// Week 34 supplement: arXiv + RSSHub collection, AI summarize, merge
import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

const PERIOD = '2026.08.17-2026.08.23 第34周';
const PERIOD_START = new Date('2026-08-17T00:00:00+08:00');
const PERIOD_END = new Date('2026-08-23T23:59:59+08:00');

const apiConfig = JSON.parse(readFileSync('config/api.json', 'utf8'));
const DS_KEY = apiConfig.deepseek.apiKey;
const DS_URL = apiConfig.deepseek.baseUrl + '/chat/completions';

function makeId(url, title, salt) {
  return 'w34-' + createHash('md5').update(url + '|' + title + '|' + salt).digest('hex').substring(0, 12);
}

function cleanText(s) {
  return (s||'').replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/&#8211;/g,'-').replace(/\s+/g,' ').trim();
}

// === arXiv ===
const ARXIV_QUERIES = [
  ['金属材料', 'all:"wind turbine" AND (all:steel OR all:alloy OR all:casting OR all:gear OR all:material) AND (all:fatigue OR all:fracture)'],
  ['风机噪声', 'all:"wind turbine" AND (all:noise OR all:acoustic OR all:aeroacoustic OR all:blade)'],
  ['风电试验', 'all:"wind turbine" AND (all:testing OR all:monitoring OR all:structural OR all:inspection OR all:crack)'],
  ['风电螺栓', 'all:"wind turbine" AND (all:bolt OR all:fastener OR all:flange OR all:preload)'],
  ['结构AI', 'all:structural AND (all:machine learning OR all:deep learning OR all:generative OR all:CAD) AND (all:design OR all:automation)']
];

async function fetchArxiv() {
  const out = [];
  for (const [cat, query] of ARXIV_QUERIES) {
    try {
      const url = 'http://export.arxiv.org/api/query?search_query=' + encodeURIComponent(query) +
        '&start=0&max_results=10&sortBy=submittedDate&sortOrder=descending';
      const r = await fetch(url, { headers: { Accept: 'application/atom+xml' }, signal: AbortSignal.timeout(15000) });
      const text = await r.text();
      const entries = [...text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
      let cnt = 0;
      for (const m of entries) {
        const e = m[1];
        const titleM = e.match(/<title>([\s\S]*?)<\/title>/);
        const linkM = e.match(/<id>(.*?)<\/id>/);
        const sumM = e.match(/<summary>([\s\S]*?)<\/summary>/);
        const pubM = e.match(/<published>(.*?)<\/published>/);
        if (!titleM || !linkM) continue;
        
        const title = cleanText(titleM[1]);
        const link = cleanText(linkM[1]);
        const pubDate = pubM ? new Date(cleanText(pubM[1])) : null;
        if (!pubDate || pubDate < PERIOD_START || pubDate > PERIOD_END) continue;
        
        out.push({
          id: makeId(link, title, 'ax'),
          title,
          titleZh: title,
          url: link,
          sourceUrl: link,
          snippet: cleanText(sumM?.[1] || '').substring(0, 500),
          fullContent: cleanText(sumM?.[1] || '').substring(0, 2000),
          source: 'arXiv',
          publishedAt: pubDate.toISOString(),
          collectedAt: new Date().toISOString(),
          sourceChannel: 'arXiv/学术论文',
          sourceType: '学术论文',
          linkType: 'publisher',
          region: '海外',
          language: 'en',
          queryTopic: cat,
          contextTags: [cat, '学术论文'],
          category: cat,
          tags: [],
          relevanceScore: 8,
          reliability: { grade: 'B', label: '预印本', score: 70 }
        });
        cnt++;
      }
      process.stdout.write(cat + ':' + cnt + ' ');
    } catch(e) {
      process.stdout.write(cat + ':FAIL ');
    }
    await new Promise(r => setTimeout(r, 500));
  }
  process.stdout.write('\n');
  return out;
}

// === RSSHub ===
async function fetchRsshub() {
  const base = 'https://rsshub.ktachibana.party';
  const routes = [
    ['/bjx/fd/yw', '北极星要闻', '风电动态'],
    ['/bjx/fd/js', '北极星技术', '风电动态'],
    ['/bjx/fd/xm', '北极星项目', '风电动态']
  ];
  const out = [];
  const seen = new Set();
  for (const [route, label, cat] of routes) {
    try {
      const r = await fetch(base + route, { signal: AbortSignal.timeout(15000) });
      const text = await r.text();
      const items = [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)];
      let cnt = 0;
      for (const m of items) {
        const e = m[1];
        const titleM = e.match(/<title>([\s\S]*?)<\/title>/);
        const linkM = e.match(/<link>(.*?)<\/link>/);
        const pubM = e.match(/<pubDate>(.*?)<\/pubDate>/);
        if (!titleM || !linkM) continue;
        
        const title = cleanText(titleM[1]);
        const link = cleanText(linkM[1]);
        const pubDate = pubM ? new Date(cleanText(pubM[1])) : null;
        if (!pubDate || pubDate < PERIOD_START || pubDate > PERIOD_END) continue;
        if (seen.has(link)) continue;
        seen.add(link);
        
        out.push({
          id: makeId(link, title, 'rh'),
          title,
          titleZh: title,
          url: link,
          sourceUrl: link,
          snippet: '',
          fullContent: '',
          source: '北极星风电-' + label,
          publishedAt: pubDate.toISOString(),
          collectedAt: new Date().toISOString(),
          sourceChannel: 'RSSHub/自动采集',
          sourceType: '新闻',
          linkType: 'publisher',
          region: '国内',
          language: 'zh',
          queryTopic: cat,
          contextTags: [cat],
          category: cat,
          tags: [],
          relevanceScore: 7,
          reliability: { grade: 'B', label: '行业媒体', score: 72 }
        });
        cnt++;
      }
      process.stdout.write(label + ':' + cnt + ' ');
    } catch(e) {
      process.stdout.write(label + ':FAIL ');
    }
    await new Promise(r => setTimeout(r, 500));
  }
  process.stdout.write('\n');
  return out;
}

