const DRIVETRAIN_COMPONENTS = [
  "传动链整体",
  "主轴",
  "主轴承",
  "齿轮箱",
  "齿轮",
  "齿轮箱轴承",
  "行星架",
  "箱体",
  "滑动轴承",
  "锁紧盘",
  "联轴器",
  "润滑系统",
  "冷却与密封",
  "制动器",
  "变桨齿轮箱",
  "发电机"
];

const REPORT_COMPONENT_ORDER = new Map(DRIVETRAIN_COMPONENTS.map((component, index) => [component, index]));

const INDUSTRY_CATEGORIES = ["传动链企业", "整机与开发商", "项目进展", "企业动态"];
const COMPREHENSIVE_SECTION = "综合资讯与待深读线索";
const PRIMARY_SECTIONS = [
  "传动链技术开发与质量运维",
  "论文、标准与专利",
  "厂商与项目动态",
  "政策、市场与产业环境"
];

const LEGACY_SECTION_MAP = {
  "技术与产品开发": "传动链技术开发与质量运维",
  "故障、质量与运维": "传动链技术开发与质量运维",
  "风电传动链专栏": "传动链技术开发与质量运维",
  "企业与项目追踪": "厂商与项目动态",
  "风电行业全景": "政策、市场与产业环境"
};

const LEGACY_COMPONENT_MAP = {
  "主轴与主轴承": "主轴系统",
  "箱体与扭力臂": "箱体与支承",
  "发电机与高速端接口": "制动与高速端",
  "监测与传感系统": "监测与传感",
  "齿轮箱总成与架构": "齿轮箱总成",
  "传动链系统与整机接口": "传动链总体"
};

const state = {
  data: null,
  articles: [],
  query: "",
  category: "传动链技术开发与质量运维",
  component: "全部部件",
  industryCategory: "全部动态",
  region: "全部",
  sourceType: "全部",
  sort: "latest",
  view: "all",
  saved: new Set(readStorage("wind-intel-saved", [])),
  watchlist: readStorage("wind-intel-watchlist", ["白色蚀刻裂纹", "行星架轴承", "油液监测"]),
  feedback: readObjectStorage("wind-intel-feedback", {}),
  experiences: readObjectStorage("wind-intel-experiences", {}),
  clientId: readClientId()
};

const runtimeConfig = window.WIND_INTEL_CONFIG || {};

const defaultShareMetadata = {
  title: document.title,
  description: document.querySelector('meta[property="og:description"]')?.content || ""
};

const elements = {
  activeFilters: document.querySelector("#active-filters"),
  articleDialog: document.querySelector("#article-dialog"),
  articleFeed: document.querySelector("#article-feed"),
  briefMode: document.querySelector("#brief-mode"),
  briefPeriod: document.querySelector("#brief-period"),
  briefSummary: document.querySelector("#brief-summary"),
  briefTitle: document.querySelector("#brief-title"),
  categoryTabs: document.querySelector("#category-tabs"),
  clearSearch: document.querySelector("#clear-search"),
  dialogContent: document.querySelector("#dialog-content"),
  dialogSource: document.querySelector("#dialog-source"),
  dimensionFilters: document.querySelector("#dimension-filters"),
  feedTitle: document.querySelector("#feed-title"),
  filterCount: document.querySelector("#filter-count"),
  filterDialog: document.querySelector("#filter-dialog"),
  filterForm: document.querySelector("#filter-form"),
  freshness: document.querySelector("#freshness"),
  metricDomestic: document.querySelector("#metric-domestic"),
  metricPapers: document.querySelector("#metric-papers"),
  metricTotal: document.querySelector("#metric-total"),
  openWeeklyReport: document.querySelector("#open-weekly-report"),
  resultCount: document.querySelector("#result-count"),
  savedCount: document.querySelector("#saved-count"),
  searchInput: document.querySelector("#search-input"),
  shareApp: document.querySelector("#share-app"),
  signalList: document.querySelector("#signal-list"),
  toast: document.querySelector("#toast"),
  trendList: document.querySelector("#trend-list"),
  weeklyReportDialog: document.querySelector("#weekly-report-dialog"),
  weeklyReportContent: document.querySelector("#weekly-report-content"),
  weeklyReportToolbarPeriod: document.querySelector("#weekly-report-toolbar-period"),
  copyWeeklyReport: document.querySelector("#copy-weekly-report"),
  downloadWeeklyReport: document.querySelector("#download-weekly-report"),
  shareWeeklyReport: document.querySelector("#share-weekly-report"),
  closeWeeklyReport: document.querySelector("#close-weekly-report"),
  watchForm: document.querySelector("#watch-form"),
  watchInput: document.querySelector("#watch-input"),
  watchList: document.querySelector("#watch-list")
};

let toastTimer;
let activeWeeklyReport = null;

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function readObjectStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function readClientId() {
  const existing = localStorage.getItem("wind-intel-client-id");
  if (existing) return existing;
  const value = crypto.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem("wind-intel-client-id", value);
  return value;
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function renderIcons() {
  window.lucide?.createIcons({
    attrs: {
      "aria-hidden": "true"
    }
  });
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2200);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日期待确认";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatPeriod(period) {
  if (!period?.from || !period?.to) return "本周情报简报";
  const formatter = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" });
  return `${formatter.format(new Date(period.from))} - ${formatter.format(new Date(period.to))} 情报简报`;
}

function updateShareMetadata(title, description) {
  document.title = title;
  const titleMeta = document.querySelector('meta[property="og:title"]');
  const descriptionMeta = document.querySelector('meta[property="og:description"]');
  if (titleMeta) titleMeta.content = title;
  if (descriptionMeta) descriptionMeta.content = description;
}

function restoreShareMetadata() {
  updateShareMetadata(defaultShareMetadata.title, defaultShareMetadata.description);
}

