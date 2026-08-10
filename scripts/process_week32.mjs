// scripts/process_week32.mjs
// Fetch manual URLs + AI summarize + build articles.json for Week 32
import { readFile, writeFile } from "node:fs/promises";

const PERIOD = "2026.08.03-2026.08.09 第32周";
const PERIOD_START = new Date("2026-08-03T00:00:00+08:00");
const PERIOD_END = new Date("2026-08-09T23:59:59+08:00");
const MAX_PER_CAT = 15;

// Category mapping for URL parsing
const CAT_MAP = {
  "结构AI": "结构AI",
  "金属材料": "金属材料",
  "风电噪声": "风机噪声",
  "风电试验": "风电试验",
  "风电螺栓": "风电螺栓",
  "风电动态": "风电动态"
};

function matchCategory(line) {
  for (const [key, val] of Object.entries(CAT_MAP)) {
    if (line.includes(key)) return val;
  }
  return null;
}

function cleanText(s) {
  return (s||"").replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}

function makeId(url, title) {
  const hash = Buffer.from(url+title).toString("base64").substring(0,12);
  return "w32-" + hash.replace(/[+/=]/g, '');
}

console.log("=== Week 32 Processor ===");
console.log("Period:", PERIOD);

// 1. Read manual URLs
const raw = await readFile("./config/manual-urls.txt", "utf8");
const lines = raw.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));

let currentCategory = "风电动态";
const urlEntries = [];

for (const line of lines) {
  if (line.match(/^\d{4}\.\d{2}\.\d{2}/)) continue;
  const matched = matchCategory(line);
  if (matched) { currentCategory = matched; continue; }
  if (line.startsWith("http")) {
    urlEntries.push({ url: line, category: currentCategory });
  }
}

console.log("Manual URLs:", urlEntries.length);
urlEntries.forEach(e => console.log("  [" + e.category + "] " + e.url.substring(0, 80)));

// 2. Fetch all URLs
console.log("\n=== Fetching ===");
const articles = [];

for (let i = 0; i < urlEntries.length; i++) {
  const {url, category} = urlEntries[i];
  try {
    process.stdout.write("[" + (i+1) + "/" + urlEntries.length + "] " + category + ": ");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: controller.signal
    });
    clearTimeout(timeout);
    const html = await r.text();

    let title = "";
    const m1 = html.match(/<meta property="og:title" content="([^"]+)"/);
    const m2 = html.match(/var msg_title\s*=\s*'([^']+)'/);
    const m3 = html.match(/<title[^>]*>([^<]+)<\/title>/);
    if (m1) title = cleanText(m1[1]);
    else if (m2) title = cleanText(m2[1]);
    else if (m3) title = cleanText(m3[1]);
    if (!title || title.length < 3) { console.log("SKIP: no title"); continue; }

    let source = "微信公众号";
    const sm = html.match(/var nickname\s*=\s*"([^"]+)"/);
    if (sm) source = cleanText(sm[1]);

    let content = "";
    const cm = html.match(/<div[^>]*class="rich_media_content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (cm) content = cleanText(cm[1]).substring(0, 4000);
    if (!content) {
      const dm = html.match(/var msg_desc\s*=\s*"([^"]+)"/);
      if (dm) content = cleanText(dm[1]).substring(0, 500);
    }

    let pubDate = new Date();
    const dm2 = html.match(/var ct\s*=\s*"(\d+)"/);
    if (dm2) {
      const ts = parseInt(dm2[1]);
      if (ts > 1000000000) pubDate = new Date(ts * 1000);
    }

    console.log(title.substring(0, 60) + " | " + source);

    const article = {
      id: makeId(url, title),
      title,
      titleZh: title,
      url,
      sourceUrl: url,
      snippet: content.substring(0, 2000),
      fullContent: content,
      source,
      publishedAt: pubDate.toISOString(),
      collectedAt: new Date().toISOString(),
      sourceChannel: "微信公众号/手动采集",
      linkType: "publisher",
      region: "国内",
      language: "zh",
      sourceType: "行业资讯",
      queryTopic: category,
      contextTags: [category],
      category,
      tags: [],
      relevanceScore: 10,
      reliability: { grade: "B", label: "可靠", score: 70 }
    };
    articles.push(article);
  } catch(e) {
    console.log("FAIL: " + e.message);
  }
  // Small delay between requests
  await new Promise(r => setTimeout(r, 300));
}

console.log("\nFetched:", articles.length, "articles");

