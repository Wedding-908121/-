// Fix and enhance Week 32 articles - ESM version
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const PERIOD = '2026.08.03-2026.08.09 第32周';
const MAX_PER_CAT = 15;
const CAT_ORDER = ['风电动态', '结构AI', '金属材料', '风机噪声', '风电试验', '风电螺栓'];

const apiConfig = JSON.parse(readFileSync(join(root, 'config/api.json'), 'utf8'));
const DS_KEY = apiConfig.deepseek.apiKey;
const DS_URL = apiConfig.deepseek.baseUrl + '/chat/completions';
const OPENALEX_KEY = apiConfig.openalex?.apiKey || '';
console.log('DeepSeek key configured:', DS_KEY ? 'YES' : 'NO');
console.log('OpenAlex key configured:', OPENALEX_KEY ? 'YES' : 'NO');

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

function reconstructAbstract(inverted) {
  if (!inverted) return '';
  const indexed = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) indexed.push({ pos, word });
  }
  indexed.sort((a,b) => a.pos - b.pos);
  return indexed.map(x => x.word).join(' ');
}

async function fetchOpenAlexPapers(category, query) {
  const papers = [];
  try {
    const url = 'https://api.openalex.org/works?search=' + encodeURIComponent(query) +
      '&per_page=5&sort=publication_date:desc&filter=from_publication_date:2026-07-01' +
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
      const pubDate = w.publication_date || '2026-07-01';
      const abstract = (w.abstract_inverted_index ? reconstructAbstract(w.abstract_inverted_index) : '').substring(0, 2000);
      
      papers.push({
        id: 'oa-' + (w.id || Math.random().toString(36)).replace(/[^a-z0-9]/gi,'').substring(0, 16),
        title: title,
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
        queryTopic: category,
        contextTags: [category, '学术论文'],
        category: category,
        tags: authors ? [authors] : [],
        relevanceScore: 8,
        reliability: { grade: 'A', label: '学术期刊', score: 85 }
      });
    }
  } catch(e) {
    console.log('  OpenAlex error for ' + category + ': ' + e.message);
  }
  return papers;
}

async function aiSummarize(article, index, total) {
  const focus = FOCUS[article.category] || '';
  const isPaper = article.sourceType === '学术论文';
  
  const prompt = isPaper 
    ? '你是工程情报分析专家。请将以下英文学术论文翻译并总结。\n\n' +
      '论文标题：' + article.title + '\n' +
      '摘要：' + (article.fullContent || article.snippet || '').substring(0, 3000) + '\n\n' +
      '聚焦方向：' + focus + '\n\n' +
      '请返回纯JSON：\n{"titleZh":"论文中文标题","summary":"中文摘要200-350字，提取研究背景、方法、核心发现和工程意义",' +
      '"keyPoints":["要点1","要点2","要点3"],"engineeringImpact":"工程参考价值"}'
    : '你是工程情报分析专家。请对以下文章进行摘要。\n\n' +
      '文章标题：' + article.title + '\n' +
      '文章内容：' + (article.fullContent || article.snippet || '').substring(0, 3000) + '\n\n' +
      '聚焦方向：' + focus + '\n\n' +
      '请返回纯JSON：\n{"titleZh":"中文标题","summary":"中文摘要150-300字",' +
      '"keyPoints":["要点1","要点2","要点3"],"engineeringImpact":"工程参考价值"}';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    const resp = await fetch(DS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + DS_KEY
      },
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
    
    if (parsed.summary && parsed.summary.length > 10) {
      article.summary = parsed.summary;
    }
    if (parsed.titleZh) article.titleZh = parsed.titleZh;
    if (parsed.keyPoints?.length) article.keyPoints = parsed.keyPoints;
    if (parsed.engineeringImpact) article.engineeringImpact = parsed.engineeringImpact;
    
    process.stdout.write('[' + (index+1) + '/' + total + '] OK ');
  } catch(e) {
    process.stdout.write('[' + (index+1) + '/' + total + '] FAIL ');
  }
  
  await new Promise(r => setTimeout(r, 300));
}

async function main() {
  console.log('=== Week 32 Enhancement ===\n');
  
  // 1. Load current articles
  const current = JSON.parse(readFileSync(join(root, 'public/data/articles.json'), 'utf8'));
  let articles = current.articles;
  articles = articles.filter(a => !(a.sourceChannel || '').includes('????'));
  console.log('Loaded articles:', articles.length);
  
  // 2. Fetch OpenAlex papers for each topic (except 风电动态)
  console.log('\n--- Fetching OpenAlex Papers ---');
  for (const cat of ['金属材料', '风机噪声', '风电试验', '风电螺栓', '结构AI']) {
    const query = PAPER_QUERIES[cat];
    if (!query) continue;
    process.stdout.write(cat + ': ');
    const papers = await fetchOpenAlexPapers(cat, query);
    process.stdout.write('+' + papers.length + ' papers\n');
    articles.push(...papers);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('Total after papers:', articles.length);
  
  // 3. Run AI summarization on articles that don't have it
  console.log('\n--- AI Summarization (DeepSeek) ---');
  const needSummary = articles.filter(a => !a.summary || a.summary.length < 50);
  console.log('Need AI summary:', needSummary.length);
  
  for (let i = 0; i < needSummary.length; i++) {
    await aiSummarize(needSummary[i], i, needSummary.length);
    if ((i+1) % 5 === 0) process.stdout.write('\n');
  }
  process.stdout.write('\n');
  
  // 4. Cap each category at MAX_PER_CAT
  console.log('\n--- Capping at ' + MAX_PER_CAT + ' ---');
  const grouped = {};
  for (const a of articles) {
    const cat = a.category || '风电动态';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(a);
  }
  
  const final = [];
  for (const cat of CAT_ORDER) {
    const arts = grouped[cat] || [];
    arts.sort((a, b) => {
      const rs = (b.relevanceScore||0) - (a.relevanceScore||0);
      if (rs !== 0) return rs;
      return new Date(b.publishedAt||0).getTime() - new Date(a.publishedAt||0).getTime();
    });
    const capped = arts.slice(0, MAX_PER_CAT);
    console.log(cat + ': ' + capped.length + ' (raw: ' + arts.length + ')');
    final.push(...capped);
  }
  
  // 5. Save
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
      categories: CAT_ORDER.filter(c => grouped[c]).map(c => ({ name: c, count: (grouped[c]||[]).length })),
      period: PERIOD
    },
    articles: final
  };
  
  writeFileSync(join(root, 'public/data/articles.json'), JSON.stringify(output, null, 2), 'utf8');
  console.log('\n=== DONE ===');
  console.log('Total articles:', final.length);
  console.log('Papers:', final.filter(a => a.sourceType==='学术论文').length);
  console.log('With AI summary:', final.filter(a => a.summary && a.summary.length > 50).length);
  console.log('Saved: public/data/articles.json');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