function searchTokens() {
  return state.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function articleSearchScore(article) {
  const tokens = searchTokens();
  if (!tokens.length) return (article.relevanceScore || 0) + (article.reliability?.score || 0) / 10;

  const fields = {
    title: article.title.toLowerCase(),
    titleZh: (article.titleZh || "").toLowerCase(),
    tags: (article.tags || []).join(" ").toLowerCase(),
    summary: article.summary.toLowerCase(),
    points: article.keyPoints.join(" ").toLowerCase(),
    impact: (article.engineeringImpact || "").toLowerCase(),
    source: article.source.toLowerCase(),
    classification: [
      article.category,
      article.region,
      article.sourceType,
      ...(article.sections || []),
      ...(article.technicalDomains || []),
      ...(article.technicalTags || []),
      ...(article.componentTags || []),
      ...(article.failureModes || []),
      ...(article.developmentStages || []),
      ...(article.evidenceTypes || []),
      article.industryCategory,
      article.componentCategory,
      article.drivetrainComponent,
      ...(article.drivetrainComponents || [])
    ].join(" ").toLowerCase(),
    structured: JSON.stringify({
      evidence: article.evidence || {},
      paper: article.paperDetails || {},
      industry: article.industryDetails || {}
    }).toLowerCase()
  };

  return tokens.reduce((score, token) => {
    if (!Object.values(fields).some((field) => field.includes(token))) return -1000;
    return (
      score +
      (fields.title.includes(token) ? 8 : 0) +
      (fields.titleZh.includes(token) ? 8 : 0) +
      (fields.tags.includes(token) ? 5 : 0) +
      (fields.summary.includes(token) ? 3 : 0) +
      (fields.points.includes(token) ? 2 : 0) +
      (fields.impact.includes(token) ? 2 : 0) +
      (fields.source.includes(token) ? 1 : 0) +
      (fields.classification.includes(token) ? 1 : 0)
      + (fields.structured.includes(token) ? 2 : 0)
    );
  }, (article.relevanceScore || 0) + (article.reliability?.score || 0) / 10);
}

function feedbackVoteWeight(vote) {
  return { useful: 8, questionable: -3, irrelevant: -18, broken: -20 }[vote] || 0;
}

function personalScore(article) {
  let score = (article.reliability?.score || 0) * 0.6 + (article.relevanceScore || 0) * 2;
  score += feedbackVoteWeight(state.feedback[article.id]);
  const articleTags = new Set(article.tags || []);
  for (const [articleId, vote] of Object.entries(state.feedback)) {
    const rated = state.articles.find((item) => item.id === articleId);
    if (!rated) continue;
    const direction = vote === "useful" ? 1.5 : vote === "irrelevant" ? -2 : 0;
    if (!direction) continue;
    const overlap = (rated.tags || []).filter((tag) => articleTags.has(tag)).length;
    score += Math.min(6, overlap * direction);
  }
  return score;
}

function matchesCategory(article) {
  const level = articleInformationLevel(article);
  if (level === "ignored") return false;
  if (state.category === COMPREHENSIVE_SECTION) return level === "lead";
  if (state.category === "全部") return true;
  if (level === "lead") return false;
  return primarySection(article) === state.category;
}

function matchesDimension(article) {
  if (state.category === "厂商与项目动态") {
    return state.industryCategory === "全部动态" || article.industryCategory === state.industryCategory;
  }
  if (state.component === "全部部件") return true;
  return relatedComponentTags(article).includes(state.component);
}

function isTitleClue(article) {
  return (article.evidence?.contentAccess || "metadata") === "metadata";
}

function articleInformationLevel(article) {
  if (["readable", "brief", "catalog", "lead", "ignored"].includes(article.informationLevel)) {
    return article.informationLevel;
  }
  if (!isTitleClue(article)) return "readable";
  if (["论文", "标准", "专利"].includes(article.sourceType)) return "catalog";
  const title = String(article.titleZh || article.title || "").trim();
  if (/招聘|岗位|薪资|简历|项目经理|猎聘|职位|job opening|career opportunity|salary/i.test(title)) return "ignored";
  const hasEvent = /发布|印发|通知|意见|规划|方案|公示|核准|批复|获批|启动|开工|投产|投运|并网|吊装|交付|发运|下线|中标|成交|签约|订单|合作|扩产|量产|完成|突破|验证|试验|研究|布局|新增|装机|检修|维修|announces|released|publishes|launches|approved|starts|completed|commissioned|installed|delivers|delivery|order|contract|award|production|prototype|test|study|research|validation|maintenance|repair/i.test(title);
  const longEnough = /[\p{Script=Han}]/u.test(title) ? title.length >= 10 : title.length >= 28;
  return hasEvent && longEnough ? "brief" : "lead";
}

function articleSections(article) {
  return [primarySection(article)];
}

function primarySection(article) {
  if (PRIMARY_SECTIONS.includes(article.primarySection)) return article.primarySection;
  if (LEGACY_SECTION_MAP[article.primarySection]) return LEGACY_SECTION_MAP[article.primarySection];
  if (["论文", "标准", "专利"].includes(article.sourceType)) return "论文、标准与专利";
  const failureSignals = [
    ...(article.failureModes || []),
    ...(article.technicalDomains || []).filter((domain) => ["失效分析", "失效与质量"].includes(domain))
  ];
  if (failureSignals.length && article.intelligenceType !== "official") return "传动链技术开发与质量运维";
  if (article.intelligenceType === "industry") return "厂商与项目动态";
  if (article.intelligenceType === "official") return "政策、市场与产业环境";
  return "传动链技术开发与质量运维";
}

function technicalDomains(article) {
  if (Array.isArray(article.technicalDomains) && article.technicalDomains.length) return article.technicalDomains;
  const category = article.category;
  if (["齿轮箱", "白色蚀刻裂纹"].includes(category)) return ["失效与质量"];
  if (category === "轴承") return ["轴承与连接"];
  if (category === "润滑") return ["润滑与摩擦"];
  if (category === "状态监测") return ["监测诊断与试验"];
  return [];
}

function technicalTags(article) {
  if (Array.isArray(article.technicalTags) && article.technicalTags.length) return article.technicalTags;
  return (article.tags || []).filter((tag) => ![
    "论文", "海外", "国内", "权威发布", "行业权威", "整机厂商", "齿轮箱厂商", "轴承厂商", "润滑供应商"
  ].includes(tag));
}

function componentCategory(article) {
  if (article.componentCategory || article.drivetrainComponent) {
    const component = article.componentCategory || article.drivetrainComponent;
    if (["行业政策与市场", "企业与项目综合"].includes(component)) return "行业综合";
    return LEGACY_COMPONENT_MAP[component] || component;
  }
  const tags = technicalTags(article);
  if (tags.some((tag) => ["行星传动", "行星架强度"].includes(tag))) return "行星级";
  if (tags.some((tag) => ["滚动轴承", "轴承跑圈与配合", "游隙与预紧", "保持架与滚动体"].includes(tag))) return "齿轮箱轴承";
  if (tags.some((tag) => ["润滑油与添加剂", "油液污染与磨粒", "热平衡与润滑系统"].includes(tag))) return "润滑冷却与密封";
  if (["厂商与项目动态", "政策、市场与产业环境"].includes(primarySection(article))) return "行业综合";
  return "传动链总体";
}

function drivetrainComponents(article) {
  if (Array.isArray(article.drivetrainComponents) && article.drivetrainComponents.length) {
    return [...new Set(article.drivetrainComponents.map((component) => LEGACY_COMPONENT_MAP[component] || component))];
  }
  return componentCategory(article) === "行业综合" ? [] : [componentCategory(article)];
}

const relatedComponentBySystem = {
  "传动链总体": "传动链整体",
  "齿轮箱总成": "齿轮箱",
  "主轴系统": "主轴",
  "行星级": "齿轮箱",
  "平行轴级": "齿轮箱",
  "齿轮件": "齿轮",
  "齿轮箱轴承": "齿轮箱轴承",
  "滑动轴承系统": "滑动轴承",
  "箱体与支承": "箱体",
  "轴系连接": "联轴器",
  "变桨传动": "变桨齿轮箱",
  "润滑冷却与密封": "润滑系统",
  "制动与高速端": "制动器",
  "监测与传感": "传动链整体",
  "行业综合": "传动链整体"
};

function relatedComponentTags(article) {
  const components = [];
  const add = (value) => {
    if (value && !components.includes(value)) components.push(value);
  };
  const text = [
    article.title,
    article.titleZh,
    article.summary,
    ...(article.componentTags || []),
  ].filter(Boolean).join(" ").toLowerCase();
  if (/变桨齿轮箱|变桨减速器|变桨传动|变桨驱动|pitch gearbox|pitch drive/.test(text)) add("变桨齿轮箱");
  if (/主轴承|主轴轴承|main bearing|main shaft bearing/.test(text)) add("主轴承");
  if (/齿轮箱轴承|行星轮轴承|高速轴轴承|中间轴轴承|gearbox bearing|planet bearing/.test(text)) add("齿轮箱轴承");
  if (/滑动轴承|轴瓦|可倾瓦|plain bearing|journal bearing|sliding bearing|tilting pad/.test(text)) add("滑动轴承");
  if (/行星架|planet carrier/.test(text)) add("行星架");
  if (/锁紧盘|胀紧套|胀套|收缩盘|shrink disc|locking assembly/.test(text)) add("锁紧盘");
  if (/联轴器|coupling/.test(text)) add("联轴器");
  if (/主轴|main shaft/.test(text)) add("主轴");
  if (/齿轮箱|gearbox|gear box/.test(text)) add("齿轮箱");
  if (/齿轮(?!箱)|轮齿|齿面|齿根|啮合|行星轮|太阳轮|内齿圈|gear mesh|gear flank|tooth|planet gear|sun gear|ring gear/.test(text)) add("齿轮");
  if (/箱体|扭力臂|housing|torque arm/.test(text)) add("箱体");
  if (/润滑|油液|过滤|lubric|oil debris|filtration/.test(text)) add("润滑系统");
  if (/冷却|密封|漏油|cooling|seal|oil leakage/.test(text)) add("冷却与密封");
  if (/制动器|制动盘|brake/.test(text)) add("制动器");
  if (/发电机|generator/.test(text)) add("发电机");
  drivetrainComponents(article).forEach((component) => add(relatedComponentBySystem[component] || component));
  if (!components.length) add("传动链整体");
  return components.slice(0, 3);
}

function primaryRelatedComponent(article) {
  return relatedComponentTags(article)[0] || "传动链整体";
}

function renderRelatedComponentTags(article, className = "") {
  const tags = relatedComponentTags(article);
  return `<div class="related-component-tags ${escapeHtml(className)}" aria-label="相关部件">
    <span class="related-component-label">相关部件</span>
    ${tags.map((tag) => `<span class="related-component-chip">${escapeHtml(tag)}</span>`).join("")}
  </div>`;
}

function contentAccessMeta(article) {
  const access = article.evidence?.contentAccess || "metadata";
  if (access === "fulltext") return { access, label: "公开全文已提取", icon: "file-check-2" };
  if (access === "abstract") return { access, label: "公开摘要", icon: "text-search" };
  return { access: "metadata", label: "仅元数据", icon: "database" };
}

function matchesSourceType(article) {
  if (state.sourceType === "全部") return true;
  if (state.sourceType === "论文") return article.sourceType === "论文";
  return article.sourceType !== "论文";
}

function getVisibleArticles() {
  return state.articles
    .map((article) => ({ article, searchScore: articleSearchScore(article) }))
    .filter(({ article, searchScore }) => {
      if (searchScore < 0) return false;
      if (!matchesCategory(article)) return false;
      if (!matchesDimension(article)) return false;
      if (state.region !== "全部" && article.region !== state.region) return false;
      if (!matchesSourceType(article)) return false;
      if (state.view === "saved" && !state.saved.has(article.id)) return false;
      return true;
    })
    .sort((a, b) => {
      if (state.sort === "relevance" || state.query) return b.searchScore - a.searchScore;
      if (state.sort === "reliability") return (b.article.reliability?.score || 0) - (a.article.reliability?.score || 0);
      if (state.sort === "personal") return personalScore(b.article) - personalScore(a.article);
      return new Date(b.article.publishedAt) - new Date(a.article.publishedAt);
    })
    .map(({ article }) => article);
}

function highlight(value) {
  const tokens = searchTokens();
  let safe = escapeHtml(value);
  for (const token of tokens) {
    const pattern = new RegExp(`(${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    safe = safe.replace(pattern, "<mark>$1</mark>");
  }
  return safe;
}

function renderWeeklyBrief() {
  const { weeklyBrief, period, generatedAt, collectionStatus } = state.data;
  elements.briefPeriod.textContent = formatPeriod(period);
  elements.briefMode.textContent = weeklyBrief.summaryMode || "自动摘要";
  elements.briefTitle.textContent = weeklyBrief.title;
  elements.briefSummary.textContent = weeklyBrief.summary;
  elements.metricTotal.textContent = weeklyBrief.metrics?.total ?? state.articles.length;
  elements.metricDomestic.textContent = weeklyBrief.metrics?.domestic ?? 0;
  elements.metricPapers.textContent = weeklyBrief.metrics?.papers ?? 0;
  elements.signalList.innerHTML = (weeklyBrief.signals || [])
    .map(
      (signal) => `
        <span class="signal-chip">
          <i data-lucide="zap"></i>
          ${escapeHtml(signal)}
        </span>
      `
    )
    .join("");

  const generatedLabel = formatDate(generatedAt);
  const failedLabel = collectionStatus?.failed ? ` · ${collectionStatus.failed} 个通道异常` : "";
  const lowYieldCount = Number(collectionStatus?.empty || 0) + Number(collectionStatus?.lowYield || 0);
  const coverageLabel = lowYieldCount ? ` · ${lowYieldCount} 个通道本期无有效结果` : "";
  const liveLabel = collectionStatus?.dataMode === "live" ? " · 真实来源" : "";
  elements.freshness.innerHTML = `
    <span class="status-dot" aria-hidden="true"></span>
    更新于 ${generatedLabel}${liveLabel}${failedLabel}${coverageLabel}
  `;
}

function renderCategoryCounts() {
  const counts = new Map([...PRIMARY_SECTIONS, COMPREHENSIVE_SECTION, "全部"].map((section) => [section, 0]));
  for (const article of state.articles) {
    const level = articleInformationLevel(article);
    if (level === "ignored") continue;
    counts.set("全部", counts.get("全部") + 1);
    const section = level === "lead" ? COMPREHENSIVE_SECTION : primarySection(article);
    counts.set(section, (counts.get(section) || 0) + 1);
  }
  elements.categoryTabs.querySelectorAll("[data-category]").forEach((button) => {
    const count = button.querySelector("[data-category-count]");
    if (count) count.textContent = counts.get(button.dataset.category) || 0;
  });
}

const weeklyReportGroups = [
  { key: "technical", title: "传动链技术开发与质量运维", caption: "设计、制造、仿真、试验、故障质量与现场运维" },
  { key: "research", title: "论文、标准与专利", caption: "研究结论、标准变化与公开专利进展" },
  { key: "industry", title: "厂商与项目动态", caption: "传动链企业、整机厂商与项目进展" },
  { key: "environment", title: "政策、市场与产业环境", caption: "政策、规划、市场和供应链环境变化" }
];

function reportGroupKey(article) {
  const section = primarySection(article);
  return {
    "传动链技术开发与质量运维": "technical",
    "技术与产品开发": "technical",
    "故障、质量与运维": "technical",
    "论文、标准与专利": "research",
    "厂商与项目动态": "industry",
    "政策、市场与产业环境": "environment"
  }[section] || "technical";
}

function reportUnique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function reportQuantitativeFindings(article) {
  return (article.paperDetails?.quantitativeFindings || [])
    .map((item) => {
      const value = `${item.metric || "相关指标"}达到${item.value || ""}${item.unit || ""}`;
      const comparison = item.comparison && /\d/.test(item.comparison) && item.comparison.length <= 48
        ? `，相较之下${item.comparison}`
        : "";
      return `${value}${comparison}`;
    })
    .filter(Boolean);
}

function reportDataPoints(article) {
  const details = article.industryDetails || {};
  const industryPoints = [
    details.capacity ? `规模${stripReportLabels(details.capacity)}` : "",
    details.investment ? `涉及${stripReportLabels(details.investment)}` : "",
    ...(details.quantitativeFacts || []).map((point) => stripReportLabels(point))
  ];
  const paperPoints = reportQuantitativeFindings(article);
  const fallbackPoints = (article.keyPoints || []).filter((point) => /\d/.test(point));
  const points = article.sourceType === "论文"
    ? paperPoints
    : article.intelligenceType === "industry" || article.intelligenceType === "official"
      ? industryPoints
      : fallbackPoints;
  return reportUnique(points)
    .filter((point) => /\d/.test(point))
    .slice(0, 3);
}

function reportSubject(article) {
  if (article.sourceType === "论文") {
    const authors = (article.evidence?.authors || []).slice(0, 3).join("、");
    return authors
      ? `${authors}${(article.evidence?.authors || []).length > 3 ? "等" : ""}（${article.evidence?.journal || article.source}）`
      : article.evidence?.journal || article.source || "论文作者未披露";
  }
  const companies = article.industryDetails?.companies || [];
  return companies.length ? companies.join("、") : article.source || "发布方未明确披露";
}

function reportAction(article) {
  const summary = article.summary || article.titleZh || article.title;
  if (article.sourceType === "论文" && article.paperDetails?.objective) {
    const objective = String(article.paperDetails.objective).trim().replace(/[。；;.]$/, "");
    const method = String(article.paperDetails.methods || "")
      .trim()
      .replace(/^方法[：:]\s*/, "")
      .replace(/^(?:采用|使用|通过)\s*/, "")
      .replace(/[。；;.]$/, "");
    return stripReportLabels(method ? `${objective}，并采用${method}` : objective);
  }
  return cleanReportProse(summary);
}

function reportEffect(article, dataPoints) {
  if (dataPoints.length) return dataPoints.slice(0, 3).join("，");
  return stripReportLabels(article.keyPoints?.find((point) => point && point !== article.summary) || "");
}

function stripReportLabels(value) {
  return String(value || "")
    .replace(/(^|[。；]\s*)(?:主体|做了什么|事件|效果|结果|关键数据|关键点|工程意义|借鉴意义|公开资料披露|项目容量|投资\/金额|时间线)[：:]\s*/g, "$1")
    .replace(/[；;]\s*(?=[\u4e00-\u9fffA-Za-z])/g, "，")
    .replace(/\s+/g, " ")
    .trim();
}

function isReportDisclosureGap(sentence) {
  const text = String(sentence || "").replace(/\s+/g, " ").trim();
  if (!text) return true;
  return [
    /(?:回到|查阅|核验).{0,36}(?:原文|资料|公开(?:信息|内容))/i,
    /(?:需要|仍需|应当|建议).{0,16}(?:补充|确认|查阅|核验).{0,36}(?:原文|资料|公开(?:信息|内容)|披露)/i,
    /(?:来源|渠道|媒体|官方|企业声明).{0,28}(?:可靠|权威|级别|评价|可信)/i,
    /(?:公开(?:资料|信息|内容|摘要|报道|公告)|原文|该(?:资料|信息|报道|项目|研究)|相关(?:信息|资料)).{0,36}(?:未|尚未|没有|缺少|不足|有限|无法).{0,42}(?:披露|提供|说明|给出|明确|获知|核验|评估|判断|确认|数据|参数|细节|结论|边界)/i,
    /(?:未|尚未|没有|缺少|不足|有限|无法).{0,42}(?:披露|提供|说明|给出|明确|核验|评估|判断|确认).{0,42}(?:数据|参数|指标|金额|机型|细节|内容|结果|时间|边界)?/i,
    /(?:信息|资料|摘要|公开内容|披露)(?:有限|不足|缺失|不完整)/i,
    /(?:无法|难以)(?:判断|评估|确认|核验)/i
  ].some((pattern) => pattern.test(text));
}

function cleanReportProse(value) {
  const cleaned = stripReportLabels(value)
    .replace(/^[^。！？!?]{1,120}?发布的信息显示[，,]\s*/, "")
    .replace(/(?:该|此)?(?:信息|资讯|报道|成果|资料)?\s*属于(?:行业资讯(?:类)?(?:官方公告)?|官方公告|媒体报道|企业声明)(?=[，,；;。.!！?？]|$)/gi, "")
    .replace(/[，,；;]\s*(?:属于|归为)(?:行业|厂商|企业|政策|官方|媒体|新闻)[^，,；;。.!！?？]{0,20}(?=[，,；;。.!！?？]|$)/gi, "")
    .replace(/(?:该|此)?(?:信息|资讯|报道|资料)?\s*(?:来源|渠道)(?:来自|属于|于|为)[^，,；;。.!！?？]{0,36}(?=[，,；;。.!！?？]|$)/gi, "")
    .replace(/(?:该|此)?(?:信息|资讯|报道)\s*来自[^，,；;。.!！?？]{1,36}(?=[，,；;。.!！?？]|$)/gi, "")
    .replace(/(?:该|此)?(?:信息|资讯|报道)?渠道(?:来自|属于|为)[^。.!！?？]*/gi, "")
    .replace(/(^|[。.!！?？])\s*(?:该|此)?(?:资料|信息|资讯|报道)(?:为|属于)(?:政府|企业|媒体|官方)[^，,；;。.!！?？]{0,24}(?:[，,；;]|(?=[。.!！?？]|$))/gi, "$1")
    .replace(/[，,]{2,}/g, "，")
    .replace(/([。.!！?？])[，,；;]+/g, "$1")
    .replace(/^[，,；;\s]+|[，,；;\s]+$/g, "");
  return cleaned
    .split(/(?<=[。！？!?])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !isReportDisclosureGap(sentence))
    .filter((sentence) => !/^(?:该|此)?(?:资料|信息|资讯|报道)?\s*(?:属于|归为)(?:行业|厂商|企业|政策|官方|媒体|新闻)[^。.!！?？]{0,24}(?:动态|资讯|信息|报道|公告|宣传)/i.test(sentence))
    .filter((sentence) => !/^(?:但|不过|同时)?(?:该|此)?(?:摘要|资料|信息|报道|公开内容)?\s*(?:未|尚未|没有)(?:提供|披露|给出|说明|提及|包含)[^。.!！?？]*(?:数据|参数|指标|金额|机型|细节|内容|结果|时间|边界)[。.!！?？]?$/i.test(sentence))
    .filter((sentence) => !/^(?:证据层级|结论边界|待验证问题)[：:]?/i.test(sentence))
    .join("");
}

function reportSentence(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /[。！？!?；;.]$/.test(text) ? text : `${text}。`;
}

function reportInsightBody(item) {
  return cleanReportProse(item.significance)
    .trim()
    .replace(/^(?:从)?(?:工程应用|工程实践|工程|借鉴意义|工程意义)(?:角度)?(?:来看|看)?[，,:：]?\s*/, "");
}

function reportSubjectAppears(item) {
  const action = String(item.action || "").toLowerCase();
  const subject = String(item.subject || "").trim();
  const subjectProbe = subject.split(/[（(、]/)[0].toLowerCase();
  return Boolean(subjectProbe && action.includes(subjectProbe));
}

function reportOpening(item) {
  const action = cleanReportProse(item.action).replace(/[。！？!?；;.]$/, "");
  if (!action) return "";
  if (reportSubjectAppears({ ...item, action })) return action;
  const connector = item.article.sourceType === "论文" ? "围绕相关问题开展研究，" : "显示，";
  return `${item.subject}${connector}${action}`.replace(/[。！？!?；;.]$/, "");
}

function reportNumberValues(value) {
  return (String(value || "").match(/\d+(?:\.\d+)?/g) || []).map((number) => String(Number(number)));
}

function reportMissingDataPoints(item) {
  const seenNumbers = new Set(reportNumberValues(item.action));
  return item.dataPoints.filter((point) => {
    const values = reportNumberValues(point);
    const hasNewValue = values.some((value) => !seenNumbers.has(value));
    values.forEach((value) => seenNumbers.add(value));
    return values.length && hasNewValue;
  });
}

function reportSentenceParts(value) {
  return (String(value || "").match(/[^。！？!?]+[。！？!?]?/g) || []).map((sentence) => reportSentence(sentence.trim()));
}

function reportSentenceSignature(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/该(?:项目|研究|资料|成果|方法|框架|订单|事件|政策)|进一步|工程上|实际|具体|相关/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function reportSentenceIsDuplicate(sentence, accepted) {
  const signature = reportSentenceSignature(sentence);
  if (signature.length < 10) return false;
  return accepted.some((existing) => {
    const other = reportSentenceSignature(existing);
    if (other.length < 10) return false;
    if (signature.includes(other) || other.includes(signature)) return Math.min(signature.length, other.length) >= 14;
    const grams = new Set(Array.from({ length: Math.max(0, signature.length - 1) }, (_, index) => signature.slice(index, index + 2)));
    const otherGrams = new Set(Array.from({ length: Math.max(0, other.length - 1) }, (_, index) => other.slice(index, index + 2)));
    const overlap = [...grams].filter((gram) => otherGrams.has(gram)).length;
    return overlap / Math.max(grams.size, otherGrams.size, 1) >= 0.72;
  });
}

function reportNarrativePlain(item) {
  const missingData = reportMissingDataPoints(item);
  const opening = cleanReportProse(reportOpening(item));
  const factual = [opening, ...missingData.map(cleanReportProse)].filter(Boolean).join("，");
  const insight = reportInsightBody(item);
  const sentences = [];
  for (const sentence of [...reportSentenceParts(factual), ...reportSentenceParts(insight)]) {
    if (!reportSentenceIsDuplicate(sentence, sentences)) sentences.push(sentence);
  }
  if (sentences.length) return sentences.slice(0, 4).join("");
  return reportSentence(item.article.titleZh || item.article.title || "本周收录相关传动链资料");
}

function reportHighlightSegments(item) {
  const narrative = reportNarrativePlain(item);
  const roles = Array.from({ length: narrative.length }, () => "");
  const applyRange = (start, length, role) => {
    for (let index = start; index < start + length; index += 1) {
      if (!roles[index]) roles[index] = role;
    }
  };
  for (const match of narrative.matchAll(/\d+(?:\.\d+)?\s*(?:mw|gw|kw|%|亿元|万元|年|月|日|倍|台|套|小时|h|℃|°c)?/gi)) {
    applyRange(match.index, match[0].length, "data");
  }
  const organizations = reportUnique([
    ...(item.article.industryDetails?.companies || []),
    item.article.evidence?.journal,
    item.article.source,
    item.subject
  ]).sort((left, right) => right.length - left.length);
  const technologies = reportUnique([
    ...(item.article.componentTags || []),
    ...(item.article.technicalTags || []),
    ...(item.article.failureModes || [])
  ]).sort((left, right) => right.length - left.length);
  for (const [terms, role] of [[organizations, "organization"], [technologies, "technology"]]) {
    for (const term of terms) {
      let start = narrative.indexOf(term);
      while (start >= 0) {
        applyRange(start, term.length, role);
        start = narrative.indexOf(term, start + term.length);
      }
    }
  }
  const segments = [];
  Array.from(narrative).forEach((character, index) => {
    const role = roles[index] || "body";
    const previous = segments[segments.length - 1];
    if (previous?.role === role) previous.text += character;
    else segments.push({ text: character, role });
  });
  return segments;
}

function reportNarrativeHtml(item) {
  const classes = {
    data: "report-key-data",
    organization: "report-key-organization",
    technology: "report-key-technology"
  };
  return reportHighlightSegments(item).map((segment) => {
    const content = escapeHtml(segment.text);
    return classes[segment.role] ? `<mark class="${classes[segment.role]}">${content}</mark>` : content;
  }).join("");
}

function reportItem(article) {
  const dataPoints = reportDataPoints(article);
  const componentTags = relatedComponentTags(article);
  const reportTags = reportUnique([
    ...componentTags,
    ...(article.componentTags || []),
    ...technicalTags(article),
    ...(article.failureModes || []),
    ...(article.developmentStages || [])
  ]).slice(0, 8);
  return {
    article,
    group: reportGroupKey(article),
    componentGroup: componentTags[0] || "传动链整体",
    componentTags,
    reportTags,
    subject: reportSubject(article),
    action: reportAction(article),
    effect: reportEffect(article, dataPoints),
    dataPoints,
    significance: article.engineeringImpact || ""
  };
}

function buildReportComponentGroups(items) {
  const grouped = new Map();
  items.forEach((item) => {
    const component = item.componentGroup || "传动链整体";
    if (!grouped.has(component)) grouped.set(component, []);
    grouped.get(component).push(item);
  });
  return [...grouped.entries()]
    .sort(([left], [right]) => {
      const leftRank = REPORT_COMPONENT_ORDER.get(left) ?? DRIVETRAIN_COMPONENTS.length;
      const rightRank = REPORT_COMPONENT_ORDER.get(right) ?? DRIVETRAIN_COMPONENTS.length;
      return leftRank - rightRank || left.localeCompare(right, "zh-CN");
    })
    .map(([component, componentItems]) => ({
      key: component,
      title: component,
      items: componentItems
    }));
}

function buildWeeklyReport() {
  const generatedAt = new Date(state.data?.generatedAt || Date.now());
  const end = Number.isNaN(generatedAt.getTime()) ? new Date() : generatedAt;
  const start = new Date(end.getTime() - 7 * 86400000);
  const articles = state.articles
    .filter((article) => {
      const publishedAt = new Date(article.publishedAt).getTime();
      return !isTitleClue(article) && Number.isFinite(publishedAt) && publishedAt >= start.getTime() && publishedAt <= end.getTime();
    })
    .sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt))
    .map(reportItem);
  const groups = weeklyReportGroups.map((group) => {
    const componentGroups = buildReportComponentGroups(articles.filter((item) => item.group === group.key));
    let reportIndex = 0;
    componentGroups.forEach((componentGroup) => {
      componentGroup.items.forEach((item) => {
        item.reportIndex = reportIndex;
        reportIndex += 1;
      });
    });
    return {
      ...group,
      componentGroups,
      items: componentGroups.flatMap((componentGroup) => componentGroup.items)
    };
  }).filter((group) => group.items.length);
  const quantified = articles.filter((item) => item.dataPoints.length).length;
  const domestic = articles.filter((item) => item.article.region === "国内").length;
  const papers = articles.filter((item) => item.article.sourceType === "论文").length;
  const industry = articles.filter((item) => item.group === "industry" || item.group === "environment").length;
  const highlights = [...articles]
    .sort((left, right) => {
      const score = (item) => (item.article.reliability?.score || 0) + (item.article.relevanceScore || 0) * 2 + (item.dataPoints.length ? 6 : 0);
      return score(right) - score(left);
    })
    .slice(0, 3);
  return {
    start,
    end,
    articles,
    groups,
    highlights,
    metrics: { total: articles.length, domestic, overseas: articles.length - domestic, papers, industry, quantified }
  };
}

function weeklyReportPeriod(model) {
  return `${formatDate(model.start)} - ${formatDate(model.end)}`;
}

function reportMetaItems(article) {
  return [article.source, article.region, formatDate(article.publishedAt)]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function renderReportTags(item) {
  return `<div class="report-tags" aria-label="周报技术标签">
    ${item.reportTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
  </div>`;
}

function renderReportItem(item, index) {
  const article = item.article;
  return `
    <article class="report-item">
      <div class="report-item-number">${String(index + 1).padStart(2, "0")}</div>
      <div class="report-item-main">
        <div class="report-item-meta">
          ${reportMetaItems(article).map((value) => `<span>${escapeHtml(value)}</span>`).join("")}
        </div>
        <h3>${escapeHtml(article.titleZh || article.title)}</h3>
        ${renderReportTags(item)}
        <div class="report-narrative">
          <p class="report-paragraph">${reportNarrativeHtml(item)}</p>
        </div>
        <a class="report-source-link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i>阅读原文</a>
      </div>
    </article>
  `;
}

function renderReportComponentGroup(componentGroup) {
  return `
    <section class="report-component-group" data-report-component="${escapeHtml(componentGroup.key)}">
      <div class="report-component-heading">
        <h3>${escapeHtml(componentGroup.title)}</h3>
        <span>${componentGroup.items.length} 条</span>
      </div>
      <div class="report-items">${componentGroup.items.map((item) => `<div id="report-${escapeHtml(item.article.id)}">${renderReportItem(item, item.reportIndex)}</div>`).join("")}</div>
    </section>
  `;
}

function renderWeeklyReport(model = buildWeeklyReport()) {
  activeWeeklyReport = model;
  const reportSummary = model.metrics.total
    ? `最近一周收录 ${model.metrics.total} 条资料，其中国内 ${model.metrics.domestic} 条、海外 ${model.metrics.overseas} 条；包含 ${model.metrics.papers} 篇论文和 ${model.metrics.industry} 条产业或厂商动态，其中 ${model.metrics.quantified} 条带有量化数据。`
    : "最近一周没有符合当前采集和相关性规则的资料。";
  elements.weeklyReportToolbarPeriod.textContent = weeklyReportPeriod(model);
  elements.weeklyReportContent.innerHTML = `
    <header class="report-cover">
      <span class="report-kicker">MECHANICAL CENTER · DRIVETRAIN TECHNOLOGY</span>
      <h1>机械中心-传动技术部风电传动链情报周报</h1>
      <p>${escapeHtml(weeklyReportPeriod(model))} · 数据截至 ${escapeHtml(formatDate(model.end))}</p>
      <div class="report-metrics">
        <div><strong>${model.metrics.total}</strong><span>周内资料</span></div>
        <div><strong>${model.metrics.industry}</strong><span>产业/厂商动态</span></div>
        <div><strong>${model.metrics.papers}</strong><span>研究论文</span></div>
        <div><strong>${model.metrics.quantified}</strong><span>含必要数据</span></div>
      </div>
    </header>
    <section class="report-overview">
      <span class="report-section-kicker">EXECUTIVE SUMMARY</span>
      <h2>本周摘要</h2>
      <p>${escapeHtml(reportSummary)}</p>
      ${model.highlights.length ? `<div class="report-highlights"><strong>优先关注</strong>${model.highlights.map((item) => `<a href="#report-${escapeHtml(item.article.id)}">${escapeHtml(item.article.titleZh || item.article.title)}</a>`).join("")}</div>` : ""}
    </section>
    ${model.groups.length ? model.groups.map((group, groupIndex) => `
      <section class="report-section" aria-labelledby="report-group-${escapeHtml(group.key)}">
        <div class="report-section-heading">
          <span>${String(groupIndex + 1).padStart(2, "0")}</span>
          <div><h2 id="report-group-${escapeHtml(group.key)}">${escapeHtml(group.title)}</h2><p>${escapeHtml(group.caption)}</p></div>
        </div>
        <div class="report-component-groups">${group.componentGroups.map(renderReportComponentGroup).join("")}</div>
      </section>
    `).join("") : `<div class="report-empty"><i data-lucide="calendar-x"></i><h2>本周暂无资料</h2><p>请检查采集任务状态或扩大采集时间范围。</p></div>`}
    <footer class="report-footer">本报告基于公开资料整理，供风电传动链技术交流与周度研判使用。</footer>
  `;
  renderIcons();
}

function weeklyReportPlainText(model = activeWeeklyReport || buildWeeklyReport()) {
  const lines = [
    "机械中心-传动技术部风电传动链情报周报",
    `报告范围：${weeklyReportPeriod(model)}，数据截至 ${formatDate(model.end)}`,
    `周内资料：${model.metrics.total}；国内：${model.metrics.domestic}；海外：${model.metrics.overseas}；论文：${model.metrics.papers}；含必要数据：${model.metrics.quantified}`,
    ""
  ];
  model.groups.forEach((group) => {
    lines.push(`【${group.title}】`);
    group.componentGroups.forEach((componentGroup) => {
      lines.push(`〔${componentGroup.title} · ${componentGroup.items.length} 条〕`);
      componentGroup.items.forEach((item) => {
        lines.push(`${item.reportIndex + 1}. ${item.article.titleZh || item.article.title}`);
        lines.push(item.reportTags.map((tag) => `#${tag}`).join(" "));
        lines.push(reportNarrativePlain(item));
        lines.push(`原文链接：${item.article.url}`);
        lines.push("");
      });
    });
  });
  return lines.join("\n");
}

