import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const PORT = 4173;

// Simple static file server
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  try {
    let url = new URL(req.url, "http://localhost");
    let pathname = url.pathname === "/" ? "/report.html" : url.pathname;
    let filePath = join(publicDir, pathname);

    // Security: ensure path is within publicDir
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const data = await readFile(filePath);
    const ext = "." + (pathname.split(".").pop() || "html");
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch (e) {
    if (e.code === "ENOENT") {
      res.writeHead(404);
      res.end("Not Found: " + req.url);
    } else {
      res.writeHead(500);
      res.end("Error: " + e.message);
    }
  }
});

server.listen(PORT, async () => {
  console.log("Server on http://localhost:" + PORT);

  try {
    const browser = await chromium.launch({
      channel: "msedge",
      headless: true,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 2,
    });

    const page = await context.newPage();

    // Navigate to report.html
    await page.goto("http://localhost:" + PORT + "/report.html", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Wait for articles to load
    await page.waitForFunction(() => {
      const el = document.getElementById("report-content");
      return el && el.textContent && !el.textContent.includes("正在加载");
    }, { timeout: 15000 });

    // Small delay to ensure rendering is complete
    await page.waitForTimeout(1000);

    // Generate PDF
    const pdfPath = join(__dirname, "..", "机械共性部情报中心_第30周周报.pdf");
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "0mm",
        bottom: "0mm",
        left: "0mm",
        right: "0mm",
      },
      scale: 0.92,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: '<div style="text-align:center;font-size:8px;color:#999;font-family:PingFang SC,Microsoft YaHei,sans-serif;width:100%;">— <span class="pageNumber"></span> —</div>',
    });

    console.log("PDF generated: " + pdfPath);

    await browser.close();
  } catch (e) {
    console.error("PDF generation failed:", e.message);
  } finally {
    server.close();
    process.exit(0);
  }
});
