// Finalize Week 38: select engineering BJX news + remove off-topic items
import { readFileSync, writeFileSync } from 'fs';

const PERIOD = '2026.09.14-2026.09.20 第38周';
const CAT_ORDER = ['风电动态', '结构AI', '金属材料', '风机噪声', '风电试验', '风电螺栓'];

const current = JSON.parse(readFileSync('public/data/articles.json', 'utf8'));
const bjx = JSON.parse(readFileSync('temp_bjx.json', 'utf8'));

const sumMap = new Map();
current.articles.forEach(a => {
  if (a.summary && a.summary.length > 50) sumMap.set((a.title||'').trim(), a);
});

const BJX_KEYS = [
  '中核集团单体投运容量最大风电项目全容量并网',
  '李强主持召开国务院常务会议',
  '华能17兆瓦漂浮式风电项目',
  '23台18MW',
  '深远海风电宁波母港',
  '明阳11MW-210',
  '20MW！国家电投全球最大漂浮式',
  '江苏省：统筹推进海上风电场改造升级',
  '远景能源首个国际海上风电项目首吊',
  '远景受邀出席2026年服贸会',
  '金风科技签署巴西872MW',
  '电气风电阿曼项目首台机组成功吊装',
  '中船科技H220低风速机组在上海首吊',
  '国家能源集团15GW风机框采',
  '华电黑龙江300MW风电项目机组招标'
];

const windNews = [];
for (const k of BJX_KEYS) {
  const found = bjx.find(x => (x.title||'').includes(k));
  if (!found) { console.log('MISSING:', k); continue; }
  const copy = sumMap.get((found.title||'').trim());
  if (copy) { windNews.push(copy); console.log('REUSE:', found.title.substring(0, 35)); }
  else { windNews.push(found); console.log('RAW  :', found.title.substring(0, 35)); }
}
console.log('风电动态 selected:', windNews.length);

const REMOVE_PATTERNS = {
  '结构AI': ['南斯拉夫新闻方面级情感分析','软件测试用例生成','混凝土X射线计算机断层扫描','银行业代理式人工智能','风险与事件分析','CareerNova','HydroSuite-AI','抗体工程的生成式重构'],
  '金属材料': ['高性能陶瓷材料在航空航天'],
  '风机噪声': ['为什么风力发电机都是白色的','为什么海上风电比陆上风电难','超短期风电场功率预测','职业病危害因素现场检测','可扩展声学记录平台','水下船舶推进','带变形前缘段俯仰翼型','前缘宏圆柱'],
  '风电试验': ['新能源汽车用6082铝合金'],
  '风电螺栓': ['复合材料T型接头的失效','氢能管道接头']
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
      signal: AbortSignal.timeout(45000)
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
  await new Promise(r => setTimeout(r, 300));
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
