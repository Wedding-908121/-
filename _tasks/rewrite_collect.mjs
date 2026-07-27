import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
let content = await readFile(root + "scripts/quick_collect.mjs", "utf8");

// === 1. Replace RSS feeds entirely ===
const rssStartMarker = '// Fast sources: news + journal RSS';
const rssEndMarker = '// OpenAlex academic paper sources';

const newRssBlock = `// Fast sources: news + journal RSS
  const fastSources = [
    { id: "bjx", label: "北极星风电", fn: fetchBjxNews },
    { id: "chinawind", label: "每日风电", fn: fetchChinaWindNews },

    // Metal materials
    { id: "rss-materials", label: "Materials", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/materials", "Materials (MDPI)", "金属材料") },
    { id: "rss-metals", label: "Metals", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/metals", "Metals (MDPI)", "金属材料") },
    { id: "rss-corrosion", label: "Corrosion & Materials Degradation", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/cmd", "Corrosion & Materials Degradation (MDPI)", "金属材料") },
    // Wind noise
    { id: "rss-acoustics", label: "Acoustics", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/acoustics", "Acoustics (MDPI)", "风机噪声") },
    // Wind testing
    { id: "rss-sensors", label: "Sensors", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/sensors", "Sensors (MDPI)", "风电试验") },
    // General / wind dynamic
    { id: "rss-energies", label: "Energies", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/energies", "Energies (MDPI)", "风电动态") },
    { id: "rss-wind-wiley", label: "Wind Energy (Wiley)", fn: () => fetchJournalRSS("https://onlinelibrary.wiley.com/action/showFeed?jc=10991824&type=etoc&feed=rss", "Wind Energy (Wiley)", "风电动态") },
    { id: "rss-iop", label: "IOP JPCS", fn: () => fetchJournalRSS("https://iopscience.iop.org/journal/rss/1742-6596", "IOP JPCS", "风电动态") },
  ];`;

// Find and replace the fast sources block
const rssStart = content.indexOf(rssStartMarker);
const rssEnd = content.indexOf("];", content.indexOf(rssEndMarker) - 200) + 2;

if (rssStart >= 0 && rssEnd >= 2) {
  // Find the actual end of fastSources array
  let searchFrom = rssStart;
  let depth = 0;
  let actualEnd = -1;
  for (let i = searchFrom; i < content.length; i++) {
    if (content[i] === '[') depth++;
    if (content[i] === ']') { depth--; if (depth === 0) { actualEnd = i + 1; break; } }
  }
  
  if (actualEnd >= 0) {
    content = content.substring(0, rssStart) + newRssBlock + "\n" + content.substring(actualEnd + 1);
    console.log("RSS feeds replaced: +Corrosion, +Acoustics, +Sensors, -AI-BOT, -Wind MDPI");
  }
}

// === 2. Fix category normalization ===
// Find the category normalization section and replace
const normOld = `// AI-BOT always AI动态
  if ((a.source||"") === "AI-BOT" && a.queryTopic === "AI动态") a.category = "AI动态";
  // Merge non-standard categories
  if (a.category === "标准政策" || a.category === "行业资讯" || a.category === "工程技术" || a.category === "气动研究" || a.category === "疲劳断裂" || a.category === "噪声研究" || a.category === "螺栓研究") a.category = "风电动态";
  // Wind-related AI from non-AI-BOT sources -> 风电动态
  if (a.category === "AI动态" && (a.source||"") !== "AI-BOT") a.category = "风电动态";`;

const normNew = `// Normalize categories: news -> 风电动态, academic papers keep their topic
  if (a.sourceType === "行业资讯") {
    a.category = "风电动态";
  }`;

if (content.includes(normOld)) {
  content = content.replace(normOld, normNew);
  console.log("Category normalization updated");
} else {
  // Try to find just the normalization section
  const nIdx = content.indexOf("AI-BOT always");
  if (nIdx >= 0) {
    const nEnd = content.indexOf("if (!a.category)", nIdx);
    if (nEnd >= 0) {
      content = content.substring(0, nIdx) + normNew + "\n  " + content.substring(nEnd);
      console.log("Category normalization replaced by position");
    }
  }
}

// === 3. Fix priority order ===
content = content.replace(
  'const priorityOrder = ["风电动态", "AI动态", "学术研究"];',
  'const priorityOrder = ["风电动态", "金属材料", "风机噪声", "风电试验", "风电螺栓"];'
);

// === 4. Fix category cap for new system ===
const catMaxOld = 'const catMax = { "default": 15 };';
const catMaxNew = 'const catMax = { "default": 15, "风电动态": 15, "金属材料": 15, "风机噪声": 15, "风电试验": 15, "风电螺栓": 15 };';
content = content.replace(catMaxOld, catMaxNew);

await writeFile(root + "scripts/quick_collect.mjs", content, "utf8");
console.log("\nquick_collect.mjs fully rewritten");
