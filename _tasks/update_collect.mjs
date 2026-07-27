import { readFile, writeFile } from "node:fs/promises";

let content = await readFile("./scripts/quick_collect.mjs", "utf8");

// 1. Replace RSS feeds section with expanded list
const oldFeeds = `  { id: "rss-wind-wiley", fn: () => fetchJournalRSS("https://onlinelibrary.wiley.com/action/showFeed?jc=10991824&type=etoc&feed=rss", "Wind Energy (Wiley)", "风电动态") },
  { id: "rss-wind-mdpi", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/wind", "Wind (MDPI)", "风电动态") },
  { id: "rss-energies", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/energies", "Energies (MDPI)", "风电动态") },
  { id: "rss-materials", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/materials", "Materials (MDPI)", "疲劳断裂") },
  { id: "rss-metals", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/metals", "Metals (MDPI)", "疲劳断裂") },
  { id: "rss-iop", fn: () => fetchJournalRSS("https://iopscience.iop.org/journal/rss/1742-6596", "IOP JPCS", "风电动态") },`;

const newFeeds = `  { id: "rss-wind-wiley", fn: () => fetchJournalRSS("https://onlinelibrary.wiley.com/action/showFeed?jc=10991824&type=etoc&feed=rss", "Wind Energy (Wiley)", "风电动态") },
  { id: "rss-materials", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/materials", "Materials (MDPI)", "金属材料") },
  { id: "rss-metals", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/metals", "Metals (MDPI)", "金属材料") },
  { id: "rss-corrosion", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/cmd", "Corrosion & Materials Degradation (MDPI)", "金属材料") },
  { id: "rss-acoustics", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/acoustics", "Acoustics (MDPI)", "风机噪声") },
  { id: "rss-sensors", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/sensors", "Sensors (MDPI)", "风电试验") },
  { id: "rss-energies", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/energies", "Energies (MDPI)", "风电动态") },
  { id: "rss-iop", fn: () => fetchJournalRSS("https://iopscience.iop.org/journal/rss/1742-6596", "IOP JPCS", "风电动态") },`;

if (content.includes(oldFeeds)) {
  content = content.replace(oldFeeds, newFeeds);
  console.log("RSS feeds updated: +Corrosion, +Acoustics, +Sensors; -Wind MDPI");
}

// 2. Remove AI-BOT news source
if (content.includes('{ id: "ai-bot"')) {
  content = content.replace(
    /  \{ id: "ai-bot".*?\},\n/s,
    ""
  );
  console.log("AI-BOT removed");
}

// 3. Update category normalization
const oldNorm = `// AI-BOT always AI动态
  if ((a.source||"") === "AI-BOT" && a.queryTopic === "AI动态") a.category = "AI动态";
  // Merge non-standard categories
  if (a.category === "标准政策" || a.category === "行业资讯" || a.category === "工程技术" || a.category === "气动研究" || a.category === "疲劳断裂" || a.category === "噪声研究" || a.category === "螺栓研究") a.category = "风电动态";
  // Wind-related AI from non-AI-BOT sources -> 风电动态
  if (a.category === "AI动态" && (a.source||"") !== "AI-BOT") a.category = "风电动态";`;

const newNorm = `// Normalize: news defaults to 风电动态, academic papers keep their topic category
  if (a.sourceType === "行业资讯") {
    a.category = "风电动态";
  }`;

if (content.includes(oldNorm)) {
  content = content.replace(oldNorm, newNorm);
  console.log("Category normalization updated");
}

// 4. Update per-category priority order
content = content.replace(
  'const priorityOrder = ["风电动态", "AI动态", "学术研究"];',
  'const priorityOrder = ["风电动态", "金属材料", "风机噪声", "风电试验", "风电螺栓"];'
);

await writeFile("./scripts/quick_collect.mjs", content, "utf8");
console.log("\nquick_collect.mjs updated");
