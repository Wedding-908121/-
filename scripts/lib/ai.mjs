import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanText } from "./articles.mjs";

const SUMMARY_CATEGORIES = new Set([
  "学术研究", "AI动态", "风电动态"
]);

const SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    articles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          titleZh: { type: "string" },
          summary: { type: "string" },
          keyPoints: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
          engineeringImpact: { type: "string" },
          category: { type: "string", enum: [...SUMMARY_CATEGORIES] },
          tags: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
          paperDetails: {
            type: "object", additionalProperties: false,
            properties: {
              objective: { type: "string" },
              methods: { type: "string" },
              testObject: { type: "string" },
              operatingConditions: { type: "string" },
              quantitativeFindings: { type: "array", maxItems: 6,
                items: {
                  type: "object", additionalProperties: false,
                  properties: { metric: { type: "string" }, value: { type: "string" }, unit: { type: "string" }, comparison: { type: "string" }, conditions: { type: "string" }, evidence: { type: "string" } },
                  required: ["metric", "value", "unit", "comparison", "conditions", "evidence"]
                }
              },
              limitations: { type: "array", items: { type: "string" }, maxItems: 5 }
            },
            required: ["objective", "methods", "testObject", "operatingConditions", "quantitativeFindings", "limitations"]
          },
          industryDetails: {
            type: "object", additionalProperties: false,
            properties: {
              eventType: { type: "string" },
              companies: { type: "array", items: { type: "string" }, maxItems: 8 },
              location: { type: "string" }, capacity: { type: "string" },
              investment: { type: "string" }, timeline: { type: "string" },
              supplyChainImpact: { type: "string" }, verificationStatus: { type: "string" },
              quantitativeFacts: { type: "array", items: { type: "string" }, maxItems: 6 }
            },
            required: ["eventType", "companies", "location", "capacity", "investment", "timeline", "supplyChainImpact", "verificationStatus", "quantitativeFacts"]
          }
        },
        required: ["id", "titleZh", "summary", "keyPoints", "engineeringImpact", "category", "tags", "paperDetails", "industryDetails"]
      }
    }
  },
  required: ["articles"]
};

const SYSTEM_INSTRUCTIONS = [
  "你是机械工程共性技术情报分析助手，专攻风电装备、疲劳断裂、AI动态、噪声和气动领域。",
  "仅依据给定标题和原始摘要总结，不得补造试验数据、结论、来源或因果关系。",
  "英文题目必须给出准确、自然的中文技术标题(titleZh)；中文原题可原样写入。",
  "所有输出使用简洁中文，保留必要的英文缩写、标准号、材料名和故障机理术语。",
  "summary 用 120-220 个汉字说明资料做了什么、主要结果、证据层级和结论边界。",
  "keyPoints 给出三至五条可从输入核查的信息，不得重复标题。",
  "engineeringImpact 用 80-180 个汉字说明对设计、验证、运维或供应链的工程启示。",
  "category 从 疲劳断裂、AI动态、噪声研究、气动布局、风电动态、标准政策 中选择。",
  "tags 每项 2-6 个汉字或标准英文缩写。",
  "论文资料必须完整填写 paperDetails 各字段，缺少信息标注'未提及'。",
  "行业动态必须完整填写 industryDetails 各字段，缺少信息留空。",
  "量化结论只有当标题或摘要中含有相同数字时才写入，否则不写。"
].join("\n");

function inputArticles(articles) {
  return articles.map(a => ({
    id: a.id,
    language: a.language || "en",
    title: a.title || "",
    snippet: a.snippet || "",
    source: a.source || "",
    url: a.url || "",
    publishedAt: a.publishedAt || "",
    queryTopic: a.queryTopic || "technical",
    feedbackSummary: a.feedbackSummary || ""
  }));
}

function parseSummaryJson(text, articles) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { throw new Error("AI返回无法解析的JSON"); }
    } else {
      throw new Error("AI返回不含JSON");
    }
  }
  const summaries = new Map();
  const items = parsed?.articles;
  if (!Array.isArray(items) || !items.length) throw new Error("AI返回不含articles数组");
  for (const item of items) {
    const article = articles.find(a => a.id === item.id);
    if (!article) continue;
    const tags = (item.tags || []).map(cleanText).filter(Boolean).slice(0, 5);
    if (!SUMMARY_CATEGORIES.has(item.category)) item.category = "风电动态";
    summaries.set(item.id, {
      titleZh: cleanText(item.titleZh || "").slice(0, 200),
      summary: cleanText(item.summary || article.snippet || "").slice(0, 600),
      keyPoints: (item.keyPoints || []).map(cleanText).filter(Boolean).slice(0, 5),
      engineeringImpact: cleanText(item.engineeringImpact || "").slice(0, 600),
      category: item.category,
      tags,
      paperDetails: item.paperDetails || {},
      industryDetails: item.industryDetails || {}
    });
  }
  if (!summaries.size) throw new Error("AI摘要未返回任何通过检验的资料");
  return summaries;
}

