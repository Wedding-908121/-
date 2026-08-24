// 北极星全栏目抓取 Week 34 (08.17-08.23)
import { createHash } from 'crypto';
import { writeFileSync } from 'fs';

const PERIOD_START = new Date('2026-08-17T00:00:00+08:00');
const PERIOD_END = new Date('2026-08-23T23:59:59+08:00');

const CATS = [
  ['fdcy', '风电产业'], ['xm', '风电项目'], ['fdsbycl', '风电设备'],
  ['fdyw', '风电运维'], ['ypjycl', '叶片及原材料'], ['hsfd', '海上风电'],
  ['gj', '全球风电'], ['zc', '政策'], ['js', '技术'], ['mq', '企业'],
  ['sj', '数据'], ['sc', '市场'], ['zb', '招标'], ['yw', '要闻']
];

function makeId(url, title, salt) {
  return 'w34-' + createHash('md5').update(url + '|' + title + '|' + salt).digest('hex').substring(0, 12);
}

function cleanText(s) {
  return (s||'').replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}

const articles = [];
const seen = new Set();

for (const [cat, name] of CATS) {
  for (let page = 1; page <= 2; page++) {
    const url = page === 1 ? 'https://fd.bjx.com.cn/' + cat + '/' : 'https://fd.bjx.com.cn/' + cat + '/' + page + '/';
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(15000)
      });
      const html = await r.text();
      
      const re = /<a href="(https?:\/\/news\.bjx\.com\.cn\/html\/[^"]+)"[^>]*title="([^"]+)"[^>]*>[^<]*<\/a><span>(\d{4}-\d{2}-\d{2})<\/span>/g;
      let m, cnt = 0;
      while ((m = re.exec(html)) !== null) {
        const link = m[1];
        const title = cleanText(m[2]);
        const dateStr = m[3];
        if (!title || title.length < 8 || seen.has(link)) continue;
        
        const pubDate = new Date(dateStr + 'T12:00:00+08:00');
        if (pubDate >= PERIOD_START && pubDate <= PERIOD_END) {
          seen.add(link);
          articles.push({
            id: makeId(link, title, 'bjx'),
            title,
            titleZh: title,
            url: link,
            sourceUrl: link,
            snippet: '',
            fullContent: '',
            source: '北极星风电-' + name,
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
          cnt++;
        }
      }
      process.stdout.write(name + '(p' + page + '):' + cnt + ' ');
    } catch(e) {
      process.stdout.write(name + ':FAIL ');
    }
    await new Promise(r => setTimeout(r, 300));
  }
  process.stdout.write('\n');
}

console.log('\nTotal in period:', articles.length);
writeFileSync('temp_bjx.json', JSON.stringify(articles, null, 2), 'utf8');