function openWeeklyReport({ download = false, updateUrl = true } = {}) {
  renderWeeklyReport();
  if (!elements.weeklyReportDialog.open) elements.weeklyReportDialog.showModal();
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.delete("article");
    url.searchParams.set("report", "weekly");
    history.replaceState(null, "", url);
  }
  updateShareMetadata(`机械中心-传动技术部风电传动链情报周报｜${weeklyReportPeriod(activeWeeklyReport)}`, weeklyReportPlainText(activeWeeklyReport).slice(0, 180));
  if (download) void downloadWeeklyReportPdf();
}

function closeWeeklyReport() {
  if (elements.weeklyReportDialog.open) elements.weeklyReportDialog.close();
  const url = new URL(window.location.href);
  url.searchParams.delete("report");
  history.replaceState(null, "", url);
  restoreShareMetadata();
}

async function copyWeeklyReport() {
  const text = weeklyReportPlainText();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const input = document.createElement("textarea");
    input.value = text;
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  showToast("周报文字已复制");
}

async function shareWeeklyReport() {
  const url = new URL(window.location.href);
  url.searchParams.delete("article");
  url.searchParams.set("report", "weekly");
  return shareContent({
    title: `机械中心-传动技术部风电传动链情报周报｜${weeklyReportPeriod(activeWeeklyReport || buildWeeklyReport())}`,
    text: weeklyReportPlainText().slice(0, 500),
    url: url.toString()
  });
}

