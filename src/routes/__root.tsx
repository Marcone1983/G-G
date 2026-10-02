import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

function BootScreen() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const bar = document.getElementById("gg-boot-bar");
      const progress = Math.min(100, ((now - start) / 1400) * 100);
      if (bar) bar.style.width = `${progress}%`;
      if (progress < 100) frame = requestAnimationFrame(tick);
      else setGone(true);
    };
    const timer = window.setTimeout(() => setGone(true), 1400);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);
  if (gone) return null;
  return (
    <div
      id="gg-boot"
      role="status"
      aria-label="Apertura di GREED & GROSS"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        background: "#000",
      }}
    >
      <img src="/brand/gg-logo.png" alt="" style={{ width: "min(78vw, 280px)", height: "auto" }} />
      <div className="gg-boot-track">
        <div id="gg-boot-bar" />
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GREED & GROSS" },
      { name: "description", content: "Intelligenza scientifica di breeding. Pedigree, evidenza, incertezza." },
      { name: "theme-color", content: "#000000" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/brand/gg-logo.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560;9..144,640&family=Outfit:wght@400;500;600&display=swap",
      },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/brand/gg-logo.png" },
    ],
  }),
  component: () => (
    <html lang="it" translate="no" className="notranslate" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <BootScreen />
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});