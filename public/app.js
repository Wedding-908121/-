const state = {
  data: null,
  articles: [],
  query: "",
  category: "全部",
  region: "全部",
  sort: "latest",
  saved: new Set(readStorage("mech-intel-saved", [])),
  watchlist: readStorage("mech-intel-watchlist", ["疲劳寿命", "数字孪生", "气动噪声"]),
  clientId: readClientId()
};

var toastTimer;

function readStorage(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : fallback; }
  catch { return fallback; }
}

function readClientId() {
  let id = localStorage.getItem("mech-intel-client-id");
  if (!id) { id = crypto.randomUUID?.() || "local-" + Date.now() + "-" + Math.random().toString(16).slice(2); localStorage.setItem("mech-intel-client-id", id); }
  return id;
}

function writeStorage(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function escapeHtml(v) { return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll("\"","&quot;").replaceAll("'","&#039;"); }

function showToast(msg) {
  clearTimeout(toastTimer);
  const el = document.getElementById("toast");
  el.textContent = msg; el.classList.add("show");
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

function formatDate(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { year:"numeric", month:"2-digit", day:"2-digit" }).format(d);
}

function renderIcons() { window.lucide?.createIcons({ attrs: { "aria-hidden":"true" } }); }


// ===== Dialog helpers =====
function definitionRows(rows) {
  const visible = rows.filter(([, value]) => value !== "" && value !== null && value !== undefined);
  if (!visible.length) return "";
  return `<dl class="detail-grid">${visible.map(([label, value]) => `
    <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
  `).join("")}</dl>`;
}

function renderPaperMetadata(article) {
  const isPaper = article.sourceType === "学术论文" || article.sourceType === "论文";
  if (!isPaper) return "";
  const evidence = article.evidence || {};
  const metrics = evidence.sourceMetrics || {};
  const pages = [evidence.firstPage, evidence.lastPage].filter(Boolean).join("-");
  const metricValue = Number(metrics.twoYearMeanCitedness || 0);
  return `
    <section class="detail-section paper-metadata">
      <h3><i data-lucide="book-open"></i> 论文与期刊</h3>
      ${definitionRows([
        ["期刊", evidence.journal || article.source],
        ["作者", (evidence.authors || []).join("、")],
        ["DOI", evidence.doi],
        ["ISSN-L", evidence.issnL],
        ["出版社", evidence.publisher],
        ["卷期", [evidence.volume && `Vol. ${evidence.volume}`, evidence.issue && `No. ${evidence.issue}`].filter(Boolean).join(" / ")],
        ["页码", pages],
        ["论文被引", Number(evidence.citedByCount || 0) ? `${evidence.citedByCount} 次` : ""],
        ["2年平均被引率", metricValue ? `${Number(metricValue.toFixed(2))}（OpenAlex数据，非JCR影响因子）` : ""],
        ["期刊 h-index", Number(metrics.hIndex || 0) ? `${metrics.hIndex}（OpenAlex）` : ""],
        ["开放获取", evidence.isOpenAccess ? "是" : ""]
      ])}
    </section>
  `;
}

function renderPaperDetails(article) {
  const isPaper = article.sourceType === "学术论文" || article.sourceType === "论文";
  if (!isPaper) return "";
  const details = article.paperDetails || {};
  const findings = details.quantitativeFindings || [];
  return `
    <section class="detail-section">
      <h3><i data-lucide="flask-conical"></i> 研究设计</h3>
      ${definitionRows([
        ["研究目标", details.objective],
        ["方法", details.methods],
        ["试验对象", details.testObject],
        ["工况与边界", details.operatingConditions]
      ]) || '<p class="detail-empty">公开摘要未披露完整研究设计。</p>'}
      <h3><i data-lucide="bar-chart-3"></i> 量化结论</h3>
      ${findings.length ? `<div class="quantitative-list">${findings.map((item) => `
        <div class="quantitative-row">
          <div class="quantitative-value"><strong>${escapeHtml(item.value)}${item.unit ? ` ${escapeHtml(item.unit)}` : ""}</strong><span>${escapeHtml(item.metric)}</span></div>
          <div>${item.comparison ? `<p>${escapeHtml(item.comparison)}</p>` : ""}${item.conditions ? `<p>条件：${escapeHtml(item.conditions)}</p>` : ""}${item.evidence ? `<p>依据：${escapeHtml(item.evidence)}</p>` : ""}</div>
        </div>
      `).join("")}</div>` : '<p class="detail-empty">公开摘要未披露可核查的量化结果。</p>'}
      ${(details.limitations || []).length ? `<h3><i data-lucide="alert-triangle"></i> 研究局限</h3><ul class="limitations-list">${details.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    </section>
  `;
}

function renderIndustryDetails(article) {
  const isIndustry = article.intelligenceType === "industry" || article.sourceType === "行业新闻" || article.sourceType === "行业动态";
  if (!isIndustry) return "";
  const details = article.industryDetails || {};
  if (!details.eventType && !(details.companies || []).length && !details.capacity && !details.investment) return "";
  return `
    <section class="detail-section">
      <h3><i data-lucide="building-2"></i> 行业事件</h3>
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

// ===== Load Data =====
async function loadData() {
  try {
    const resp = await fetch("./data/articles.json?v=" + Date.now());
    state.data = await resp.json();
    state.articles = state.data.articles || [];
    renderAll();
  // Load archive index for week selector
  try {
    const archiveResp = await fetch("./data/archive/index.json?v=" + Date.now());
    if (archiveResp.ok) {
      state.archiveIndex = await archiveResp.json();
      renderWeekSelector();
    }
  } catch {}

  // Listen for week selector changes
  const weekSelector = document.getElementById("week-selector");
  if (weekSelector) {
    weekSelector.addEventListener("change", async () => {
      const week = weekSelector.value;
      if (!week) {
        // Reload current week
        await loadData();
      } else {
        try {
          const resp = await fetch("./data/archive/" + week + ".json");
          if (!resp.ok) throw new Error("Not found");
          const archiveData = await resp.json();
          state.data = { ...archiveData, collectionStatus: { ...archiveData.collectionStatus, dataMode: "archive" } };
          state.articles = archiveData.articles || [];
          renderAll();
          document.getElementById("brief-mode").textContent = "历史归档";
        } catch(e) {
          showToast("无法加载历史周报");
        }
      }
    });
  }
  } catch (e) {
    document.getElementById("brief-title").textContent = "数据加载失败";
    document.getElementById("brief-summary").textContent = "请运行 npm run collect 生成数据";
  }
}

// ===== Filter & Sort =====
function filteredArticles() {
  let arts = [...state.articles];
  if (state.category !== "全部") {
    if (state.category === "学术研究") {
      // 学术研究: match category OR research sub-tags
      const researchTags = ["疲劳断裂", "AI动态", "噪声研究", "气动研究", "螺栓研究"];
      arts = arts.filter(a => a.category === "学术研究" || researchTags.some(t => (a.tags||[]).includes(t)));
    } else {
      arts = arts.filter(a => a.category === state.category || (a.tags||[]).includes(state.category));
    }
  }
  if (state.query) {
    const q = state.query.toLowerCase();
    arts = arts.filter(a =>
      (a.title||"").toLowerCase().includes(q) ||
      (a.titleZh||"").toLowerCase().includes(q) ||
      (a.summary||"").toLowerCase().includes(q) ||
      (a.tags||[]).some(t => t.toLowerCase().includes(q)) ||
      (a.source||"").toLowerCase().includes(q)
    );
  }
  switch (state.sort) {
    case "oldest": arts.sort((a,b) => new Date(a.publishedAt) - new Date(b.publishedAt)); break;
    case "relevant": arts.sort((a,b) => (b.relevanceScore||0) - (a.relevanceScore||0)); break;
    default: arts.sort((a,b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  }
  return arts;
}

// ===== Render =====
function renderAll() {
  renderHero();
  renderTabs();
  renderFeed();
  renderWatchlist();
  renderTrends();
  renderSaved();
  renderIcons();
}

function renderHero() {
  const brief = state.data?.weeklyBrief || {};
  document.getElementById("brief-period").textContent = "本周情报简报";
  let weekEl = document.getElementById("brief-week-range");
  if (!weekEl) {
    weekEl = document.createElement("span");
    weekEl.id = "brief-week-range";
    weekEl.className = "brief-week-range";
    weekEl.textContent = "2026.07.13-2026.07.20 第29周";
    document.getElementById("brief-period").after(weekEl);
  }
  document.getElementById("brief-mode").textContent = state.data?.collectionStatus?.dataMode === "live" ? "生产数据" : "";
  document.getElementById("brief-title").innerHTML = "本周汇集 <span class=\"accent\">" + (brief.total||0) + "</span> 条高相关机械共性情报";
  document.getElementById("brief-summary").textContent = "数据覆盖疲劳断裂仿真、风机噪声、风机气动布局、AI发展动态与风电行业动态五个主题" + (brief.period ? "，近" + brief.period : "");
  document.getElementById("metric-total").textContent = brief.total || "--";
  document.getElementById("metric-domestic").textContent = brief.domestic || "--";
  document.getElementById("metric-papers").textContent = brief.papers || "--";

  const signals = document.getElementById("signal-list");
  signals.innerHTML = (brief.signals||[]).slice(0,6).map(s =>
    '<span class="signal-tag"><strong>' + s.count + '</strong> ' + escapeHtml(s.tag) + '</span>'
  ).join("");

  const freshness = document.getElementById("freshness");
  const dot = freshness.querySelector(".status-dot");
  if (state.data?.generatedAt) {
    const d = new Date(state.data.generatedAt);
    freshness.innerHTML = '<span class="status-dot live"></span> 更新于 ' + formatDate(d.toISOString());
  }
}

function renderTabs() {
  document.querySelectorAll(".category-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.category === state.category);
  });
}

function renderFeed() {
  const arts = filteredArticles();
  document.getElementById("feed-title").textContent = state.category === "全部" ? "全部资料" : state.category;
  document.getElementById("result-count").textContent = arts.length + " 条";
  const feed = document.getElementById("article-feed");
  if (!arts.length) {
    feed.innerHTML = '<div class="empty-state"><i data-lucide="search-x"></i><h3>无匹配资料</h3><p>尝试调整搜索词或分类</p></div>';
    renderIcons();
    return;
  }
  feed.innerHTML = arts.map(a => {
    const zhTitle = a.titleZh || a.title || "";
    const tags = (a.tags||[]).slice(0,4);
    const isDomestic = a.region === "国内";
    return '<article class="article-card" data-id="' + a.id + '" role="article">' +
      '<div class="card-header">' +
        '<span class="card-title">' + escapeHtml(zhTitle) + '</span>' +
      '</div>' +
      '<div class="card-meta">' +
        '<span class="card-source">' + escapeHtml(a.source||"未知来源") + '</span>' +
        '<span class="card-date">' + formatDate(a.publishedAt) + '</span>' +
      '</div>' +
      '<div class="card-tags">' + tags.map(t => '<span class="card-tag">' + escapeHtml(t) + '</span>').join("") + '</div>' +
      '<p class="card-snippet">' + escapeHtml(a.summary||a.snippet||"") + '</p>' +
      '<div class="card-footer">' +
        '<span class="card-region' + (isDomestic?" domestic":"") + '">' + escapeHtml(a.region||"海外") + '</span>' +
        (() => { const r = a.reliability; const g = r?.grade || ""; const s = r?.score; return '<span class="card-reliability grade-' + g.toLowerCase() + '">' + (s ? g + ' · ' + s : '--') + '</span>'; })() +
        '<div class="card-actions">' +
          '<button class="card-action' + (state.saved.has(a.id)?" saved":"") + '" data-action="save" data-id="' + a.id + '" title="收藏"><i data-lucide="bookmark"></i></button>' +
          '<button class="card-action" data-action="share" data-id="' + a.id + '" title="分享"><i data-lucide="share-2"></i></button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }).join("");
  renderIcons();

  feed.querySelectorAll(".article-card").forEach(card => {
    card.addEventListener("click", e => {
      if (e.target.closest("[data-action]")) return;
      showDialog(card.dataset.id);
    });
  });
  feed.querySelectorAll("[data-action='save']").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); toggleSave(btn.dataset.id); });
  });
  feed.querySelectorAll("[data-action='share']").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); shareArticle(btn.dataset.id); });
  });
}

