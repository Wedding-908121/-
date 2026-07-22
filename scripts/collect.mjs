import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { GoogleDecoder } from "google-news-url-decoder";
import { parse } from "node-html-parser";
import {
  cleanText, createFallbackSummary, deduplicateArticles, inferCategory, inferTags,
  isDomainRelevant, isIndustryRelevant, isLowQualityArticle, isNoiseArticle, makeArticleId,
  relevanceScore, resolveNewsUrl, toPublicArticle
} from "./lib/articles.mjs";
import { resolveAiProvider, summarizeInBatches } from "./lib/ai.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const configPath = new URL("../config/sources.json", import.meta.url);
const outputPath = new URL("../public/data/articles.json", import.meta.url);
const dryRun = process.argv.includes("--dry-run");
const forceAiSummary = process.argv.includes("--resummarize") ||
  /^(?:1|true|yes)$/i.test(String(process.env.AI_RESUMMARIZE_EXISTING || ""));
const now = new Date();
const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true });
const googleDecoder = new GoogleDecoder();

async function readJson(url, fallback) {
  try { return JSON.parse(await readFile(url, "utf8")); }
  catch { return fallback; }
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJson(url, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "mechanical-intelligence/0.1 (mailto:mech-intel@example.com)" },
        signal: controller.signal
      });
      if (response.ok) return response.json();
      if (attempt === retries || (response.status !== 429 && response.status < 500))
        throw new Error(response.status + " " + response.statusText);
      // 429 or 5xx: backoff
      const retryAfter = Number(response.headers.get("retry-after") || 0) * 1000;
      const waitMs = Math.max(retryAfter, 3000 * (attempt + 1));
      console.warn("  Retry " + (attempt + 1) + " for " + url.slice(0, 80) + " in " + (waitMs / 1000) + "s");
      await delay(waitMs);
    } finally { clearTimeout(timeout); }
  }
  throw new Error("JSON request failed");
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/rss+xml,text/xml,text/html", "User-Agent": "mechanical-intelligence/0.1" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(response.status + " " + response.statusText);
    return response.text();
  } finally { clearTimeout(timeout); }
}

async function fetchArxivPapers(query, label, region) {
  const encoded = encodeURIComponent(query);
  const url = "https://export.arxiv.org/api/query?search_query=all:" + encoded +
    "&start=0&max_results=10&sortBy=submittedDate&sortOrder=descending";
  try {
    const text = await fetchText(url);
    const entries = text.split("<entry>").slice(1);
    return entries.map(entry => {
      const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
      const summaryMatch = entry.match(/<summary>([^<]+)<\/summary>/);
      const linkMatch = entry.match(/<id>([^<]+)<\/id>/);
      const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);
      const authorMatches = [...entry.matchAll(/<name>([^<]+)<\/name>/g)];
      const journalMatch = entry.match(/<arxiv:journal_ref[^>]*>([^<]+)<\/arxiv:journal_ref>/);
      const title = cleanText(titleMatch?.[1] || "");
      if (!title) return null;
      return {
        title,
        url: linkMatch?.[1]?.trim() || "",
        sourceUrl: linkMatch?.[1]?.trim() || "",
        snippet: cleanText(summaryMatch?.[1] || "").slice(0, 2000),
        source: journalMatch?.[1] ? cleanText(journalMatch[1]) : "arXiv",
        publishedAt: publishedMatch?.[1]?.trim() || new Date().toISOString().slice(0,10),
        collectedAt: now.toISOString(),
        sourceChannel: "arXiv/" + label,
        linkType: "publisher",
        region: region,
        language: "en",
        sourceType: "学术论文",
        evidence: {
          hasAbstract: Boolean(summaryMatch?.[1]),
          doi: "",
          authorsCount: authorMatches.length,
          authors: authorMatches.map(m => cleanText(m[1])),
          citedByCount: 0,
          publicationType: "preprint",
          journal: "arXiv",
          publisher: "arXiv",
          isOpenAccess: true
        }
      };
    }).filter(Boolean);
  } catch (error) {
    console.warn("arXiv fetch failed: " + label + " - " + error.message);
    return [];
  }
}

