import { resolveQuery } from "../src/lib/gg/resolve.ts";

const query = process.argv[2] ?? "";
const result = await resolveQuery(query, async () => {
  console.log("MODEL_CALLED");
  throw new Error("must not call");
});
console.log(
  JSON.stringify({
    origin: result.origin,
    grok_called: result.grok_called,
    research_id: result.research_id,
    research_status: result.research_status,
    resolution_status: result.resolution_status,
    cross_id: result.cross_id,
    relationship_status: result.relationship_status,
  }),
);