function renderWatchlist() {
  const list = document.getElementById("watch-list");
  list.innerHTML = state.watchlist.map(t =>
    '<div class="watch-item">' + escapeHtml(t) + ' <button class="watch-remove" data-tag="' + escapeHtml(t) + '" aria-label="移除">\u00d7</button></div>'
  ).join("");
  list.querySelectorAll(".watch-remove").forEach(btn => {
    btn.addEventListener("click", () => removeWatch(btn.dataset.tag));
  });
}

function renderTrends() {
  const cats = {};
  state.articles.forEach(a => { const c = a.category||"其他"; cats[c] = (cats[c]||0) + 1; });
  const sorted = Object.entries(cats).sort((a,b) => b[1]-a[1]).slice(0,5);
  document.getElementById("trend-list").innerHTML = sorted.map(([c,n]) =>
    '<div class="trend-item"><span class="count">' + n + '</span> ' + escapeHtml(c) + '</div>'
  ).join("") || '<div class="trend-item">暂无数据</div>';
}

function renderSaved() {
  document.getElementById("saved-count").textContent = state.saved.size;
  const list = document.getElementById("saved-list");
  if (!state.saved.size) { list.innerHTML = '<span style="font-size:0.82rem;color:var(--c-text-muted)">暂无收藏</span>'; return; }
  const savedArticles = state.articles.filter(a => state.saved.has(a.id)).slice(0,5);
  list.innerHTML = savedArticles.map(a =>
    '<div style="font-size:0.8rem;padding:4px 0;cursor:pointer" data-id="' + a.id + '">' + escapeHtml((a.titleZh||a.title||"").slice(0,36)) + '</div>'
  ).join("");
  list.querySelectorAll("[data-id]").forEach(el => {
    el.addEventListener("click", () => showDialog(el.dataset.id));
  });
}

