import { mkdirSync, writeFileSync } from "node:fs";

import { productionReadiness } from "../src/lib/gg/production-readiness.ts";

const report = productionReadiness();
mkdirSync("data", { recursive: true });
writeFileSync("data/enterprise-final-readiness.json", JSON.stringify({ ...report, environment: "LOCAL", ci_remote: "CI_REMOTE_RUN_NOT_EXECUTED" }, null, 2));
console.log(report.status);
process.exit(report.status === "READY" ? 0 : 2);
