import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
});

const page = await context.newPage();

await page.goto("http://localhost:4173/report.html", {
  waitUntil: "networkidle",
  timeout: 30000,
});

// Wait for articles to load
await page.waitForFunction(() => {
  const el = document.getElementById("report-content");
  return el && el.textContent && !el.textContent.includes("正在加载");
}, { timeout: 15000 });

await page.waitForTimeout(1500);

const pdfPath = join(__dirname, "..", "机械共性部情报中心_第30周周报.pdf");
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
  scale: 0.92,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: '<div style="text-align:center;font-size:8px;color:#999;font-family:PingFang SC,Microsoft YaHei,sans-serif;width:100%;">— <span class="pageNumber"></span> —</div>',
});

console.log("PDF generated: " + pdfPath);
await browser.close();
process.exit(0);
