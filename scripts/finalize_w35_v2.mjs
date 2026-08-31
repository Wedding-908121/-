// Finalize Week 35 v2: keyword match BJX + reuse summaries + AI fill gaps
import { readFileSync, writeFileSync } from 'fs';

const PERIOD = '2026.08.24-2026.08.30 第35周';
const CAT_ORDER = ['风电动态', '结构AI', '金属材料', '风机噪声', '风电试验', '风电螺栓'];

const current = JSON.parse(readFileSync('public/data/articles.json', 'utf8'));
const bjx = JSON.parse(readFileSync('temp_bjx.json', 'utf8'));

// Summarized copies live in current.articles (only some survived)
const sumMap = new Map();
current.articles.forEach(a => {
  if (a.summary && a.summary.length > 50) sumMap.set((a.title||'').trim(), a);
});

const BJX_KEYS = [
  '三一重能斩获蒙能500MW风机采购',
  '国家电网：“十五五”年均新增新能源装机200GW',
  '南方电网：十五五新增新能源装机230GW',
  '7月，风电新增装机同比增271',
  '中车戚墅堰所12.5兆瓦风电齿轮箱下线交付',
  '新疆490MW风储一体化绿电直连项目正式获批',
  '山东海工线缆首根110kV三芯交流海缆成功下线启运',
  '中核集团首个海上风电项目首批单桩发运',
  '东方电气若羌100万千瓦风电项目全面开工建设',
  '海拔5150米！西藏首个全部采用200型6.25兆瓦风电项目风机吊装全线收官',
  '重齿&金风科技联合研发！6.25MW增速齿轮箱样机顺利下线',
  '147米超长风电叶片，成功下线',
  '全球首座16MW张力腿浮式风电平台核心部件赋能深远海发展',
  '“十五五”期间，陆上10MW风机将成主力机型',
  '全球首套千方级海上漂浮式PEM制氢系统，即将启运'
];

const windNews = [];
for (const k of BJX_KEYS) {
  const found = bjx.find(x => (x.title||'').includes(k));
  if (!found) { console.log('MISSING:', k); continue; }
  const copy = sumMap.get((found.title||'').trim());
  if (copy) {
    windNews.push(copy); // has summary
    console.log('REUSE:', found.title.substring(0, 40));
  } else {
    windNews.push(found); // needs summary
    console.log('RAW  :', found.title.substring(0, 40));
  }
}
console.log('风电动态 selected:', windNews.length);

// Off-topic removal
const REMOVE_PATTERNS = {
  '结构AI': ['道路损毁分割','人工智能是否强化企业领导决策','技术接受模型','Universitas Merdeka','ArchPipeline','人工智能在交通研究中的综合综述','劳动力激励','机器人辅助活检','跨语言词性标注'],
  '金属材料': ['航空航天与国防应用高性能陶瓷'],
  '风机噪声': ['Fluent燃气轮机叶片气膜冷却','绿色转型背景下的水下船舶推进','前缘变形俯仰翼型','前缘宏观圆柱作为被动改进','涡流发生器方向对Myring'],
  '风电螺栓': ['复合材料T型接头在拉伸载荷下的失效','氢气管道接头技术进展']
};
let kept = current.articles.filter(a => {
  const t = (a.titleZh || a.title || '');
  const pats = REMOVE_PATTERNS[a.category] || [];
  return !pats.some(p => t.includes(p));
});
console.log('Removed off-topic:', current.articles.length - kept.length);

kept = kept.filter(a => a.category !== '风电动态');
const all = [...kept, ...windNews];

// AI fill for missing summaries (风电动态 raw news)
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

// Group & cap
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
