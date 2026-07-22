export function cleanText(str) {
  if (!str) return "";
  return str.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export function containsKeyword(text, keyword) {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function normalizeUrl(url) {
  try { const u = new URL(url); return u.origin + u.pathname; }
  catch { return url; }
}

// Category rules for classifying articles
const categoryRules = [
  ["疲劳断裂", ["fatigue", "fracture", "crack", "疲劳", "断裂", "裂纹", "finite element", "有限元", "S-N", "寿命预测", "损伤容限", "stress intensity"]],
  ["AI动态", ["machine learning", "deep learning", "digital twin", "机器学习", "深度学习", "数字孪生", "neural network", "神经网络", "PINN", "physics-informed", "surrogate model", "代理模型", "人工智能", "工业AI"]],
  ["噪声研究", ["noise", "aeroacoustic", "噪声", "气动声学", "NVH", "降噪", "声压", "sound pressure", "acoustic"]],
  ["气动研究", ["aerodynamic", "blade", "airfoil", "气动", "叶片", "翼型", "CFD", "vortex", "wake", "涡流", "尾流", "aeroelastic", "气弹", "BEM", "LES", "RANS"]],
  ["螺栓研究", ["bolt", "fastener", "螺栓", "紧固件", "连接", "tension", "预紧力", "flange", "法兰"]],
  ["标准政策", ["标准", "政策", "规范", "竞配", "电价", "核准", "批复", "征求意见", "regulation", "standard", "policy", "IEC", "ISO"]],
  ["风电动态", ["风电", "风力发电", "风机", "wind turbine", "wind power", "wind energy", "项目", "中标", "投产", "核准", "招标", "海上风电", "offshore"]]
];

// Sub-topic tags for academic research classification
export const researchSubTopics = ["疲劳断裂", "AI动态", "噪声研究", "气动研究", "螺栓研究"];

// Relevance scoring
export function relevanceScore(article, keywordWeights) {
  const text = (article.title + " " + article.snippet + " " + (article.tags || []).join(" ")).toLowerCase();
  return Object.entries(keywordWeights).reduce((score, [kw, w]) => text.includes(kw.toLowerCase()) ? score + Number(w) : score, 0);
}

// Domain relevance check for academic papers
export function isDomainRelevant(article) {
  const text = (article.title + " " + article.snippet + " " + (article.tags || []).join(" ")).toLowerCase();
  
  if (isNoiseArticle(article)) return false;
  if (isLowQualityArticle(article)) return false;

  const windAnchors = ["风电", "风力发电", "风机", "风电场", "风电机组", "风电叶片",
    "wind turbine", "wind power", "wind energy", "wind farm", "offshore wind", "wind turbine blade"];
  
  if (article.sourceType === '学术论文') {
    const windJournals = ["Wind Energy (Wiley)", "Wind (MDPI)", "Wind Energy Science", "IOP JPCS"];
    const isWindJournal = windJournals.some(j => (article.source || "").includes(j) || (article.sourceChannel || "").includes(j));
    
    if (!isWindJournal) {
      const hasWindContext = windAnchors.some(k => containsKeyword(text, k));
      
      // Relaxed topics (noise, bolt, fatigue, aero): accept if topic-relevant
      const isRelaxedTopic = article.queryTopic === "噪声研究" || article.queryTopic === "风机噪声研究" || article.queryTopic === "噪声" ||
        article.queryTopic === "螺栓连接研究" || article.queryTopic === "螺栓研究" || article.queryTopic === "螺栓" ||
        article.queryTopic === "疲劳断裂仿真" || article.queryTopic === "疲劳断裂" || article.queryTopic === "气动布局研究" || article.queryTopic === "气动";
      
      if (isRelaxedTopic) {
        // Accept if has wind context OR topic-specific terms
        const relaxedTerms = ["noise", "acoustic", "aeroacoustic", "sound", "vibration", 
          "bolt", "fastener", "flange", "connection", "tension", "preload", 
          "fatigue", "fracture", "crack", "aerodynamic", "blade", "airfoil", "CFD", "wake",
          "噪声", "声学", "振动", "螺栓", "紧固件", "法兰", "连接", "预紧",
          "疲劳", "断裂", "裂纹", "气动", "叶片", "翼型"];
        if (!hasWindContext && !relaxedTerms.some(k => containsKeyword(text, k))) return false;
      } else {
        // General papers: MUST have wind context
        if (!hasWindContext) return false;
      }
    }
  }
  
  // AI动态 articles: bypass wind context check
  if (article.queryTopic === "AI动态") return true;
  
  if (article.queryTopic === "industry" || article.sourceType === "行业资讯") {
    return windAnchors.some(k => containsKeyword(text, k));
  }

  return true;
}

// Industry relevance for news
export function isIndustryRelevant(article) {
  if (article.queryTopic !== "industry") return false;
  const text = cleanText((article.title || "") + " " + (article.snippet || "")).toLowerCase();
  
  const windSignals = ["风电", "风力发电", "风机", "风电机组", "风电场", "风电项目",
    "wind power", "wind energy", "wind farm", "wind turbine", "offshore wind"];
  if (!windSignals.some(s => containsKeyword(text, s))) return false;
  
  // Engineering/technical signals have higher weight
  const techSignals = [
    "技术", "研发", "创新", "突破", "测试", "试验", "认证", "样机", "新品", "专利",
    "设计", "制造", "工艺", "材料", "结构", "效率", "性能", "可靠性",
    "technology", "innovation", "prototype", "design", "manufacturing", "testing",
    "兆瓦", "MW", "千瓦", "kW", "大容量", "大型", "海上", "深远海",
    "叶片", "塔筒", "齿轮箱", "发电机", "变流器", "轴承",
    "漂浮式", "双馈", "直驱", "半直驱", "永磁"];
  
  const bizSignals = [
    "订单", "中标", "签约", "交付", "项目", "基地", "投产", "产能",
    "核准", "开工", "投运", "招标", "并网", "吊装", "安装",
    "order", "contract", "project", "capacity", "delivery", "installation"];
  
  // Accept if has wind context AND (tech signal OR biz signal)
  const hasTech = techSignals.some(s => containsKeyword(text, s));
  const hasBiz = bizSignals.some(s => containsKeyword(text, s));
  
  return hasTech || hasBiz;
}

// Noise patterns - reject obviously off-topic content
const noisePatterns = [
  "直播", "水果", "侨联", "参观", "山村", "奶茶", "世界杯", "足球",
  "家政", "理财", "A股", "大盘", "个股", "涨停", "跌停", "开盘",
  "逆回购", "LPR", "人民币对美元", "汇率",
  "基层", "纪检", "审查调查", "被查",
  "天气", "降温", "暴雨", "台风登陆",
  "演唱会", "综艺", "票房", "电影节",
  "小升初", "中考", "高考", "学区房",
  "彩票", "中奖", "编程课", "分数", "考试", "小学生", "幼儿园", "房价", "楼盘", "二手房",
  "快评", "联播", "评论员", "述评", "时评",
  "习近平", "主席讲话", "总书记", "总理",
  "治理体系", "向上向善", "时代之问",
  "重要讲话", "重要指示", "贺信", "致辞",
  "光伏", "太阳能电池", "锂电池", "新能源汽车",
  "核电", "火电", "水电", "氢能", "储能",
  "石油", "煤炭", "天然气", "汽油",
  "希望小学", "希望工程", "慈善",
  "小学生", "幼儿园", "学前",
  "手机", "芯片", "半导体", "集成电路", "光刻",
  "生猪", "猪肉", "粮食", "农产品", "期货",
  "人民币", "央行", "降息", "加息", "存款", "贷款基准",
  "肺炎", "疫情", "疫苗", "流感",
  "奥运会", "世界杯", "锦标赛", "亚运会",
  "动物园", "大熊猫", "旅游", "景区",
  "演唱会", "音乐会", "话剧",
  "APP", "小程序", "下载", "支付宝", "微信支付",
  "网红", "直播带货", "短视频", "抖音", "快手",
  "家政", "月嫂", "外卖", "快递", "滴滴",
  "楼盘", "商品房", "二手房", "限购", "房贷",
  "小学", "中学", "大学排名", "学科评估", "学位",
  "受贿", "违纪", "立案", "双开", "处分",
  "水泥", "混凝土", "cement", "concrete", "道砟", "ballast",
  "水稻", "杂交", "水稻制种", "rice", "paddy",
  "无人机", "UAV", "drone", "quadrotor", "hexacopter"
];

// Low quality aggregation content
const lowQualityPatterns = [
  "一周.*汇总", "一周.*盘点", "本周.*汇总", "收藏", "统计.*情况",
  "每日.*速览", "速览", "简报.*汇总", "周报",
  "一周.*项目汇总", "项目.*汇总", ".*汇总.*项目",
  "一周.*盘点", ".*周报", ".*简讯",
  "今日.*要闻", ".*早报", ".*晚报",
  ".*日签", ".*打卡", ".*签到",
  "热门.*推荐", ".*排行榜", ".*热搜",
  ".*广告", ".*推广", ".*促销"
];

export function isLowQualityArticle(article) {
  const text = (article.title || "") + (article.titleZh || "");
  return lowQualityPatterns.some(p => new RegExp(p).test(text));
}

export function isNoiseArticle(article) {
  // Academic papers: only filter out editorial/non-research content
  if (article.sourceType === "????" || article.sourceType === "??") {
    const text = (article.title + " " + (article.snippet || "")).toLowerCase();
    const academicNoise = ["preface", "peer review statement", "editorial", "correction:", "retraction:", "book review", "conference report", "newsletter", "announcement", "call for papers", "table of contents"];
    return academicNoise.some(p => text.includes(p.toLowerCase()));
  }
  // News articles: full noise filter
  const text = (article.title + " " + (article.snippet || "")).toLowerCase();
  return noisePatterns.some(p => text.includes(p.toLowerCase()));
}

export function inferCategory(article) {
  const text = (article.title + " " + article.snippet + " " + (article.tags || []).join(" ")).toLowerCase();
  
  // Check research sub-topics first
  let matchedResearch = "";
  for (const subTopic of researchSubTopics) {
    const rule = categoryRules.find(r => r[0] === subTopic);
    if (rule && rule[1].some(k => containsKeyword(text, k))) {
      matchedResearch = subTopic;
      break;
    }
  }
  
  // Academic papers → "学术研究" (with sub-topic preserved)
  if (article.sourceType === "学术论文" || article.sourceType === "论文") {
    if (matchedResearch) {
      article._researchTag = matchedResearch;
    }
    return "学术研究";
  }
  
  // News/articles: use category rules
  for (const [category, keywords] of categoryRules) {
    if (keywords.some(k => containsKeyword(text, k))) return category;
  }
  return article.queryTopic === "industry" ? "风电动态" : "工程技术";
}

export function inferTags(article) {
  const text = (article.title + " " + article.snippet).toLowerCase();
  const tagMap = {
    "疲劳": ["fatigue"], "断裂": ["fracture"], "裂纹": ["crack"],
    "机器学习": ["machine learning", "deep learning"], "深度学习": ["deep learning"],
    "数字孪生": ["digital twin"], "噪声": ["noise", "aeroacoustic"],
    "气动": ["aerodynamic", "CFD"], "叶片": ["blade"],
    "有限元": ["FEM", "finite element"], "海上风电": ["offshore"],
    "神经网络": ["neural network", "PINN"]
  };
  const matched = [];
  for (const [tag, keywords] of Object.entries(tagMap)) {
    if (keywords.some(k => containsKeyword(text, k)) && !matched.includes(tag)) matched.push(tag);
  }
  if (article.region === "国内" && !matched.includes("国内")) matched.unshift("国内");
  return matched.slice(0, 5);
}

export function makeArticleId(url, title) {
  const hashInput = (url + title).slice(0, 200);
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    hash = ((hash << 5) - hash) + hashInput.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

export function deduplicateArticles(articles) {
  const seen = new Set();
  return articles.filter(a => {
    const key = (a.titleZh || a.title || "").toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveNewsUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "news.google.com") {
      const decoded = u.searchParams.get("url");
      if (decoded) return decoded;
    }
    return url;
  } catch { return url; }
}


// Compute reliability score based on source authority, evidence, and content signals
export function computeReliability(article, config) {
  if (!config) return 50;
  
  let score = 50; // baseline
  const factors = [];
  const limitations = [];
  
  const url = (article.url || article.sourceUrl || "").toLowerCase();
  const text = (article.title + " " + (article.snippet || "")).toLowerCase();
  
  // 1. Source authority (max +25)
  const primaryDomains = config.authorityDomains?.primary || [];
  const industryDomains = config.authorityDomains?.industry || [];
  const mediaDomains = config.authorityDomains?.media || [];
  
  const allDomains = [...primaryDomains, ...industryDomains, ...mediaDomains];
  const matchedDomain = allDomains.find(d => url.includes(d));
  
  if (primaryDomains.some(d => url.includes(d))) {
    score += 25;
    factors.push("一级权威来源（政府/国际机构）");
  } else if (industryDomains.some(d => url.includes(d))) {
    score += 18;
    factors.push("行业权威来源（头部企业）");
  } else if (mediaDomains.some(d => url.includes(d))) {
    score += 10;
    factors.push("知名媒体来源");
  } else if (article.sourceType === "学术论文") {
    // Academic papers: score based on evidence
    const evidence = article.evidence || {};
    if (evidence.doi) { score += 15; factors.push("有DOI可追溯"); }
    if (evidence.journal) { score += 8; factors.push("发表在" + evidence.journal); }
    if (evidence.citedByCount > 0) { score += Math.min(10, evidence.citedByCount); factors.push("被引" + evidence.citedByCount + "次"); }
    if (evidence.authorsCount > 0) { score += Math.min(5, evidence.authorsCount); factors.push(evidence.authorsCount + "位作者"); }
    if (evidence.isOpenAccess) { score += 3; factors.push("开放获取"); }
  } else {
    // News/articles: generic source
    score += 5;
    factors.push("公开网络来源");
    limitations.push("非一级权威来源");
  }
  
  // 2. Evidence completeness (max +15)
  if (article.snippet && article.snippet.length > 100) { score += 10; factors.push("有详细摘要"); }
  else if (article.snippet && article.snippet.length > 20) { score += 5; factors.push("有简短摘要"); }
  else { limitations.push("缺少内容摘要"); }
  
  if (article.evidence?.hasAbstract) { score += 5; factors.push("有结构化摘要"); }
  
  // 3. Commercial signal penalty (max -20)
  const commercialSignals = config.commercialSignals || [];
  const matchedCommercial = commercialSignals.filter(s => text.includes(s.toLowerCase()));
  if (matchedCommercial.length > 0) {
    score -= Math.min(20, matchedCommercial.length * 8);
    limitations.push("含商业推广语言");
  }
  
  // 4. Self-claim penalty (max -10)
  const selfClaimSignals = config.selfClaimSignals || [];
  const matchedSelfClaim = selfClaimSignals.filter(s => text.includes(s.toLowerCase()));
  if (matchedSelfClaim.length > 0) {
    score -= Math.min(10, matchedSelfClaim.length * 5);
    limitations.push("含企业自宣内容");
  }
  
  // 5. Regional authority bonus
  if (article.region === "国内") {
    const cnAuth = ["cas.cn", "cae.cn", "bjx.com.cn", "chinawindnews.com"];
    if (cnAuth.some(d => url.includes(d))) { score += 5; factors.push("国内行业权威渠道"); }
  }
  
  // Clamp
  score = Math.max(10, Math.min(100, Math.round(score)));
  
  // Grade
  const grade = score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "D";
  const label = score >= 80 ? "高可靠" : score >= 60 ? "待核验" : score >= 40 ? "低可靠" : "不可靠";
  
  return { score, grade, label, factors: factors.slice(0, 5), limitations: limitations.slice(0, 3) };
}

export function toPublicArticle(article) {
  return {
    id: article.id,
    title: article.title || "",
    source: article.source || "",
    sourceType: article.sourceType || "行业资讯",
    region: article.region || "海外",
    language: article.language || "zh",
    publishedAt: article.publishedAt || new Date().toISOString(),
    collectedAt: article.collectedAt || new Date().toISOString(),
    url: article.url || "",
    sourceUrl: article.sourceUrl || article.url || "",
    sourceChannel: article.sourceChannel || article.source || "",
    linkType: article.linkType || "publisher",
    linkVerified: article.linkVerified !== false,
    evidence: article.evidence || {},
    intelligenceType: article.queryTopic === "industry" ? "industry" : "research",
    titleZh: article.titleZh || article.aiSummary?.titleZh || "",
    category: article.category || "",
    tags: article.tags || [],
    summary: article.aiSummary || article.snippet || "",
    keyPoints: article.aiKeyPoints || [],
    engineeringImpact: article.aiEngineeringImpact || "",
    paperDetails: article.aiPaperDetails || {},
    industryDetails: article.aiIndustryDetails || {},
    readingMinutes: article.readingMinutes || 4,
    relevanceScore: article.relevanceScore || 0,
    reliability: article.reliability || 50,
    aiAnalysis: article.aiAnalysis || null
  };
}

export function createFallbackSummary(article) {
  return {
    id: article.id,
    titleZh: article.titleZh || article.title || "",
    summary: article.snippet || "",
    keyPoints: [],
    engineeringImpact: "",
    category: article.category || inferCategory(article),
    tags: article.tags || inferTags(article),
    paperDetails: {},
    industryDetails: {}
  };
}
