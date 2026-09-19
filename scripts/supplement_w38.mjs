// Week 38 supplement: OpenAlex broader papers + BJX news summary + merge
import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

const PERIOD = '2026.09.14-2026.09.20 第38周';
const MAX = 15;
const CAT_ORDER = ['风电动态', '结构AI', '金属材料', '风机噪声', '风电试验', '风电螺栓'];
const apiConfig = JSON.parse(readFileSync('config/api.json', 'utf8'));
const DS_KEY = apiConfig.deepseek.apiKey;
const DS_URL = apiConfig.deepseek.baseUrl + '/chat/completions';
const OPENALEX_KEY = apiConfig.openalex?.apiKey || '';

function makeId(url, title, salt) {
  return 'w38-' + createHash('md5').update(url + '|' + title + '|' + salt).digest('hex').substring(0, 12);
}
function cleanText(s) {
  return (s||'').replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}
function reconstructAbstract(inverted) {
  if (!inverted) return '';
  const indexed = [];
  for (const [word, positions] of Object.entries(inverted)) for (const pos of positions) indexed.push({ pos, word });
  indexed.sort((a,b) => a.pos - b.pos);
  return indexed.map(x => x.word).join(' ');
}

const PAPER_QUERIES = {
  '金属材料': 'wind turbine steel alloy casting forging gear fatigue fracture microstructure',
  '风机噪声': 'wind turbine noise aeroacoustic sound reduction blade trailing edge serration',
  '风电试验': 'wind turbine fatigue test material tensile NDT structural health crack detection',
  '风电螺栓': 'wind turbine bolt fastener bolted flange preload tightening fatigue',
  '结构AI': 'structural engineering AI machine learning automation design optimization generative'
};

// Load existing W35 + W34 titles for dedup
const current = JSON.parse(readFileSync('public/data/articles.json', 'utf8'));
const w34 = JSON.parse(readFileSync('public/data/archive/2026-W35.json', 'utf8'));
const seenTitles = new Set();
[...current.articles, ...w34.articles].forEach(a => {
  seenTitles.add((a.title||'').trim().toLowerCase());
  seenTitles.add((a.titleZh||'').trim().toLowerCase());
});

// 1. Fetch broader OpenAlex papers
console.log('=== OpenAlex broad papers ===');
const papers = [];
for (const [cat, query] of Object.entries(PAPER_QUERIES)) {
  process.stdout.write(cat + ': ');
  try {
    const url = 'https://api.openalex.org/works?search=' + encodeURIComponent(query) +
      '&per_page=8&sort=publication_date:desc&filter=from_publication_date:2026-01-01' +
      (OPENALEX_KEY ? '&api_key=' + OPENALEX_KEY : '') + '&mailto=chaohu2000@outlook.com';
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const d = await r.json();
    let cnt = 0;
    for (const w of (d.results || [])) {
      const title = w.title || '';
      if (!title || title.length < 5) continue;
      if (seenTitles.has(title.trim().toLowerCase())) continue;
      const doi = w.doi ? 'https://doi.org/' + w.doi : null;
      const authors = (w.authorships || []).map(a => a.author?.display_name).filter(Boolean).slice(0, 3).join(', ');
      const journal = w.primary_location?.source?.display_name || '';
      const pubDate = w.publication_date || '2026-01-01';
      const abstract = (w.abstract_inverted_index ? reconstructAbstract(w.abstract_inverted_index) : '').substring(0, 2000);
      seenTitles.add(title.trim().toLowerCase());
      papers.push({
        id: makeId(doi || w.id || title, title, 'oa2'),
        title, titleZh: title,
        url: doi || (w.open_access?.oa_url || 'https://openalex.org/' + (w.id||'')),
        sourceUrl: doi || '', snippet: abstract.substring(0, 500), fullContent: abstract,
        source: journal || 'OpenAlex', publishedAt: pubDate, collectedAt: new Date().toISOString(),
        sourceChannel: 'OpenAlex/学术论文', sourceType: '学术论文', linkType: 'research',
        region: '海外', language: 'en', queryTopic: cat, contextTags: [cat, '学术论文'],
        category: cat, tags: authors ? [authors] : [], relevanceScore: 8,
        reliability: { grade: 'A', label: '学术期刊', score: 85 }
      });
      cnt++;
    }
    process.stdout.write('+' + cnt + '\n');
  } catch(e) { process.stdout.write('FAIL: ' + e.message.substring(0, 40) + '\n'); }
  await new Promise(r => setTimeout(r, 800));
}
console.log('New papers:', papers.length);

