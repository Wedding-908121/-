// Finalize Week 41: engineering BJX news (incl. 2 CWP2026) + remove off-topic items
import { readFileSync, writeFileSync } from 'fs';

const PERIOD = '2026.10.05-2026.10.11 第41周';
const CAT_ORDER = ['风电动态', '结构AI', '金属材料', '风机噪声', '风电试验', '风电螺栓'];

const current = JSON.parse(readFileSync('public/data/articles.json', 'utf8'));
const bjx = JSON.parse(readFileSync('temp_bjx.json', 'utf8'));

const sumMap = new Map();
current.articles.forEach(a => {
  if (a.summary && a.summary.length > 50) sumMap.set((a.title||'').trim(), a);
});

const BJX_KEYS = [
  '365m！全球最高风机安装完成',
  '中广核100MW“以大代小”项目获批',
  'CWP2026将于10月14-16日在北京盛大启幕',
  'CWP2026 | 创新剧场日程发布',
  '16MW漂浮式海上风电投入运行',
  '国内首座260米构架式风机塔架亮相',
  '远景重磅发布《AI风储一体机白皮书》',
  '风电并网新规！国家能源局征求意见稿发布',
  '超20GW！22个海上风电项目加速落地',
  '中电建万宁漂浮式海上风电试验项目',
  '时代新材斩获风电叶片大单',
  '14MW海上风电机组叶片损坏',
  '价格回暖、机型分化',
  '2026年前三季度风电项目核准115GW',
  '山西再废止458.3MW风光项目'
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
  '结构AI': ['探索还是利用生成式AI','面向多组分系统设计的分层生成建模','迈向大语言模型可靠性','追逐算法','重构AI驱动与沉浸式建筑环境','农业中的人与机器人','游戏化物流的未来','QMzyme'],
  '金属材料': ['算力金属｜铜、镍、锌','高性能陶瓷材料在航空航天'],
  '风机噪声': ['华能启东H4#海上风电场项目环境影响报告','可扩展声学记录平台','水下船舶推进'],
  '风电试验': ['多功能木材复合材料','聚合物复合材料中机器学习综述'],
  '风电螺栓': ['全球风电法兰 市场规模','美标全螺纹螺柱优质厂商清单','复合材料T型接头的失效','氢能管道接头']
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
const cwp = final.filter(a => (a.title||'').includes('CWP') || (a.titleZh||'').includes('CWP'));
console.log('CWP items:', cwp.length);
cwp.forEach(a => console.log('  *', a.titleZh || a.title));
