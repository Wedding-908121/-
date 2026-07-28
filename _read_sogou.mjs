// Read Sogou HTML saved from previous test
const fs = await import("node:fs");
let html = fs.readFileSync("./sogou_test.html", "utf8").catch(() => "");

// If no file, fetch fresh
if (!html) {
  const http = await import("node:http");
  const https = await import("node:https");
  
  html = await new Promise((resolve) => {
    const req = http.request({
      host: "127.0.0.1", port: 7890, method: "CONNECT",
      path: "weixin.sogou.com:443",
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    req.setTimeout(10000, () => { req.destroy(); resolve(""); });
    req.on("connect", (res, socket) => {
      const hReq = https.request({
        host: "weixin.sogou.com", path: "/weixin?type=2&query=" + encodeURIComponent("风电 试验") + "&ie=utf8",
        method: "GET", socket, agent: false,
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" }
      }, (hRes) => {
        let body = ""; hRes.on("data", c => body += c);
        hRes.on("end", () => resolve(body));
      });
      hReq.setTimeout(10000, () => { hReq.destroy(); resolve(""); });
      hReq.on("error", () => resolve(""));
      hReq.end();
    });
    req.on("error", () => resolve(""));
    req.end();
  });
  fs.writeFileSync("./sogou_test.html", html, "utf8");
}

// Find JS objects with article data
const patterns = [
  /var\s+msgList\s*=\s*(\{.*?\});/s,
  /var\s+items\s*=\s*(\[.*?\]);/s,
  /"url":"(https?:\/\/mp\.weixin\.qq\.com[^"]+)"/g,
  /data-url="([^"]+)"/g,
  /href="(\/link\?url=[^"]+)"/g
];

for (const p of patterns) {
  const matches = [...html.matchAll(p)];
  if (matches.length > 0) {
    console.log("Pattern found:", matches.length, "matches");
    matches.slice(0, 3).forEach(m => console.log("  " + (m[1] || m[0]).substring(0, 100)));
  }
}

// Search for "mp.weixin" in any context
const wxIdx = html.indexOf("mp.weixin");
if (wxIdx > 0) {
  console.log("\nFound mp.weixin at", wxIdx, ":", html.substring(wxIdx-20, wxIdx+100));
} else {
  console.log("\nNo mp.weixin found anywhere in the HTML");
}

// Check if there's an AJAX URL pattern
const ajaxPatterns = [/url:\s*['"]([^'"]+)['"]/, /ajax_url\s*=\s*['"]([^'"]+)['"]/];
for (const p of ajaxPatterns) {
  const m = html.match(p);
  if (m) console.log("AJAX URL found:", m[1]);
}