import { rawGuard } from "../src/lib/gg/guard.ts";

const guard = rawGuard();
console.log(JSON.stringify({ ok: guard.ok, failures: guard.failures, counts: guard.counts }));
process.exit(guard.ok ? 0 : 1);
