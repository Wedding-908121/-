// Quick collection test without AI
import { readFile, writeFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import { cleanText, isDomainRelevant, relevanceScore, inferCategory, isNoiseArticle, isLowQualityArticle, isIndustryRelevant, deduplicateArticles, makeArticleId, createFallbackSummary, computeReliability } from "./lib/articles.mjs";
import { resolveAiProvider, summarizeInBatches } from "./lib/ai.mjs";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const now = new Date();
const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true });

// Load API keys (env vars override file for security - config/api.json is gitignored)
var _apiKeys;
try { _apiKeys = JSON.parse(await readFile("./config/api.json", "utf8")); } catch { _apiKeys = {}; }
const openalexKey = process.env.OPENALEX_API_KEY || _apiKeys.openalex?.apiKey || "";
const deepseekKey = process.env.DEEPSEEK_API_KEY || _apiKeys.deepseek?.apiKey || "";
const config = JSON.parse(await readFile("./config/sources.json", "utf8"));
const keywords = config.relevanceKeywords || {};
const periodStart = new Date("2026-07-13T00:00:00.000Z");
const periodEnd = new Date("2026-07-20T23:59:59.999Z");
const academicStart = new Date("2026-01-01T00:00:00.000Z");

async function fetchText(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15000);
  try { const r = await fetch(url, { headers: { Accept: "application/rss+xml,text/xml,text/html" }, signal: c.signal }); return r.text(); }
  finally { clearTimeout(t); }
}

async function fetchJson(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15000);
  try { const r = await fetch(url, { headers: { Accept: "application/json" }, signal: c.signal }); if (!r.ok) throw new Error(r.status); return r.json(); }
  finally { clearTimeout(t); }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJournalRSS(feedUrl, journalName, topicLabel) {
  try {
    const text = await fetchText(feedUrl);
    const data = xmlParser.parse(text);
    let items = [];
    if (data?.RDF?.item) items = [].concat(data.RDF.item);
    else if (data?.rss?.channel?.item) items = [].concat(data.rss.channel.item);
    else if (data?.feed?.entry) items = [].concat(data.feed.entry);
    return items.map(item => {
      let title = item.title || "";
      if (Array.isArray(title)) title = title[title.length - 1] || "";
      if (typeof title === "object") title = title["#text"] || "";
      title = cleanText(String(title));
      let snippet = item.description || item.summary || item.encoded || "";
      if (typeof snippet === "object") snippet = snippet["#text"] || "";
      snippet = cleanText(String(snippet)).slice(0, 2000);
      let url = item.link || item.url || item.identifier || "";
      if (typeof url === "object") url = url["#text"] || "";
      url = String(url).trim();
      let pubDate = item.pubDate || item.date || item.publicationDate || "";
      if (typeof pubDate === "object") pubDate = pubDate["#text"] || "";
      return {
        title, url: url || "", sourceUrl: url || "", snippet, source: journalName,
        publishedAt: new Date(String(pubDate) || Date.now()).toISOString(),
        collectedAt: now.toISOString(), sourceChannel: "RSS/" + journalName,
        linkType: "publisher", region: "海外", language: "en", sourceType: "学术论文",
        queryTopic: topicLabel, contextTags: [topicLabel],
        evidence: { hasAbstract: Boolean(snippet), doi: "", authorsCount: 0, authors: [], journal: journalName, isOpenAccess: true }
      };
    }).filter(item => item.title && item.url);
  } catch(e) { console.warn(journalName + " err: " + e.message); return []; }
}

