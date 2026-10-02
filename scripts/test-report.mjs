import { spawn } from "node:child_process";

const suites = [
  ["LEGACY TEMPLATE TESTS", "node", ["--test", "scripts/**/*.test.mjs"]],
  [
    "SCIENTIFIC TESTS",
    "node",
    [
      "--experimental-strip-types",
      "--test",
      "src/lib/gg/engine.test.ts",
      "src/lib/gg/brain.test.ts",
      "src/lib/gg/corpus.test.ts",
      "src/lib/gg/phase3.test.ts",
      "src/lib/gg/acquire.test.ts",
      "src/lib/gg/resolve.test.ts",
      "src/lib/gg/repository.test.ts",
      "src/lib/gg/knowledge-repository.test.ts",
      "src/lib/gg/production-path.test.ts",
      "src/lib/gg/audit.test.ts",
      "src/lib/gg/health-evidence.test.ts",
      "src/lib/gg/enterprise-gates.test.ts",
      "src/lib/gg/enterprise-64.test.ts",
    ],
  ],
  [
    "API TESTS",
    "node",
    ["--experimental-strip-types", "--test", "src/lib/gg/contract.test.ts", "src/lib/gg/monetization.test.ts", "src/lib/gg/production-path.test.ts"],
  ],
  [
    "SECURITY TESTS",
    "node",
    ["--experimental-strip-types", "--test", "src/lib/gg/matrix.test.ts", "src/lib/gg/release.test.ts"],
  ],
];

let failed = 0;
for (const [label, command, args] of suites) {
  console.log(`\n== ${label} ==`);
  const code = await new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (status) => resolve(status ?? 1));
  });
  console.log(`${label}: ${code === 0 ? "PASS" : "FAIL"}`);
  if (code !== 0) failed += 1;
}
process.exit(failed === 0 ? 0 : 1);
