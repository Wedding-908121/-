import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./public/", import.meta.url));
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp"
};

function resolvePublicPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const candidate = normalize(join(root, relative));
  return candidate.startsWith(root) ? candidate : null;
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://" + (request.headers.host || "localhost"));
  if (url.pathname === "/api/health") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, service: "mechanical-intelligence" }));
    return;
  }
  let filePath = resolvePublicPath(url.pathname);
  if (!filePath) { response.writeHead(403); response.end("Forbidden"); return; }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, "index.html");
  }
  const extension = extname(filePath).toLowerCase();
  const cacheControl = filePath.endsWith("index.html") ? "no-cache"
    : extension === ".json" ? "public, max-age=300" : "public, max-age=86400";
  response.writeHead(200, { "Cache-Control": cacheControl, "Content-Type": contentTypes[extension] || "application/octet-stream" });
  createReadStream(filePath).pipe(response);
});

server.listen(port, "0.0.0.0", () => {
  console.log("机械共性情报已启动 http://localhost:" + port);
});