// 3. AI Summarization via DeepSeek
console.log("\n=== AI Summarization ===");
const apiConfig = JSON.parse(await readFile("./config/api.json", "utf8"));
const ds = apiConfig.deepseek;

const FOCUS = {
  "结构AI": "重点提取：自动化建模方法、自动化出图技术、自动化审核流程、AI辅助设计工具、工程应用案例",
  "金属材料": "重点提取：齿轮锻造材料、球磨铸铁材料、风电用钢性能、材料热处理工艺",
  "风机噪声": "重点提取：叶片降噪技术、气动噪声控制、降噪材料与结构、噪声测试方法",
  "风电试验": "重点提取：材料试验方法、裂纹试验技术、疲劳试验数据、静强度试验标准、试验设备与流程",
  "风电螺栓": "重点提取：螺栓强度校核方法、螺栓加工工艺、预紧力控制、疲劳寿命评估、防松技术",
  "风电动态": "重点提取：风电项目进展、技术突破、政策变化、产业链动态、企业合作"
};

for (let i = 0; i < articles.length; i++) {
  const a = articles[i];
  const focus = FOCUS[a.category] || "";
  
  process.stdout.write("[" + (i+1) + "/" + articles.length + "] " + a.category + ": ");
  
  try {
    const prompt = `你是工程情报分析专家。请对以下文章进行摘要，聚焦方向：${focus}

文章标题：${a.title}
文章内容：${a.fullContent || a.snippet}

请返回JSON格式（不要markdown代码块）：
{
  "titleZh": "中文标题（保持原标题即可）",
  "summary": "中文摘要，150-300字，提取核心工程信息、技术参数、关键结论。必须紧扣主题方向：${focus}",
  "keyPoints": ["要点1", "要点2", "要点3"],
  "engineeringImpact": "一句话说明该信息对工程实践的参考价值"
}`;

    const resp = await fetch(ds.baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + ds.apiKey
      },
      body: JSON.stringify({
        model: ds.model,
        messages: [
          { role: "system", content: "你是工程情报分析专家，擅长提取技术文章中的工程核心信息。始终返回有效JSON。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });
    
    const json = await resp.json();
    const text = json.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response
    let parsed;
    try {
      // Remove possible markdown code blocks
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      // Fallback: just use the raw text as summary
      parsed = { summary: text.substring(0, 400) };
    }
    
    if (parsed.summary && parsed.summary.length > 10) {
      a.summary = parsed.summary;
      console.log("OK: " + a.summary.substring(0, 60) + "...");
    } else {
      a.summary = a.snippet ? a.snippet.substring(0, 300) : "";
      console.log("NO SUMMARY, using snippet");
    }
    
    if (parsed.keyPoints?.length) a.keyPoints = parsed.keyPoints;
    if (parsed.engineeringImpact) a.engineeringImpact = parsed.engineeringImpact;
    
  } catch(e) {
    console.log("AI FAIL: " + e.message);
    a.summary = (a.snippet || "").substring(0, 300);
  }
  
  // Delay between API calls
  await new Promise(r => setTimeout(r, 500));
}

// 4. Build categories and cap at MAX_PER_CAT
const grouped = {};
for (const a of articles) {
  const cat = a.category || "风电动态";
  if (!grouped[cat]) grouped[cat] = [];
  grouped[cat].push(a);
}

const finalArticles = [];
const catOrder = ["风电动态", "结构AI", "金属材料", "风机噪声", "风电试验", "风电螺栓"];

for (const cat of catOrder) {
  const arts = grouped[cat] || [];
  arts.sort((a, b) => (b.relevanceScore||0) - (a.relevanceScore||0));
  const capped = arts.slice(0, MAX_PER_CAT);
  console.log("  " + cat + ": " + capped.length + " (raw: " + arts.length + ")");
  finalArticles.push(...capped);
}

// 5. Build output
const output = {
  app: "机械共性部情报中心",
  generatedAt: new Date().toISOString(),
  collectionStatus: { dataMode: "live", demo: false, manualCount: articles.length, autoCount: 0 },
  weeklyBrief: {
    total: finalArticles.length,
    domestic: finalArticles.filter(a => a.region === "国内").length,
    papers: finalArticles.filter(a => a.sourceType === "学术论文").length,
    categories: catOrder.filter(c => grouped[c]).map(c => ({ name: c, count: (grouped[c]||[]).length })),
    period: PERIOD
  },
  articles: finalArticles
};

await writeFile("./public/data/articles.json", JSON.stringify(output, null, 2), "utf8");
console.log("\n=== DONE ===");
console.log("Total articles:", finalArticles.length);
console.log("Saved to public/data/articles.json");