const pdfPageSize = { width: 1240, height: 1754, margin: 74 };

function pdfWrapText(context, value, maxWidth) {
  const lines = [];
  String(value || "").split("\n").forEach((paragraph) => {
    let line = "";
    for (const character of Array.from(paragraph)) {
      const candidate = line + character;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = character;
      } else {
        line = candidate;
      }
    }
    lines.push(line || " ");
  });
  return lines;
}

function pdfText(context, value, x, y, maxWidth, options = {}) {
  const size = options.size || 22;
  const lineHeight = options.lineHeight || Math.round(size * 1.55);
  context.font = `${options.weight || 400} ${size}px ${options.family || '"Microsoft YaHei", "PingFang SC", sans-serif'}`;
  context.fillStyle = options.color || "#17231f";
  const lines = pdfWrapText(context, value, maxWidth);
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function pdfSetFont(context, options = {}) {
  context.font = `${options.weight || 400} ${options.size || 22}px ${options.family || '"Microsoft YaHei", "PingFang SC", sans-serif'}`;
}

function pdfRichLines(context, segments, maxWidth, options = {}) {
  const baseStyle = {
    size: options.size || 20,
    weight: options.weight || 400,
    family: options.family || '"Microsoft YaHei", "PingFang SC", sans-serif',
    color: options.color || "#34463f"
  };
  const lines = [[]];
  let lineWidth = 0;
  for (const segment of segments) {
    const style = { ...baseStyle, ...segment };
    delete style.text;
    const styleKey = `${style.size}|${style.weight}|${style.family}|${style.color}`;
    for (const character of Array.from(String(segment.text || ""))) {
      if (character === "\n") {
        lines.push([]);
        lineWidth = 0;
        continue;
      }
      pdfSetFont(context, style);
      const width = context.measureText(character).width;
      const canHangPunctuation = /[，。；：、！？）》】％%]/.test(character);
      if (lineWidth && lineWidth + width > maxWidth && !canHangPunctuation) {
        lines.push([]);
        lineWidth = 0;
      }
      const line = lines[lines.length - 1];
      const previous = line[line.length - 1];
      if (previous?.styleKey === styleKey) {
        previous.text += character;
        previous.width += width;
      } else {
        line.push({ text: character, width, style, styleKey });
      }
      lineWidth += width;
    }
  }
  return lines.filter((line) => line.length);
}

function pdfRichText(context, segments, x, y, maxWidth, options = {}) {
  const lineHeight = options.lineHeight || 31;
  const lines = pdfRichLines(context, segments, maxWidth, options);
  lines.forEach((line, lineIndex) => {
    let cursorX = x;
    line.forEach((run) => {
      pdfSetFont(context, run.style);
      context.fillStyle = run.style.color;
      context.fillText(run.text, cursorX, y + lineIndex * lineHeight);
      cursorX += run.width;
    });
  });
  return y + Math.max(lines.length, 1) * lineHeight;
}

function pdfRichHeight(context, segments, maxWidth, options = {}) {
  return Math.max(pdfRichLines(context, segments, maxWidth, options).length, 1) * (options.lineHeight || 31);
}

function pdfPlainHeight(context, value, maxWidth, options = {}) {
  pdfSetFont(context, options);
  return pdfWrapText(context, value, maxWidth).length * (options.lineHeight || Math.round((options.size || 22) * 1.55));
}

function pdfOverviewText(model) {
  return model.metrics.total
    ? `最近一周收录 ${model.metrics.total} 条资料，其中国内 ${model.metrics.domestic} 条、海外 ${model.metrics.overseas} 条；包含 ${model.metrics.papers} 篇论文和 ${model.metrics.industry} 条产业或厂商动态，其中 ${model.metrics.quantified} 条带有量化数据。`
    : "最近一周没有符合当前采集和相关性规则的资料。";
}

function pdfNewPage(model, pages, pageNumber) {
  const canvas = document.createElement("canvas");
  canvas.width = pdfPageSize.width;
  canvas.height = pdfPageSize.height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#153a31";
  context.fillRect(0, 0, canvas.width, 94);
  pdfText(context, "机械中心-传动技术部  |  风电传动链情报周报", pdfPageSize.margin, 59, 700, { size: 21, weight: 700, color: "#ffffff" });
  pdfText(context, `${weeklyReportPeriod(model)}  |  第 ${pageNumber} 页`, 850, 59, 310, { size: 16, color: "#dbece5" });
  pages.push(canvas);
  return { canvas, context, y: 142 };
}

function pdfNarrativeSegments(item) {
  const styles = {
    body: { color: "#34463f", weight: 400 },
    data: { color: "#a96712", weight: 700 },
    organization: { color: "#176c55", weight: 700 },
    technology: { color: "#2e7680", weight: 700 }
  };
  return reportHighlightSegments(item).map((segment) => ({
    text: segment.text,
    ...styles[segment.role]
  }));
}

function pdfItemHeight(context, item) {
  const contentWidth = pdfPageSize.width - pdfPageSize.margin * 2;
  const textWidth = contentWidth - 76;
  const reportTags = item.reportTags.map((tag) => `#${tag}`).join("  ");
  return pdfPlainHeight(context, item.article.titleZh || item.article.title, textWidth, { size: 27, lineHeight: 37 })
    + pdfPlainHeight(context, reportMetaItems(item.article).join("  ·  "), textWidth, { size: 15, lineHeight: 23 })
    + pdfPlainHeight(context, reportTags, textWidth, { size: 16, lineHeight: 24 })
    + pdfRichHeight(context, pdfNarrativeSegments(item), textWidth, { size: 19, lineHeight: 31 })
    + pdfPlainHeight(context, `原文链接  ${item.article.url}`, textWidth, { size: 14, lineHeight: 22 })
    + 82;
}

function pdfDrawItem(context, item, index, y) {
  const contentWidth = pdfPageSize.width - pdfPageSize.margin * 2;
  context.fillStyle = "#eef5f2";
  context.fillRect(pdfPageSize.margin, y - 30, 54, 54);
  pdfText(context, String(index + 1).padStart(2, "0"), pdfPageSize.margin + 8, y + 6, 45, { size: 18, weight: 700, color: "#176c55" });
  const titleX = pdfPageSize.margin + 76;
  const titleWidth = contentWidth - 76;
  y = pdfText(context, item.article.titleZh || item.article.title, titleX, y, titleWidth, { size: 27, weight: 700, lineHeight: 37, color: "#17231f" }) + 5;
  y = pdfText(context, reportMetaItems(item.article).join("  ·  "), titleX, y, titleWidth, { size: 15, color: "#53635d" }) + 14;
  y = pdfText(context, item.reportTags.map((tag) => `#${tag}`).join("  "), titleX, y, titleWidth, { size: 16, weight: 700, lineHeight: 24, color: "#216873" }) + 10;
  y = pdfRichText(context, pdfNarrativeSegments(item), titleX, y, titleWidth, { size: 19, lineHeight: 31 }) + 18;
  y = pdfText(context, `原文链接  ${item.article.url}`, titleX, y, titleWidth, { size: 14, lineHeight: 22, color: "#2e7680" }) + 7;
  context.strokeStyle = "#d5ded9";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(pdfPageSize.margin, y + 7);
  context.lineTo(pdfPageSize.width - pdfPageSize.margin, y + 7);
  context.stroke();
  return y + 36;
}

function pdfDrawComponentHeading(context, componentGroup, y, continued = false) {
  const contentWidth = pdfPageSize.width - pdfPageSize.margin * 2;
  context.fillStyle = "#eef5f2";
  context.fillRect(pdfPageSize.margin, y - 27, contentWidth, 48);
  pdfText(context, `${componentGroup.title}${continued ? "（续）" : ""}`, pdfPageSize.margin + 16, y + 3, 650, { size: 20, weight: 700, color: "#176c55" });
  pdfText(context, `${componentGroup.items.length} 条`, pdfPageSize.width - pdfPageSize.margin - 88, y + 3, 72, { size: 15, weight: 700, color: "#53635d" });
  return y + 48;
}

function createWeeklyReportCanvases(model) {
  const pages = [];
  let page = pdfNewPage(model, pages, 1);
  const context = page.context;
  context.fillStyle = "#153a31";
  context.fillRect(0, 94, pdfPageSize.width, 250);
  pdfText(context, "MECHANICAL CENTER · DRIVETRAIN TECHNOLOGY", pdfPageSize.margin, 160, 800, { size: 18, weight: 700, color: "#b9ded0" });
  pdfText(context, "机械中心-传动技术部风电传动链情报周报", pdfPageSize.margin, 214, 620, { size: 38, weight: 700, color: "#ffffff", lineHeight: 52 });
  pdfText(context, `${weeklyReportPeriod(model)}  ·  数据截至 ${formatDate(model.end)}`, pdfPageSize.margin, 322, 590, { size: 18, color: "#dbece5" });
  const metricLabels = [[model.metrics.total, "周内资料"], [model.metrics.industry, "产业/厂商动态"], [model.metrics.papers, "研究论文"], [model.metrics.quantified, "含必要数据"]];
  metricLabels.forEach(([value, label], index) => {
    const x = 700 + index * 125;
    pdfText(context, String(value), x, 180, 110, { size: 30, weight: 700, color: "#f5d898" });
    pdfText(context, label, x, 212, 116, { size: 13, color: "#dbece5" });
  });
  let y = 400;
  pdfText(context, "本周摘要", pdfPageSize.margin, y, 900, { size: 26, weight: 700, color: "#176c55" });
  y = pdfText(context, pdfOverviewText(model), pdfPageSize.margin, y + 42, pdfPageSize.width - pdfPageSize.margin * 2, { size: 21, lineHeight: 34, color: "#34463f" }) + 22;
  if (model.highlights.length) {
    y = pdfText(context, "优先关注", pdfPageSize.margin, y, 900, { size: 19, weight: 700, color: "#3b8792" }) + 30;
    model.highlights.forEach((item, index) => {
      y = pdfText(context, `${index + 1}. ${item.article.titleZh || item.article.title}`, pdfPageSize.margin + 18, y, pdfPageSize.width - pdfPageSize.margin * 2 - 18, { size: 18, lineHeight: 28, color: "#34463f" }) + 8;
    });
  }
  y += 18;
  for (const group of model.groups) {
    const firstComponent = group.componentGroups[0];
    const firstItemHeight = firstComponent?.items.length ? pdfItemHeight(page.context, firstComponent.items[0]) : 0;
    if (y + 124 + firstItemHeight > pdfPageSize.height - 90) {
      pdfText(page.context, String(pages.length), pdfPageSize.width - 130, pdfPageSize.height - 38, 60, { size: 14, color: "#83948d" });
      page = pdfNewPage(model, pages, pages.length + 1);
      y = page.y;
    }
    pdfText(page.context, group.title, pdfPageSize.margin, y, 900, { size: 30, weight: 700, color: "#176c55" });
    y = pdfText(page.context, group.caption, pdfPageSize.margin, y + 35, 1000, { size: 16, color: "#53635d" }) + 26;
    for (const componentGroup of group.componentGroups) {
      const firstHeight = componentGroup.items.length ? pdfItemHeight(page.context, componentGroup.items[0]) : 0;
      if (y + 48 + firstHeight > pdfPageSize.height - 85) {
        pdfText(page.context, String(pages.length), pdfPageSize.width - 130, pdfPageSize.height - 38, 60, { size: 14, color: "#83948d" });
        page = pdfNewPage(model, pages, pages.length + 1);
        y = page.y;
        pdfText(page.context, `${group.title}（续）`, pdfPageSize.margin, y, 900, { size: 24, weight: 700, color: "#176c55" });
        y += 46;
      }
      y = pdfDrawComponentHeading(page.context, componentGroup, y);
      for (const item of componentGroup.items) {
        const height = pdfItemHeight(page.context, item);
        if (y + height > pdfPageSize.height - 85) {
          pdfText(page.context, String(pages.length), pdfPageSize.width - 130, pdfPageSize.height - 38, 60, { size: 14, color: "#83948d" });
          page = pdfNewPage(model, pages, pages.length + 1);
          y = page.y;
          pdfText(page.context, `${group.title}（续）`, pdfPageSize.margin, y, 900, { size: 24, weight: 700, color: "#176c55" });
          y += 46;
          y = pdfDrawComponentHeading(page.context, componentGroup, y, true);
        }
        y = pdfDrawItem(page.context, item, item.reportIndex, y);
      }
    }
  }
  pages.forEach((canvas, index) => {
    const context = canvas.getContext("2d");
    pdfText(context, `风电传动链周度研判  ·  第 ${index + 1} / ${pages.length} 页`, pdfPageSize.margin, pdfPageSize.height - 34, 700, { size: 14, color: "#83948d" });
  });
  return pages;
}

function pdfBytesFromDataUrl(dataUrl) {
  const binary = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function pdfAscii(value) {
  return new TextEncoder().encode(value);
}

function pdfConcat(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

function buildImagePdf(canvases) {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const objectCount = 2 + canvases.length * 3;
  const objects = new Map();
  const pageIds = [];
  canvases.forEach((canvas, index) => {
    const pageId = 3 + index * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    pageIds.push(pageId);
    const imageBytes = pdfBytesFromDataUrl(canvas.toDataURL("image/jpeg", 0.94));
    objects.set(imageId, { dictionary: `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>`, stream: imageBytes });
    const content = pdfAscii(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${index + 1} Do\nQ\n`);
    objects.set(contentId, { dictionary: `<< /Length ${content.length} >>`, stream: content });
    objects.set(pageId, { body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>` });
  });
  objects.set(1, { body: "<< /Type /Catalog /Pages 2 0 R >>" });
  objects.set(2, { body: `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>` });
  const chunks = [pdfAscii("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n")];
  const offsets = new Array(objectCount + 1).fill(0);
  let offset = chunks[0].length;
  for (let id = 1; id <= objectCount; id += 1) {
    const object = objects.get(id);
    offsets[id] = offset;
    const header = pdfAscii(`${id} 0 obj\n`);
    chunks.push(header);
    offset += header.length;
    if (object.stream) {
      const dictionary = pdfAscii(`${object.dictionary}\nstream\n`);
      chunks.push(dictionary, object.stream, pdfAscii("\nendstream\nendobj\n"));
      offset += dictionary.length + object.stream.length + "\nendstream\nendobj\n".length;
    } else {
      const body = pdfAscii(`${object.body}\nendobj\n`);
      chunks.push(body);
      offset += body.length;
    }
  }
  const xrefOffset = offset;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objectCount; id += 1) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(pdfAscii(xref));
  return new Blob([pdfConcat(chunks)], { type: "application/pdf" });
}

async function downloadWeeklyReportPdf() {
  const model = activeWeeklyReport || buildWeeklyReport();
  showToast("正在生成结构化 PDF 周报");
  try {
    const canvases = createWeeklyReportCanvases(model);
    const blob = buildImagePdf(canvases);
    const date = `${model.end.getFullYear()}${String(model.end.getMonth() + 1).padStart(2, "0")}${String(model.end.getDate()).padStart(2, "0")}`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `wind-intel-weekly-${date}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast("结构化 PDF 周报已生成");
  } catch (error) {
    console.error(error);
    showToast("PDF 生成失败，请使用复制周报");
  }
}

function titleClueCard(article) {
  const displayTitle = article.titleZh || article.title;
  const level = articleInformationLevel(article);
  const kind = level === "catalog"
    ? article.sourceType === "论文" ? "论文题录" : `${article.sourceType || "资料"}题录`
    : level === "brief" ? "题名简讯" : "待深读";
  return `
    <article class="clue-card" data-id="${escapeHtml(article.id)}">
      <div class="clue-marker"><i data-lucide="list-tree"></i></div>
      <div class="clue-main">
        <div class="clue-meta">
          <span class="clue-kind level-${escapeHtml(level)}">${escapeHtml(kind)}</span>
          <span>${escapeHtml(article.source || "公开题录")}</span>
          <span>${escapeHtml(article.sourceType || "公开资讯")}</span>
          <time datetime="${escapeHtml(article.publishedAt)}">${formatDate(article.publishedAt)}</time>
          <span class="clue-section">${escapeHtml(primarySection(article))}</span>
        </div>
        <h3><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">${highlight(displayTitle)}</a></h3>
        ${renderRelatedComponentTags(article, "clue-component-tags")}
      </div>
      <a class="icon-button" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer" title="查看题录或原文" aria-label="查看题录或原文"><i data-lucide="external-link"></i></a>
    </article>
  `;
}

function articleCard(article) {
  const saved = state.saved.has(article.id);
  const reliability = article.reliability || { score: 0, grade: "D", label: "待评估" };
  const displayTitle = article.titleZh || article.title;
  const access = contentAccessMeta(article);
  return `
    <article class="article-card" data-id="${escapeHtml(article.id)}">
      <div class="article-media">
        <img src="./assets/gearbox-cover.png" alt="" loading="lazy">
        <span class="media-category">${escapeHtml(primarySection(article))}</span>
      </div>
      <div class="article-body">
        <div class="article-meta">
          <span class="source">${escapeHtml(article.source)}</span>
          <span class="reliability-badge grade-${escapeHtml(reliability.grade.toLowerCase())}" title="可靠度 ${reliability.score} 分">
            ${escapeHtml(reliability.grade)} · ${escapeHtml(reliability.label)}
          </span>
          <span class="meta-separator" aria-hidden="true"></span>
          <span>${escapeHtml(article.region)}</span>
          <span class="meta-separator" aria-hidden="true"></span>
          <time datetime="${escapeHtml(article.publishedAt)}">${formatDate(article.publishedAt)}</time>
          <span class="content-access access-${escapeHtml(access.access)}"><i data-lucide="${access.icon}"></i>${access.label}</span>
          <span class="meta-separator reading-separator" aria-hidden="true"></span>
          <span class="reading-time">${article.readingMinutes || 4} 分钟</span>
        </div>
        <h3 class="article-title">
          <button type="button" data-action="details">${highlight(displayTitle)}</button>
        </h3>
        <p class="article-summary">${highlight(article.summary)}</p>
        ${renderRelatedComponentTags(article)}
        <button class="experience-link" type="button" data-action="experience">
          <i data-lucide="wrench"></i>
          <span>工程经验</span>
          <i data-lucide="chevron-right"></i>
        </button>
        <div class="article-footer">
          <div class="article-actions">
            <button class="icon-button ${saved ? "saved" : ""}" type="button" data-action="save" title="${saved ? "取消收藏" : "收藏"}" aria-label="${saved ? "取消收藏" : "收藏"}">
              <i data-lucide="${saved ? "bookmark-check" : "bookmark"}"></i>
            </button>
            <button class="icon-button share-action" type="button" data-action="share" title="分享" aria-label="分享">
              <i data-lucide="share-2"></i>
            </button>
            <a class="icon-button" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer" title="查看原文" aria-label="查看原文">
              <i data-lucide="external-link"></i>
            </a>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderFeed() {
  const articles = getVisibleArticles();
  const hasFilters =
    state.query ||
    state.category !== "全部" ||
    state.component !== "全部部件" ||
    state.industryCategory !== "全部动态" ||
    state.region !== "全部" ||
    state.sourceType !== "全部" ||
    state.view === "saved";

  elements.feedTitle.textContent = state.view === "saved"
    ? "我的收藏"
      : state.query
      ? "搜索结果"
      : state.category === COMPREHENSIVE_SECTION
        ? COMPREHENSIVE_SECTION
        : state.category === "全部"
          ? "全部情报"
          : state.category;
  elements.resultCount.textContent = `找到 ${articles.length} 条资料${hasFilters ? "，已按当前条件筛选" : ""}`;
  elements.clearSearch.hidden = !state.query;

  if (!articles.length) {
    const collectionIsEmpty = state.articles.length === 0 && state.view !== "saved" && !hasFilters;
    elements.articleFeed.innerHTML = `
      <div class="empty-state">
        <div>
          <i data-lucide="${state.view === "saved" ? "bookmark" : collectionIsEmpty ? "calendar-check" : "search-x"}"></i>
          <h3>${state.view === "saved" ? "还没有收藏资料" : collectionIsEmpty ? "本周暂无高相关新增" : "没有找到匹配内容"}</h3>
          <p>${state.view === "saved" ? "在资讯卡片上点击收藏图标，重要资料会保存在当前设备。" : collectionIsEmpty ? "采集任务已完成，当前没有达到相关性阈值的公开资料。" : "试试更短的关键词，或移除部分分类与来源筛选。"}</p>
        </div>
      </div>
    `;
  } else {
    elements.articleFeed.innerHTML = articles.map((article) => isTitleClue(article) ? titleClueCard(article) : articleCard(article)).join("");
  }

  elements.savedCount.textContent = state.saved.size;
  renderActiveFilters();
  renderIcons();
}

function renderActiveFilters() {
  const filters = [];
  if (state.query) filters.push({ key: "query", label: `关键词：${state.query}` });
  if (state.category !== "全部") filters.push({ key: "category", label: state.category });
  if (state.component !== "全部部件") filters.push({ key: "component", label: state.component });
  if (state.industryCategory !== "全部动态") filters.push({ key: "industryCategory", label: state.industryCategory });
  if (state.region !== "全部") filters.push({ key: "region", label: state.region });
  if (state.sourceType !== "全部") filters.push({ key: "sourceType", label: state.sourceType });
  if (state.view === "saved") filters.push({ key: "view", label: "仅看收藏" });

  elements.activeFilters.innerHTML = filters
    .map(
      (filter) => `
        <button class="active-filter" type="button" data-clear="${filter.key}">
          ${escapeHtml(filter.label)}
          <i data-lucide="x"></i>
        </button>
      `
    )
    .join("");

  const filterCount = [state.region, state.sourceType].filter((value) => value !== "全部").length;
  elements.filterCount.textContent = filterCount;
  elements.filterCount.hidden = filterCount === 0;
}

function renderTrends() {
  const counts = new Map();
  for (const article of state.articles.filter((item) => !isTitleClue(item))) {
    const labels = [primaryRelatedComponent(article)];
    for (const label of new Set(labels)) counts.set(label, (counts.get(label) || 0) + 1);
  }
  const trends = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(...trends.map(([, count]) => count), 1);

  elements.trendList.innerHTML = trends
    .map(
      ([category, count]) => `
        <button class="trend-item" type="button" data-trend="${escapeHtml(category)}" title="筛选 ${escapeHtml(category)}">
          <span class="trend-label">${escapeHtml(category)}</span>
          <span class="trend-bar"><span style="width: ${(count / max) * 100}%"></span></span>
          <span class="trend-count">${count}</span>
        </button>
      `
    )
    .join("");
}

function renderDimensionFilters() {
  if ([COMPREHENSIVE_SECTION, "政策、市场与产业环境"].includes(state.category)) {
    elements.dimensionFilters.innerHTML = "";
    elements.dimensionFilters.hidden = true;
    return;
  }
  const isIndustry = state.category === "厂商与项目动态";
  const values = isIndustry ? ["全部动态", ...INDUSTRY_CATEGORIES] : ["全部部件", ...DRIVETRAIN_COMPONENTS];
  const current = isIndustry ? state.industryCategory : state.component;
  const attribute = isIndustry ? "data-industry-category" : "data-component";
  elements.dimensionFilters.hidden = false;
  elements.dimensionFilters.innerHTML = values.map((value) => `
    <button class="dimension-filter ${current === value ? "active" : ""}" type="button" ${attribute}="${escapeHtml(value)}">
      ${escapeHtml(value)}
    </button>
  `).join("");
}

function renderWatchlist() {
  elements.watchList.innerHTML = state.watchlist
    .map(
      (keyword) => `
        <span class="watch-token">
          <button type="button" data-watch="${escapeHtml(keyword)}">${escapeHtml(keyword)}</button>
          <button class="remove-watch" type="button" data-remove-watch="${escapeHtml(keyword)}" title="移除 ${escapeHtml(keyword)}" aria-label="移除 ${escapeHtml(keyword)}">
            <i data-lucide="x"></i>
          </button>
        </span>
      `
    )
    .join("");
  renderIcons();
}

function setCategory(category) {
  state.category = category;
  state.component = "全部部件";
  state.industryCategory = "全部动态";
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.classList.toggle("active", button.dataset.category === category);
  });
  renderDimensionFilters();
  renderFeed();
}

function setComponent(component) {
  state.component = component;
  document.querySelectorAll("[data-component]").forEach((button) => {
    button.classList.toggle("active", button.dataset.component === component);
  });
  renderFeed();
}

function setView(view) {
  state.view = view;
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view || (view === "all" && button.dataset.view === "all"));
  });
  if (view === "search") {
    state.view = "all";
    elements.searchInput.focus();
    document.querySelector(".search-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  renderFeed();
}

function findArticle(id) {
  return state.articles.find((article) => article.id === id);
}

function definitionRows(rows) {
  const visible = rows.filter(([, value]) => value !== "" && value !== null && value !== undefined);
  if (!visible.length) return "";
  return `<dl class="detail-grid">${visible.map(([label, value]) => `
    <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
  `).join("")}</dl>`;
}

function renderTechnicalClassification(article) {
  const sections = articleSections(article);
  const components = relatedComponentTags(article);
  if (!sections.length && !components.length) return "";
  return `
    <section class="classification-panel" aria-labelledby="classification-title">
      <div class="classification-heading">
        <span>INFORMATION CLASSIFICATION</span>
        <h3 id="classification-title">信息归类</h3>
      </div>
      <div class="classification-row"><strong>所属栏目</strong><div>${sections.map((section) => `<span class="section-chip">${escapeHtml(section)}</span>`).join("")}</div></div>
      <div class="classification-row"><strong>相关部件</strong><div>${components.map((component) => `<span class="related-component-chip">${escapeHtml(component)}</span>`).join("")}</div></div>
    </section>
  `;
}

function renderPaperMetadata(article) {
  if (article.sourceType !== "论文") return "";
  const evidence = article.evidence || {};
  const metrics = evidence.sourceMetrics || {};
  const pages = [evidence.firstPage, evidence.lastPage].filter(Boolean).join("-");
  const metricValue = Number(metrics.twoYearMeanCitedness || 0);
  return `
    <section class="detail-section paper-metadata">
      <h3>论文与期刊</h3>
      ${definitionRows([
        ["期刊", evidence.journal || article.source],
        ["作者", (evidence.authors || []).join("、")],
        ["DOI", evidence.doi],
        ["ISSN-L", evidence.issnL],
        ["出版社", evidence.publisher],
        ["卷期", [evidence.volume && `Vol. ${evidence.volume}`, evidence.issue && `No. ${evidence.issue}`].filter(Boolean).join(" / ")],
        ["页码", pages],
        ["论文被引", Number(evidence.citedByCount || 0) ? `${evidence.citedByCount} 次（OpenAlex）` : ""],
        ["2年平均被引率", metricValue ? `${Number(metricValue.toFixed(2))}（OpenAlex，非 JCR 影响因子）` : ""],
        ["期刊 h-index", Number(metrics.hIndex || 0) ? `${metrics.hIndex}（OpenAlex）` : ""],
        ["开放获取", evidence.isOpenAccess ? "是" : ""]
      ])}
    </section>
  `;
}

function renderPaperDetails(article) {
  if (article.sourceType !== "论文") return "";
  const details = article.paperDetails || {};
  const findings = details.quantitativeFindings || [];
  return `
    <section class="detail-section">
      <h3>研究设计</h3>
      ${definitionRows([
        ["研究目标", details.objective],
        ["方法", details.methods],
        ["试验对象", details.testObject],
        ["工况与边界", details.operatingConditions]
      ]) || '<p class="detail-empty">公开摘要未披露完整研究设计。</p>'}
      <h3>量化结论</h3>
      ${findings.length ? `<div class="quantitative-list">${findings.map((item) => `
        <div class="quantitative-row">
          <div class="quantitative-value"><strong>${escapeHtml(item.value)}${item.unit ? ` ${escapeHtml(item.unit)}` : ""}</strong><span>${escapeHtml(item.metric)}</span></div>
          <div>${item.comparison ? `<p>${escapeHtml(item.comparison)}</p>` : ""}${item.conditions ? `<p>条件：${escapeHtml(item.conditions)}</p>` : ""}${item.evidence ? `<p>依据：${escapeHtml(item.evidence)}</p>` : ""}</div>
        </div>
      `).join("")}</div>` : '<p class="detail-empty">公开摘要未披露可核查的量化结果。</p>'}
      ${(details.limitations || []).length ? `<h3>研究局限</h3><ul class="limitations-list">${details.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    </section>
  `;
}

function renderIndustryDetails(article) {
  if (article.intelligenceType !== "industry") return "";
  const details = article.industryDetails || {};
  return `
    <section class="detail-section">
      <h3>行业事件</h3>
      ${definitionRows([
        ["事件", details.eventType],
        ["企业", (details.companies || []).join("、")],
        ["地点", details.location],
        ["容量", details.capacity],
        ["金额", details.investment],
        ["时间线", details.timeline],
        ["供应链影响", details.supplyChainImpact],
        ["核验状态", details.verificationStatus]
      ])}
      ${(details.quantitativeFacts || []).length ? `<h3>量化事实</h3><ul class="fact-list">${details.quantitativeFacts.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    </section>
  `;
}

const experienceOptions = {
  applicability: {
    supports: "符合工程经验",
    conditional: "有条件适用",
    contradicts: "与工程经验冲突",
    uncertain: "暂不确定"
  },
  component: {
    gearbox: "齿轮箱总成",
    planetary: "行星级",
    high_speed: "高速级",
    main_bearing: "主轴承",
    gear_bearing: "齿轮箱轴承",
    lubrication: "润滑系统",
    monitoring: "状态监测",
    drivetrain: "传动链",
    other: "其他"
  },
  failureMode: {
    micropitting: "微点蚀",
    wec: "白色蚀刻裂纹",
    scuffing: "胶合",
    tooth_failure: "断齿/齿根裂纹",
    bearing_damage: "轴承损伤",
    electrical_damage: "电蚀",
    lubrication: "润滑问题",
    monitoring: "监测诊断",
    loads: "载荷与均载",
    manufacturing: "材料与制造",
    other: "其他",
    not_applicable: "不涉及失效"
  },
  evidenceLevel: {
    test_report: "试验报告",
    failure_analysis: "失效分析",
    multiple_cases: "多个案例",
    single_case: "单个案例",
    engineering_judgment: "工程判断"
  },
  powerRange: {
    under_5mw: "5 MW 以下",
    "5_10mw": "5-10 MW",
    over_10mw: "10 MW 以上",
    unknown: "未限定"
  },
  environment: {
    onshore: "陆上风场",
    offshore: "海上风场",
    test_bench: "试验台",
    unknown: "未限定"
  }
};

function selectOptions(group, selected, fallback) {
  return Object.entries(experienceOptions[group]).map(([value, label]) =>
    `<option value="${escapeHtml(value)}" ${value === (selected || fallback) ? "selected" : ""}>${escapeHtml(label)}</option>`
  ).join("");
}

function renderExperiencePanel(article) {
  const selected = state.experiences[article.id] || {};
  const aggregate = article.engineeringExperience || {};
  const aggregateLabel = aggregate.writtenTotal
    ? `已收录 ${aggregate.writtenTotal} 条工程心得`
    : "欢迎补充工程心得";
  const insight = String(selected.insight || "");
  return `
    <details class="experience-panel">
      <summary><span><i data-lucide="wrench"></i>工程经验交流</span><small>${escapeHtml(aggregateLabel)}</small></summary>
      <form class="experience-form" data-experience-form data-id="${escapeHtml(article.id)}">
        <label class="experience-insight-field">
          <span><strong>工程心得</strong><small data-insight-count>${insight.length}/1200</small></span>
          <textarea name="insight" rows="6" minlength="20" maxlength="1200" required autocomplete="off" placeholder="请写下你观察到的现象、适用边界、判断依据、反例或建议的验证方法">${escapeHtml(insight)}</textarea>
          <small>请勿填写公司、项目、机组编号、人员姓名及其他保密信息。</small>
        </label>
        <div class="experience-context-heading">适用背景</div>
        <div class="experience-grid">
          <label>适用判断<select name="applicability" required>${selectOptions("applicability", selected.applicability, "uncertain")}</select></label>
          <label>相关部件<select name="component" required>${selectOptions("component", selected.component, "gearbox")}</select></label>
          <label>失效/主题<select name="failureMode" required>${selectOptions("failureMode", selected.failureMode, "not_applicable")}</select></label>
          <label>证据等级<select name="evidenceLevel" required>${selectOptions("evidenceLevel", selected.evidenceLevel, "engineering_judgment")}</select></label>
          <label>功率区间<select name="powerRange" required>${selectOptions("powerRange", selected.powerRange, "unknown")}</select></label>
          <label>应用场景<select name="environment" required>${selectOptions("environment", selected.environment, "unknown")}</select></label>
        </div>
        <label class="privacy-confirmation"><input type="checkbox" name="privacyConfirmed" required><span>我确认这段心得不含单位或项目保密信息</span></label>
        <div class="experience-actions">
          <button class="primary-button" type="submit"><i data-lucide="send"></i>提交工程心得</button>
          ${selected.applicability ? `<button class="quiet-button" type="button" data-experience-clear data-id="${escapeHtml(article.id)}"><i data-lucide="trash-2"></i>撤销</button>` : ""}
        </div>
      </form>
    </details>
  `;
}

function renderExperienceReview(article) {
  const review = article.experienceReview || {};
  if (!review.synthesis) return "";
  return `
    <section class="experience-review" aria-labelledby="experience-review-title">
      <div class="experience-review-heading">
        <div>
          <span>ENGINEER REVIEW</span>
          <h3 id="experience-review-title">工程经验复核</h3>
        </div>
        <strong>${escapeHtml(review.status || "待核验")}</strong>
      </div>
      <p>${escapeHtml(review.synthesis)}</p>
      ${review.applicableBoundary ? `<div><b>适用边界</b><span>${escapeHtml(review.applicableBoundary)}</span></div>` : ""}
      ${review.verificationNeeded ? `<div><b>待验证</b><span>${escapeHtml(review.verificationNeeded)}</span></div>` : ""}
      <small>基于匿名工程师心得归纳，不替代论文、试验报告或失效分析原始证据。</small>
    </section>
  `;
}

function openArticle(article, { focusExperience = false } = {}) {
  if (!article) return;
  const displayTitle = article.titleZh || article.title;
  updateShareMetadata(`${displayTitle}｜机械中心-传动技术部在线平台`, article.summary);
  elements.dialogSource.textContent = `${article.source} · ${article.sourceType}`;
  const linkLabel = article.linkType === "aggregator" ? "聚合跳转" : "发布方原文";
  const access = contentAccessMeta(article);
  const extractedCharacters = Number(article.evidence?.extractedCharacters || 0);
  const reliability = article.reliability || { score: 0, grade: "D", label: "待评估", factors: [], limitations: [], feedback: {} };
  const selectedFeedback = state.feedback[article.id] || "";
  const aggregateTotal = reliability.feedback?.total || 0;
  elements.dialogContent.innerHTML = `
    <article class="dialog-article">
      <h2>${escapeHtml(displayTitle)}</h2>
      ${article.titleZh && article.titleZh !== article.title ? `<p class="original-title">${escapeHtml(article.title)}</p>` : ""}
      <div class="dialog-meta">
        <span class="dialog-section">${escapeHtml(primarySection(article))}</span>
        <span>·</span>
        <span>${escapeHtml(article.region)}</span>
        <span>·</span>
        <time datetime="${escapeHtml(article.publishedAt)}">${formatDate(article.publishedAt)}</time>
        <span>·</span>
        <span>${article.readingMinutes || 4} 分钟阅读</span>
      </div>
      <div class="provenance-row">
        <span><i data-lucide="shield-check"></i> 来源可追溯</span>
        <span>${escapeHtml(article.sourceChannel || "网络公开来源")}</span>
        <span>${linkLabel}</span>
        <span class="content-access access-${escapeHtml(access.access)}"><i data-lucide="${access.icon}"></i>${escapeHtml(access.label)}${extractedCharacters ? ` · ${extractedCharacters.toLocaleString("zh-CN")} 字符` : ""}</span>
        ${article.aiAnalysis?.provider ? `<span>${escapeHtml(article.aiAnalysis.provider)} AI 摘要</span>` : ""}
      </div>
      ${renderTechnicalClassification(article)}
      ${renderPaperMetadata(article)}
      <p class="dialog-summary">${escapeHtml(article.summary)}</p>
      ${renderPaperDetails(article)}
      ${renderIndustryDetails(article)}
      <section class="reliability-section" aria-labelledby="reliability-title">
        <div class="reliability-heading">
          <div>
            <h3 id="reliability-title">可靠度评估</h3>
            <p>评估来源、证据与可追溯性，不代表结论已经证实。</p>
          </div>
          <div class="reliability-score grade-${escapeHtml(reliability.grade.toLowerCase())}">
            <strong>${reliability.score}</strong>
            <span>${escapeHtml(reliability.grade)} · ${escapeHtml(reliability.label)}</span>
          </div>
        </div>
        <div class="reliability-reasons">
          ${(reliability.factors || []).map((item) => `<span class="positive"><i data-lucide="check"></i>${escapeHtml(item)}</span>`).join("")}
          ${(reliability.limitations || []).map((item) => `<span class="limitation"><i data-lucide="triangle-alert"></i>${escapeHtml(item)}</span>`).join("")}
        </div>
      </section>
      <h3>关键信息</h3>
      <ol class="key-points">
        ${(article.keyPoints || [])
          .map((point, index) => `<li><span>${index + 1}</span><div>${escapeHtml(point)}</div></li>`)
          .join("")}
      </ol>
      <h3>工程启示</h3>
      <div class="impact-box">${escapeHtml(article.engineeringImpact)}</div>
      ${renderExperienceReview(article)}
      <div class="tag-list" style="margin-top: 18px">
        ${(article.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
      </div>
      ${renderExperiencePanel(article)}
      <section class="feedback-section" aria-labelledby="feedback-title">
        <div>
          <h3 id="feedback-title">你的判断</h3>
          ${aggregateTotal ? `<span class="feedback-total">已汇总 ${aggregateTotal} 份反馈</span>` : ""}
        </div>
        <div class="feedback-actions" role="group" aria-label="评价这条资料">
          <button type="button" data-feedback="useful" data-id="${escapeHtml(article.id)}" aria-pressed="${selectedFeedback === "useful"}">
            <i data-lucide="thumbs-up"></i><span>有价值</span>
          </button>
          <button type="button" data-feedback="questionable" data-id="${escapeHtml(article.id)}" aria-pressed="${selectedFeedback === "questionable"}">
            <i data-lucide="circle-help"></i><span>需核验</span>
          </button>
          <button type="button" data-feedback="irrelevant" data-id="${escapeHtml(article.id)}" aria-pressed="${selectedFeedback === "irrelevant"}">
            <i data-lucide="circle-minus"></i><span>不相关</span>
          </button>
          <button type="button" data-feedback="broken" data-id="${escapeHtml(article.id)}" aria-pressed="${selectedFeedback === "broken"}">
            <i data-lucide="unlink"></i><span>链接失效</span>
          </button>
        </div>
      </section>
      <div class="dialog-actions">
        <a class="primary-button" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">
          <i data-lucide="external-link"></i>
          阅读原文
        </a>
        <button class="quiet-button" type="button" data-dialog-action="save" data-id="${escapeHtml(article.id)}">
          <i data-lucide="${state.saved.has(article.id) ? "bookmark-check" : "bookmark"}"></i>
          ${state.saved.has(article.id) ? "已收藏" : "收藏"}
        </button>
        <button class="quiet-button" type="button" data-dialog-action="share" data-id="${escapeHtml(article.id)}">
          <i data-lucide="share-2"></i>
          分享
        </button>
      </div>
    </article>
  `;
  if (!elements.articleDialog.open) elements.articleDialog.showModal();
  const shareUrl = new URL(window.location.href);
  shareUrl.searchParams.set("article", article.id);
  history.replaceState(null, "", shareUrl);
  renderIcons();
  if (focusExperience) {
    const panel = elements.dialogContent.querySelector(".experience-panel");
    if (panel) {
      panel.open = true;
      requestAnimationFrame(() => {
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
        panel.querySelector("textarea")?.focus({ preventScroll: true });
      });
    }
  }
}

async function sendCentralFeedback(article, vote) {
  if (!runtimeConfig.feedbackEndpoint) return;
  const endpoint = new URL("feedback", runtimeConfig.feedbackEndpoint.endsWith("/")
    ? runtimeConfig.feedbackEndpoint
    : `${runtimeConfig.feedbackEndpoint}/`);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      articleId: article.id,
      vote,
      clientId: state.clientId,
      reliabilityScore: article.reliability?.score || 0,
      submittedAt: new Date().toISOString()
    })
  });
  if (!response.ok) throw new Error(`Feedback API ${response.status}`);
  const pending = readObjectStorage("wind-intel-feedback-pending", {});
  delete pending[article.id];
  writeStorage("wind-intel-feedback-pending", pending);
}

