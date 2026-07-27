import { readFile, writeFile } from "node:fs/promises";

let html = await readFile("./public/index.html", "utf8");

// Replace tabs by position - find the nav tag
const navStart = html.indexOf('<nav class="category-tabs"');
const navEnd = html.indexOf('</nav>', navStart) + 6;

const newNav = `<nav class="category-tabs" id="category-tabs" aria-label="资料分类">
          <button class="category-tab active" type="button" data-category="全部">全部</button>
          <button class="category-tab" type="button" data-category="风电动态">风电动态</button>
          <button class="category-tab" type="button" data-category="金属材料">金属材料</button>
          <button class="category-tab" type="button" data-category="风机噪声">风机噪声</button>
          <button class="category-tab" type="button" data-category="风电试验">风电试验</button>
          <button class="category-tab" type="button" data-category="风电螺栓">风电螺栓</button>
        </nav>`;

html = html.substring(0, navStart) + newNav + html.substring(navEnd);

// Update hero description text
html = html.replace(
  /<small>.*?<\/small>/,
  "<small>金属材料 · 风机噪声 · 风电试验 · 风电螺栓</small>"
);

await writeFile("./public/index.html", html, "utf8");
console.log("Tabs updated: 全部 | 风电动态 | 金属材料 | 风机噪声 | 风电试验 | 风电螺栓");

// Verify
const verify = await readFile("./public/index.html", "utf8");
const matches = verify.match(/data-category="([^"]+)"/g);
console.log("Verification:", matches ? matches.join(", ") : "FAILED");
