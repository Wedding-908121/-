// Finalize Week 34: AI summarize 北极星 news + save
import { readFileSync, writeFileSync } from 'fs';

const PERIOD = '2026.08.17-2026.08.23 第34周';
const apiConfig = JSON.parse(readFileSync('config/api.json', 'utf8'));
const DS_KEY = apiConfig.deepseek.apiKey;
const DS_URL = apiConfig.deepseek.baseUrl + '/chat/completions';

const all = JSON.parse(readFileSync('temp_merged.json', 'utf8'));
const needSummary = all.filter(a => !a.summary || a.summary.length < 50);
console.log('Need summary:', needSummary.length);

for (let i = 0; i < needSummary.length; i++) {
  const a = needSummary[i];
  try {
    const prompt = '你是工程情报分析专家。请对以下风电新闻进行摘要。\n\n' +
      '新闻标题：' + a.title + '\n' +
      '\n聚焦方向：风电项目进展、技术突破、产业链动态、工程价值\n\n' +
      '请返回纯JSON：{"titleZh":"中文标题","summary":"中文摘要100-200字，提取关键工程信息","keyPoints":["要点1","要点2","要点3"],"engineeringImpact":"工程参考价值"}';
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    const resp = await fetch(DS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DS_KEY },
      body: JSON.stringify({
        model: apiConfig.deepseek.model,
        messages: [
          { role: 'system', content: '你是工程情报分析专家。返回有效JSON，不要markdown代码块。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1500
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    const json = await resp.json();
    if (json.error) { process.stdout.write('API_ERR '); continue; }
    
    const text = json.choices?.[0]?.message?.content || '';
    let parsed;
    try {
      const clean = text.replace(/`json\n?/g, '').replace(/`\n?/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      parsed = { summary: text.substring(0, 300) };
    }
    
    if (parsed.summary) a.summary = parsed.summary;
    if (parsed.keyPoints?.length) a.keyPoints = parsed.keyPoints;
    if (parsed.engineeringImpact) a.engineeringImpact = parsed.engineeringImpact;
    process.stdout.write('[' + (i+1) + '/' + needSummary.length + '] OK ');
  } catch(e) {
    process.stdout.write('FAIL ');
  }
  await new Promise(r => setTimeout(r, 300));
}
process.stdout.write('\n');

// Category counts
const grouped = {};
for (const a of all) {
  const cat = a.category || '风电动态';
  if (!grouped[cat]) grouped[cat] = [];
  grouped[cat].push(a);
}

const output = {
  app: '机械共性部情报中心',
  generatedAt: new Date().toISOString(),
  collectionStatus: {
    dataMode: 'live',
    demo: false,
    manualCount: all.filter(a => a.sourceChannel && a.sourceChannel.includes('手动')).length,
    autoCount: all.filter(a => !a.sourceChannel || !a.sourceChannel.includes('手动')).length
  },
  weeklyBrief: {
    total: all.length,
    domestic: all.filter(a => a.region === '国内').length,
    papers: all.filter(a => a.sourceType === '学术论文').length,
    categories: Object.keys(grouped).map(c => ({ name: c, count: grouped[c].length })),
    period: PERIOD
  },
  articles: all
};

writeFileSync('public/data/articles.json', JSON.stringify(output, null, 2), 'utf8');
console.log('\n=== Week 34 FINAL ===');
console.log('Total:', all.length);
for (const [cat, arts] of Object.entries(grouped)) {
  console.log('  ' + cat + ': ' + arts.length);
}
console.log('Papers:', all.filter(a => a.sourceType === '学术论文').length);
console.log('With summary:', all.filter(a => a.summary && a.summary.length > 50).length);