async function fetchAiJson(url, options, fetchImpl, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      if (response.ok) return response.json();
      const detail = cleanText(await response.text()).slice(0, 240);
      if (attempt === retries || (response.status !== 429 && response.status < 500)) {
        throw new Error("AI请求失败: " + response.status + " " + detail);
      }
      const retryAfter = Number(response.headers.get("retry-after") || 0) * 1000;
      await new Promise(r => setTimeout(r, Math.max(retryAfter, 2500 * (attempt + 1))));
    } finally { clearTimeout(timeout); }
  }
  throw new Error("AI请求重试后仍失败");
}

export async function summarizeBatch(provider, articles, fetchImpl = fetch) {
  if (!provider || !articles.length) return new Map();
  const payload = inputArticles(articles);
  let text;

  if (provider.id === "deepseek") {
    const responseData = await fetchAiJson(provider.baseUrl + "/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + provider.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTIONS },
          { role: "user", content: "请按以下 JSON Schema 分析资料并返回JSON：\n" + JSON.stringify(SUMMARY_SCHEMA) + "\n输入资料：\n" + JSON.stringify({ articles: payload }) }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 4096,
        stream: false
      })
    }, fetchImpl);
    text = responseData.choices?.[0]?.message?.content || "";
  } else if (provider.id === "openai") {
    const responseData = await fetchAiJson(provider.baseUrl + "/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + provider.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTIONS },
          { role: "user", content: "请按 JSON Schema 分析资料并返回JSON：\n" + JSON.stringify(SUMMARY_SCHEMA) + "\n输入资料：\n" + JSON.stringify({ articles: payload }) }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 4096
      })
    }, fetchImpl);
    text = responseData.choices?.[0]?.message?.content || "";
  } else {
    throw new Error("不支持的AI供应商: " + provider.id);
  }

  if (!text) throw new Error(provider.label + " 未返回摘要文本");
  return parseSummaryJson(text, articles);
}

export async function summarizeInBatches(provider, articles, options = {}) {
  const batchSize = Math.max(1, Number(options.batchSize || 3));
  const summaries = new Map();
  const errors = [];
  for (let index = 0; index < articles.length; index += batchSize) {
    const batch = articles.slice(index, index + batchSize);
    try {
      const batchSummaries = await summarizeBatch(provider, batch, options.fetchImpl || fetch);
      batchSummaries.forEach((v, k) => summaries.set(k, v));
      const missing = batch.filter(a => !batchSummaries.has(a.id));
      for (const article of missing) {
        try {
          const retry = await summarizeBatch(provider, [article], options.fetchImpl || fetch);
          retry.forEach((v, k) => summaries.set(k, v));
        } catch (e) { errors.push(e); options.onBatchError?.(e, article.id, [article]); }
      }
    } catch (e) { errors.push(e); options.onBatchError?.(e, index / batchSize + 1, batch); }
  }
  if (!summaries.size && errors.length) throw errors[0];
  return summaries;
}

export function resolveAiProvider() {
  const provider = String(process.env.AI_PROVIDER || "").trim().toLowerCase();

  // Helper: try env vars first, then fall back to config/api.json
  function getConfig() {
    try {
      
      
      const configPath = join(process.cwd(), "config", "api.json");
      if (existsSync(configPath)) {
        const raw = readFileSync(configPath, 'utf8').replace(/^\\uFEFF/, ''); return JSON.parse(raw);
      }
    } catch {}
    return {};
  }

  const config = getConfig();
  const activeProvider = provider || config.aiProvider || "deepseek";

  if (activeProvider === "deepseek") {
    const key = process.env.DEEPSEEK_API_KEY || config.deepseek?.apiKey || "";
    if (!key || key.includes("你的")) return null;
    return {
      id: "deepseek",
      label: "DeepSeek",
      apiKey: key,
      model: process.env.DEEPSEEK_MODEL || config.deepseek?.model || "deepseek-chat",
      baseUrl: (process.env.DEEPSEEK_BASE_URL || config.deepseek?.baseUrl || "https://api.deepseek.com").replace(/\/$/, "")
    };
  }
  if (activeProvider === "openai") {
    const key = process.env.OPENAI_API_KEY || config.openai?.apiKey || "";
    if (!key) return null;
    return {
      id: "openai",
      label: "OpenAI",
      apiKey: key,
      model: process.env.OPENAI_MODEL || config.openai?.model || "gpt-4o-mini",
      baseUrl: (process.env.OPENAI_BASE_URL || config.openai?.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "")
    };
  }
  return null;
}
export function feedbackNeedsAiReview(article) {
  const fb = article.feedbackAggregate || {};
  const total = Number(fb.total || 0);
  const bad = Number(fb.questionable || 0) + Number(fb.irrelevant || 0);
  return total >= 3 && total >= 5 && bad >= 3 && bad / total >= 0.6;
}

export function experienceNeedsAiReview(article) {
  const exp = article.engineeringExperience || {};
  const total = Number(exp.total || 0);
  const written = Number(exp.writtenTotal || 0);
  return total >= 2 && written >= 2;
}