async function fetchCrossrefPapers(query, label, region) {
  const encoded = encodeURIComponent(query);
  const url = "https://api.crossref.org/works?query=" + encoded +
    "&filter=type:journal-article&rows=10&sort=published&order=desc";
  try {
    const data = await fetchJson(url);
    return (data.message?.items || []).map(item => {
      const title = cleanText((item.title || [""])[0] || "");
      const doi = item.DOI || "";
      const pubDate = (item.published?.["date-parts"]?.[0] || []).join("-") || 
        (item.created?.["date-parts"]?.[0] || []).join("-");
      const authors = (item.author || []).map(a => cleanText((a.given || "") + " " + (a.family || "")));
      return {
        title,
        url: doi ? "https://doi.org/" + doi : "",
        sourceUrl: doi ? "https://doi.org/" + doi : "",
        snippet: cleanText(item.abstract || "").slice(0, 2000),
        source: cleanText((item["container-title"] || [""])[0] || ""),
        publishedAt: pubDate || new Date().toISOString().slice(0,10),
        collectedAt: now.toISOString(),
        sourceChannel: "Crossref/" + label,
        linkType: "publisher",
        region: region,
        language: "en",
        sourceType: "学术论文",
        evidence: {
          hasAbstract: Boolean(item.abstract),
          doi: doi,
          authorsCount: authors.length,
          authors: authors,
          citedByCount: Number(item["is-referenced-by-count"] || 0),
          publicationType: cleanText(item.type || ""),
          journal: cleanText((item["container-title"] || [""])[0] || ""),
          publisher: cleanText(item.publisher || ""),
          isOpenAccess: false
        }
      };
    }).filter(item => item.title);
  } catch (error) {
    console.warn("Crossref fetch failed: " + label + " - " + error.message);
    return [];
  }
}

// Wrapper that tries arXiv first, then Crossref
async function fetchAcademicPapers(query, label, region) {
  const arxivResults = await fetchArxivPapers(query, label, region);
  if (arxivResults.length >= 3) return arxivResults;
  // Supplement with Crossref if arXiv returns few results
  const crossrefResults = await fetchCrossrefPapers(query, label, region);
  // Deduplicate by title similarity
  const seen = new Set(arxivResults.map(a => a.title.toLowerCase().slice(0, 50)));
  const unique = crossrefResults.filter(a => !seen.has(a.title.toLowerCase().slice(0, 50)));
  return [...arxivResults, ...unique];
}

