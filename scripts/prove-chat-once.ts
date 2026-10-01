import { breedingChat } from "../src/lib/gg/services.server.ts";

const query = process.argv[2] ?? "";
const result = await breedingChat(query);
console.log(
  JSON.stringify(
    {
      intent: result.intent,
      has_report: result.report != null,
      says_missing_catalog: /non è nel catalogo/i.test(result.reply),
      says_not_a_fact: /non dimostra|non è un fatto|UNVERIFIED|RESEARCH/i.test(result.reply),
      reply: result.reply,
    },
    null,
    2,
  ),
);