// ===== Dialog =====
function showDialog(id) {
  const article = state.articles.find(x => x.id === id);
  if (!article) return;
  const overlay = document.getElementById("dialog-overlay");
  const displayTitle = article.titleZh || article.title;
  document.getElementById("dialog-title").textContent = displayTitle;

  // Reliability
  const reliability = article.reliability;
  const relScore = typeof reliability === "number" ? reliability : (reliability?.score || 50);
  const relGrade = reliability?.grade || (relScore >= 80 ? "A" : relScore >= 60 ? "B" : relScore >= 40 ? "C" : "D");
  const relLabel = reliability?.label || (relScore >= 80 ? "高可靠" : relScore >= 60 ? "待核验" : "低可靠");
  const relFactors = reliability?.factors || [];
  const relLimitations = reliability?.limitations || [];

  const linkLabel = article.linkType === "aggregator" ? "聚合跳转" : "发布方原文";

  document.getElementById("dialog-body").innerHTML = `
    <article class="dialog-article">
      <div class="dialog-meta">
        <span>${escapeHtml(article.region||"未标注")}</span>
        <span>·</span>
        <time datetime="${escapeHtml(article.publishedAt)}">${formatDate(article.publishedAt)}</time>
        <span>·</span>
        <span>${article.readingMinutes || 4} 分钟阅读</span>
      </div>
      <div class="provenance-row">
        <span><i data-lucide="shield-check"></i> 来源可追溯</span>
        <span>${escapeHtml(article.sourceChannel || article.source || "网络公开来源")}</span>
        <span>${escapeHtml(linkLabel)}</span>
        ${article.aiAnalysis?.provider ? `<span>${escapeHtml(article.aiAnalysis.provider)} AI 摘要</span>` : ""}
      </div>

      ${renderPaperMetadata(article)}

      <div class="dialog-summary">${escapeHtml(article.summary||article.snippet||"暂无摘要")}</div>

      ${renderPaperDetails(article)}
      ${renderIndustryDetails(article)}

      <section class="reliability-section">
        <div class="reliability-heading">
          <div>
            <h3>可靠度评估</h3>
            <p>评估来源、证据与可追溯性，不代表结论已经证实。</p>
          </div>
          <div class="reliability-score grade-${escapeHtml(relGrade.toLowerCase())}">
            <strong>${relScore}</strong>
            <span>${escapeHtml(relGrade)} · ${escapeHtml(relLabel)}</span>
          </div>
        </div>
        <div class="reliability-reasons">
          ${relFactors.map((item) => `<span class="positive"><i data-lucide="check"></i>${escapeHtml(item)}</span>`).join("")}
          ${relLimitations.map((item) => `<span class="limitation"><i data-lucide="triangle-alert"></i>${escapeHtml(item)}</span>`).join("")}
        </div>
      </section>

      ${(article.keyPoints || []).length ? `
      <h3><i data-lucide="list-checks"></i> 关键信息</h3>
      <ol class="key-points">
        ${(article.keyPoints || []).map((point, index) => `<li><span>${index + 1}</span><div>${escapeHtml(point)}</div></li>`).join("")}
      </ol>` : ""}

      ${article.engineeringImpact ? `
      <h3><i data-lucide="lightbulb"></i> 工程启示</h3>
      <div class="impact-box">${escapeHtml(article.engineeringImpact)}</div>` : ""}

      <div class="tag-list" style="margin-top: 18px">
        ${(article.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
      </div>

      <div class="dialog-actions">
        <a class="primary-button" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">
          <i data-lucide="external-link"></i> 阅读原文
        </a>
        <button class="quiet-button" type="button" data-dialog-action="save" data-id="${escapeHtml(article.id)}">
          <i data-lucide="${state.saved.has(article.id) ? "bookmark-check" : "bookmark"}"></i>
          ${state.saved.has(article.id) ? "已收藏" : "收藏"}
        </button>
        <button class="quiet-button" type="button" data-dialog-action="share" data-id="${escapeHtml(article.id)}">
          <i data-lucide="share-2"></i> 分享
        </button>
      </div>

      <div class="dialog-source">
        <span>${escapeHtml(article.source)} · ${escapeHtml(article.sourceType||"行业资讯")}</span>
        <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener">${escapeHtml((article.url||"").slice(0,80))}</a>
      </div>
    </article>`;

  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  renderIcons();

  // Bind dialog buttons
  overlay.querySelectorAll("[data-dialog-action='save']").forEach(btn => {
    btn.addEventListener("click", () => { toggleSave(btn.dataset.id); showDialog(btn.dataset.id); });
  });
  overlay.querySelectorAll("[data-dialog-action='share']").forEach(btn => {
    btn.addEventListener("click", () => shareArticle(btn.dataset.id));
  });
}

