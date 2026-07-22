import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const publicDirectory = new URL("../public/", import.meta.url);
const outputDirectory = new URL("../dist/", import.meta.url);
const baseUrl = String(process.env.PUBLIC_BASE_URL || "").replace(//$/, "");

await rm(outputDirectory, { recursive: true, force: true });
await cp(publicDirectory, outputDirectory, { recursive: true });

const version = Date.now().toString(36);

const indexPath = new URL("index.html", outputDirectory);
let html = await readFile(indexPath, "utf8");

// Cache busting: append version to CSS/JS files
html = html.replace(/(.css|.js)(?v=[^"]*)?/g, "$1?v=" + version);

if (baseUrl) {
  html = html.replace(
    '<meta property="og:image" content="./assets/share-cover.png',
    '<meta property="og:image" content="' + baseUrl + '/assets/share-cover.png'
  );
}
await writeFile(indexPath, html, "utf8");

// Also version articles.json in app.js
const appPath = new URL("app.js", outputDirectory);
let app = await readFile(appPath, "utf8");
app = app.replace(/articles.json?v=[^"']*/g, "articles.json?v=" + version);
app = app.replace(/index.json?v=[^"']*/g, "index.json?v=" + version);
await writeFile(appPath, app, "utf8");

await writeFile(new URL("runtime-config.js", outputDirectory),
  "window.MECH_INTEL_CONFIG = Object.freeze(" + JSON.stringify({ feedbackEndpoint: String(process.env.FEEDBACK_API_URL || "").replace(//$/, "") }, null, 2) + ");\n", "utf8");

await writeFile(new URL(".nojekyll", outputDirectory), "", "utf8");
console.log("Built dist/ with version " + version);
if (baseUrl) console.log("Public URL: " + baseUrl + "/");
