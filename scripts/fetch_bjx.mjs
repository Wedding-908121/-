// 北极星风电 - list page with dates (no detail fetch needed)
import { createHash } from 'crypto';
import { writeFileSync } from 'fs';

const PERIOD_START = new Date('2026-08-10T00:00:00+08:00');
const PERIOD_END = new Date('2026-08-16T23:59:59+08:00');

function makeId(url, title, salt) {
  return 'w33-' + createHash('md5').update(url + '|' + title + '|' + salt).digest('hex').substring(0, 12);
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
    
    // Match: <a href="..." title="TITLE">TITLE</a><span>DATE</span>
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
        console.log('OK:', dateStr, '|', title.substring(0, 55));
      }
    }
  } catch(e) {
    console.log('Page', page, 'fail:', e.message.substring(0, 40));
  }
  await new Promise(r => setTimeout(r, 400));
}

console.log('\nTotal in period:', articles.length);
writeFileSync('temp_bjx.json', JSON.stringify(articles, null, 2), 'utf8');
