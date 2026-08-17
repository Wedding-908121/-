// Week 33 processor - fetch manual URLs + auto sources + AI summarize
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const PERIOD = '2026.08.10-2026.08.16 第33周';
const MAX_PER_CAT = 15;
const CAT_ORDER = ['风电动态', '结构AI', '金属材料', '风机噪声', '风电试验', '风电螺栓'];

const apiConfig = JSON.parse(readFileSync(join(root, 'config/api.json'), 'utf8'));
const DS_KEY = apiConfig.deepseek.apiKey;
const DS_URL = apiConfig.deepseek.baseUrl + '/chat/completions';
const OPENALEX_KEY = apiConfig.openalex?.apiKey || '';

const FOCUS = {
  '结构AI': '重点提取：自动化建模方法、自动化出图技术、自动化审核流程、AI辅助设计工具、工程应用案例',
  '金属材料': '重点提取：齿轮锻造材料、球磨铸铁材料、风电用钢性能、材料热处理工艺',
  '风机噪声': '重点提取：叶片降噪技术、气动噪声控制、降噪材料与结构、噪声测试方法',
  '风电试验': '重点提取：材料试验方法、裂纹试验技术、疲劳试验数据、静强度试验标准、试验设备与流程',
  '风电螺栓': '重点提取：螺栓强度校核方法、螺栓加工工艺、预紧力控制、疲劳寿命评估、防松技术',
  '风电动态': '重点提取：风电项目进展、技术突破、政策变化、产业链动态、企业合作'
};

const PAPER_QUERIES = {
  '金属材料': 'wind turbine steel alloy casting forging gear fatigue fracture microstructure',
  '风机噪声': 'wind turbine noise aeroacoustic sound reduction blade trailing edge serration',
  '风电试验': 'wind turbine fatigue test material tensile NDT structural health crack detection',
  '风电螺栓': 'wind turbine bolt fastener bolted flange preload tightening fatigue',
  '结构AI': 'structural engineering AI machine learning automation design optimization generative'
};

const CAT_MAP = {
  '结构AI': '结构AI',
  '金属材料': '金属材料',
  '风电噪声': '风机噪声',
  '风电试验': '风电试验',
  '风电螺栓': '风电螺栓',
  '风电动态': '风电动态'
};

function matchCategory(line) {
  for (const [key, val] of Object.entries(CAT_MAP)) {
    if (line.includes(key)) return val;
  }
  return null;
}

function cleanText(s) {
  return (s||'').replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}

function makeId(url, title, salt) {
  return 'w33-' + createHash('md5').update(url + '|' + title + '|' + salt).digest('hex').substring(0, 12);
}

function reconstructAbstract(inverted) {
  if (!inverted) return '';
  const indexed = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) indexed.push({ pos, word });
  }
  indexed.sort((a,b) => a.pos - b.pos);
  return indexed.map(x => x.word).join(' ');
}

