// Add 结构AI tab to index.html
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const htmlPath = join(root, 'public', 'index.html');
let html = readFileSync(htmlPath, 'utf8');

// Find the tabs section and add 结构AI
const search = 'data-category=\"金属材料\">金属材料<';
const replace = 'data-category=\"结构AI\">结构AI</button>\n          <button class=\"category-tab\" type=\"button\" data-category=\"金属材料\">金属材料<';

if (html.includes('data-category=\"结构AI\"')) {
  console.log('结构AI tab already exists!');
} else if (html.includes(search)) {
  html = html.replace(search, replace);
  writeFileSync(htmlPath, html, 'utf8');
  console.log('Added 结构AI tab ✓');
} else {
  console.log('Search string not found');
}
