import net from "node:net";
import tls from "node:tls";
import { getSql } from "@/lib/db";

export type Check = "healthy" | "degraded" | "unreachable" | "not_configured";

export function declaredInfrastructure() {
  const databaseUrl = Boolean(process.env.DATABASE_URL?.trim());
  const redisUrl = Boolean(process.env.REDIS_URL?.trim());
  const vectorRequested = process.env.VECTOR_BACKEND?.trim() || "";
  return {
    environment: process.env.NODE_ENV?.trim() || "development",
    api_version: "1.2.0",
    public_base_url: process.env.GG_PUBLIC_BASE_URL?.trim() || null,
    database: databaseUrl ? "postgresql" : "pglite",
    vector: vectorRequested === "pgvector" ? "pgvector_requested" : "in_process_cosine_v1",
    hot_cache: redisUrl ? "redis_configured" : "process_memory",
    durable_cache: "postgresql",
    redis: redisUrl ? "configured" : "not_configured",
  };
}

type Probe = {
  environment: string;
  api_version: string;
  public_base_url: string | null;
  checks: { api: Check; database: Check; vector: Check; cache: Check };
  backends: {
    database: string;
    vector: string;
    cache_hot: string;
    cache_durable: string;
    redis: string;
  };
  notes: { vector: string; cache: string };
};

let probeCache: { at: number; value: Probe } | null = null;

export async function probeInfrastructure(): Promise<Probe> {
  if (probeCache && Date.now() - probeCache.at < 15_000) return probeCache.value;
  const declared = declaredInfrastructure();
  let database: Check = "unreachable";
  let pgvector = false;
  try {
    const sql = await getSql();
    await sql`select 1 as ok`;
    database = "healthy";
  } catch {
    database = "unreachable";
  }
  if (database === "healthy" && declared.database === "postgresql") {
    try {
      const sql = await getSql();
      const rows = await sql<{ extname: string }>`select extname from pg_extension where extname = 'vector'`;
      pgvector = rows.length > 0;
    } catch {
      pgvector = false;
    }
  }
  const vectorBackend = pgvector ? "pgvector" : "in_process_cosine_v1";
  const vector: Check = database === "unreachable" ? "unreachable" : "healthy";
  const vectorNote = pgvector
    ? "L'estensione pgvector è installata. La ricerca semantica corrente usa ancora il cosine in processo."
    : declared.database === "postgresql"
      ? "Postgres reale senza estensione vector. Il cosine in processo è il backend effettivo."
      : "PGLite di sviluppo. Il cosine in processo è il backend effettivo. pgvector non è attivo.";
  let redis: string = declared.redis === "configured" ? "unreachable" : "not_configured";
  if (process.env.REDIS_URL?.trim()) {
    redis = (await redisCommand(["PING"], 500)) === "PONG" ? "redis" : "unreachable";
  }
  const cache: Check = redis === "unreachable" ? "degraded" : "healthy";
  const value: Probe = {
    environment: declared.environment,
    api_version: declared.api_version,
    public_base_url: declared.public_base_url,
    checks: { api: "healthy", database, vector, cache },
    backends: {
      database: declared.database,
      vector: vectorBackend,
      cache_hot: redis === "redis" ? "redis" : "process_memory",
      cache_durable: "postgresql",
      redis,
    },
    notes: {
      vector: vectorNote,
      cache:
        redis === "not_configured"
          ? "Redis non configurato. La cache durevole è gg_cache. La cache calda è la memoria del processo."
          : redis === "redis"
            ? "Redis risponde. La memoria scientifica durevole resta gg_cache."
            : "REDIS_URL è impostata ma Redis non risponde. Si usa il fallback gg_cache.",
    },
  };
  probeCache = { at: Date.now(), value };
  return value;
}

export async function redisGet(key: string): Promise<string | null> {
  if (!process.env.REDIS_URL?.trim()) return null;
  const reply = await redisCommand(["GET", `gg:${key}`], 400);
  return reply;
}

export async function redisSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (!process.env.REDIS_URL?.trim()) return;
  await redisCommand(["SET", `gg:${key}`, value, "EX", String(ttlSeconds)], 400);
}

async function redisCommand(args: string[], timeoutMs: number): Promise<string | null> {
  const raw = process.env.REDIS_URL?.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  const secure = parsed.protocol === "rediss:";
  const port = Number(parsed.port || (secure ? 6380 : 6379));
  const payload = encodeResp(args);
  return new Promise((resolve) => {
    const socket = secure
      ? tls.connect({ host: parsed.hostname, port, servername: parsed.hostname })
      : net.connect({ host: parsed.hostname, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(null);
    }, timeoutMs);
    let buf = "";
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      if (buf.includes("\r\n")) {
        clearTimeout(timer);
        socket.end();
        resolve(decodeResp(buf));
      }
    });
    socket.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    socket.on("connect", () => {
      const password = parsed.password ? decodeURIComponent(parsed.password) : "";
      const hello = password ? encodeResp(["AUTH", password]) + payload : payload;
      socket.write(hello);
    });
  });
}

function encodeResp(args: string[]): string {
  return `*${args.length}\r\n${args.map((arg) => `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`).join("")}`;
}

function decodeResp(payload: string): string | null {
  if (payload.startsWith("+")) return payload.slice(1).split("\r\n")[0] ?? null;
  if (payload.startsWith("-")) return null;
  if (payload.startsWith("$")) {
    const lines = payload.split("\r\n");
    if (lines[0] === "$-1") return null;
    return lines[1] ?? null;
  }
  return null;
}