document.getElementById("dialog-close").addEventListener("click", () => {
  document.getElementById("dialog-overlay").hidden = true;
  document.body.style.overflow = "";
});
document.getElementById("dialog-overlay").addEventListener("click", e => {
  if (e.target === e.currentTarget) {
    document.getElementById("dialog-overlay").hidden = true;
    document.body.style.overflow = "";
  }
});

// ===== Actions =====
function toggleSave(id) {
  if (state.saved.has(id)) state.saved.delete(id); else state.saved.add(id);
  writeStorage("mech-intel-saved", [...state.saved]);
  renderFeed(); renderSaved(); renderIcons();
  showToast(state.saved.has(id) ? "已收藏" : "已取消收藏");
}

function shareArticle(id) {
  const a = state.articles.find(x => x.id === id);
  if (!a) return;
  const text = (a.titleZh||a.title||"") + " " + (a.url||"");
  if (navigator.share) {
    navigator.share({ title: a.titleZh||a.title||"", text: (a.summary||"").slice(0,120), url: a.url }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text).then(() => showToast("链接已复制")).catch(() => showToast("复制失败"));
  }
}

function addWatch(tag) {
  tag = tag.trim();
  if (!tag || state.watchlist.includes(tag)) return;
  state.watchlist.push(tag);
  writeStorage("mech-intel-watchlist", state.watchlist);
  renderWatchlist();
}

