import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const html = readFileSync("/workspace/.grok/og-card.html", "utf8");

const browser = await chromium.launch({
  executablePath:
    "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
  args: ["--no-sandbox", "--disable-gpu"],
});

const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.setContent(html, { waitUntil: "load" });
const boxes = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll("text")];
  return nodes.map((node) => {
    const b = node.getBBox();
    return {
      t: (node.textContent || "").replace(/\s+/g, " ").trim(),
      x: Math.round(b.x),
      y: Math.round(b.y),
      w: Math.round(b.width),
      h: Math.round(b.height),
    };
  });
});
console.log(JSON.stringify(boxes, null, 2));
const edge = boxes.filter(
  (b) => b.x < 12 || b.y < 8 || b.x + b.w > 1188 || b.y + b.h > 622,
);
if (edge.length) {
  console.error("EDGE", JSON.stringify(edge));
  process.exitCode = 2;
}
await page.screenshot({ path: "/workspace/.grok/og-raw.png", type: "png" });

const favHtml = `<!doctype html><html><body style="margin:0;background:#000">
<img id="i" src="data:image/svg+xml;base64,${Buffer.from(
  readFileSync("/workspace/public/favicon.svg"),
).toString("base64")}" width="32" height="32"/>
</body></html>`;
const fav = await browser.newPage({
  viewport: { width: 32, height: 32 },
  deviceScaleFactor: 4,
});
await fav.setContent(favHtml, { waitUntil: "load" });
await fav.screenshot({ path: "/workspace/.grok/favicon-32.png" });

const fav16 = await browser.newPage({
  viewport: { width: 16, height: 16 },
  deviceScaleFactor: 8,
});
await fav16.setContent(
  favHtml.replace('width="32" height="32"', 'width="16" height="16"'),
  { waitUntil: "load" },
);
await fav16.screenshot({ path: "/workspace/.grok/favicon-16.png" });

await browser.close();
console.log("rendered");
