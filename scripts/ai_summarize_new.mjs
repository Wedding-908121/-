// AI summarize only new Google News articles
import { readFile, writeFile } from 'node:fs/promises';
import { resolveAiProvider, summarizeInBatches } from './lib/ai.mjs';

const data = JSON.parse(await readFile('./public/data/articles.json', 'utf8'));
const articles = data.articles || [];

// Find articles without summaries
const needsSummary = articles.filter(a => !a.summary || a.summary.length < 10);
console.log('Articles needing AI summary: ' + needsSummary.length);

if (needsSummary.length === 0) {
  console.log('All articles have summaries!');
  process.exit(0);
}

const aiProvider = await resolveAiProvider();
if (!aiProvider) {
  console.log('No AI provider configured');
  process.exit(1);
}

console.log('Using: ' + aiProvider.id + ' ' + aiProvider.model);

const startTime = Date.now();
const summaries = await summarizeInBatches(aiProvider, needsSummary, {
  batchSize: 3,
  onBatchError: (e, n) => console.warn('Batch ' + n + ' error:', e.message)
});

console.log('AI summarized ' + summaries.size + '/' + needsSummary.length + ' (' + ((Date.now()-startTime)/1000).toFixed(0) + 's)');

// Apply summaries
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

await writeFile('./public/data/articles.json', JSON.stringify(data, null, 2), 'utf8');
console.log('Saved!');
