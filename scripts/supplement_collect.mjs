// Minimal news collector - supplement Google News CN + 北极星风电
import { readFile, writeFile } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
const now = new Date();
const periodStart = new Date('2026-07-20T00:00:00.000Z');
const periodEnd = new Date('2026-07-26T23:59:59.999Z');

function cleanText(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Google News via proxy
function proxyFetch(url) {
  const target = new URL(url);
  return new Promise((resolve) => {
    const req = httpRequest({
      host: '127.0.0.1', port: 7890, method: 'CONNECT',
      path: target.hostname + ':443',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    req.setTimeout(15000, () => { req.destroy(); resolve({ ok: false }); });
    req.on('connect', (res, socket) => {
      const hReq = httpsRequest({
        host: target.hostname, path: target.pathname + target.search,
        method: 'GET', socket, agent: false,
        headers: { Accept: 'application/rss+xml,text/xml', 'User-Agent': 'Mozilla/5.0' }
      }, (hRes) => {
        let body = ''; hRes.on('data', c => body += c);
        hRes.on('end', () => resolve({ ok: true, text: () => Promise.resolve(body) }));
      });
      hReq.setTimeout(15000, () => { hReq.destroy(); resolve({ ok: false }); });
      hReq.on('error', () => resolve({ ok: false }));
      hReq.end();
    });
    req.on('error', () => resolve({ ok: false }));
    req.end();
  });
}

async function fetchGoogleNews(query, label) {
  try {
    const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=zh-CN&gl=CN&ceid=CN:zh-Hans';
    console.log('  Google News: ' + query);
    const r = await proxyFetch(url);
    if (!r.ok) return [];
    const text = await r.text();
    const data = xmlParser.parse(text);
    let items = data?.rss?.channel?.item || [];
    if (!Array.isArray(items)) items = [items];
    return items.map(item => ({
      title: cleanText(String(item.title || '')),
      url: String(item.link || ''),
      sourceUrl: String(item.link || ''),
      snippet: cleanText(String(item.description || '')).slice(0, 2000),
      source: cleanText(String((typeof item.source === 'object' && item.source ? (item.source._ || item.source['#text'] || '') : item.source) || 'Google News')),
      publishedAt: new Date(item.pubDate || Date.now()).toISOString(),
      collectedAt: now.toISOString(),
      sourceChannel: 'GoogleNews/' + label,
      linkType: 'publisher', region: '海外', language: 'zh',
      sourceType: '行业资讯', queryTopic: label, contextTags: [label],
      category: '风电动态', relevanceScore: 8, reliability: 60
    })).filter(a => a.title && a.url);
  } catch(e) { console.warn('  Google News FAIL: ' + e.message); return []; }
}

// Filter by date window
function inWindow(a) {
  const d = new Date(a.publishedAt);
  return d >= periodStart && d <= periodEnd;
}

// Simple wind-relevance check
function isWindRelevant(title, snippet) {
  const text = (title + ' ' + snippet).toLowerCase();
  const windTerms = ['wind', 'turbine', '风机', '风电', '风力', 'blade', '叶片', 'offshore', '海上', 'renewable', '清洁能源'];
  return windTerms.some(t => text.includes(t));
}

// === MAIN ===
console.log('=== Collecting supplementary news ===\n');

// Google News queries
const gnewsQueries = [
  ['风力发电 OR 风电 OR 风机', 'industry'],
  ['wind turbine OR wind power OR wind energy', 'industry-en'],
];

let newArticles = [];
for (const [q, label] of gnewsQueries) {
  const items = await fetchGoogleNews(q, label);
  console.log('  Got: ' + items.length + ' items');
  newArticles.push(...items);
  await delay(2000);
}

// Filter
newArticles = newArticles.filter(a => {
  if (!inWindow(a)) return false;
  if (!isWindRelevant(a.title, a.snippet)) return false;
  return true;
});

console.log('\nFiltered (in window + wind relevant): ' + newArticles.length);

// Generate IDs
function makeId(url, title) {
  const crypto = await import('node:crypto');
  return crypto.createHash('md5').update((url + title).slice(0, 200)).digest('hex').slice(0, 16);
}

for (const a of newArticles) {
  a.id = await makeId(a.url, a.title);
}

// Save
await writeFile('./public/data/supplement_news.json', JSON.stringify(newArticles, null, 2), 'utf8');
console.log('\nSaved supplement_news.json (' + newArticles.length + ' articles)');
newArticles.forEach(a => console.log('  ' + a.title.substring(0, 80)));
