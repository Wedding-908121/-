import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const raw = readFileSync(join(root, 'config/manual-urls.txt'), 'utf8');
const dateLine = raw.split('\n')[0].trim();
const [startStr, endStr] = dateLine.split('-');
const PERIOD_START = new Date(startStr + 'T00:00:00+08:00');
const PERIOD_END = new Date(endStr + 'T23:59:59+08:00');

const start = new Date(startStr + 'T00:00:00+08:00');
const year = start.getFullYear();
const jan1 = new Date(year, 0, 1);
const weekNum = Math.ceil((((start - jan1) / 86400000) + jan1.getDay() + 1) / 7);
const ID_PREFIX = 'w' + weekNum + '-';

function makeId(url, title, salt) {
  return ID_PREFIX + createHash('md5').update(url + '|' + title + '|' + salt).digest('hex').substring(0, 12);
}

function cleanText(s) {
  return (s||'').replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}

const articles = [];
const seen = new Set();

for (let page = 1; page <= 4; page++) {
  const url = page === 1 ? 'https://fd.bjx.com.cn/yw/' : 'https://fd.bjx.com.cn/yw/' + page + '/';
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15000)
    });
    const html = await r.text();
    
    const re = /<a href="(https?:\/\/news\.bjx\.com\.cn\/html\/[^"]+)"[^>]*title="([^"]+)"[^>]*>[^<]*<\/a><span>(\d{4}-\d{2}-\d{2})<\/span>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const link = m[1];
      const title = cleanText(m[2]);
      const dateStr = m[3];
      if (!title || title.length < 8 || seen.has(link)) continue;
      seen.add(link);
      
      const pubDate = new Date(dateStr + 'T12:00:00+08:00');
      if (pubDate >= PERIOD_START && pubDate <= PERIOD_END) {
        articles.push({
          id: makeId(link, title, 'bjx'),
          title,
          titleZh: title,
          url: link,
          sourceUrl: link,
          snippet: '',
          fullContent: '',
          source: '北极星风电',
          publishedAt: pubDate.toISOString(),
          collectedAt: new Date().toISOString(),
          sourceChannel: '北极星风电/自动采集',
          sourceType: '新闻',
          linkType: 'publisher',
          region: '国内',
          language: 'zh',
          queryTopic: '风电动态',
          contextTags: ['风电动态'],
          category: '风电动态',
          tags: [],
          relevanceScore: 8,
          reliability: { grade: 'B', label: '行业媒体', score: 75 }
        });
      }
    }
  } catch(e) {
    console.log('Page', page, 'fail:', e.message.substring(0, 40));
  }
  await new Promise(r => setTimeout(r, 400));
}

console.log('Period:', dateLine, '| Total in period:', articles.length);
writeFileSync('temp_bjx.json', JSON.stringify(articles, null, 2), 'utf8');
