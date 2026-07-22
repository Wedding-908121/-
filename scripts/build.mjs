import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const publicDirectory = new URL("../public/", import.meta.url);
const outputDirectory = new URL("../dist/", import.meta.url);
const baseUrl = String(process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");

await rm(outputDirectory, { recursive: true, force: true });
await cp(publicDirectory, outputDirectory, { recursive: true });

const indexPath = new URL("index.html", outputDirectory);
let html = await readFile(indexPath, "utf8");

if (baseUrl) {
  html = html.replace(
    '<meta property="og:image" content="./assets/share-cover.png">',
    '<meta property="og:image" content="' + baseUrl + '/assets/share-cover.png">\n    <meta property="og:url" content="' + baseUrl + '/">\n    <link rel="canonical" href="' + baseUrl + '/">'
  );
}
await writeFile(indexPath, html, "utf8");

await writeFile(new URL("runtime-config.js", outputDirectory),
  "window.MECH_INTEL_CONFIG = Object.freeze(" + JSON.stringify({ feedbackEndpoint: String(process.env.FEEDBACK_API_URL || "").replace(/\/$/, "") }, null, 2) + ");\n", "utf8");

await writeFile(new URL(".nojekyll", outputDirectory), "", "utf8");
console.log("已构建部署目录: " + fileURLToPath(outputDirectory));
if (baseUrl) console.log("公开地址: " + baseUrl + "/");
