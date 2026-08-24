// Merge supplement into Week 34 + cap 15 + save
import { readFileSync, writeFileSync } from 'fs';

const PERIOD = '2026.08.17-2026.08.23 第34周';
const MAX = 15;
const CAT_ORDER = ['风电动态', '结构AI', '金属材料', '风机噪声', '风电试验', '风电螺栓'];

const supp = JSON.parse(readFileSync('temp_supplement.json', 'utf8'));
const current = JSON.parse(readFileSync('public/data/articles.json', 'utf8'));

// Dedup by URL/title against existing
const existingKeys = new Set();
current.articles.forEach(a => existingKeys.add((a.url || a.title || '').trim()));

const added = supp.filter(a => {
  const k = (a.url || a.title || '').trim();
  if (existingKeys.has(k)) return false;
  existingKeys.add(k);
  return true;
});

console.log('New unique items:', added.length);

// Merge
const all = [...current.articles, ...added];

// Group & cap
const grouped = {};
for (const a of all) {
  const cat = a.category || '风电动态';
  if (!grouped[cat]) grouped[cat] = [];
  grouped[cat].push(a);
}

const final = [];
for (const cat of CAT_ORDER) {
  const arts = grouped[cat] || [];
  // Sort: papers first? No - sort by relevance then date
  arts.sort((a, b) => {
    const rs = (b.relevanceScore||0) - (a.relevanceScore||0);
    if (rs !== 0) return rs;
    return new Date(b.publishedAt||0) - new Date(a.publishedAt||0);
  });
  const capped = arts.slice(0, MAX);
  console.log(cat + ': ' + capped.length + ' (raw: ' + arts.length + ')');
  final.push(...capped);
}

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

writeFileSync('public/data/articles.json', JSON.stringify(output, null, 2), 'utf8');

console.log('\n=== FINAL ===');
console.log('Total:', final.length);
console.log('Papers:', final.filter(a => a.sourceType === '学术论文').length);
console.log('News:', final.filter(a => a.sourceType === '新闻').length);
console.log('With summary:', final.filter(a => a.summary && a.summary.length > 50).length);

// Source breakdown
const src = {};
final.forEach(a => {
  const ch = a.sourceChannel || '未知';
  src[ch] = (src[ch]||0) + 1;
});
console.log('\nSources:');
Object.entries(src).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log('  ' + k + ': ' + v));
