import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { computeReliability } from "./lib/articles.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const data = JSON.parse(await readFile(root + "public/data/articles.json", "utf8"));
const config = JSON.parse(await readFile(root + "config/sources.json", "utf8"));
const reliabilityConfig = config.reliability || {};

let updated = 0;
for (const a of data.articles) {
  a.reliability = computeReliability(a, reliabilityConfig);
  updated++;
}

const dist = {};
for (const a of data.articles) {
  const g = a.reliability.grade;
  dist[g] = (dist[g]||0)+1;
}
console.log("Grade distribution:", JSON.stringify(dist));
console.log("Updated " + updated + " articles");

const a = data.articles[0];
console.log("Sample:", (a.title||"").substring(0,40));
console.log("  reliability:", JSON.stringify(a.reliability));

await writeFile(root + "public/data/articles.json", JSON.stringify(data, null, 2), "utf8");
console.log("Saved");
