import { readFileSync, writeFileSync } from 'fs';

const bjx = JSON.parse(readFileSync('temp_bjx.json', 'utf8'));
const data = JSON.parse(readFileSync('public/data/articles.json', 'utf8'));

// Add the 16MW generator article via fuzzy match
const fuzzy = bjx.find(x => x.title.includes('16MW海上风力发电机'));
if (fuzzy) console.log('Found:', fuzzy.title);

const PICKS = [
  '大兆瓦风机加速演进，IT7900电网模拟器如何支撑功率单元温升验证？',
  '世界电压等级最高、输送容量最大直流海缆完成海上换流站平台施工',
  '老师傅的经验+智能化的平台，这才是智慧运营该有的样子',
  '水电四局交付三峡深远海风电176台套塔筒等装备',
  '大连重工陆上风机核心铸件成功交付',
  fuzzy ? fuzzy.title : null,
  '国内首个批量退役风电机组梯次利用项目正式启动！',
  '“十五五”风机大变样？风储一体机来了',
  '亨通助力全球首座16兆瓦张力腿浮式风电平台成功并网',
  '“白海豚”来袭，海上机组如何通过台风季大考？',
  '超强台风“白海豚”登陆浙江 运达机组再交“安全”答卷',
  '运达300MW海上风电项目环评获批',
  '东非最大风电项目！运达股份斩获国际订单',
  '中广核400MW海上风电项目招标！',
  '华润100万千瓦风电机组招标！'
].filter(Boolean);

const selected = [];
for (const p of PICKS) {
  const a = bjx.find(x => x.title === p);
  if (a) selected.push(a);
}

console.log('Selected:', selected.length);
const others = data.articles.filter(a => a.category !== '风电动态');
const merged = [...others, ...selected];
writeFileSync('temp_merged.json', JSON.stringify(merged, null, 2), 'utf8');
console.log('Merged total:', merged.length);
