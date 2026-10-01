#!/usr/bin/env node
/**
 * Names may appear in fixtures, tests, documentation and raw data.
 * A comparison that special-cases a strain name in production logic fails the phase.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const names = ["Gelato", "Domina", "Blue Dream", "OG Kush"];
const namePattern = new RegExp(`(?<![A-Za-z])(?:${names.map((name) => name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")).join("|")})(?![A-Za-z])`);
const special = /(?:===|==|!==|!=)\s*["'](?:Gelato|Black Domina|Domina|Blue Dream|OG Kush)|switch\s*\(\s*strainName\s*\)|includes\(\s*["'](?:Gelato|Domina|Blue Dream|OG Kush)/;

function files(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "build" || entry === ".git" || entry === "data") continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files(full, acc);
    else if (/\.(ts|tsx|mjs|py|kt)$/.test(entry)) acc.push(full);
  }
  return acc;
}

const failures = [];
const classified = [];
for (const file of files(path.join(root, "src")).concat(files(path.join(root, "scripts")))) {
  const rel = path.relative(root, file);
  const text = readFileSync(file, "utf8");
  const hit = namePattern.test(text) ? names.filter((name) => new RegExp(`(?<![A-Za-z])${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}(?![A-Za-z])`).test(text)) : [];
  if (!hit.length && !special.test(text)) continue;
  let klass = "PRODUCTION_LOGIC";
  if (rel.includes("hardcode-scan")) klass = "DETECTOR";
  else if (rel.includes(".test.") || rel.endsWith(".test.ts") || rel.endsWith(".test.mjs")) klass = "TEST";
  else if (rel.endsWith("knowledge.ts") || rel.endsWith("examples.ts")) klass = "FIXTURE";
  else if (rel.includes("benchmark")) klass = "BENCHMARK";
  else if (rel.endsWith("normalize-foundation.py")) klass = "SCIENTIFIC_SOURCE";
  else if (rel.endsWith(".md")) klass = "DOCUMENTATION";
  classified.push({ file: rel, klass, names: hit });
  if (klass === "PRODUCTION_LOGIC" && (hit.length || special.test(text))) failures.push(rel);
}

const report = { failures, classified };
if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  for (const row of classified) console.log(`${row.klass}\t${row.file}\t${row.names.join(",")}`);
  if (failures.length) {
    console.error("PRODUCTION_LOGIC name special cases:", failures.join(", "));
    process.exit(1);
  }
}
