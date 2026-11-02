// Finalize Week 44: curated BJX news + remove off-topic items
import { readFileSync, writeFileSync } from 'fs';

const PERIOD = '2026.10.26-2026.11.01 第44周';
const CAT_ORDER = ['风电动态', '结构AI', '金属材料', '风机噪声', '风电试验', '风电螺栓'];

const current = JSON.parse(readFileSync('public/data/articles.json', 'utf8'));
const bjx = JSON.parse(readFileSync('temp_bjx.json', 'utf8'));

const sumMap = new Map();
current.articles.forEach(a => {
  if (a.summary && a.summary.length > 50) sumMap.set((a.title||'').trim(), a);
});

const BJX_KEYS = [
  '国际首项！中车让退役风机',
  '从CWP2026看风电技术发展趋势',
  '辽宁公示266.5MW绿电直连项目',
  '我国风光累计装机容量破20亿千瓦',
  '中节能壶关树掌三期200MW风电项目获得核准',
  'GE Vernova风机批量故障',
  '中石油青海200万千瓦风电项目完成百台风机吊装',
  '广西900MW海上风电示范项目最新获批',
  '内蒙古1.5GW风光大基地项目开工',
  '中广核阳江三山岛五海上风电场首台18MW风机',
  'CWP2026“大”盘点——风电轴承、齿轮箱',
  '远景能源“超长柔性叶片”技术获国家级认可',
  'CWP2026风电叶片及复合材料黑科技展品一览',
  '金风科技推动漂浮式风电走向商业化',
  'CWP2026风电齿轮箱及传动系统展品盘点'
];

const windNews = [];
for (const k of BJX_KEYS) {
  const found = bjx.find(x => (x.title||'').includes(k));
  if (!found) { console.log('MISSING:', k); continue; }
  const copy = sumMap.get((found.title||'').trim());
  if (copy) { windNews.push(copy); console.log('REUSE:', found.title.substring(0, 36)); }
  else { windNews.push(found); console.log('RAW  :', found.title.substring(0, 36)); }
}
console.log('风电动态 selected:', windNews.length);

const REMOVE_PATTERNS = {
  '结构AI': ['AI时代软件工程建模能力提升指南','多智能体协同自动本体建模','探索还是利用生成式AI','社会技术冲突与适应性治理','NaturalEdit','UXCascade','VeriForge'],
  '金属材料': ['智能制造中的软计算技术','航空航天与国防用高性能陶瓷材料'],
  '风机噪声': ['远景用16年，将风电可开发风速降低','风机盘管异常噪声','复合绝缘子风噪声测试'],
  '风电试验': ['聚合物与复合材料退化机制','人工智能在复合材料中的应用','功能性聚合物纳米复合涂层','疲劳可靠性','多功能木材复合材料'],
  '风电螺栓': ['复合材料T型接头的失效']
};

let kept = current.articles.filter(a => {
  const t = (a.titleZh || a.title || '');
  const pats = REMOVE_PATTERNS[a.category] || [];
  return !pats.some(p => t.includes(p));
});
console.log('Removed off-topic:', current.articles.length - kept.length);

kept = kept.filter(a => a.category !== '风电动态');
const all = [...kept, ...windNews];

const needSummary = all.filter(a => !a.summary || a.summary.length < 50);
console.log('Need summary:', needSummary.length);

const apiConfig = JSON.parse(readFileSync('config/api.json', 'utf8'));
const DS_URL = apiConfig.deepseek.baseUrl + '/chat/completions';
for (let i = 0; i < needSummary.length; i++) {
  const a = needSummary[i];
  try {
    const prompt = '你是工程情报分析专家。请对以下风电新闻进行摘要。\n\n新闻标题：' + a.title +
      '\n\n聚焦方向：风电项目进展、技术突破、产业链动态、工程价值\n\n' +
      '请返回纯JSON：{"titleZh":"中文标题","summary":"中文摘要100-200字，提取关键工程信息","keyPoints":["要点1","要点2","要点3"],"engineeringImpact":"工程参考价值"}';
    const resp = await fetch(DS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiConfig.deepseek.apiKey },
      body: JSON.stringify({ model: apiConfig.deepseek.model, messages: [
        { role: 'system', content: '你是工程情报分析专家。返回有效JSON，不要markdown代码块。' },
        { role: 'user', content: prompt }], temperature: 0.3, max_tokens: 1500 }),
      signal: AbortSignal.timeout(60000)
    });
    const json = await resp.json();
    if (json.error) { process.stdout.write('API_ERR '); continue; }
    const text = json.choices?.[0]?.message?.content || '';
    let parsed;
    try { parsed = JSON.parse(text.replace(/`json\n?/g, '').replace(/`\n?/g, '').trim()); }
    catch { parsed = { summary: text.substring(0, 300) }; }
    if (parsed.summary) a.summary = parsed.summary;
    if (parsed.keyPoints?.length) a.keyPoints = parsed.keyPoints;
    if (parsed.engineeringImpact) a.engineeringImpact = parsed.engineeringImpact;
    process.stdout.write('[' + (i+1) + '/' + needSummary.length + '] OK ');
  } catch(e) { process.stdout.write('FAIL '); }
  await new Promise(r => setTimeout(r, 900));
}
process.stdout.write('\n');

const grouped = {};
for (const a of all) {
  const cat = a.category || '风电动态';
  if (!grouped[cat]) grouped[cat] = [];
  grouped[cat].push(a);
}
const final = [];
for (const cat of CAT_ORDER) {
  const arts = grouped[cat] || [];
  const seen = new Set();
  const deduped = arts.filter(a => {
    const t = (a.title || '').trim().toLowerCase();
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
  deduped.sort((a, b) => (b.relevanceScore||0) - (a.relevanceScore||0));
  const capped = deduped.slice(0, 15);
  console.log(cat + ': ' + capped.length);
  final.push(...capped);
}

const output = {
  app: '机械共性部情报中心',
  generatedAt: new Date().toISOString(),
  collectionStatus: { dataMode: 'live', demo: false,
    manualCount: final.filter(a => a.sourceChannel && a.sourceChannel.includes('手动')).length,
    autoCount: final.filter(a => !a.sourceChannel || !a.sourceChannel.includes('手动')).length },
  weeklyBrief: { total: final.length,
    domestic: final.filter(a => a.region === '国内').length,
    papers: final.filter(a => a.sourceType === '学术论文').length,
    categories: CAT_ORDER.filter(c => grouped[c]).map(c => ({ name: c, count: grouped[c].length })),
    period: PERIOD },
  articles: final
};
writeFileSync('public/data/articles.json', JSON.stringify(output, null, 2), 'utf8');
console.log('\n=== FINAL ===');
console.log('Total:', final.length);
console.log('Papers:', final.filter(a => a.sourceType === '学术论文').length);
console.log('With summary:', final.filter(a => a.summary && a.summary.length > 50).length);
