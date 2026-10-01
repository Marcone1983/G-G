import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { attachPreview } from "./preview-attach.mjs";

const log = createWriteStream("/tmp/gg-dev.log", { flags: "a" });
let backoff = 1000;
let child = null;

function nodeOptions() {
  const flag = "--import /workspace/scripts/preview-guard.mjs";
  const current = process.env.NODE_OPTIONS?.trim();
  if (!current) return flag;
  if (current.includes("preview-guard.mjs")) return current;
  return `${current} ${flag}`;
}

function healthy() {
  return fetch("http://127.0.0.1:8080/", { signal: AbortSignal.timeout(1500) })
    .then((response) => response.status < 500)
    .catch(() => false);
}

async function watchUntilHealthy() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await healthy()) {
      backoff = 1000;
      await attachPreview().catch(() => false);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function launch() {
  child = spawn("npm", ["run", "dev"], {
    cwd: "/workspace",
    env: { ...process.env, NODE_OPTIONS: nodeOptions() },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  log.write(`\n[supervisor] started pid=${child.pid}\n`);
  void watchUntilHealthy();
  child.on("exit", (code, signal) => {
    log.write(`[supervisor] dev exited code=${code ?? "null"} signal=${signal ?? "null"}\n`);
    child = null;
    setTimeout(launch, backoff);
    backoff = Math.min(backoff * 2, 5000);
  });
}

setInterval(() => {
  if (child) void attachPreview().catch(() => false);
}, 5000);

process.on("SIGTERM", () => {
  if (child) child.kill("SIGTERM");
  process.exit(0);
});

launch();