async function sendCentralExperience(article, experience) {
  if (!runtimeConfig.feedbackEndpoint) return;
  const endpoint = new URL("experience", runtimeConfig.feedbackEndpoint.endsWith("/")
    ? runtimeConfig.feedbackEndpoint
    : `${runtimeConfig.feedbackEndpoint}/`);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      articleId: article.id,
      clientId: state.clientId,
      ...experience,
      submittedAt: new Date().toISOString()
    })
  });
  if (!response.ok) throw new Error(`Experience API ${response.status}`);
  const pending = readObjectStorage("wind-intel-experience-pending", {});
  delete pending[article.id];
  writeStorage("wind-intel-experience-pending", pending);
}

function queuePendingExperience(article, experience) {
  const pending = readObjectStorage("wind-intel-experience-pending", {});
  pending[article.id] = { ...experience, updatedAt: new Date().toISOString() };
  writeStorage("wind-intel-experience-pending", pending);
}

async function flushPendingExperience() {
  if (!runtimeConfig.feedbackEndpoint) return;
  const pending = readObjectStorage("wind-intel-experience-pending", {});
  for (const [articleId, experience] of Object.entries(pending)) {
    const article = findArticle(articleId);
    if (!article) continue;
    try {
      await sendCentralExperience(article, experience);
    } catch {
      return;
    }
  }
}