// === AI Summarize ===
async function aiSummarize(a, i, total) {
  const isPaper = a.sourceType === '学术论文';
  const prompt = isPaper
    ? '你是工程情报分析专家。请将以下英文学术论文翻译并总结。\n\n论文标题：' + a.title +
      '\n摘要：' + (a.fullContent || a.snippet || '').substring(0, 2500) +
      '\n\n请返回纯JSON：{"titleZh":"论文中文标题","summary":"中文摘要200-300字","keyPoints":["要点1","要点2","要点3"],"engineeringImpact":"工程参考价值"}'
    : '你是工程情报分析专家。请对以下风电新闻进行摘要。\n\n新闻标题：' + a.title +
      '\n\n聚焦方向：风电项目进展、技术突破、产业链动态、工程价值\n\n' +
      '请返回纯JSON：{"titleZh":"中文标题","summary":"中文摘要100-200字","keyPoints":["要点1","要点2","要点3"],"engineeringImpact":"工程参考价值"}';
  try {
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
    if (json.error) { process.stdout.write('[' + (i+1) + '/' + total + '] ERR '); return; }
    const text = json.choices?.[0]?.message?.content || '';
    let parsed;
    try { parsed = JSON.parse(text.replace(/`json\n?/g, '').replace(/`\n?/g, '').trim()); }
    catch { parsed = { summary: text.substring(0, 300) }; }
    if (parsed.summary) a.summary = parsed.summary;
    if (parsed.titleZh) a.titleZh = parsed.titleZh;
    if (parsed.keyPoints?.length) a.keyPoints = parsed.keyPoints;
    if (parsed.engineeringImpact) a.engineeringImpact = parsed.engineeringImpact;
    process.stdout.write('[' + (i+1) + '/' + total + '] OK ');
  } catch(e) {
    process.stdout.write('FAIL ');
  }
  await new Promise(r => setTimeout(r, 300));
}

// === Main ===
console.log('=== Week 34 Supplement: arXiv + RSSHub ===');
const arxiv = await fetchArxiv();
const rsshub = await fetchRsshub();
console.log('arXiv:', arxiv.length, '| RSSHub:', rsshub.length);

const all = [...arxiv, ...rsshub];
if (all.length > 0) {
  console.log('\n--- AI Summarize ---');
  for (let i = 0; i < all.length; i++) {
    await aiSummarize(all[i], i, all.length);
    if ((i+1) % 5 === 0) process.stdout.write('\n');
  }
  process.stdout.write('\n');
}

writeFileSync('temp_supplement.json', JSON.stringify(all, null, 2), 'utf8');
console.log('\nSaved temp_supplement.json:', all.length);
