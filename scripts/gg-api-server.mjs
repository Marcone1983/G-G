import { createServer as createHttp } from "node:http";
import { createServer } from "vite";
import { serverEnvStatus } from "./server-env-status.mjs";

const envStatus = serverEnvStatus();
for (const [key, value] of Object.entries(envStatus)) console.log(`${key}=${value}`);

const port = Number(process.env.GG_API_PORT || 8090);
const host = process.env.HOST || "0.0.0.0";
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
const mod = await vite.ssrLoadModule("/src/lib/gg/http.server.ts");

createHttp(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (!url.pathname.startsWith("/api/v1")) {
    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Questo processo serve solo il core /api/v1. La UI è un client separato." }));
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
  });
  const response = await mod.handleV1(request);
  const bytes = Buffer.from(await response.arrayBuffer());
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(response.status, headers);
  res.end(bytes);
}).listen(port, host, () => {
  console.log(`G&G API only http://${host}:${port}/api/v1`);
});
