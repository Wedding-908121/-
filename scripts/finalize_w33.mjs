// AI summarize 北极星 articles + save final Week 33 data
import { readFileSync, writeFileSync } from 'fs';

const PERIOD = '2026.08.10-2026.08.16 第33周';
const apiConfig = JSON.parse(readFileSync('config/api.json', 'utf8'));
const DS_KEY = apiConfig.deepseek.apiKey;
const DS_URL = apiConfig.deepseek.baseUrl + '/chat/completions';

const merged = JSON.parse(readFileSync('temp_merged.json', 'utf8'));

// Find articles without summary
const needSummary = merged.filter(a => !a.summary || a.summary.length < 50);
console.log('Need summary:', needSummary.length);

const FOCUS = {
  '结构AI': '重点提取：自动化建模方法、自动化出图技术、自动化审核流程、AI辅助设计工具、工程应用案例',
  '金属材料': '重点提取：齿轮锻造材料、球磨铸铁材料、风电用钢性能、材料热处理工艺',
  '风机噪声': '重点提取：叶片降噪技术、气动噪声控制、降噪材料与结构、噪声测试方法',
  '风电试验': '重点提取：材料试验方法、裂纹试验技术、疲劳试验数据、静强度试验标准、试验设备与流程',
  '风电螺栓': '重点提取：螺栓强度校核方法、螺栓加工工艺、预紧力控制、疲劳寿命评估、防松技术',
  '风电动态': '重点提取：风电项目进展、技术突破、政策变化、产业链动态、企业合作'
};

for (let i = 0; i < needSummary.length; i++) {
  const a = needSummary[i];
  const focus = FOCUS[a.category] || '';
  
  try {
    const prompt = '你是工程情报分析专家。请对以下新闻进行摘要。\n\n' +
      '新闻标题：' + a.title + '\n' +
      '\n聚焦方向：' + focus + '\n\n' +
      '请返回纯JSON：{"titleZh":"中文标题","summary":"中文摘要100-200字","keyPoints":["要点1","要点2","要点3"],"engineeringImpact":"工程参考价值"}';
    
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
    if (json.error) { console.log('[' + (i+1) + '/' + needSummary.length + '] API_ERR'); continue; }
    
    const text = json.choices?.[0]?.message?.content || '';
    let parsed;
    try {
      const clean = text.replace(/`json\n?/g, '').replace(/`\n?/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      parsed = { summary: text.substring(0, 300) };
    }
    
    if (parsed.summary) a.summary = parsed.summary;
    if (parsed.titleZh) a.titleZh = parsed.titleZh;
    if (parsed.keyPoints?.length) a.keyPoints = parsed.keyPoints;
    if (parsed.engineeringImpact) a.engineeringImpact = parsed.engineeringImpact;
    
    process.stdout.write('[' + (i+1) + '/' + needSummary.length + '] OK ');
  } catch(e) {
    process.stdout.write('[' + (i+1) + '/' + needSummary.length + '] FAIL ');
  }
  await new Promise(r => setTimeout(r, 300));
}
process.stdout.write('\n');

// Final counts
const grouped = {};
for (const a of merged) {
  const cat = a.category || '风电动态';
  if (!grouped[cat]) grouped[cat] = [];
  grouped[cat].push(a);
}

const output = {
  app: '机械共性部情报中心',
  generatedAt: new Date().toISOString(),
  collectionStatus: {
    dataMode: 'live',
    demo: false,
    manualCount: merged.filter(a => a.sourceChannel && a.sourceChannel.includes('手动')).length,
    autoCount: merged.filter(a => !a.sourceChannel || !a.sourceChannel.includes('手动')).length
  },
  weeklyBrief: {
    total: merged.length,
    domestic: merged.filter(a => a.region === '国内').length,
    papers: merged.filter(a => a.sourceType === '学术论文').length,
    categories: Object.keys(grouped).map(c => ({ name: c, count: grouped[c].length })),
    period: PERIOD
  },
  articles: merged
};

writeFileSync('public/data/articles.json', JSON.stringify(output, null, 2), 'utf8');

console.log('\n=== Week 33 FINAL ===');
console.log('Total:', merged.length);
for (const [cat, arts] of Object.entries(grouped)) {
  console.log('  ' + cat + ': ' + arts.length);
}
console.log('Papers:', merged.filter(a => a.sourceType === '学术论文').length);
console.log('With summary:', merged.filter(a => a.summary && a.summary.length > 50).length);
