import { chromium } from "playwright";

const browser = await chromium.launch({
  executablePath:
    "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage({
  viewport: { width: 400, height: 200 },
  deviceScaleFactor: 1,
});
await page.setContent(
  `<!doctype html><html><body style="margin:0;background:#141712">
   <div style="width:200px;height:100px;background:#C5D86D;color:#141712;font:32px Liberation Serif,serif;padding:20px">GREED</div>
   </body></html>`,
  { waitUntil: "load" },
);
await page.screenshot({ path: "/workspace/.grok/probe.png" });
const box = await page.evaluate(() => document.body.innerText);
console.log("text", JSON.stringify(box));
await browser.close();
