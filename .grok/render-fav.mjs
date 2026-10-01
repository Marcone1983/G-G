import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const svg = readFileSync("/workspace/public/favicon.svg");
const b64 = Buffer.from(svg).toString("base64");
const browser = await chromium.launch({
  executablePath:
    "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage({
  viewport: { width: 64, height: 32 },
  deviceScaleFactor: 4,
});
await page.setContent(
  `<!doctype html><body style="margin:0;background:#ff00ff;display:flex;align-items:flex-start">
   <img id="a" width="16" height="16" src="data:image/svg+xml;base64,${b64}"/>
   <img id="b" width="32" height="32" src="data:image/svg+xml;base64,${b64}"/>
   </body>`,
  { waitUntil: "load" },
);
const info = await page.evaluate(() => ({
  a: { w: a.naturalWidth, h: a.naturalHeight },
  b: { w: b.naturalWidth, h: b.naturalHeight },
}));
console.log(JSON.stringify(info));
await page.screenshot({ path: "/workspace/.grok/favicon-strip.png" });
await browser.close();