async function submitExperience(article, form) {
  if (!article || !form) return;
  const data = new FormData(form);
  const experience = {
    insight: String(data.get("insight") || "").replace(/\r\n?/g, "\n").trim().slice(0, 1200),
    applicability: data.get("applicability"),
    component: data.get("component"),
    failureMode: data.get("failureMode"),
    evidenceLevel: data.get("evidenceLevel"),
    powerRange: data.get("powerRange"),
    environment: data.get("environment")
  };
  state.experiences[article.id] = experience;
  writeStorage("wind-intel-experiences", state.experiences);
  openArticle(article, { focusExperience: true });
  try {
    await sendCentralExperience(article, experience);
    showToast(runtimeConfig.feedbackEndpoint ? "工程经验已匿名汇总" : "工程经验已保存在本机");
  } catch (error) {
    console.warn(error);
    queuePendingExperience(article, experience);
    showToast("工程经验已保存在本机，下次打开自动重试");
  }
}

async function clearExperience(article) {
  if (!article) return;
  delete state.experiences[article.id];
  writeStorage("wind-intel-experiences", state.experiences);
  openArticle(article, { focusExperience: true });
  const clearPayload = { action: "clear" };
  try {
    await sendCentralExperience(article, clearPayload);
    showToast("已撤销工程经验");
  } catch (error) {
    console.warn(error);
    queuePendingExperience(article, clearPayload);
    showToast("撤销请求已保存在本机");
  }
}

