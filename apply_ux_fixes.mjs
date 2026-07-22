import { readFile, writeFile } from "node:fs/promises";

// === 1. Fix index.html ===
let html = await readFile("./public/index.html", "utf8");

// Change title
html = html.replaceAll("机械共性部门情报中心", "机械共性部情报中心");

// Remove desktop filter button
html = html.replace(
  '<button class="filter-button desktop-only" id="open-filters" type="button">\n            <i data-lucide="sliders-horizontal"></i>\n            筛选\n            <span class="filter-count" id="filter-count" hidden>0</span>\n          </button>',
  ""
);

await writeFile("./public/index.html", html, "utf8");
console.log("index.html: title + filter removed");

// === 2. Fix app.js ===
let app = await readFile("./public/app.js", "utf8");

// Fix brief-period: split into two lines
// Current: "本周情报简报（2026.07.13-2026.07.20 第29周）"
// New: "本周情报简报" + separate date line
app = app.replace(
  '"本周情报简报（2026.07.13-2026.07.20 第29周）"',
  '"本周情报简报"'
);

// Add week range as a separate element after brief-period
// Find where brief-period is set and add the week range
const periodLine = 'document.getElementById("brief-period").textContent = "本周情报简报";';
const newPeriodLine = `document.getElementById("brief-period").textContent = "本周情报简报";
  document.getElementById("brief-period").insertAdjacentHTML("afterend", '<span class="brief-week-range">2026.07.13-2026.07.20 第29周</span>');`;

if (app.includes(periodLine)) {
  app = app.replace(periodLine, newPeriodLine);
  console.log("app.js: period split into 2 lines");
}

// Fix brief-summary
app = app.replace(
  '"覆盖疲劳断裂仿真、风机噪声、风机气动布局、AI发展动态与风电行业动态"',
  '"数据覆盖疲劳断裂仿真、风机噪声、风机气动布局、AI发展动态与风电行业动态五个主题"'
);
console.log("app.js: summary text updated");

await writeFile("./public/app.js", app, "utf8");
console.log("app.js updated");

// === 3. Add CSS for the week range line ===
let css = await readFile("./public/styles.css", "utf8");
const cssAddition = `
.brief-week-range {
  display: block;
  font-size: 0.82rem;
  color: var(--c-text-muted);
  margin-top: 2px;
}`;
css += cssAddition;
await writeFile("./public/styles.css", css, "utf8");
console.log("styles.css: week range style added");

console.log("\nAll 4 changes done!");
