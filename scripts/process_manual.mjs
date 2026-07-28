// Process manual WeChat URLs → full AI-summarized weekly report
import { readFile, writeFile } from "node:fs/promises";
import { cleanText, inferCategory, makeArticleId, isNoiseArticle, isLowQualityArticle, isDomainRelevant } from "./lib/articles.mjs";
import { resolveAiProvider, summarizeInBatches } from "./lib/ai.mjs";

const now = new Date();
const periodStart = new Date("2026-07-20T00:00:00.000Z");
const periodEnd = new Date("2026-07-26T23:59:59.999Z");

// 1. Read manual URLs
const raw = await readFile("./config/manual-urls.txt", "utf8");
const lines = raw.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));

let currentCategory = "风电动态";
const manualArticles = [];

for (const line of lines) {
  // Check if line is a category header
  if (line.includes("金属材料")) { currentCategory = "金属材料"; continue; }
  if (line.includes("噪声")) { currentCategory = "风机噪声"; continue; }
  if (line.includes("试验")) { currentCategory = "风电试验"; continue; }
  if (line.includes("螺栓")) { currentCategory = "风电螺栓"; continue; }
  if (line.includes("风电") && !line.startsWith("http")) { currentCategory = "风电动态"; continue; }
  if (line.match(/^\d{4}\.\d{2}\.\d{2}/)) continue; // date line
  
  // Must be a URL
  if (line.startsWith("http")) {
    manualArticles.push({ url: line, category: currentCategory });
  }
}

console.log("Manual URLs found:", manualArticles.length);
manualArticles.forEach(a => console.log("  [" + a.category + "] " + a.url.substring(0, 60)));

// 2. Fetch each article
console.log("\n=== Fetching articles ===");
const articles = [];

for (const {url, category} of manualArticles) {
  try {
    console.log("Fetching: " + url.substring(0, 60) + "...");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: controller.signal
    });
    clearTimeout(timeout);
    const html = await r.text();
    
    // Extract title
    let title = "";
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/) || html.match(/var msg_title\s*=\s*'([^']+)'/) || html.match(/<title[^>]*>([^<]+)<\/title>/);
    if (titleMatch) title = cleanText(titleMatch[1]);
    if (!title || title.length < 5) { console.log("  SKIP: no title"); continue; }
    
    // Extract content (WeChat article body)
    let content = "";
    const contentMatch = html.match(/<div[^>]*class="rich_media_content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || html.match(/var msg_desc\s*=\s*"([^"]+)"/) || html.match(/<meta name="description" content="([^"]+)"/);
    if (contentMatch) content = cleanText(contentMatch[1]).substring(0, 6000);
    
    // Extract date
    let pubDate = now;
    const dateMatch = html.match(/var ct\s*=\s*"(\d+)"/) || html.match(/publish_time"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      const ts = parseInt(dateMatch[1]);
      if (ts > 1000000000) pubDate = new Date(ts * 1000);
    }
    
    // Extract source (公众号名称)
    let source = "微信公众号";
    const sourceMatch = html.match(/var nickname\s*=\s*"([^"]+)"/) || html.match(/<meta property="og:article:author" content="([^"]+)"/);
    if (sourceMatch) source = cleanText(sourceMatch[1]);
    
    console.log("  OK: [" + category + "] " + title.substring(0, 80) + " | " + source);
    
    articles.push({
      id: makeArticleId(url, title),
      title,
      url,
      sourceUrl: url,
      snippet: content.substring(0, 2000),
      fullContent: content,
      source,
      publishedAt: pubDate.toISOString(),
      collectedAt: now.toISOString(),
      sourceChannel: "WeChat/手动精选",
      linkType: "publisher",
      region: "国内",
      language: "zh",
      sourceType: "行业资讯",
      queryTopic: category,
      contextTags: [category],
      category,
      tags: [],
      relevanceScore: 10, // manually curated = high score
      reliability: 70
    });
  } catch(e) {
    console.log("  FAIL: " + e.message);
  }
}

console.log("\nFetched: " + articles.length + " articles");

