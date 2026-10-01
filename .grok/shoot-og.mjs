import { chromium } from "playwright";

const browser = await chromium.launch({
  executablePath:
    "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
  args: ["--no-sandbox", "--disable-gpu"],
});

const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.goto("file:///workspace/.grok/og-card.html", { waitUntil: "load" });
await page.screenshot({ path: "/workspace/.grok/og-raw.png", type: "png" });

const p16 = await browser.newPage({
  viewport: { width: 16, height: 16 },
  deviceScaleFactor: 8,
});
await p16.goto("file:///workspace/public/favicon.svg", { waitUntil: "load" });
await p16.screenshot({ path: "/workspace/.grok/favicon-16.png" });

const p32 = await browser.newPage({
  viewport: { width: 32, height: 32 },
  deviceScaleFactor: 4,
});
await p32.goto("file:///workspace/public/favicon.svg", { waitUntil: "load" });
await p32.screenshot({ path: "/workspace/.grok/favicon-32.png" });

await browser.close();
console.log("shot ok");