async function fetchOpenAlex(query, label, region) {
  const key = openalexKey;
  const encoded = encodeURIComponent(query);
  const url = "https://api.openalex.org/works?search=" + encoded + "&filter=from_publication_date:2026-01-01,type:article&sort=publication_date:desc&per_page=15";
  try {
    const response = await fetch(url, { headers: { "User-Agent": "mailto:mech-intel@example.com", Authorization: "Bearer " + key } });
    if (!response.ok) throw new Error(response.status + " " + response.statusText);
    const data = await response.json();
    return (data.results || []).map(work => {
      const source = (work.primary_location || {}).source || {};
      const doi = (work.doi || "").replace("https://doi.org/", "");
      const abstract = work.abstract_inverted_index ? (() => {
        const words = []; for (const [word, positions] of Object.entries(work.abstract_inverted_index)) for (const pos of positions) words[pos] = word;
        return words.filter(Boolean).join(" ");
      })() : "";
      return {
        title: cleanText(work.title || ""),
        url: doi ? "https://doi.org/" + doi : (work.primary_location?.landing_page_url || ""),
        sourceUrl: doi ? "https://doi.org/" + doi : "",
        snippet: abstract.slice(0, 2000),
        source: cleanText(source.display_name || ""),
        publishedAt: work.publication_date || now.toISOString().slice(0,10),
        collectedAt: now.toISOString(), sourceChannel: "OpenAlex/" + label,
        linkType: "publisher", region: region, language: region === "国内" ? "zh" : "en",
        sourceType: "学术论文", queryTopic: label,
        evidence: {
          hasAbstract: Boolean(abstract), doi,
          authorsCount: (work.authorships || []).length,
          authors: (work.authorships || []).map(a => cleanText(a.author?.display_name || "")),
          citedByCount: Number(work.cited_by_count || 0),
          publicationType: cleanText(work.type || ""),
          journal: cleanText(source.display_name || ""),
          publisher: cleanText(source.host_organization_name || ""),
          isOpenAccess: Boolean((work.open_access || {}).is_oa)
        }
      };
    }).filter(item => item.title);
  } catch(e) { console.warn("OpenAlex " + label + ": " + e.message); return []; }
}


function getWeekNumber(d) {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d - start + (start.getTimezoneOffset() - d.getTimezoneOffset()) * 60000;
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
}

console.log("=== Starting quick collection (no AI) ===");

