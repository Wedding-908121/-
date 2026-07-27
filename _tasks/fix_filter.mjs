import { readFile, writeFile } from "node:fs/promises";

let content = await readFile("./scripts/lib/articles.mjs", "utf8");

// Find windAnchors and expand them significantly
const oldAnchors = `const windAnchors = ["风电", "风力发电", "风机", "风电场", "风电机组", "风电叶片",
    "wind turbine", "wind power", "wind energy", "wind farm", "offshore wind", "wind turbine blade"];`;

const newAnchors = `const windAnchors = [
    // Direct wind terms
    "风电", "风力发电", "风机", "风电场", "风电机组", "风电叶片",
    "wind turbine", "wind power", "wind energy", "wind farm", "offshore wind", "wind turbine blade",
    // Wind infrastructure (often without explicit "wind" in title)
    "monopile", "offshore structure", "renewable energy", "turbine blade", "turbine tower",
    // Wind-specific contexts
    "aeroelastic", "aerodynamic load", "wake effect", "wind load", "wind-induced",
    "offshore foundation", "wind resource", "wind tunnel", "wind speed",
    // Chinese wind infrastructure
    "海上风机", "漂浮式", "塔筒", "机舱", "叶根", "变桨", "偏航"
  ];`;

if (content.includes(oldAnchors)) {
  content = content.replace(oldAnchors, newAnchors);
  console.log("Wind anchors expanded");
}

// Also expand relaxed terms for each topic
const oldRelaxedTerms = `const relaxedTerms = ["noise", "acoustic", "aeroacoustic", "sound", "vibration", 
          "bolt", "fastener", "flange", "connection", "tension", "preload", 
          "fatigue", "fracture", "crack", "aerodynamic", "blade", "airfoil", "CFD", "wake",
          "噪声", "声学", "振动", "螺栓", "紧固件", "法兰", "连接", "预紧",
          "疲劳", "断裂", "裂纹", "气动", "叶片", "翼型"];`;

const newRelaxedTerms = `const relaxedTerms = [
          // Noise
          "noise", "acoustic", "aeroacoustic", "sound", "vibration", "noise reduction", "sound power",
          "噪声", "声学", "振动", "降噪", "声压",
          // Bolt
          "bolt", "fastener", "flange", "connection", "tension", "preload", "bolted", "tightening",
          "螺栓", "紧固件", "法兰", "连接", "预紧", "拧紧", "防松",
          // Fatigue / metal
          "fatigue", "fracture", "crack", "corrosion", "steel", "alloy", "weld", "casting", "coating", "S-N",
          "疲劳", "断裂", "裂纹", "腐蚀", "钢", "合金", "焊接", "铸造",
          // Testing
          "experimental", "field test", "full-scale", "monitoring", "inspection", "structural health", "SHM", "NDT",
          "试验", "测试", "检测", "监测", "全尺寸",
          // Aero
          "aerodynamic", "blade", "airfoil", "CFD", "wake", "turbine", "rotor",
          "气动", "叶片", "翼型", "叶轮",
          // Wind infrastructure (catch-all for wind context)
          "monopile", "offshore", "renewable", "turbine",
          "海上", "漂浮式", "塔筒", "机舱"
        ];`;

if (content.includes(oldRelaxedTerms)) {
  content = content.replace(oldRelaxedTerms, newRelaxedTerms);
  console.log("Relaxed terms expanded");
} else {
  console.log("Could not find old relaxed terms, checking...");
  const idx = content.indexOf("relaxedTerms");
  if (idx >= 0) console.log(content.substring(idx, idx + 300));
}

await writeFile("./scripts/lib/articles.mjs", content, "utf8");
console.log("\narticles.mjs updated");
