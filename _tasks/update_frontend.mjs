import { readFile, writeFile } from "node:fs/promises";

// === 1. Update index.html tabs ===
let html = await readFile("./public/index.html", "utf8");

const oldTabs = `<nav class="category-tabs" id="category-tabs" aria-label="资料分类">
          <button class="category-tab active" type="button" data-category="全部">全部</button>
          <button class="category-tab" type="button" data-category="风电动态">风电动态</button>
          <button class="category-tab" type="button" data-category="AI动态">AI动态</button>
          <button class="category-tab" type="button" data-category="学术研究">学术研究</button>
        </nav>`;

const newTabs = `<nav class="category-tabs" id="category-tabs" aria-label="资料分类">
          <button class="category-tab active" type="button" data-category="全部">全部</button>
          <button class="category-tab" type="button" data-category="风电动态">风电动态</button>
          <button class="category-tab" type="button" data-category="金属材料">金属材料</button>
          <button class="category-tab" type="button" data-category="风机噪声">风机噪声</button>
          <button class="category-tab" type="button" data-category="风电试验">风电试验</button>
          <button class="category-tab" type="button" data-category="风电螺栓">风电螺栓</button>
        </nav>`;

if (html.includes(oldTabs)) {
  html = html.replace(oldTabs, newTabs);
  console.log("Tabs updated");
}

// Update page description
html = html.replace(
  "风电装备 · 仿真 · AI · 噪声 · 气动",
  "金属材料 · 风机噪声 · 风电试验 · 风电螺栓"
);
html = html.replace(
  "疲劳断裂 · 风机噪声 · 气动布局 · AI动态 · 风电动态",
  "金属材料 · 风机噪声 · 风电试验 · 风电螺栓 · 风电动态"
);

await writeFile("./public/index.html", html, "utf8");

// === 2. Update app.js summary text ===
let app = await readFile("./public/app.js", "utf8");
app = app.replace(
  "数据覆盖疲劳断裂仿真、风机噪声、风机气动布局、AI发展动态与风电行业动态五个主题",
  "数据覆盖金属材料、风机噪声、风电试验、风电螺栓与风电行业动态五个技术方向"
);

await writeFile("./public/app.js", app, "utf8");
console.log("Frontend updated");
