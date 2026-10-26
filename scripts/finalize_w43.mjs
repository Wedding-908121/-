// Finalize Week 43: curated BJX news + remove off-topic items
import { readFileSync, writeFileSync } from 'fs';

const PERIOD = '2026.10.19-2026.10.25 第43周';
const CAT_ORDER = ['风电动态', '结构AI', '金属材料', '风机噪声', '风电试验', '风电螺栓'];

const current = JSON.parse(readFileSync('public/data/articles.json', 'utf8'));
const bjx = JSON.parse(readFileSync('temp_bjx.json', 'utf8'));

const sumMap = new Map();
current.articles.forEach(a => {
  if (a.summary && a.summary.length > 50) sumMap.set((a.title||'').trim(), a);
});

const BJX_KEYS = [
  'CWP2026 | 埃里克·索尔海姆',
  '河北张家口1.08GW风电项目启动竞配',
  '全球首项风电退役回收IEC国际标准正式发布',
  'CWP2026｜风资源技术论坛成功举办',
  '风光万物生——开启工业文明新范式”主题展区内容全览',
  'CWP2026企业家论坛二：聚焦构建韧性全球风电供应链',
  '张传卫出席广东省海洋产业高质量发展大会',
  '配套沙戈荒新能源基地11GW！陇电入川特高压',
  'CWP2026企业家论坛一：探求新周期下的增长逻辑',
  '内蒙古察右中旗390MW风电项目全容量并网',
  '风电迈向第二个太瓦',
  '全球首个退役风电叶片梯次利用',
  '中国气象大模型再夺全球第一',
  'CWP2026丨10家风电整机商新机型',
  '国家发改委：支持新能源与场站内配套储能'
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
  '结构AI': ['探索还是利用生成式AI','超越AI采纳','自动化行政杂志','知识蒸馏驱动的去中心化联邦学习','矿山灾害管理','甘蔗叶病害分类','多领导狼群智能','教育游戏系统中的分层认知结构'],
  '金属材料': ['智能制造中的软计算技术','高性能陶瓷材料在航空航天'],
  '风机噪声': ['风力发电机的危害有多大','远景发布超低风速AI风储一体机','自动测风方案','可扩展声学记录平台','水下船舶推进'],
  '风电试验': ['人工智能在复合材料中的应用','功能性聚合物纳米复合涂层','疲劳可靠性','多功能木材复合材料','机器学习在高分子复合材料'],
  '风电螺栓': ['百米风车常年迎风晃动','复合材料T型接头的失效','海上变压器标准化可扩展底座']
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
