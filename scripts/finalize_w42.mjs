// Finalize Week 42: keep 6 manual 风电动态 + 9 tech BJX, remove off-topic
import { readFileSync, writeFileSync } from 'fs';

const PERIOD = '2026.10.12-2026.10.18 第42周';
const CAT_ORDER = ['风电动态', '结构AI', '金属材料', '风机噪声', '风电试验', '风电螺栓'];

const current = JSON.parse(readFileSync('public/data/articles.json', 'utf8'));
const bjx = JSON.parse(readFileSync('temp_bjx.json', 'utf8'));

const sumMap = new Map();
current.articles.forEach(a => {
  if (a.summary && a.summary.length > 50) sumMap.set((a.title||'').trim(), a);
});

// 1. Keep the 6 manual 风电动态 items (user-added CWP2026)
const manualWind = current.articles.filter(a => a.category === '风电动态' && a.sourceChannel && a.sourceChannel.includes('手动'));
console.log('Manual 风电动态:', manualWind.length);
manualWind.forEach(a => console.log('  *', (a.titleZh||a.title).substring(0, 46)));

// 2. Add 9 tech-oriented BJX news
const BJX_KEYS = [
  '南方宇航首台16.XMW四级行星传动海上风电齿轮箱',
  '南高齿25MW级海上风电齿轮箱首台产品',
  '中船科技四款新品亮相CWP2026',
  '明阳集团携四“大”创新技术成果',
  '金风科技发布GoldFusion+风储一体系统级解决方案',
  '三一重能吹响进军“十五五”号角',
  '远景发布AI风储一体机产品矩阵',
  '全球首座半潜式风电制氢平台下水',
  '国家能源局：“十五五”风电发展四大方向'
];
const windNews = [...manualWind];
for (const k of BJX_KEYS) {
  const found = bjx.find(x => (x.title||'').includes(k));
  if (!found) { console.log('MISSING:', k); continue; }
  const copy = sumMap.get((found.title||'').trim());
  if (copy) { windNews.push(copy); console.log('REUSE:', found.title.substring(0, 40)); }
  else { windNews.push(found); console.log('RAW  :', found.title.substring(0, 40)); }
}
console.log('风电动态 selected:', windNews.length);

const REMOVE_PATTERNS = {
  '结构AI': ['探索还是利用生成式AI','管理创新作为数字化转型','面向包容性人工智能与可持续增长','医保理赔','云原生与分布式系统','金融领域AI实施的公开技术披露','数字时代管理人与技术','人工智能与终身学习研究图景'],
  '金属材料': ['航空航天与国防用高性能陶瓷材料'],
  '风机噪声': ['风电场为什么会“干扰”雷达','离心风机和轴流风机的区别','广西崇左200MW山地风电项目','垂直轴风力发电机有什么优点','可扩展声学记录平台','水下船舶推进'],
  '风电试验': ['铜铝排专题','亮相CWP2026,电气风电交出','功能性聚合物纳米复合涂层','多功能木材复合材料','机器学习在聚合物复合材料中的研究综述'],
  '风电螺栓': ['这家净利接近翻倍','复合材料T型接头的失效','海上变压器标准化可扩展底座']
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
const manualKept = final.filter(a => a.category === '风电动态' && a.sourceChannel && a.sourceChannel.includes('手动'));
console.log('Manual 风电动态 kept:', manualKept.length);
