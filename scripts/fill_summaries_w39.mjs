// Fill missing summaries for Week 39 with retry
import { readFileSync, writeFileSync } from 'fs';

const apiConfig = JSON.parse(readFileSync('config/api.json', 'utf8'));
const DS_URL = apiConfig.deepseek.baseUrl + '/chat/completions';
const data = JSON.parse(readFileSync('public/data/articles.json', 'utf8'));

const FOCUS = {
  '结构AI': '自动化建模方法、AI辅助设计工具、自动化出图技术、工程应用案例',
  '金属材料': '风电用钢、铸造锻造材料、材料性能与热处理工艺',
  '风机噪声': '叶片降噪技术、气动噪声控制、降噪材料与结构、噪声测试方法',
  '风电试验': '材料试验方法、疲劳试验技术、无损检测、试验标准与设备',
  '风电螺栓': '螺栓强度校核方法、预紧力控制、疲劳寿命评估、防松技术',
  '风电动态': '风电项目进展、技术突破、产业链动态、工程价值'
};

const todo = data.articles.filter(a => !a.summary || a.summary.length < 50);
console.log('Missing:', todo.length);

async function callDS(prompt) {
  const resp = await fetch(DS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiConfig.deepseek.apiKey },
    body: JSON.stringify({ model: apiConfig.deepseek.model, messages: [
      { role: 'system', content: '你是工程情报分析专家。返回有效JSON，不要markdown代码块。' },
      { role: 'user', content: prompt }], temperature: 0.3, max_tokens: 1800 }),
    signal: AbortSignal.timeout(60000)
  });
  const json = await resp.json();
  if (json.error) throw new Error(JSON.stringify(json.error).substring(0, 120));
  return json.choices?.[0]?.message?.content || '';
}

let ok = 0, fail = 0;
for (let i = 0; i < todo.length; i++) {
  const a = todo[i];
  const isPaper = a.sourceType === '学术论文';
  const focus = FOCUS[a.category] || '';
  const prompt = isPaper
    ? '你是工程情报分析专家。请将以下英文学术论文翻译并总结。\n\n论文标题：' + a.title +
      '\n摘要：' + (a.fullContent || a.snippet || '').substring(0, 2500) +
      '\n\n聚焦方向：' + focus + '\n\n请返回纯JSON：{"titleZh":"论文中文标题","summary":"中文摘要200-300字","keyPoints":["要点1","要点2","要点3"],"engineeringImpact":"工程参考价值"}'
    : '你是工程情报分析专家。请对以下文章进行摘要。\n\n文章标题：' + a.title +
      '\n文章内容：' + (a.fullContent || a.snippet || '').substring(0, 2000) +
      '\n\n聚焦方向：' + focus + '\n\n请返回纯JSON：{"titleZh":"中文标题","summary":"中文摘要150-250字","keyPoints":["要点1","要点2","要点3"],"engineeringImpact":"工程参考价值"}';

  let done = false;
  for (let attempt = 0; attempt < 3 && !done; attempt++) {
    try {
      const text = await callDS(prompt);
      let parsed;
      try { parsed = JSON.parse(text.replace(/`json\n?/g, '').replace(/`\n?/g, '').trim()); }
      catch { parsed = { summary: text.substring(0, 300) }; }
      if (parsed.summary && parsed.summary.length > 10) a.summary = parsed.summary;
      if (parsed.titleZh) a.titleZh = parsed.titleZh;
      if (parsed.keyPoints?.length) a.keyPoints = parsed.keyPoints;
      if (parsed.engineeringImpact) a.engineeringImpact = parsed.engineeringImpact;
      done = true; ok++;
      process.stdout.write('[' + (i+1) + '/' + todo.length + ']OK ');
    } catch(e) {
      if (attempt === 2) { fail++; process.stdout.write('[' + (i+1) + ']FAIL(' + e.message.substring(0,40) + ') '); }
      else await new Promise(r => setTimeout(r, 3000));
    }
  }
  await new Promise(r => setTimeout(r, 900));
  if ((i+1) % 5 === 0) process.stdout.write('\n');
}
process.stdout.write('\n');
console.log('OK:', ok, 'FAIL:', fail);

writeFileSync('public/data/articles.json', JSON.stringify(data, null, 2), 'utf8');
console.log('With summary now:', data.articles.filter(a => a.summary && a.summary.length > 50).length, '/', data.articles.length);
