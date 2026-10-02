import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

export const Route = createFileRoute("/auth/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const start = new Request(new URL("/api/auth/sign-in/oauth2", origin), {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            providerId: "grok-google",
            callbackURL: "/auth/mobile",
            disableRedirect: true,
          }),
        });
        const response = await auth.handler(start);
        const data = (await response.json().catch(() => null)) as { url?: string; message?: string } | null;
        if (!response.ok || !data?.url) {
          return Response.json({ message: data?.message ?? "Google non disponibile" }, { status: response.status || 502 });
        }
        const headers = new Headers({ location: data.url });
        const setCookies = response.headers.getSetCookie?.() ?? [];
        for (const cookie of setCookies) headers.append("set-cookie", cookie);
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