// 3. AI Summarization
console.log("\n=== AI Summarization ===");
const aiProvider = await resolveAiProvider();
if (aiProvider) {
  console.log("Using: " + aiProvider.id + " " + aiProvider.model);
  const summaries = await summarizeInBatches(aiProvider, articles, {
    batchSize: 3,
    onBatchError: (e, n) => console.warn("Batch " + n + " error:", e.message)
  });
  
  for (const a of articles) {
    const s = summaries.get(a.id);
    if (s) {
      if (s.titleZh) a.titleZh = s.titleZh;
      if (s.summary && s.summary.length > 5) a.summary = s.summary;
      if (s.keyPoints?.length) a.keyPoints = s.keyPoints;
      if (s.engineeringImpact) a.engineeringImpact = s.engineeringImpact;
      if (s.paperDetails && Object.keys(s.paperDetails).length > 0) a.paperDetails = s.paperDetails;
      if (s.industryDetails && Object.keys(s.industryDetails).length > 0) a.industryDetails = s.industryDetails;
      if (s.readingMinutes) a.readingMinutes = s.readingMinutes;
    }
  }
  console.log("AI summarized: " + summaries.size + "/" + articles.length);
}

// 4. Merge with existing data (keep high-quality existing articles)
console.log("\n=== Merging with existing data ===");
let existing = { articles: [] };
try {
  const raw = await readFile("./public/data/articles.json", "utf8");
  existing = JSON.parse(raw);
} catch {}

// Keep only articles that are tightly themed
const keepExisting = (existing.articles || []).filter(a => {
  // Keep manually curated articles
  if ((a.sourceChannel || "").includes("WeChat")) return true;
  // Keep articles with AI summaries that are clearly themed
  if (!a.summary || a.summary.length < 20) return false;
  // Filter out generic/unrelated
  const title = (a.title || "").toLowerCase();
  // Remove ecology, economics, etc. not directly about wind engineering
  const noiseWords = ["ecosystem", "marine ecology", "food web", "biodiversity", "eco-communities"];
  if (noiseWords.some(w => title.includes(w))) return false;
  return true;
});

console.log("Existing kept: " + keepExisting.length + " / " + (existing.articles || []).length);

// 5. Combine and cap
const allArticles = [...articles, ...keepExisting];
const combined = {};
for (const a of allArticles) {
  const cat = a.category || "风电动态";
  if (!combined[cat]) combined[cat] = [];
  combined[cat].push(a);
}

const MAX = 15;
const finalArticles = [];
for (const [cat, arts] of Object.entries(combined)) {
  // Sort manual articles first, then by relevance
  arts.sort((a, b) => {
    const aManual = (a.sourceChannel || "").includes("手动精选") ? 1 : 0;
    const bManual = (b.sourceChannel || "").includes("手动精选") ? 1 : 0;
    if (aManual !== bManual) return bManual - aManual;
    return (b.relevanceScore || 0) - (a.relevanceScore || 0);
  });
  const capped = arts.slice(0, MAX);
  console.log("  " + cat + ": " + capped.length + " (raw: " + arts.length + ")");
  finalArticles.push(...capped);
}

// 6. Write output
const output = {
  app: "机械共性部情报中心",
  generatedAt: now.toISOString(),
  period: { from: periodStart.toISOString(), to: periodEnd.toISOString() },
  collectionStatus: { dataMode: "live", demo: false, manualCount: articles.length, autoCount: keepExisting.length },
  weeklyBrief: {
    total: finalArticles.length,
    domestic: finalArticles.filter(a => a.region === "国内").length,
    papers: finalArticles.filter(a => a.sourceType === "学术论文").length,
    categories: Object.entries(combined).map(([name, arts]) => ({ name, count: Math.min(arts.length, MAX) })),
    period: "2026.07.20-2026.07.26 第30周"
  },
  articles: finalArticles
};

await writeFile("./public/data/articles.json", JSON.stringify(output, null, 2), "utf8");
console.log("\n=== DONE ===");
console.log("Total: " + finalArticles.length + " articles");
console.log("Manual: " + articles.length + " | Auto: " + keepExisting.length);