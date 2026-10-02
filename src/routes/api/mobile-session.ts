import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

const COOKIE = "__Host-grok-auth.session_token=";

function sessionToken(request: Request): string | null {
  const raw = request.headers.get("cookie") ?? "";
  const part = raw.split(";").map((item) => item.trim()).find((item) => item.startsWith(COOKIE));
  if (!part) return null;
  try {
    const value = decodeURIComponent(part.slice(COOKIE.length));
    return value || null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/mobile-session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        const token = sessionToken(request);
        if (!session || !token) {
          return Response.json({ error: "Nessuna sessione" }, { status: 401 });
        }
        return Response.json({ token });
      },
    },
  },
});