async function fetchOpenAlexWithKey(query, label, region) {
  const key = (await readJson(new URL("../config/api.json", import.meta.url), {})).openalex?.apiKey || "";
  if (!key) { console.warn("OpenAlex: no API key configured"); return []; }
  const encoded = encodeURIComponent(query);
  const d30 = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const url = "https://api.openalex.org/works?search=" + encoded +
    "&filter=from_publication_date:" + d30 + ",type:article&sort=publication_date:desc&per_page=10";
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "mailto:mech-intel@example.com", "Authorization": "Bearer " + key }
    });
    if (!response.ok) throw new Error(response.status + " " + response.statusText);
    const data = await response.json();
    return (data.results || []).map(work => {
      const source = (work.primary_location || {}).source || {};
      const doi = (work.doi || "").replace("https://doi.org/", "");
      const abstract = work.abstract_inverted_index ? (() => {
        const words = [];
        for (const [word, positions] of Object.entries(work.abstract_inverted_index))
          for (const pos of positions) words[pos] = word;
        return words.filter(Boolean).join(" ");
      })() : "";
      return {
        title: cleanText(work.title || ""),
        url: doi ? "https://doi.org/" + doi : (work.primary_location?.landing_page_url || ""),
        sourceUrl: doi ? "https://doi.org/" + doi : "",
        snippet: abstract.slice(0, 2000),
        source: cleanText(source.display_name || ""),
        publishedAt: work.publication_date || new Date().toISOString().slice(0,10),
        collectedAt: now.toISOString(),
        sourceChannel: "OpenAlex/" + label,
        linkType: "publisher",
        region: region,
        language: region === "国内" ? "zh" : "en",
        sourceType: "学术论文",
        evidence: {
          hasAbstract: Boolean(abstract),
          doi: doi,
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
  } catch (error) {
    console.warn("OpenAlex fetch failed: " + label + " - " + error.message);
    return [];
  }
}

async function fetchChinaWindNews() {
  try {
    const html = await fetchText("http://www.chinawindnews.com/");
    const linkRegex = new RegExp(String.raw`<a[^>]+href="(https?://[^"]+|/[^"]+)"[^>]*>([^<]{8,150})</a>`, "gi");
    const linkMatches = [...html.matchAll(linkRegex)];
    const seen = new Set();
    const items = [];
    for (const match of linkMatches) {
      let href = match[1];
      if (href.startsWith("/")) href = "http://www.chinawindnews.com" + href;
      const rawTitle = match[2].replace(/<[^>]*>/g, "").trim();
      if (!rawTitle || rawTitle.length < 10) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      // Only wind-related news
      if (!/[风电场风电风机风电叶片风力风能项目中标招标投产核准开工]/i.test(rawTitle)) continue;
      items.push({
        title: cleanText(rawTitle),
        url: href,
        sourceUrl: href,
        snippet: "",
        source: "每日风电",
        publishedAt: now.toISOString(),
        collectedAt: now.toISOString(),
        sourceChannel: "每日风电/风电动态",
        linkType: "publisher",
        region: "国内",
        language: "zh",
        sourceType: "行业资讯",
        queryTopic: "industry",
        contextTags: ["风电", "行业动态"]
      });
    }
    return items.slice(0, 30);
  } catch (error) {
    console.warn("每日风电 fetch failed: " + error.message);
    return [];
  }
}

async function fetchBjxNews() {
  try {
    const html = await fetchText("https://fd.bjx.com.cn/");
    const linkMatches = [...html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+\.s?html?)[^>]*>([^<]+)<\/a>/gi)];
    const seen = new Set();
    const items = [];
    for (const match of linkMatches) {
      const href = match[1];
      const rawTitle = match[2].replace(/<[^>]*>/g, "").trim();
      if (!rawTitle || rawTitle.length < 8) continue;
      if (!href.includes("fd.bjx.com.cn") && !href.includes("news.bjx.com.cn")) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      const dateMatch = href.match(/(\d{8})/);
      const pubDate = dateMatch ? dateMatch[1].slice(0,4) + "-" + dateMatch[1].slice(4,6) + "-" + dateMatch[1].slice(6,8) : new Date().toISOString().slice(0,10);
      items.push({
        title: cleanText(rawTitle),
        url: href,
        sourceUrl: href,
        snippet: "",
        source: "\u5317\u6781\u661f\u98ce\u529b\u53d1\u7535\u7f51",
        publishedAt: pubDate + "T00:00:00.000Z",
        collectedAt: now.toISOString(),
        sourceChannel: "\u5317\u6781\u661f\u98ce\u7535/\u98ce\u7535\u52a8\u6001",
        linkType: "publisher",
        region: "\u56fd\u5185",
        language: "zh",
        sourceType: "\u884c\u4e1a\u8d44\u8baf",
        queryTopic: "industry",
        contextTags: ["\u98ce\u7535", "\u884c\u4e1a\u52a8\u6001"]
      });
    }
    return items.slice(0, 30);
  } catch (error) {
    console.warn("\u5317\u6781\u661f\u98ce\u7535 fetch failed: " + error.message);
    return [];
  }
}

async function fetchChinanewsRSS(feedUrl, label) {
  try {
    const xml = await fetchText(feedUrl);
    const data = xmlParser.parse(xml);
    const items = (data?.rss?.channel?.item || []).map(item => {
      const link = item.link || item.guid || "";
      return {
        title: cleanText(item.title || ""),
        url: link,
        sourceUrl: link,
        snippet: cleanText(item.description || ""),
        source: "\u4e2d\u56fd\u65b0\u95fb\u7f51",
        publishedAt: new Date(item.pubDate || Date.now()).toISOString(),
        collectedAt: now.toISOString(),
        sourceChannel: "\u4e2d\u65b0\u7f51/" + label,
        linkType: "publisher",
        region: "\u56fd\u5185",
        language: "zh",
        sourceType: "\u884c\u4e1a\u8d44\u8baf"
      };
    }).filter(item => item.title && item.url);
    return items;
  } catch (error) {
    console.warn("\u4e2d\u65b0\u7f51 fetch failed: " + label + " - " + error.message);
    return [];
  }
}