// 1. Fetch manual WeChat URLs
async function fetchManualUrls() {
  const raw = readFileSync(join(root, 'config/manual-urls.txt'), 'utf8');
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  
  let currentCategory = '风电动态';
  const urlEntries = [];
  
  for (const line of lines) {
    if (line.match(/^\d{4}\.\d{2}\.\d{2}/)) continue;
    const matched = matchCategory(line);
    if (matched) { currentCategory = matched; continue; }
    if (line.startsWith('http')) {
      urlEntries.push({ url: line, category: currentCategory });
    }
  }
  
  console.log('Manual URLs:', urlEntries.length);
  const articles = [];
  const seenUrls = new Set();
  
  for (let i = 0; i < urlEntries.length; i++) {
    const {url, category} = urlEntries[i];
    if (seenUrls.has(url)) {
      console.log('[' + (i+1) + '/' + urlEntries.length + '] SKIP duplicate: ' + url.substring(0, 60));
      continue;
    }
    seenUrls.add(url);
    
    try {
      process.stdout.write('[' + (i+1) + '/' + urlEntries.length + '] ' + category + ': ');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
        signal: controller.signal
      });
      clearTimeout(timeout);
      const html = await r.text();
      
      let title = '';
      const m1 = html.match(/<meta property="og:title" content="([^"]+)"/);
      const m2 = html.match(/var msg_title\s*=\s*'([^']+)'/);
      const m3 = html.match(/<title[^>]*>([^<]+)<\/title>/);
      if (m1) title = cleanText(m1[1]);
      else if (m2) title = cleanText(m2[1]);
      else if (m3) title = cleanText(m3[1]);
      if (!title || title.length < 3) { console.log('SKIP: no title'); continue; }
      
      let source = '微信公众号';
      const sm = html.match(/var nickname\s*=\s*"([^"]+)"/);
      if (sm) source = cleanText(sm[1]);
      
      let content = '';
      const cm = html.match(/<div[^>]*class="rich_media_content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (cm) content = cleanText(cm[1]).substring(0, 4000);
      if (!content) {
        const dm = html.match(/var msg_desc\s*=\s*"([^"]+)"/);
        if (dm) content = cleanText(dm[1]).substring(0, 500);
      }
      
      let pubDate = new Date('2026-08-10T00:00:00+08:00');
      const dm2 = html.match(/var ct\s*=\s*"(\d+)"/);
      if (dm2) {
        const ts = parseInt(dm2[1]);
        if (ts > 1000000000) pubDate = new Date(ts * 1000);
      }
      
      console.log(title.substring(0, 50) + ' | ' + source);
      
      articles.push({
        id: makeId(url, title, String(i)),
        title,
        titleZh: title,
        url,
        sourceUrl: url,
        snippet: content.substring(0, 500),
        fullContent: content,
        source,
        publishedAt: pubDate.toISOString(),
        collectedAt: new Date().toISOString(),
        sourceChannel: '微信公众号/手动采集',
        sourceType: '行业资讯',
        linkType: 'publisher',
        region: '国内',
        language: 'zh',
        queryTopic: category,
        contextTags: [category],
        category,
        tags: [],
        relevanceScore: 10,
        reliability: { grade: 'B', label: '可靠', score: 70 }
      });
    } catch(e) {
      console.log('FAIL: ' + e.message.substring(0, 50));
    }
    await new Promise(r => setTimeout(r, 400));
  }
  
  return articles;
}

// 2. Fetch Google News for 风电动态
async function fetchGoogleNews() {
  console.log('\n=== Google News 风电动态 ===');
  const articles = [];
  try {
    const queries = ['风电', 'wind power China', 'wind turbine'];
    for (const q of queries) {
      const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q + ' when:7d') + '&hl=zh-CN&gl=CN&ceid=CN:zh-Hans';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      const xml = await r.text();
      
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
      for (const m of items) {
        const item = m[1];
        const titleM = item.match(/<title>(.*?)<\/title>/);
        const linkM = item.match(/<link>(.*?)<\/link>/);
        const pubM = item.match(/<pubDate>(.*?)<\/pubDate>/);
        const srcM = item.match(/<source[^>]*url="([^"]*)"/);
        if (!titleM || !linkM) continue;
        
        const title = cleanText(titleM[1]);
        const link = cleanText(linkM[1]);
        const pubDate = pubM ? new Date(pubM[1]).toISOString() : new Date().toISOString();
        const source = srcM ? cleanText(srcM[1]) : 'Google News';
        
        // Only keep within week period
        const pd = new Date(pubDate);
        const weekStart = new Date('2026-08-10T00:00:00+08:00');
        const weekEnd = new Date('2026-08-16T23:59:59+08:00');
        if (pd < weekStart || pd > weekEnd) continue;
        
        articles.push({
          id: makeId(link, title, 'gn'),
          title,
          titleZh: title,
          url: link,
          sourceUrl: link,
          snippet: '',
          fullContent: '',
          source,
          publishedAt: pubDate,
          collectedAt: new Date().toISOString(),
          sourceChannel: 'Google News/自动采集',
          sourceType: '新闻',
          linkType: 'aggregator',
          region: '国内',
          language: 'zh',
          queryTopic: '风电动态',
          contextTags: ['风电动态'],
          category: '风电动态',
          tags: [],
          relevanceScore: 7,
          reliability: { grade: 'B', label: '可靠', score: 65 }
        });
      }
      await new Promise(r => setTimeout(r, 500));
    }
  } catch(e) {
    console.log('Google News error:', e.message);
  }
  console.log('Google News:', articles.length);
  return articles;
}

