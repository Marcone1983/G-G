import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
  const base = path.join(root, "src", specifier.slice(2));
  const candidates = path.extname(base) ? [base] : [`${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, path.join(base, "index.ts")];
  let last;
  for (const candidate of candidates) {
    try {
      return await nextResolve(pathToFileURL(candidate).href, context);
    } catch (error) {
      last = error;
    }
  }
  throw last;
}
