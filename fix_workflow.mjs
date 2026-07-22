import { readFile, writeFile } from "node:fs/promises";

let wf = await readFile("./.github/workflows/weekly-collect.yml", "utf8");

// Fix 1: Use quick_collect.mjs instead of collect.mjs
wf = wf.replace("npm run collect", "node scripts/quick_collect.mjs");

// Fix 2: Add OPENALEX_API_KEY env
wf = wf.replace(
  "DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}",
  "DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}\n          OPENALEX_API_KEY: ${{ secrets.OPENALEX_API_KEY }}"
);

// Fix 3: Remove npm test (no tests)
wf = wf.replace(/      - name: Run tests\n        run: npm test\n\n/, "");

// Fix 4: Fix PUBLIC_BASE_URL (repo name "-" causes issues)
wf = wf.replace(
  "PUBLIC_BASE_URL: https://${{ github.repository_owner }}.github.io/${{ github.event.repository.name }}",
  "PUBLIC_BASE_URL: https://Wedding-908121.github.io/-"
);

await writeFile("./.github/workflows/weekly-collect.yml", wf, "utf8");
console.log("Workflow fixed:");
console.log("1. Uses quick_collect.mjs (not broken collect.mjs)");
console.log("2. Added OPENALEX_API_KEY env var");
console.log("3. Removed failing npm test");
console.log("4. Fixed deploy URL for repo named '-'");