// 2. Load BJX news
const bjx = JSON.parse(readFileSync('temp_bjx.json', 'utf8'));
console.log('BJX news:', bjx.length);

// 3. AI summarize: papers first, then BJX
async function aiSummarize(a, idx, total) {
  const isPaper = a.sourceType === '学术论文';
  const focusMap = {
    '结构AI': '自动化建模、AI辅助设计、智能审核、结构工程应用',
    '金属材料': '风电用钢、铸造锻造材料、材料性能与热处理',
    '风机噪声': '叶片降噪、气动噪声控制、降噪材料与测试',
    '风电试验': '材料试验方法、疲劳试验、裂纹检测、试验标准',
    '风电螺栓': '螺栓强度校核、预紧力控制、疲劳寿命、防松技术',
    '风电动态': '风电项目进展、技术突破、产业链动态、工程价值'
  };
  const focus = focusMap[a.category] || '';
  const prompt = isPaper
    ? '你是工程情报分析专家。请将以下英文学术论文翻译并总结。\n\n论文标题：' + a.title +
      '\n摘要：' + (a.fullContent || a.snippet || '').substring(0, 2500) +
      '\n\n聚焦方向：' + focus + '\n\n请返回纯JSON：{"titleZh":"论文中文标题","summary":"中文摘要200-300字","keyPoints":["要点1","要点2","要点3"],"engineeringImpact":"工程参考价值"}'
    : '你是工程情报分析专家。请对以下风电新闻进行摘要。\n\n新闻标题：' + a.title +
      '\n\n聚焦方向：' + focus + '\n\n请返回纯JSON：{"titleZh":"中文标题","summary":"中文摘要100-200字，提取关键工程信息","keyPoints":["要点1","要点2","要点3"],"engineeringImpact":"工程参考价值"}';
  try {
    const resp = await fetch(DS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DS_KEY },
      body: JSON.stringify({ model: apiConfig.deepseek.model, messages: [
        { role: 'system', content: '你是工程情报分析专家。返回有效JSON，不要markdown代码块。' },
        { role: 'user', content: prompt }], temperature: 0.3, max_tokens: 1800 }),
      signal: AbortSignal.timeout(45000)
    });
    const json = await resp.json();
    if (json.error) { process.stdout.write('API_ERR '); return; }
    const text = json.choices?.[0]?.message?.content || '';
    let parsed;
    try { parsed = JSON.parse(text.replace(/`json\n?/g, '').replace(/`\n?/g, '').trim()); }
    catch { parsed = { summary: text.substring(0, 300) }; }
    if (parsed.summary && parsed.summary.length > 10) a.summary = parsed.summary;
    if (parsed.titleZh) a.titleZh = parsed.titleZh;
    if (parsed.keyPoints?.length) a.keyPoints = parsed.keyPoints;
    if (parsed.engineeringImpact) a.engineeringImpact = parsed.engineeringImpact;
    process.stdout.write('[' + (idx+1) + '/' + total + '] OK ');
  } catch(e) { process.stdout.write('FAIL '); }
  await new Promise(r => setTimeout(r, 300));
}

const toSummarize = [...papers, ...bjx.filter(a => !a.summary || a.summary.length < 50)];
console.log('\n=== AI Summarize (' + toSummarize.length + ') ===');
for (let i = 0; i < toSummarize.length; i++) {
  await aiSummarize(toSummarize[i], i, toSummarize.length);
  if ((i+1) % 5 === 0) process.stdout.write('\n');
}
process.stdout.write('\n');

// 4. Merge all
const all = [...current.articles, ...papers, ...bjx];
console.log('Total merged:', all.length);

// 5. Group, dedup, cap
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
  const capped = deduped.slice(0, MAX);
  console.log(cat + ': ' + capped.length + ' (raw: ' + deduped.length + ')');
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
console.log('\n=== Week 38 FINAL ===');
console.log('Total:', final.length);
console.log('Papers:', final.filter(a => a.sourceType === '学术论文').length);
console.log('With summary:', final.filter(a => a.summary && a.summary.length > 50).length);
