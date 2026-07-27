import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { cleanText, isDomainRelevant, isNoiseArticle } from "./lib/articles.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true });
const config = JSON.parse(await readFile(root + "config/sources.json", "utf8"));
const key = "TrO2Ktesn4PoKlmEb3hlfT";

async function fetchText(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 12000);
  try { const r = await fetch(url, { headers: { Accept: "application/rss+xml,text/xml" }, signal: c.signal }); return r.text(); }
  finally { clearTimeout(t); }
}

async function testOA(query, label) {
  const encoded = encodeURIComponent(query);
  const url = "https://api.openalex.org/works?search=" + encoded + "&filter=from_publication_date:2026-01-01,type:article&sort=publication_date:desc&per_page=10";
  try {
    const r = await fetch(url, { headers: { "User-Agent": "mailto:mech-intel@example.com", Authorization: "Bearer " + key } });
    if (!r.ok) { console.log(label + ": HTTP " + r.status); return; }
    const data = await r.json();
    const results = data.results || [];
    let passed = 0;
    for (const work of results) {
      const title = cleanText(work.title || "");
      const abstract = work.abstract_inverted_index ? (() => {
        const words = [];
        for (const [w, pos] of Object.entries(work.abstract_inverted_index)) for (const p of pos) words[p] = w;
        return words.filter(Boolean).join(" ");
      })() : "";
      const article = { title, snippet: abstract.slice(0, 500), source: "", sourceType: "学术论文", queryTopic: label, tags: [], url: "http://x", sourceChannel: "" };
      if (isDomainRelevant(article) && !isNoiseArticle(article)) passed++;
    }
    console.log(label + ": " + results.length + " fetched, " + passed + " pass (" + Math.round(passed/results.length*100) + "%)");
    if (results.length > 0) {
      console.log("  -> " + cleanText(results[0].title || "").substring(0, 70));
    }
  } catch(e) { console.log(label + ": ERR " + e.message.substring(0,60)); }
}

console.log("=== OpenAlex filter pass rate ===\n");
const queries = config.researchQueries || [];
for (let i = 0; i < Math.min(queries.length, 8); i++) {
  await testOA(queries[i].query, queries[i].label);
  await new Promise(r => setTimeout(r, 1500));
}

console.log("\nDone!");
