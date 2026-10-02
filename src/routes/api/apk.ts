import { readFile } from "node:fs/promises";
import path from "node:path";
import { createFileRoute } from "@tanstack/react-router";

const FILE_NAME = "GreedAndGross-1.5.1.apk";

export const Route = createFileRoute("/api/apk")({
  server: {
    handlers: {
      GET: async () => {
        const file = path.join(process.cwd(), "public", "downloads", FILE_NAME);
        const data = await readFile(file);
        return new Response(data, {
          headers: {
            "Content-Type": "application/vnd.android.package-archive",
            "Content-Disposition": `attachment; filename="${FILE_NAME}"`,
            "Content-Length": String(data.byteLength),
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
