import { readFile, writeFile } from "node:fs/promises";

let content = await readFile("./scripts/lib/articles.mjs", "utf8");

// Replace category rules with new 4-direction system
const oldRules = `const categoryRules = [
  ["疲劳断裂", ["fatigue", "fracture", "crack", "疲劳", "断裂", "裂纹", "finite element", "有限元", "S-N", "寿命预测", "损伤容限", "stress intensity"]],
  ["AI动态", ["machine learning", "deep learning", "digital twin", "机器学习", "深度学习", "数字孪生", "neural network", "神经网络", "PINN", "physics-informed", "surrogate model", "代理模型", "人工智能", "工业AI"]],
  ["噪声研究", ["noise", "aeroacoustic", "噪声", "气动声学", "NVH", "降噪", "声压", "sound pressure", "acoustic"]],
  ["气动研究", ["aerodynamic", "blade", "airfoil", "气动", "叶片", "翼型", "CFD", "vortex", "wake", "湍流", "尾流", "aeroelastic", "气弹", "BEM", "LES", "RANS"]],
  ["螺栓研究", ["bolt", "fastener", "螺栓", "紧固件", "连接", "tension", "预紧力", "flange", "法兰"]],
  ["标准政策", ["标准", "政策", "规范", "竞配", "电价", "核准", "批复", "征求意见", "regulation", "standard", "policy", "IEC", "ISO"]],
  ["风电动态", ["风电", "风力发电", "风机", "wind turbine", "wind power", "wind energy", "项目", "中标", "投产", "核准", "招标", "海上风电", "offshore"]]
];`;

const newRules = `// Category rules for the 4-direction system
const categoryRules = [
  ["金属材料", ["steel", "alloy", "corrosion", "fatigue", "fracture", "crack", "weld", "casting", "coating", "钢", "合金", "腐蚀", "疲劳", "断裂", "裂纹", "焊接", "铸造", "S-N", "heat treatment", "热处理", "finite element", "有限元", "stress intensity", "高强度钢", "齿轮钢", "轴承钢", "材料力学性能"]],
  ["风机噪声", ["noise", "aeroacoustic", "acoustic", "sound pressure", "噪声", "气动声学", "声压", "降噪", "减振降噪", "trailing edge", "尾缘", "serration", "锯齿", "sound power", "声功率", "NVH", "vibration", "振动"]],
  ["风电试验", ["experimental", "field test", "full-scale test", "试验", "现场测试", "全尺寸", "structural health", "结构健康", "inspection", "检测", "monitoring", "监测", "fatigue test", "疲劳试验", "type test", "型式试验", "load test", "载荷测试", "reliability test", "可靠性试验", "SHM", "NDT", "无损检测"]],
  ["风电螺栓", ["bolt", "fastener", "flange", "螺栓", "紧固件", "法兰", "preload", "预紧力", "tension", "bolted", "tightening", "拧紧", "anti-loosening", "防松", "ring flange", "高强度螺栓", "bolt fatigue", "螺栓疲劳"]],
  ["风电动态", ["风电", "风力发电", "风机", "wind turbine", "wind power", "wind energy", "项目", "中标", "投产", "核准", "招标", "海上风电", "offshore", "签约", "开工", "吊装", "并网", "基地", "GW", "MW"]]
];`;

if (content.includes("const categoryRules = [")) {
  content = content.replace(oldRules, newRules);
  console.log("Category rules updated to 4-direction system");
}

// Update researchSubTopics
content = content.replace(
  'export const researchSubTopics = ["疲劳断裂", "AI动态", "噪声研究", "气动研究", "螺栓研究"];',
  'export const researchSubTopics = ["金属材料", "风机噪声", "风电试验", "风电螺栓"];'
);

// Update the relaxed topics in isDomainRelevant
const oldRelaxed = `const isRelaxedTopic = article.queryTopic === "噪声研究" || article.queryTopic === "风机噪声研究" || article.queryTopic === "噪声" ||
        article.queryTopic === "螺栓连接研究" || article.queryTopic === "螺栓研究" || article.queryTopic === "螺栓" ||
        article.queryTopic === "疲劳断裂仿真" || article.queryTopic === "疲劳断裂" || article.queryTopic === "气动布局研究" || article.queryTopic === "气动";`;
const newRelaxed = `const isRelaxedTopic = article.queryTopic === "金属材料" || article.queryTopic === "风机噪声" || article.queryTopic === "风电试验" || article.queryTopic === "风电螺栓";`;

if (content.includes(oldRelaxed)) {
  content = content.replace(oldRelaxed, newRelaxed);
  console.log("isDomainRelevant updated for new categories");
}

// Update inferCategory for academic papers
// The old code forces papers to "学术研究", we need to route to specific categories
content = content.replace(
  'if (article.sourceType === "学术论文" || article.sourceType === "论文") {\n    if (matchedResearch) {\n      article._researchTag = matchedResearch;\n    }\n    return "学术研究";\n  }',
  'if (article.sourceType === "学术论文" || article.sourceType === "论文") {\n    if (matchedResearch) {\n      return matchedResearch;\n    }\n    // Fallback: check for wind context keywords\n    const windTerms = ["wind turbine", "风电", "风机"];\n    if (windTerms.some(k => text.includes(k.toLowerCase()))) {\n      return "金属材料";  // default academic category\n    }\n    return "风电动态";\n  }'
);

await writeFile("./scripts/lib/articles.mjs", content, "utf8");
console.log("\narticles.mjs fully updated");
