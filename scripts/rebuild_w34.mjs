// AI summarize 4 new papers + rebuild final Week 34 data
import { readFileSync, writeFileSync } from 'fs';

const PERIOD = '2026.08.17-2026.08.23 第34周';
const MAX = 15;
const CAT_ORDER = ['风电动态', '结构AI', '金属材料', '风机噪声', '风电试验', '风电螺栓'];

const apiConfig = JSON.parse(readFileSync('config/api.json', 'utf8'));
const DS_KEY = apiConfig.deepseek.apiKey;
const DS_URL = apiConfig.deepseek.baseUrl + '/chat/completions';

const papers = JSON.parse(readFileSync('temp_arxiv_ce.json', 'utf8'));

// AI summarize papers
for (let i = 0; i < papers.length; i++) {
  const a = papers[i];
  const prompt = '你是工程情报分析专家。请将以下英文学术论文翻译并总结。\n\n论文标题：' + a.title +
    '\n摘要：' + (a.fullContent || a.snippet || '').substring(0, 2500) +
    '\n\n聚焦方向：自动化建模、AI辅助设计、智能审核、结构工程应用\n\n' +
    '请返回纯JSON：{"titleZh":"论文中文标题","summary":"中文摘要200-300字","keyPoints":["要点1","要点2","要点3"],"engineeringImpact":"工程参考价值"}';
  try {
    const resp = await fetch(DS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DS_KEY },
      body: JSON.stringify({
        model: apiConfig.deepseek.model,
        messages: [{ role: 'system', content: '你是工程情报分析专家。返回有效JSON。' }, { role: 'user', content: prompt }],
        temperature: 0.3, max_tokens: 1500
      }),
      signal: AbortSignal.timeout(45000)
    });
    const json = await resp.json();
    const text = json.choices?.[0]?.message?.content || '';
    let parsed;
    try { parsed = JSON.parse(text.replace(/`json\n?/g, '').replace(/`\n?/g, '').trim()); }
    catch { parsed = { summary: text.substring(0, 300) }; }
    if (parsed.summary) a.summary = parsed.summary;
    if (parsed.titleZh) a.titleZh = parsed.titleZh;
    if (parsed.keyPoints?.length) a.keyPoints = parsed.keyPoints;
    if (parsed.engineeringImpact) a.engineeringImpact = parsed.engineeringImpact;
    process.stdout.write('[' + (i+1) + '/' + papers.length + '] OK ');
  } catch(e) { process.stdout.write('FAIL '); }
  await new Promise(r => setTimeout(r, 300));
}
process.stdout.write('\n');

// Load current data and remove junk papers
const current = JSON.parse(readFileSync('public/data/articles.json', 'utf8'));
const JUNK_TITLES = [
  '面向道路的注意力', '聚类联邦学习', '什么需要关注', '自精炼流水线',
  'EnSI-RAG', '长文档索引', '掩码外锚定指令', 'SENTRY', '液体塑造成空间结构',
  '水下船舶推进'
];

let kept = current.articles.filter(a => {
  const t = (a.titleZh || a.title || '');
  return !JUNK_TITLES.some(j => t.includes(j));
});
console.log('Removed junk:', current.articles.length - kept.length);

// Add new papers
kept.push(...papers);

// Group & cap
const grouped = {};
for (const a of kept) {
  const cat = a.category || '风电动态';
  if (!grouped[cat]) grouped[cat] = [];
  grouped[cat].push(a);
}

const final = [];
for (const cat of CAT_ORDER) {
  const arts = grouped[cat] || [];
  arts.sort((a, b) => (b.relevanceScore||0) - (a.relevanceScore||0));
  const capped = arts.slice(0, MAX);
  console.log(cat + ': ' + capped.length + ' (raw: ' + arts.length + ')');
  final.push(...capped);
}

const output = {
  app: '机械共性部情报中心',
  generatedAt: new Date().toISOString(),
  collectionStatus: {
    dataMode: 'live', demo: false,
    manualCount: final.filter(a => a.sourceChannel && a.sourceChannel.includes('手动')).length,
    autoCount: final.filter(a => !a.sourceChannel || !a.sourceChannel.includes('手动')).length
  },
  weeklyBrief: {
    total: final.length,
    domestic: final.filter(a => a.region === '国内').length,
    papers: final.filter(a => a.sourceType === '学术论文').length,
    categories: CAT_ORDER.filter(c => grouped[c]).map(c => ({ name: c, count: grouped[c].length })),
    period: PERIOD
  },
  articles: final
};

writeFileSync('public/data/articles.json', JSON.stringify(output, null, 2), 'utf8');
console.log('\n=== FINAL ===');
console.log('Total:', final.length, '| Papers:', output.weeklyBrief.papers);
const src = {};
final.forEach(a => { const ch = a.sourceChannel || '未知'; src[ch] = (src[ch]||0)+1; });
console.log('Sources:');
Object.entries(src).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log('  ' + k + ': ' + v));