// Fast sources
const sources = [
  { id: "bjx", fn: async () => {
    try {
      const html = await fetchText("https://fd.bjx.com.cn/");
      const matches = [...html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+\.s?html?)[^>]*>([^<]+)<\/a>/gi)];
      const seen = new Set();
      const items = [];
      for (const m of matches) {
        const href = m[1], rawTitle = m[2].replace(/<[^>]*>/g, "").trim();
        if (!rawTitle || rawTitle.length < 8) continue;
        if (!href.includes("fd.bjx.com.cn") && !href.includes("news.bjx.com.cn")) continue;
        if (seen.has(href)) continue; seen.add(href);
        const dateMatch = href.match(/(\d{8})/);
        const pd = dateMatch ? dateMatch[1].slice(0,4)+"-"+dateMatch[1].slice(4,6)+"-"+dateMatch[1].slice(6,8) : now.toISOString().slice(0,10);
        items.push({ title: cleanText(rawTitle), url: href, sourceUrl: href, snippet: "", source: "北极星风力发电网", publishedAt: pd+"T00:00:00.000Z", collectedAt: now.toISOString(), sourceChannel: "北极星风电/风电动态", linkType: "publisher", region: "国内", language: "zh", sourceType: "行业资讯", queryTopic: "industry", contextTags: ["风电"] });
      }
      return items.slice(0, 30);
    } catch(e) { console.warn("BJX: "+e.message); return []; }
  }},
  { id: "chinawind", fn: async () => {
    try {
      const html = await fetchText("http://www.chinawindnews.com/");
      const matches = [...html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+|\/[^"]+)"[^>]*>([^<]{8,150})<\/a>/gi)];
      const seen = new Set(); const items = [];
      for (const m of matches) {
        let href = m[1]; if (href.startsWith("/")) href = "http://www.chinawindnews.com" + href;
        const rawTitle = m[2].replace(/<[^>]*>/g, "").trim();
        if (!rawTitle || rawTitle.length < 10) continue;
        if (seen.has(href)) continue; seen.add(href);
        if (!/[风电场风电风机风电叶片风力风能项目中标招标投产核准开工]/i.test(rawTitle)) continue;
        items.push({ title: cleanText(rawTitle), url: href, sourceUrl: href, snippet: "", source: "每日风电", publishedAt: now.toISOString(), collectedAt: now.toISOString(), sourceChannel: "每日风电/风电动态", linkType: "publisher", region: "国内", language: "zh", sourceType: "行业资讯", queryTopic: "industry", contextTags: ["风电"] });
      }
      return items.slice(0, 30);
    } catch(e) { console.warn("每日风电: "+e.message); return []; }
  }},
  { id: "ai-bot", fn: async () => {
    try {
      const html = await fetchText("https://ai-bot.cn/daily-ai-news/");
      const items = []; const seen = new Set();
      const linkPattern = /<h[23][^>]*><a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a><\/h[23]>/gi;
      let m;
      while ((m = linkPattern.exec(html)) !== null) {
        const href = m[1], rawTitle = m[2].replace(/<[^>]*>/g, "").trim();
        if (!rawTitle || rawTitle.length < 8) continue;
        if (seen.has(href)) continue; seen.add(href);
        if (/融资|美元|亿元|估值|IPO|上市|股价|财报|营收|投资|收购/.test(rawTitle)) continue;
        if (!/AI|人工智能|大模型|LLM|GPT|开源|模型|智能体|Agent|推理|训练|机器学习|深度学习|生成|语音|视觉|机器人|编程|代码|框架|平台|工具/.test(rawTitle)) continue;
        items.push({ title: cleanText(rawTitle), url: href, sourceUrl: href, snippet: "", source: "AI-BOT", publishedAt: "2026-07-19T00:00:00.000Z", collectedAt: now.toISOString(), sourceChannel: "AI-BOT/AI动态", linkType: "aggregator", region: "国内", language: "zh", sourceType: "行业资讯", queryTopic: "AI动态", contextTags: ["AI"] });
      }
      return items.slice(0, 40);
    } catch(e) { console.warn("AI-BOT: "+e.message); return []; }
  }},
  { id: "rss-wind-wiley", fn: () => fetchJournalRSS("https://onlinelibrary.wiley.com/action/showFeed?jc=10991824&type=etoc&feed=rss", "Wind Energy (Wiley)", "风电动态") },
  { id: "rss-wind-mdpi", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/wind", "Wind (MDPI)", "风电动态") },
  { id: "rss-energies", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/energies", "Energies (MDPI)", "风电动态") },
  { id: "rss-materials", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/materials", "Materials (MDPI)", "疲劳断裂") },
  { id: "rss-metals", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/metals", "Metals (MDPI)", "疲劳断裂") },
  { id: "rss-iop", fn: () => fetchJournalRSS("https://iopscience.iop.org/journal/rss/1742-6596", "IOP JPCS", "风电动态") },
];

// OpenAlex sources (staggered)
const oaQueries = config.researchQueries || [];
for (let i = 0; i < oaQueries.length; i++) {
  const q = oaQueries[i];
  sources.push({ id: "oa-" + q.id, fn: async () => { await delay(2000*i); return fetchOpenAlex(q.query, q.label, q.region); } });
}

console.log("Sources: " + sources.length);
const startTime = Date.now();
const results = await Promise.allSettled(sources.map(s => s.fn()));
console.log("Collection took " + ((Date.now()-startTime)/1000).toFixed(1) + "s");

const rawArticles = [];
results.forEach((r, i) => {
  if (r.status === "fulfilled") { rawArticles.push(...r.value); console.log("  " + sources[i].id + ": " + r.value.length); }
  else console.log("  " + sources[i].id + ": FAILED");
});
console.log("Raw total: " + rawArticles.length);

// Date filter
const inWindow = [];
const newsStart = new Date(periodStart.getTime() - 7*86400000);
for (const a of rawArticles) {
  const pubDate = new Date(a.publishedAt);
  const isAcademic = a.sourceType === "学术论文";
  const isNewsScraper = (a.sourceChannel||"").includes("北极星") || (a.sourceChannel||"").includes("每日风电");
  if (isNewsScraper) { inWindow.push(a); continue; }
  const start = isAcademic ? academicStart : newsStart;
  if (pubDate >= start && pubDate <= periodEnd) inWindow.push(a);
}
console.log("In window: " + inWindow.length);

// Filter
const filtered = [];
for (const a of inWindow) {
  if (!a.title || !a.url) continue;
  a.id = makeArticleId(a.url, a.title);
  a.relevanceScore = relevanceScore(a, keywords);
  if (isNoiseArticle(a)) { continue; }
  if (isLowQualityArticle(a)) { continue; }
  const isTrustedNews = a.sourceType === "行业资讯" && ((a.sourceChannel||"").includes("北极星") || (a.sourceChannel||"").includes("每日风电"));
  if (a.queryTopic === "AI动态") { a.relevanceScore = Math.max(a.relevanceScore, 10); }
  else if (isTrustedNews) { a.relevanceScore = Math.max(a.relevanceScore, 5); }
  else if (a.queryTopic === "industry") { if (!isIndustryRelevant(a)) continue; a.relevanceScore += 3; }
  else { if (!isDomainRelevant(a)) continue; }
  if (a.relevanceScore < 2) continue;
  filtered.push(a);
}
console.log("Filtered: " + filtered.length);

const currentArticles = deduplicateArticles(filtered);
console.log("Deduped: " + currentArticles.length);

// Categorize
for (const a of currentArticles) {
  a.category = inferCategory(a);
  if (a.sourceType === "学术论文" || a.sourceType === "论文") {
    if (!a._researchTag) inferCategory(a);
    if (a._researchTag && !(a.tags||[]).includes(a._researchTag)) { if (!a.tags) a.tags = []; a.tags.unshift(a._researchTag); }
    a.category = "学术研究";
  }
  if ((a.source||"") === "AI-BOT" && a.queryTopic === "AI动态") a.category = "AI动态";
  if (a.category === "标准政策" || a.category === "行业资讯" || a.category === "工程技术" || a.category === "气动研究" || a.category === "疲劳断裂" || a.category === "噪声研究" || a.category === "螺栓研究") a.category = "风电动态";
  if (a.category === "AI动态" && (a.source||"") !== "AI-BOT") a.category = "风电动态";
  if (!a.category) a.category = inferCategory(a);
  
  const rConfig = config.reliability || {};
  a.reliability = computeReliability(a, rConfig);
  const s = createFallbackSummary(a);
  a.titleZh = s.titleZh || a.title || "";
  a.summary = s.summary || "";
  a.keyPoints = s.keyPoints || [];
  a.engineeringImpact = s.engineeringImpact || "";
  a.tags = s.tags || a.tags || [];
}

// Per-category cap (15) - sort by quality first within each category
// Academic papers: prioritize by citedByCount, news: by relevanceScore
const categorized = {};
for (const a of currentArticles) {
  const cat = a.category || "??";
  if (!categorized[cat]) categorized[cat] = [];
  categorized[cat].push(a);
}
for (const cat of Object.keys(categorized)) {
  if (cat === "????") {
    categorized[cat].sort((a, b) => {
      const aCite = (a.evidence?.citedByCount || 0);
      const bCite = (b.evidence?.citedByCount || 0);
      if (bCite !== aCite) return bCite - aCite;
      return (b.relevanceScore || 0) - (a.relevanceScore || 0);
    });
  } else {
    categorized[cat].sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  }
}
const capped = [];
const catCounts = {};
const priorityOrder = ["????", "AI??", "????"];
for (const cat of priorityOrder) {
  if (!categorized[cat]) continue;
  for (const a of categorized[cat]) {
    catCounts[cat] = (catCounts[cat] || 0) + 1;
    if (catCounts[cat] <= 15) capped.push(a);
  }
}
for (const cat of Object.keys(categorized).sort()) {
  if (priorityOrder.includes(cat)) continue;
  for (const a of categorized[cat]) {
    catCounts[cat] = (catCounts[cat] || 0) + 1;
    if (catCounts[cat] <= 15) capped.push(a);
  }
}

console.log("\n=== FINAL ===");
const finalCats = {};
for (const a of capped) finalCats[a.category] = (finalCats[a.category]||0)+1;
for (const [cat, count] of Object.entries(finalCats)) console.log("  " + cat + ": " + count);
console.log("Total: " + capped.length);

const academic = capped.filter(a => a.category === "学术研究");
console.log("\n学术研究 papers (" + academic.length + "):");
academic.slice(0, 10).forEach((a, i) => {
  console.log("  " + (i+1) + ". [" + (a._researchTag||"无标签") + "] " + (a.title||"").substring(0, 80) + " | " + a.source);
});


// === AI Summarization ===
console.log("\nStarting AI summarization...");
const aiProvider = await resolveAiProvider();
if (aiProvider) {
  console.log("Using AI: " + aiProvider.id + " " + aiProvider.model);
  const needsSummary = capped.filter(a => !a.keyPoints || a.keyPoints.length === 0);
  if (needsSummary.length > 0) {
    const startTime = Date.now();
    const summaries = await summarizeInBatches(aiProvider, needsSummary, {
      batchSize: 3,
      onBatchError: (e, batchNum) => console.warn("AI batch " + batchNum + " error:", e.message)
    });
    console.log("AI summarized " + summaries.size + "/" + needsSummary.length + " articles (" + ((Date.now()-startTime)/1000).toFixed(0) + "s)");
    
    // Apply summaries
    for (const a of capped) {
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
  } else {
    console.log("All articles already have AI summaries");
  }
} else {
  console.log("No AI provider configured, using fallback summaries");
}

// Write the output
const output = {
  app: "机械共性情报",
  generatedAt: now.toISOString(),
  period: { from: periodStart.toISOString(), to: periodEnd.toISOString() },
  collectionStatus: { dataMode: "live", demo: false, channels: sources.length, succeeded: results.filter(r=>r.status==="fulfilled").length, failed: results.filter(r=>r.status==="rejected").length, rawFetched: rawArticles.length, inWindow: inWindow.length, currentCount: currentArticles.length, archiveCount: capped.length, ai: { provider: "none", model: "", requested: 0, summarized: 0 }, sources: results.map((r,i) => ({ id: sources[i].id, label: sources[i].id, status: r.status==="fulfilled"?"ok":"failed", fetched: r.status==="fulfilled"?r.value.length:0 })) },
  weeklyBrief: { total: capped.length, domestic: capped.filter(a=>a.region==="国内").length, papers: capped.filter(a=>a.sourceType==="学术论文").length, categories: Object.entries(finalCats).map(([name,count]) => ({name,count})), signals: [], period: "7天" },
  articles: capped
};

// Auto-archive: save week snapshot
const weekStart = new Date(periodStart).toISOString().slice(0,10);
const weekEnd = new Date(periodEnd).toISOString().slice(0,10);
const weekNum = getWeekNumber(new Date(periodStart));
const weekKey = weekStart.slice(0,4) + "-W" + weekNum;
const archiveDir = new URL("../public/data/archive/", import.meta.url);
try { await import("node:fs/promises").then(fs => fs.mkdir(archiveDir, { recursive: true })); } catch {}
const archiveData = { week: weekKey, period: { from: periodStart.toISOString(), to: periodEnd.toISOString() }, generatedAt: now.toISOString(), weeklyBrief: { total: capped.length, domestic: capped.filter(a=>a.region==="国内").length, papers: capped.filter(a=>a.sourceType==="学术论文").length, categories: [], signals: [], period: "7天" }, collectionStatus: output.collectionStatus, articles: capped };
await writeFile(new URL(weekKey + ".json", archiveDir), JSON.stringify(archiveData, null, 2), "utf8");
// Update archive index
let archiveIndex = [];
try { archiveIndex = JSON.parse(await readFile(new URL("index.json", archiveDir), "utf8")); } catch {}
const existing = archiveIndex.find(e => e.week === weekKey);
if (existing) { existing.count = capped.length; existing.generatedAt = now.toISOString(); }
else { archiveIndex.push({ week: weekKey, label: weekStart + "-" + weekEnd + " 第" + weekNum + "周", count: capped.length, generatedAt: now.toISOString() }); }
archiveIndex.sort((a,b) => b.week.localeCompare(a.week));
await writeFile(new URL("index.json", archiveDir), JSON.stringify(archiveIndex, null, 2), "utf8");
console.log("Archived to " + weekKey + " (" + archiveIndex.length + " weeks total)");

await writeFile("./public/data/articles.json", JSON.stringify(output, null, 2), "utf8");
console.log("\nWritten to public/data/articles.json");