function removeWatch(tag) {
  state.watchlist = state.watchlist.filter(t => t !== tag);
  writeStorage("mech-intel-watchlist", state.watchlist);
  renderWatchlist();
}

// ===== Events =====
document.getElementById("search-input").addEventListener("input", e => {
  state.query = e.target.value;
  document.getElementById("clear-search").hidden = !state.query;
  renderFeed();
});
document.getElementById("clear-search").addEventListener("click", () => {
  document.getElementById("search-input").value = "";
  state.query = "";
  document.getElementById("clear-search").hidden = true;
  renderFeed();
  document.getElementById("search-input").focus();
});

document.addEventListener("keydown", e => {
  if ((e.ctrlKey||e.metaKey) && e.key === "k") {
    e.preventDefault();
    document.getElementById("search-input").focus();
  }
  if (e.key === "Escape") {
    if (!document.getElementById("dialog-overlay").hidden) {
      document.getElementById("dialog-overlay").hidden = true;
      document.body.style.overflow = "";
    }
  }
});

document.getElementById("category-tabs").addEventListener("click", e => {
  const btn = e.target.closest(".category-tab");
  if (!btn) return;
  state.category = btn.dataset.category;
  renderAll();
});

document.getElementById("sort-select").addEventListener("change", e => {
  state.sort = e.target.value;
  renderFeed();
});

document.getElementById("watch-form").addEventListener("submit", e => {
  e.preventDefault();
  const input = document.getElementById("watch-input");
  addWatch(input.value);
  input.value = "";
});

document.getElementById("share-app").addEventListener("click", () => {
  const url = window.location.href;
  if (navigator.share) { navigator.share({ title: document.title, url }).catch(() => {}); }
  else { navigator.clipboard?.writeText(url).then(() => showToast("链接已复制")).catch(() => {}); }
});

// ===== PWA =====
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

// ===== Init =====
loadData();
