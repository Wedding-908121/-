import { readFile, writeFile } from "node:fs/promises";
import { resolveAiProvider, summarizeInBatches } from "./lib/ai.mjs";

const data = JSON.parse(await readFile("./public/data/articles.json", "utf8"));
const articles = data.articles || [];
console.log("Total articles:", articles.length);

// Force re-summarize ALL articles (not just those with short summaries)
const needsSummary = articles.filter(a => !a.keyPoints || a.keyPoints.length === 0);
console.log("Needs AI summary (no keyPoints):", needsSummary.length);

if (needsSummary.length === 0) {
  console.log("All articles have AI summaries already");
  process.exit(0);
}

// Get AI provider
const provider = await resolveAiProvider();
console.log("Using AI:", provider.id, provider.model);

// Summarize in batches
console.log("Starting AI summarization for " + needsSummary.length + " articles...");
const startTime = Date.now();
const summaries = await summarizeInBatches(provider, needsSummary, {
  batchSize: 3,
  onBatchError: (e, batchNum) => console.warn("Batch " + batchNum + " error:", e.message)
});
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log("Summarization took " + elapsed + "s, got " + summaries.size + " summaries");

// Apply summaries to all articles
for (const a of articles) {
  const summary = summaries.get(a.id);
  if (summary) {
    if (summary.titleZh) a.titleZh = summary.titleZh;
    if (summary.summary && summary.summary.length > 5) a.summary = summary.summary;
    if (summary.keyPoints?.length) a.keyPoints = summary.keyPoints;
    if (summary.engineeringImpact) a.engineeringImpact = summary.engineeringImpact;
    if (summary.category) a.category = summary.category;
    if (summary.tags?.length) a.tags = summary.tags;
    if (summary.paperDetails && Object.keys(summary.paperDetails).length > 0) a.paperDetails = summary.paperDetails;
    if (summary.industryDetails && Object.keys(summary.industryDetails).length > 0) a.industryDetails = summary.industryDetails;
    if (summary.readingMinutes) a.readingMinutes = summary.readingMinutes;
    if (summary.reliability) a.reliability = summary.reliability;
  }
}

// Update metadata
data.collectionStatus.ai = { 
  provider: provider.id, model: provider.model, 
  requested: needsSummary.length, summarized: summaries.size 
};
data.generatedAt = new Date().toISOString();

await writeFile("./public/data/articles.json", JSON.stringify(data, null, 2), "utf8");
console.log("Saved with AI summaries. Done!");
