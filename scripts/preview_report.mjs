import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
const page = await context.newPage();

await page.goto("http://localhost:4173/report.html", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForFunction(() => {
  const el = document.getElementById("report-content");
  return el && el.textContent && !el.textContent.includes("正在加载");
}, { timeout: 15000 });
await page.waitForTimeout(500);

// Take screenshots of several pages
await page.screenshot({ path: join(__dirname, "..", "public", "report-preview-cover.png"), fullPage: false });
console.log("Cover screenshot saved");

// Scroll down and take content screenshots
await page.evaluate(() => window.scrollTo(0, 1200));
await page.waitForTimeout(300);
await page.screenshot({ path: join(__dirname, "..", "public", "report-preview-content1.png"), fullPage: false });
console.log("Content screenshot 1 saved");

await page.evaluate(() => window.scrollTo(0, 3000));
await page.waitForTimeout(300);
await page.screenshot({ path: join(__dirname, "..", "public", "report-preview-content2.png"), fullPage: false });
console.log("Content screenshot 2 saved");

await browser.close();
process.exit(0);