function queuePendingFeedback(article, vote) {
  const pending = readObjectStorage("wind-intel-feedback-pending", {});
  pending[article.id] = { vote, updatedAt: new Date().toISOString() };
  writeStorage("wind-intel-feedback-pending", pending);
}

async function flushPendingFeedback() {
  if (!runtimeConfig.feedbackEndpoint) return;
  const pending = readObjectStorage("wind-intel-feedback-pending", {});
  for (const [articleId, item] of Object.entries(pending)) {
    const article = findArticle(articleId);
    if (!article) continue;
    try {
      await sendCentralFeedback(article, item.vote);
    } catch {
      return;
    }
  }
}

async function submitFeedback(article, vote) {
  if (!article || !["useful", "questionable", "irrelevant", "broken"].includes(vote)) return;
  const keepExperienceOpen = Boolean(elements.dialogContent.querySelector(".experience-panel")?.open);
  if (state.feedback[article.id] === vote) {
    delete state.feedback[article.id];
  } else {
    state.feedback[article.id] = vote;
  }
  writeStorage("wind-intel-feedback", state.feedback);
  const selected = state.feedback[article.id] || "";
  renderFeed();
  openArticle(article, { focusExperience: keepExperienceOpen });
  try {
    await sendCentralFeedback(article, selected || "clear");
    showToast(!selected
      ? "已撤销反馈"
      : runtimeConfig.feedbackEndpoint
        ? "反馈已汇总并用于后续校准"
        : "已根据反馈调整本机推荐");
  } catch (error) {
    console.warn(error);
    queuePendingFeedback(article, selected || "clear");
    showToast("反馈已保存在本机，下次打开自动重试");
  }
}