async function fetchAiBotNews() {
    try {
      const html = await fetchText("https://ai-bot.cn/daily-ai-news/");
      const items = [];
      const seen = new Set();
      const linkMatches = [...html.matchAll(/<h[23][^>]*><a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a><\/h[23]>/gi)];
      for (const match of linkMatches) {
        const href = match[1];
        const rawTitle = match[2].replace(/<[^>]*>/g, "").trim();
        if (!rawTitle || rawTitle.length < 8) continue;
        if (seen.has(href)) continue;
        seen.add(href);
        // Filter out pure business/funding news
        if (/融资|美元|亿元|估值|IPO|上市|股价|财报|营收|投资|收购/.test(rawTitle)) continue;
        // Focus on tech/application AI news
        if (!/AI|人工智能|大模型|LLM|GPT|开源|模型|智能体|Agent|推理|训练|机器学习|深度学习|生成|语音|视觉|机器人|编程|代码|框架|平台|工具/.test(rawTitle)) continue;
        items.push({
          title: cleanText(rawTitle),
          url: href,
          sourceUrl: href,
          snippet: "",
          source: "AI-BOT",
          publishedAt: "2026-07-19T00:00:00.000Z",
          collectedAt: now.toISOString(),
          sourceChannel: "AI-BOT/AI动态",
          linkType: "aggregator",
          region: "国内",
          language: "zh",
          sourceType: "行业资讯",
          queryTopic: "AI动态",
          contextTags: ["AI", "人工智能", "技术前沿"]
        });
      }
      return items.slice(0, 40);
    } catch (error) {
      console.warn("AI-BOT fetch failed: " + error.message);
      return [];
    }
  }

async function fetchJournalRSS(feedUrl, journalName, topicLabel) {
  try {
    const text = await fetchText(feedUrl);
    const data = xmlParser.parse(text);
    
    // Handle RSS 1.0 (RDF - MDPI uses this)
    let items = [];
    if (data?.RDF?.item) items = [].concat(data.RDF.item);
    // RSS 2.0
    else if (data?.rss?.channel?.item) items = [].concat(data.rss.channel.item);
    // Atom
    else if (data?.feed?.entry) items = [].concat(data.feed.entry);
    
    return items.map(item => {
      // MDPI title is an array: ["Journal, Vol, Pages: Actual Title", "Actual Title"]
      let title = item.title || "";
      if (Array.isArray(title)) title = title[title.length - 1] || "";
      if (typeof title === "object") title = title["#text"] || "";
      title = cleanText(String(title));
      
      // Description / summary
      let snippet = item.description || item.summary || item.encoded || "";
      if (typeof snippet === "object") snippet = snippet["#text"] || "";
      snippet = cleanText(String(snippet)).slice(0, 2000);
      
      // URL - try multiple fields
      let url = item.link || item.url || item.identifier || "";
      if (typeof url === "object") url = url["#text"] || "";
      url = String(url).trim();
      if (url.startsWith("{")) url = ""; // skip JSON blobs
      
      // Date
      let pubDate = item.pubDate || item.date || item.publicationDate || "";
      if (typeof pubDate === "object") pubDate = pubDate["#text"] || "";
      
      // Authors
      let author = item.creator || item.author || "";
      if (Array.isArray(author)) author = author[0] || "";
      if (typeof author === "object") author = author["#text"] || "";
      
      // DOI
      let doi = item.doi || item.identifier || "";
      if (typeof doi === "object") doi = doi["#text"] || "";
      doi = String(doi).replace("https://doi.org/", "").trim();
      
      return {
        title,
        url: url || (doi ? "https://doi.org/" + doi : ""),
        sourceUrl: url || "",
        snippet,
        source: journalName,
        publishedAt: new Date(String(pubDate) || Date.now()).toISOString(),
        collectedAt: now.toISOString(),
        sourceChannel: "RSS/" + journalName,
        linkType: "publisher",
        region: "海外",
        language: "en",
        sourceType: "学术论文",
        queryTopic: topicLabel,
        contextTags: [topicLabel],
        evidence: {
          hasAbstract: Boolean(snippet),
          doi,
          authorsCount: author ? 1 : 0,
          authors: author ? [cleanText(String(author))] : [],
          journal: journalName,
          isOpenAccess: true
        }
      };
    }).filter(item => item.title && item.url);
  } catch (error) {
    console.warn("Journal RSS fetch failed: " + journalName + " - " + error.message);
    return [];
  }
}

