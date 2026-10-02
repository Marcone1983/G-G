import { readScientificInventory } from "../src/lib/gg/inventory.server.ts";

const inventory = await readScientificInventory();
const body = {
  status: inventory.status,
  source: inventory.source,
  categories: inventory.categories,
  measurement_classes: inventory.measurement_classes,
  domains: inventory.domains,
  embedding_columns: inventory.embedding_columns,
  error: inventory.error ? "QUERY_FAILED" : null,
};
console.log(JSON.stringify(body));
if (inventory.status !== "QUERIED") process.exit(1);