function closeArticle() {
  if (elements.articleDialog.open) elements.articleDialog.close();
  const url = new URL(window.location.href);
  url.searchParams.delete("article");
  history.replaceState(null, "", url);
  restoreShareMetadata();
}

function toggleSaved(article) {
  if (!article) return;
  if (state.saved.has(article.id)) {
    state.saved.delete(article.id);
    showToast("已取消收藏");
  } else {
    state.saved.add(article.id);
    showToast("已加入收藏");
  }
  writeStorage("wind-intel-saved", [...state.saved]);
  renderFeed();
  if (elements.articleDialog.open) openArticle(article);
}

async function shareContent(shareData) {
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }

  try {
    await navigator.clipboard.writeText(`${shareData.title}\n${shareData.url}`);
  } catch {
    const input = document.createElement("textarea");
    input.value = `${shareData.title}\n${shareData.url}`;
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  showToast(/MicroMessenger/i.test(navigator.userAgent) ? "链接已复制，也可使用微信右上角分享" : "分享链接已复制");
}

async function shareArticle(article) {
  if (!article) return;
  const shareUrl = new URL(window.location.href);
  shareUrl.searchParams.set("article", article.id);
  return shareContent({
    title: article.title,
    text: `${article.summary}\n来源：${article.source}`,
    url: shareUrl.toString()
  });
}

async function shareApplication() {
  const shareUrl = new URL(window.location.href);
  shareUrl.searchParams.delete("article");
  return shareContent({
    title: defaultShareMetadata.title,
    text: state.data?.weeklyBrief?.summary || defaultShareMetadata.description,
    url: shareUrl.toString()
  });
}

function openFilters() {
  elements.filterForm.elements.region.value = state.region;
  elements.filterForm.elements.sourceType.value = state.sourceType;
  elements.filterDialog.showModal();
}

function clearFilter(key) {
  if (key === "query") {
    state.query = "";
    elements.searchInput.value = "";
  } else if (key === "view") {
    state.view = "all";
  } else if (key === "component") {
    state.component = "全部部件";
  } else if (key === "industryCategory") {
    state.industryCategory = "全部动态";
  } else {
    state[key] = "全部";
  }
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.classList.toggle("active", button.dataset.category === state.category);
  });
  renderDimensionFilters();
  renderFeed();
}

function wireEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    if (state.query) state.sort = "relevance";
    renderFeed();
    document.querySelectorAll("[data-sort]").forEach((button) => {
      button.classList.toggle("active", button.dataset.sort === state.sort);
    });
  });

  elements.clearSearch.addEventListener("click", () => {
    state.query = "";
    elements.searchInput.value = "";
    elements.searchInput.focus();
    renderFeed();
  });

  elements.categoryTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (button) setCategory(button.dataset.category);
  });

  elements.dimensionFilters.addEventListener("click", (event) => {
    const componentButton = event.target.closest("[data-component]");
    const industryButton = event.target.closest("[data-industry-category]");
    if (componentButton) setComponent(componentButton.dataset.component);
    if (industryButton) {
      state.industryCategory = industryButton.dataset.industryCategory;
      renderDimensionFilters();
      renderFeed();
    }
  });

  document.querySelector(".segmented-control").addEventListener("click", (event) => {
    const button = event.target.closest("[data-sort]");
    if (!button) return;
    state.sort = button.dataset.sort;
    document.querySelectorAll("[data-sort]").forEach((item) => item.classList.toggle("active", item === button));
    renderFeed();
  });

  elements.articleFeed.addEventListener("click", (event) => {
    const card = event.target.closest(".article-card");
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!card || !action) return;
    const article = findArticle(card.dataset.id);
    if (action === "details") openArticle(article);
    if (action === "experience") openArticle(article, { focusExperience: true });
    if (action === "save") toggleSaved(article);
    if (action === "share") shareArticle(article);
  });

  elements.activeFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-clear]");
    if (button) clearFilter(button.dataset.clear);
  });

  elements.trendList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-trend]");
    if (button) {
      if ([COMPREHENSIVE_SECTION, "政策、市场与产业环境", "厂商与项目动态"].includes(state.category)) {
        setCategory("全部");
      }
      setComponent(button.dataset.trend);
    }
  });

  elements.watchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const keyword = elements.watchInput.value.trim();
    if (!keyword) return;
    if (!state.watchlist.includes(keyword)) {
      state.watchlist.unshift(keyword);
      state.watchlist = state.watchlist.slice(0, 12);
      writeStorage("wind-intel-watchlist", state.watchlist);
      renderWatchlist();
    }
    elements.watchInput.value = "";
  });

  elements.watchList.addEventListener("click", (event) => {
    const searchButton = event.target.closest("[data-watch]");
    const removeButton = event.target.closest("[data-remove-watch]");
    if (searchButton) {
      state.query = searchButton.dataset.watch;
      elements.searchInput.value = state.query;
      state.sort = "relevance";
      renderFeed();
      document.querySelector(".search-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (removeButton) {
      state.watchlist = state.watchlist.filter((item) => item !== removeButton.dataset.removeWatch);
      writeStorage("wind-intel-watchlist", state.watchlist);
      renderWatchlist();
    }
  });

  document.querySelector("#show-saved").addEventListener("click", () => setView("saved"));
  elements.shareApp.addEventListener("click", shareApplication);
  elements.openWeeklyReport.addEventListener("click", () => openWeeklyReport({ download: true }));
  elements.copyWeeklyReport.addEventListener("click", copyWeeklyReport);
  elements.downloadWeeklyReport.addEventListener("click", downloadWeeklyReportPdf);
  elements.shareWeeklyReport.addEventListener("click", shareWeeklyReport);
  elements.closeWeeklyReport.addEventListener("click", closeWeeklyReport);
  elements.weeklyReportDialog.addEventListener("click", (event) => {
    if (event.target === elements.weeklyReportDialog) closeWeeklyReport();
  });
  elements.weeklyReportDialog.addEventListener("close", () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("report");
    history.replaceState(null, "", url);
    restoreShareMetadata();
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  document.querySelector("#open-filters").addEventListener("click", openFilters);
  document.querySelector("#open-filters-mobile").addEventListener("click", openFilters);
  document.querySelector("#reset-filters").addEventListener("click", () => {
    elements.filterForm.elements.region.value = "全部";
    elements.filterForm.elements.sourceType.value = "全部";
  });
  elements.filterForm.addEventListener("submit", (event) => {
    if (event.submitter?.value !== "apply") return;
    const formData = new FormData(elements.filterForm);
    state.region = formData.get("region") || "全部";
    state.sourceType = formData.get("sourceType") || "全部";
    renderFeed();
  });

  document.querySelector("#close-dialog").addEventListener("click", closeArticle);
  elements.articleDialog.addEventListener("click", (event) => {
    if (event.target === elements.articleDialog) closeArticle();
    const button = event.target.closest("[data-dialog-action]");
    const feedbackButton = event.target.closest("[data-feedback]");
    const experienceClear = event.target.closest("[data-experience-clear]");
    if (experienceClear) {
      clearExperience(findArticle(experienceClear.dataset.id));
      return;
    }
    if (feedbackButton) {
      submitFeedback(findArticle(feedbackButton.dataset.id), feedbackButton.dataset.feedback);
      return;
    }
    if (button) {
      const article = findArticle(button.dataset.id);
      if (button.dataset.dialogAction === "save") toggleSaved(article);
      if (button.dataset.dialogAction === "share") shareArticle(article);
    }
  });
  elements.articleDialog.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-experience-form]");
    if (!form) return;
    event.preventDefault();
    submitExperience(findArticle(form.dataset.id), form);
  });
  elements.articleDialog.addEventListener("input", (event) => {
    const input = event.target.closest('textarea[name="insight"]');
    if (!input) return;
    const counter = input.closest(".experience-insight-field")?.querySelector("[data-insight-count]");
    if (counter) counter.textContent = `${input.value.length}/1200`;
  });
  elements.articleDialog.addEventListener("close", () => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("article")) {
      url.searchParams.delete("article");
      history.replaceState(null, "", url);
    }
    restoreShareMetadata();
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      elements.searchInput.focus();
      elements.searchInput.select();
    }
  });
}

async function loadData() {
  try {
    const response = await fetch("./data/articles.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    state.data = await response.json();
    state.articles = state.data.articles || [];
    renderWeeklyBrief();
    renderCategoryCounts();
    renderTrends();
    renderWatchlist();
    renderDimensionFilters();
    renderFeed();
    renderIcons();
    flushPendingFeedback();
    flushPendingExperience();

    const articleId = new URL(window.location.href).searchParams.get("article");
    if (articleId) openArticle(findArticle(articleId));
    if (new URL(window.location.href).searchParams.get("report") === "weekly") openWeeklyReport({ updateUrl: false });
  } catch (error) {
    console.error(error);
    elements.articleFeed.innerHTML = `
      <div class="empty-state">
        <div>
          <i data-lucide="cloud-off"></i>
          <h3>资料暂时无法加载</h3>
          <p>请检查网络连接后刷新页面。已经打开过的内容仍可通过离线缓存访问。</p>
        </div>
      </div>
    `;
    elements.resultCount.textContent = "加载失败";
    renderIcons();
  }
}

wireEvents();
renderIcons();
loadData();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.error));
}

