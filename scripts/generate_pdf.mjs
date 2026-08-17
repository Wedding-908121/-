import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const PORT = 4174;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

const server = createServer(async (req, res) => {
  try {
    let url = new URL(req.url, "http://localhost");
    let pathname = url.pathname === "/" ? "/report.html" : url.pathname;
    let filePath = join(publicDir, pathname);
    if (!filePath.startsWith(publicDir)) { res.writeHead(403); res.end("Forbidden"); return; }
    const data = await readFile(filePath);
    const ext = "." + (pathname.split(".").pop() || "html");
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch (e) {
    res.writeHead(404); res.end("Not Found");
  }
});

server.listen(PORT, async () => {
  console.log("Server: http://localhost:" + PORT);

  // Read data to get week info
  let weekLabel = "周报";
  try {
    const raw = await readFile(join(publicDir, "data", "articles.json"), "utf8");
    const d = JSON.parse(raw);
    const period = d.weeklyBrief?.period || "";
    if (period) {
      weekLabel = period.replace(/\./g, "").replace(/\s+/g, "_").replace(/-/g, "");
    }
  } catch {}

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  await page.goto("http://localhost:" + PORT + "/report.html", { waitUntil: "networkidle", timeout: 30000 });

  // Wait for content to render
  await page.waitForFunction(() => {
    const el = document.getElementById("report-body");
    return el && el.innerHTML.length > 500;
  }, { timeout: 20000 });

  await page.waitForTimeout(1500);

  const pdfPath = join(__dirname, "..", "机械共性部情报中心_" + weekLabel + ".pdf");
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
    displayHeaderFooter: true,
    headerTemplate: '<span style="font-size:7px;color:#aaa;font-family:PingFang SC,sans-serif;padding-left:20px;">机械共性部情报中心</span>',
    footerTemplate: '<div style="text-align:center;font-size:7px;color:#aaa;font-family:PingFang SC,sans-serif;width:100%;">— <span class="pageNumber"></span> / <span class="totalPages"></span> —</div>',
  });

  console.log("PDF: " + pdfPath);
  await browser.close();
  server.close();
  process.exit(0);
});
