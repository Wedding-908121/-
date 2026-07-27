import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { cleanText, isDomainRelevant, isNoiseArticle } from "./lib/articles.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true });

async function fetchText(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 12000);
  try { const r = await fetch(url, { headers: { Accept: "application/rss+xml,text/xml" }, signal: c.signal }); return r.text(); }
  finally { clearTimeout(t); }
}

console.log("=== RSS feed wind-relevance (after filter fix) ===\n");

const feeds = [
  ["Materials (MDPI)", "https://www.mdpi.com/rss/journal/materials", "金属材料"],
  ["Metals (MDPI)", "https://www.mdpi.com/rss/journal/metals", "金属材料"],
  ["Acoustics (MDPI)", "https://www.mdpi.com/rss/journal/acoustics", "风机噪声"],
  ["Sensors (MDPI)", "https://www.mdpi.com/rss/journal/sensors", "风电试验"],
  ["Corrosion (MDPI)", "https://www.mdpi.com/rss/journal/cmd", "金属材料"],
  ["Energies (MDPI)", "https://www.mdpi.com/rss/journal/energies", "风电动态"],
  ["Wind Energy (Wiley)", "https://onlinelibrary.wiley.com/action/showFeed?jc=10991824&type=etoc&feed=rss", "风电动态"],
];

for (const [name, url, topic] of feeds) {
  try {
    const text = await fetchText(url);
    const data = xmlParser.parse(text);
    let items = [];
    if (data?.RDF?.item) items = [].concat(data.RDF.item);
    else if (data?.rss?.channel?.item) items = [].concat(data.rss.channel.item);
    else if (data?.feed?.entry) items = [].concat(data.feed.entry);
    
    let windCount = 0;
    const checkCount = Math.min(30, items.length);
    for (const item of items.slice(0, checkCount)) {
      let title = item.title;
      if (Array.isArray(title)) title = title[title.length - 1] || "";
      if (typeof title === "object") title = title["#text"] || "";
      title = cleanText(String(title));
      const article = { title, snippet: "", source: name, sourceType: "学术论文", queryTopic: topic, tags: [], url: "http://x", sourceChannel: "RSS/" + name };
      if (isDomainRelevant(article) && !isNoiseArticle(article)) windCount++;
    }
    console.log(name + ": " + checkCount + " items, " + windCount + " wind-relevant (" + Math.round(windCount/checkCount*100) + "%)");
  } catch(e) { console.log(name + ": ERR - " + e.message.substring(0, 60)); }
}

console.log("\nDone!");
