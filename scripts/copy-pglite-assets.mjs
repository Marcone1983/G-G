import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules/@electric-sql/pglite/dist");
const to = join(root, ".vercel/output/functions/__server.func/_libs");
if (!existsSync(to)) {
  console.log("[pglite] nitro output missing, skip");
  process.exit(0);
}
mkdirSync(to, { recursive: true });
for (const name of ["pglite.wasm", "pglite.data", "initdb.wasm"]) {
  const source = join(from, name);
  if (!existsSync(source)) {
    console.error(`[pglite] missing ${source}`);
    process.exit(1);
  }
  copyFileSync(source, join(to, name));
}
console.log("[pglite] wasm assets copied next to the server bundle");
