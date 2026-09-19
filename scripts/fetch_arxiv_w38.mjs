// Better arXiv query for structural AI papers (cs.CE / structural engineering)
import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

function makeId(url, title, salt) {
  return 'w38-' + createHash('md5').update(url + '|' + title + '|' + salt).digest('hex').substring(0, 12);
}
function cleanText(s) {
  return (s||'').replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}

const queries = [
  'all:"structural engineering" AND (all:"machine learning" OR all:"deep learning" OR all:AI OR all:"generative design")',
  'cat:cs.CE AND (all:"wind turbine" OR all:steel OR all:concrete OR all:building OR all:frame OR all:structure)'
];

const PERIOD_START = new Date('2026-09-14T00:00:00+08:00');
const PERIOD_END = new Date('2026-09-20T23:59:59+08:00');

const good = [];
for (const q of queries) {
  try {
    const url = 'http://export.arxiv.org/api/query?search_query=' + encodeURIComponent(q) +
      '&start=0&max_results=10&sortBy=submittedDate&sortOrder=descending';
    const r = await fetch(url, { headers: { Accept: 'application/atom+xml' }, signal: AbortSignal.timeout(15000) });
    const text = await r.text();
    const entries = [...text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
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
      
      // Relevance filter
      const lower = title.toLowerCase();
      const relevant = /structural|structure|steel|concrete|building|frame|beam|column|design|fatigue|finite|simulation|turbine|bridge|wind/i.test(lower);
      if (!relevant) continue;
      
      good.push({
        id: makeId(link, title, 'ax2'),
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
        queryTopic: '结构AI',
        contextTags: ['结构AI', '学术论文'],
        category: '结构AI',
        tags: [],
        relevanceScore: 8,
        reliability: { grade: 'B', label: '预印本', score: 70 }
      });
    }
  } catch(e) {}
  await new Promise(r => setTimeout(r, 500));
}
console.log('Relevant 结构AI arXiv papers:', good.length);
good.forEach(a => console.log(' -', a.title.substring(0, 80)));
writeFileSync('temp_arxiv_ce.json', JSON.stringify(good, null, 2), 'utf8');