// 3. Fetch OpenAlex papers
async function fetchOpenAlexPapers() {
  console.log('\n=== OpenAlex Papers ===');
  const all = [];
  for (const [cat, query] of Object.entries(PAPER_QUERIES)) {
    process.stdout.write(cat + ': ');
    try {
      const url = 'https://api.openalex.org/works?search=' + encodeURIComponent(query) +
        '&per_page=5&sort=publication_date:desc&filter=from_publication_date:2026-07-20' +
        (OPENALEX_KEY ? '&api_key=' + OPENALEX_KEY : '') + '&mailto=chaohu2000@outlook.com';
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      const d = await r.json();
      
      for (const w of (d.results || [])) {
        const title = w.title || '';
        if (!title || title.length < 5) continue;
        
        const doi = w.doi ? 'https://doi.org/' + w.doi : null;
        const authors = (w.authorships || []).map(a => a.author?.display_name).filter(Boolean).slice(0, 3).join(', ');
        const journal = w.primary_location?.source?.display_name || '';
        const pubDate = w.publication_date || '2026-08-01';
        const abstract = (w.abstract_inverted_index ? reconstructAbstract(w.abstract_inverted_index) : '').substring(0, 2000);
        
        all.push({
          id: makeId(doi || w.id || title, title, 'oa'),
          title,
          titleZh: title,
          url: doi || (w.open_access?.oa_url || 'https://openalex.org/' + (w.id||'')),
          sourceUrl: doi || '',
          snippet: abstract.substring(0, 500),
          fullContent: abstract,
          source: journal || 'OpenAlex',
          publishedAt: pubDate,
          collectedAt: new Date().toISOString(),
          sourceChannel: 'OpenAlex/学术论文',
          sourceType: '学术论文',
          linkType: 'research',
          region: '海外',
          language: 'en',
          queryTopic: cat,
          contextTags: [cat, '学术论文'],
          category: cat,
          tags: authors ? [authors] : [],
          relevanceScore: 8,
          reliability: { grade: 'A', label: '学术期刊', score: 85 }
        });
      }
      process.stdout.write('+' + (all.filter(a => a.category === cat).length) + ' papers\n');
    } catch(e) {
      process.stdout.write('FAIL: ' + e.message.substring(0, 40) + '\n');
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('Total papers:', all.length);
  return all;
}

// 4. AI summarization
async function aiSummarize(article, index, total) {
  const focus = FOCUS[article.category] || '';
  const isPaper = article.sourceType === '学术论文';
  
  const prompt = isPaper
    ? '你是工程情报分析专家。请将以下英文学术论文翻译并总结。\n\n论文标题：' + article.title +
      '\n摘要：' + (article.fullContent || article.snippet || '').substring(0, 3000) +
      '\n\n聚焦方向：' + focus + '\n\n' +
      '请返回纯JSON：{"titleZh":"论文中文标题","summary":"中文摘要200-350字","keyPoints":["要点1","要点2","要点3"],"engineeringImpact":"工程参考价值"}'
    : '你是工程情报分析专家。请对以下文章进行摘要。\n\n文章标题：' + article.title +
      '\n文章内容：' + (article.fullContent || article.snippet || '').substring(0, 3000) +
      '\n\n聚焦方向：' + focus + '\n\n' +
      '请返回纯JSON：{"titleZh":"中文标题","summary":"中文摘要150-300字","keyPoints":["要点1","要点2","要点3"],"engineeringImpact":"工程参考价值"}';

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
        max_tokens: 2000
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    const json = await resp.json();
    if (json.error) {
      process.stdout.write('[' + (index+1) + '/' + total + '] API_ERR ');
      return;
    }
    
    const text = json.choices?.[0]?.message?.content || '';
    let parsed;
    const clean = text.replace(/`json\n?/g, '').replace(/`\n?/g, '').trim();
    try {
      parsed = JSON.parse(clean);
    } catch {
      parsed = { summary: text.substring(0, 400) };
    }
    
    if (parsed.summary && parsed.summary.length > 10) article.summary = parsed.summary;
    if (parsed.titleZh) article.titleZh = parsed.titleZh;
    if (parsed.keyPoints?.length) article.keyPoints = parsed.keyPoints;
    if (parsed.engineeringImpact) article.engineeringImpact = parsed.engineeringImpact;
    
    process.stdout.write('[' + (index+1) + '/' + total + '] OK ');
  } catch(e) {
    process.stdout.write('[' + (index+1) + '/' + total + '] FAIL ');
  }
  await new Promise(r => setTimeout(r, 300));
}

// Main
async function main() {
  console.log('=== Week 33 Processor ===');
  console.log('Period:', PERIOD);
  
  let articles = [];
  
  // Fetch sources
  const manual = await fetchManualUrls();
  articles.push(...manual);
  
  const gnews = await fetchGoogleNews();
  articles.push(...gnews);
  
  const papers = await fetchOpenAlexPapers();
  articles.push(...papers);
  
  console.log('\nTotal collected:', articles.length);
  
  // AI summarization
  console.log('\n=== AI Summarization ===');
  for (let i = 0; i < articles.length; i++) {
    await aiSummarize(articles[i], i, articles.length);
    if ((i+1) % 5 === 0) process.stdout.write('\n');
  }
  process.stdout.write('\n');
  
  // Group and cap
  console.log('\n=== Grouping ===');
  const grouped = {};
  for (const a of articles) {
    const cat = a.category || '风电动态';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(a);
  }
  
  const final = [];
  for (const cat of CAT_ORDER) {
    const arts = grouped[cat] || [];
    // Dedup by title
    const seenTitles = new Set();
    const deduped = arts.filter(a => {
      const t = (a.title || '').trim();
      if (seenTitles.has(t)) return false;
      seenTitles.add(t);
      return true;
    });
    deduped.sort((a, b) => (b.relevanceScore||0) - (a.relevanceScore||0));
    const capped = deduped.slice(0, MAX_PER_CAT);
    console.log(cat + ': ' + capped.length + ' (raw: ' + deduped.length + ')');
    final.push(...capped);
  }
  
  // Save
  const output = {
    app: '机械共性部情报中心',
    generatedAt: new Date().toISOString(),
    collectionStatus: {
      dataMode: 'live',
      demo: false,
      manualCount: final.filter(a => a.sourceChannel && a.sourceChannel.includes('手动')).length,
      autoCount: final.filter(a => !a.sourceChannel || !a.sourceChannel.includes('手动')).length
    },
    weeklyBrief: {
      total: final.length,
      domestic: final.filter(a => a.region === '国内').length,
      papers: final.filter(a => a.sourceType === '学术论文').length,
      categories: CAT_ORDER.filter(c => grouped[c]).map(c => ({ name: c, count: grouped[c].length })),
      period: PERIOD
    },
    articles: final
  };
  
  writeFileSync(join(root, 'public/data/articles.json'), JSON.stringify(output, null, 2), 'utf8');
  
  console.log('\n=== DONE ===');
  console.log('Total:', final.length);
  console.log('Papers:', final.filter(a => a.sourceType === '学术论文').length);
  console.log('With summary:', final.filter(a => a.summary && a.summary.length > 50).length);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
