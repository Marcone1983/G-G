import { createFileRoute } from "@tanstack/react-router";

const FILE_NAME = "GreedAndGross-1.5.3.apk";

export const Route = createFileRoute("/api/apk")({
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 302,
          headers: {
            Location: `/downloads/${FILE_NAME}`,
            "Cache-Control": "no-cache",
          },
        }),
    },
  },
});