function titleSimilarity(a, b) {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union ? intersection / union : 0;
}

function buildWeeklyBrief(articles, lookbackDays) {
  const domestic = articles.filter(a => a.region === "\u56fd\u5185").length;
  const papers = articles.filter(a => a.sourceType === "\u5b66\u672f\u8bba\u6587").length;
  const categories = {};
  for (const a of articles) {
    const cat = a.category || "\u5176\u4ed6";
    categories[cat] = (categories[cat] || 0) + 1;
  }
  const topCategories = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const allTags = articles.flatMap(a => a.tags || []);
  const tagFreq = {};
  for (const t of allTags) { tagFreq[t] = (tagFreq[t] || 0) + 1; }
  const signals = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag, count]) => ({ tag, count }));
  return { total: articles.length, domestic, papers,
    categories: topCategories.map(([name, count]) => ({ name, count })), signals,
    period: lookbackDays + "\u5929" };
}

async function main() {
  console.log("\u673a\u68b0\u5171\u6027\u60c5\u62a5\u91c7\u96c6\u542f\u52a8 " + now.toISOString());
  const config = await readJson(configPath);
  const { lookbackDays = 7, maxArticles = 80, historyMaxArticles = 400,
    historyRetentionDays = 730, minimumRelevanceScore = 2,
    relevanceKeywords = {}, reliability: reliabilityConfig = {},
    weekStart, weekEnd } = config;

  // Use config weekStart/weekEnd if available, otherwise use lookbackDays
  let periodStart, periodEnd;
  if (weekStart && weekEnd) {
    periodStart = new Date(weekStart + "T00:00:00.000Z");
    periodEnd = new Date(weekEnd + "T23:59:59.999Z");
    console.log("时间窗口: " + weekStart + " ~ " + weekEnd);
  } else {
    periodStart = new Date(now.getTime() - lookbackDays * 86400000);
    periodEnd = now;
  }

  const previousData = await readJson(outputPath, { articles: [] });
  const previousArticles = (previousData.articles || []).map(a => ({ ...a, reliabilityConfig }));

  // === DATA SOURCES ===
    // Fast sources (news/RSS) - run in parallel
  // Fast sources: news + journal RSS
  const fastSources = [
    { id: "ai-bot", label: "AI-bot日报", fn: fetchAiBotNews },
  
    { id: "bjx", label: "北极星风电", fn: fetchBjxNews },
    { id: "chinawind", label: "每日风电", fn: fetchChinaWindNews },
    { id: "rss-energies", label: "Energies", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/energies", "Energies (MDPI)", "风电动态") },
    // Journal RSS feeds (curated for mechanical/wind engineering relevance)
    { id: "rss-materials", label: "Materials", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/materials", "Materials (MDPI)", "疲劳断裂") },
    { id: "rss-metals", label: "Metals", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/metals", "Metals (MDPI)", "疲劳断裂") },
    { id: "rss-wind-wiley", label: "Wind Energy (Wiley)", fn: () => fetchJournalRSS("https://onlinelibrary.wiley.com/action/showFeed?jc=10991824&type=etoc&feed=rss", "Wind Energy (Wiley)", "风电动态") },
    { id: "rss-wind-mdpi", label: "Wind (MDPI)", fn: () => fetchJournalRSS("https://www.mdpi.com/rss/journal/wind", "Wind (MDPI)", "风电动态") },
    { id: "rss-iop", label: "IOP JPCS", fn: () => fetchJournalRSS("https://iopscience.iop.org/journal/rss/1742-6596", "IOP JPCS", "风电动态") },
  ];
  // OpenAlex academic paper sources (with API key, staggered for rate limits)
  const oaSources = (config.researchQueries || []).map((q, i) => ({
    id: "oa-" + q.id, label: "OpenAlex/" + q.label, fn: async () => {
      await delay(2000 * i); // stagger to avoid rate limits
      return fetchOpenAlexWithKey(q.query, q.label, q.region);
    }
  }));

  const sources = [...fastSources, ...oaSources];

  console.log("共 " + sources.length + " 个采集通道 (" + fastSources.length + " 快 + " + oaSources.length + " OpenAlex)");
  const fetchStart = Date.now();
  const results = await Promise.allSettled(sources.map(s => s.fn()));
  console.log("采集完成, 耗时 " + ((Date.now() - fetchStart) / 1000).toFixed(1) + "s");

  const rawArticles = [];
  const channelResults = [];
  results.forEach((r, i) => {
    channelResults.push({ id: sources[i].id, label: sources[i].label,
      status: r.status === "fulfilled" ? "ok" : "failed",
      fetched: r.status === "fulfilled" ? r.value.length : 0,
      error: r.status === "rejected" ? cleanText(r.reason?.message || "").slice(0, 180) : "" });
    if (r.status === "fulfilled") rawArticles.push(...r.value);
  });
  console.log("\u539f\u59cb\u6293\u53d6: " + rawArticles.length + " \u6761");

  // === DATE FILTER ===
  // News: 14-day window (news sites only show latest, can'''t retrieve history)
  // Academic papers: 30-day window (online-first dates precede formal publication)
  const newsStart = new Date(periodStart.getTime() - 7 * 86400000); // 14 days for news
  const academicStart = new Date("2026-01-01T00:00:00.000Z"); // Full 2026 for papers
  const inWindow = [];
  const outWindow = [];
  for (const article of rawArticles) {
    const pubDate = new Date(article.publishedAt);
    const isAcademic = article.sourceType === "学术论文";
    // Homepage news scrapers: always current, bypass date check
    const isNewsScraper = (article.sourceChannel || "").includes("北极星") || (article.sourceChannel || "").includes("每日风电");
    if (isNewsScraper) { inWindow.push(article); continue; }
    const start = isAcademic ? academicStart : newsStart;
    if (pubDate >= start && pubDate <= periodEnd) inWindow.push(article);
    else outWindow.push(article);
  }
  console.log("时间窗口内: " + inWindow.length + " 条 (排除 " + outWindow.length + " 条, 新闻14天/论文30天)");

  // === KEYWORD FILTER ===
  const rawToFilter = inWindow.length > 5 ? inWindow : rawArticles; // fallback if too few in window
  const filtered = [];
  for (const article of rawToFilter) {
    if (!article.title || !article.url) continue;
    article.id = makeArticleId(article.url, article.title);
    article.relevanceScore = relevanceScore(article, relevanceKeywords);
    article.reliabilityConfig = reliabilityConfig;
    if (isNoiseArticle(article)) continue;
    if (isLowQualityArticle(article)) continue;
    
    // Trusted wind news sources: always accept
    const isTrustedNews = article.sourceType === "行业资讯" && 
      ((article.sourceChannel || "").includes("北极星") || (article.sourceChannel || "").includes("每日风电"));
    
    if (article.queryTopic === "AI动态") {
      article.relevanceScore = Math.max(article.relevanceScore, 10);
    } else if (isTrustedNews) {
      article.relevanceScore = Math.max(article.relevanceScore, 5);
    } else if (article.queryTopic === "industry") {
      if (!isIndustryRelevant(article)) continue;
      article.relevanceScore += 3;
    } else {
      if (!isDomainRelevant(article)) continue;
    }
    if (article.relevanceScore < minimumRelevanceScore) continue;
    filtered.push(article);
  }
  console.log("\u8fc7\u6ee4\u540e: " + filtered.length + " \u6761");

  const currentArticles = deduplicateArticles(filtered).slice(0, Math.max(maxArticles, 300)); // Allow more for per-category distribution
  console.log("\u53bb\u91cd\u540e: " + currentArticles.length + " \u6761");

  // === AI SUMMARIZATION ===
  const aiProvider = resolveAiProvider();
  const existingMap = new Map(previousArticles.map(a => [a.id, a]));
  const needsSummary = [];
  for (const article of currentArticles) {
    const existing = existingMap.get(article.id);
    if (!existing || forceAiSummary || (!existing.titleZh && !/[\p{Script=Han}]/u.test(existing.title || "")))
      needsSummary.push(article);
  }

  let aiSummaries = new Map();
  if (aiProvider && needsSummary.length > 0) {
    console.log("AI\u6458\u8981: " + needsSummary.length + " \u6761, \u4f7f\u7528 " + aiProvider.label);
    aiSummaries = await summarizeInBatches(aiProvider, needsSummary, {
      batchSize: 2,
      onBatchError: (error, batchId, batch) => {
        console.warn("Batch " + batchId + " failed: " + error.message);
        for (const article of batch) aiSummaries.set(article.id, createFallbackSummary(article));
      }
    });
    console.log("AI\u6458\u8981\u5b8c\u6210: " + aiSummaries.size + " \u6761");
  } else if (needsSummary.length > 0) {
    console.log("\u672a\u914d\u7f6eAI, " + needsSummary.length + " \u6761\u4f7f\u7528\u516c\u5f00\u6458\u8981\u515c\u5e95");
    for (const article of needsSummary) aiSummaries.set(article.id, createFallbackSummary(article));
  }

  // === TECH RELEVANCE SCORE for 风电动态 ===
  // Prioritize engineering/technical content over pure business news
  const techKeywords = ["技术", "研发", "创新", "突破", "测试", "试验", "认证", "样机", "新品",
    "设计", "制造", "工艺", "材料", "结构", "效率", "性能", "可靠性", "专利",
    "兆瓦", "MW", "大容量", "大型", "海上", "深远海", "漂浮式", "双馈", "直驱", "半直驱",
    "叶片", "塔筒", "齿轮箱", "发电机", "变流器", "轴承", "变桨", "主控",
    "technology", "innovation", "prototype", "design", "manufacturing"];
  
  for (const article of currentArticles) {
    if (article.queryTopic === "industry") {
      const text = (article.title + " " + (article.snippet || "")).toLowerCase();
      let techScore = 0;
      for (const kw of techKeywords) {
        if (text.includes(kw.toLowerCase())) techScore += 2;
      }
      article._techScore = techScore;
    }
  }
  
  // Sort: AI-BOT news first, then industry tech news, then papers
  currentArticles.sort((a, b) => {
    // AI-BOT news always first
    if (((a.source||"") === "AI Bot" || (a.source||"") === "AI-BOT") && (b.source||"") !== "AI Bot" && (b.source||"") !== "AI-BOT") return -1;
    if ((a.source||"") !== "AI Bot" && (a.source||"") !== "AI-BOT" && ((b.source||"") === "AI Bot" || (b.source||"") === "AI-BOT")) return 1;
    if (a.queryTopic === "industry" && b.queryTopic !== "industry") return -1;
    if (a.queryTopic !== "industry" && b.queryTopic === "industry") return 1;
    if (a.queryTopic === "industry") return (b._techScore || 0) - (a._techScore || 0);
    return 0;
  });

  // === POST-FILTER: 风电动态 only for news, not papers ===
  for (const article of currentArticles) {
    if (article.sourceType === "学术论文" && article.category === "风电动态") {
      // Reclassify wind papers to appropriate technical category
      article.category = "学术论文";
    }
    // News articles without explicit date = recent, mark as in-window
    if (article.sourceType === "行业资讯" && !article.publishedAt) {
      article.publishedAt = new Date().toISOString();
    }
  }

  // === BUILD OUTPUT ===
  const candidateIds = new Set(currentArticles.map(a => a.id));
  let publicArticles = currentArticles.map(article => {
    const summary = aiSummaries.get(article.id);
    if (summary) {
      article.titleZh = summary.titleZh || article.titleZh;
      article.aiSummary = summary.summary;
      article.aiKeyPoints = summary.keyPoints;
      article.aiEngineeringImpact = summary.engineeringImpact;
      article.category = summary.category || article.category;
      article.tags = summary.tags || article.tags;
      article.aiPaperDetails = summary.paperDetails;
      article.aiIndustryDetails = summary.industryDetails;
    }
    if (article.sourceType === "学术论文" || article.sourceType === "论文") process.stdout.write("P");
    // Force AI-BOT articles to AI动态 (only non-wind AI)
    if ((article.source||"") === "AI-BOT" && article.queryTopic === "AI动态") {
      article.category = "AI动态";
    }
    // Force academic papers to "学术研究", preserve sub-topic in tags
    if (article.sourceType === "学术论文" || article.sourceType === "论文") {
      // Ensure research tag is set
      if (!article._researchTag) {
        inferCategory(article); // Sets _researchTag as side effect
      }
      if (article._researchTag && !(article.tags||[]).includes(article._researchTag)) {
        if (!article.tags) article.tags = [];
        article.tags.unshift(article._researchTag);
      }
      article.category = "学术研究";
    }
    // Wind-related AI from non-AI-BOT sources → reclassify
    if (article.category === "AI动态" && (article.source||"") !== "AI-BOT") {
      article.category = "风电动态";
    }
    // Normalize: any remaining wind news → "风电动态"
    if (article.category === "标准政策" || article.category === "行业资讯") {
      article.category = "风电动态";
    }
    // Ensure category is always set
    if (!article.category) article.category = inferCategory(article);
    if (!article.tags || !article.tags.length) article.tags = inferTags(article);
    const pa = toPublicArticle(article);
    if (aiProvider && summary) {
      pa.aiAnalysis = { provider: aiProvider.id, model: aiProvider.model,
        generatedAt: now.toISOString(), reason: "new" };
    }
    return pa;
  });

  // Per-category cap (applied after categories assigned)
  // 风电动态 news can have more items, other categories max 12
  const catMax = { "default": 15 };
  const acadCount = publicArticles.filter(a => a.category === "学术研究").length;
  console.log("学术研究BEFORE in currentArticles: " + acadCount);
  const catCounts = {};
  const capped = [];
  for (const pa of publicArticles) {
    const cat = pa.category || "其他";
    catCounts[cat] = (catCounts[cat] || 0) + 1;
    const max = catMax[cat] || catMax["default"];
    if (catCounts[cat] <= max) capped.push(pa);
  }
  const removed = publicArticles.length - capped.length;
  if (removed > 0) console.log("分类上限裁剪: 移除 " + removed + " 条 (每类最多15条)");
  publicArticles = capped;

  const updatedPrevious = previousArticles.map(article => {
    const summary = aiSummaries.get(article.id);
    if (!summary || candidateIds.has(article.id)) return article;
    article.titleZh = summary.titleZh || article.titleZh;
    article.aiSummary = summary.summary;
    article.aiKeyPoints = summary.keyPoints;
    article.aiEngineeringImpact = summary.engineeringImpact;
    article.category = summary.category || article.category;
    article.tags = summary.tags || article.tags;
    article.aiPaperDetails = summary.paperDetails;
    article.aiIndustryDetails = summary.industryDetails;
    return article;
  });

  const historyCutoff = now.getTime() - historyRetentionDays * 86400000;
  const articles = deduplicateArticles([...publicArticles, ...updatedPrevious])
    .filter(a => new Date(a.publishedAt).getTime() >= historyCutoff)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, historyMaxArticles);

  const payload = {
    app: "\u673a\u68b0\u5171\u6027\u60c5\u62a5",
    generatedAt: now.toISOString(),
    period: { from: periodStart.toISOString(), to: periodEnd.toISOString() },
    collectionStatus: {
      dataMode: "live", demo: false,
      channels: sources.length,
      succeeded: results.filter(r => r.status === "fulfilled").length,
      failed: results.filter(r => r.status === "rejected").length,
      rawFetched: rawArticles.length, inWindow: inWindow.length,
      currentCount: currentArticles.length,
      archiveCount: articles.length,
      ai: { provider: aiProvider?.id || "none", model: aiProvider?.model || "",
        requested: needsSummary.length, summarized: aiSummaries.size },
      sources: channelResults
    },
    weeklyBrief: buildWeeklyBrief(publicArticles, lookbackDays),
    articles
  };

  if (dryRun) { console.log(JSON.stringify(payload, null, 2)); return; }
  await writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log("\u5df2\u5199\u5165\u672c\u5468 " + publicArticles.length + " \u6761\u3001\u8d44\u6599\u5e93 " + articles.length + " \u6761");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
