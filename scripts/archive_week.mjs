import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

// 1. Create archive directory
const archiveDir = root + "public/data/archive/";
if (!existsSync(archiveDir)) {
  await mkdir(archiveDir, { recursive: true });
  console.log("Created archive directory");
}

// 2. Save current week data as archive
const data = JSON.parse(await readFile(root + "public/data/articles.json", "utf8"));
const weekNum = 29;
const weekKey = "2026-W" + weekNum;
const archiveFile = archiveDir + weekKey + ".json";

const archive = {
  week: weekKey,
  period: data.period,
  generatedAt: data.generatedAt,
  weeklyBrief: data.weeklyBrief,
  collectionStatus: data.collectionStatus,
  articles: data.articles
};

await writeFile(archiveFile, JSON.stringify(archive, null, 2), "utf8");
console.log("Archived " + data.articles.length + " articles -> " + weekKey + ".json");

// 3. Update archive index
let index = [];
const indexFile = archiveDir + "index.json";
try { index = JSON.parse(await readFile(indexFile, "utf8")); } catch {}

const existing = index.find(e => e.week === weekKey);
if (existing) {
  existing.count = data.articles.length;
  existing.generatedAt = data.generatedAt;
} else {
  index.push({
    week: weekKey,
    label: "2026.07.13-2026.07.20 第" + weekNum + "周",
    count: data.articles.length,
    generatedAt: data.generatedAt
  });
}
index.sort((a, b) => b.week.localeCompare(a.week));

await writeFile(indexFile, JSON.stringify(index, null, 2), "utf8");
console.log("Archive index updated (" + index.length + " weeks)");

// 4. Show archive list
console.log("\n=== Archive ===");
index.forEach(e => console.log("  " + e.week + ": " + e.count + " articles - " + e.label));
