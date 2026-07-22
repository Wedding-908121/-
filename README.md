# 机械共性情报

面向机械共性部门的每周行业情报 PWA — 覆盖风电装备、疲劳断裂仿真、AI辅助建模、风机噪声与气动布局研究。

## 研究方向

- **风电行业动态** — 国内外风电项目、整机厂商、供应链进展
- **疲劳/断裂仿真** — 疲劳寿命预测、裂纹扩展、损伤容限、有限元仿真
- **AI辅助建模** — 机器学习/深度学习在工程仿真中的应用、数字孪生、代理模型
- **风机噪声研究** — 气动声学、噪声预测与降噪、NVH
- **风机气动布局研究** — 叶片设计、翼型优化、CFD分析、气弹耦合

## 快速开始

```powershell
# 安装依赖
pnpm install

# 本地预览（需要先生成数据或使用演示数据）
node server.mjs
# 打开 http://localhost:4173

# 采集数据（仅联网检索，不写入文件）
node scripts/collect.mjs --dry-run

# 正式采集 + AI 摘要（需配置 DeepSeek API Key）
$env:AI_PROVIDER="deepseek"
$env:DEEPSEEK_API_KEY="sk-xxx"
$env:DEEPSEEK_MODEL="deepseek-chat"
node scripts/collect.mjs
```

## 数据源

| 数据源 | 说明 |
|--------|------|
| Bing News | 国内外新闻检索，国内可直连 |
| OpenAlex | 学术论文开放索引 |

全部数据源在国内均可正常访问，无需翻墙。

## 项目结构

```
├── config/sources.json      # 数据源配置与关键词
├── scripts/
│   ├── collect.mjs          # 采集引擎
│   ├── build.mjs            # 构建部署包
│   └── lib/
│       ├── ai.mjs           # AI 摘要模块
│       └── articles.mjs     # 文章处理工具
├── public/
│   ├── index.html           # PWA 页面
│   ├── app.js               # 前端交互
│   ├── styles.css           # 50元人民币配色
│   └── data/articles.json   # 情报数据文件
├── server.mjs               # 本地开发服务器
└── .github/workflows/       # 自动采集部署
```

## 部署

1. 将项目推送到 GitHub 仓库
2. 在仓库 Settings → Secrets 中配置 `DEEPSEEK_API_KEY`
3. 启用 GitHub Pages（Source: GitHub Actions）
4. 每周一 08:30 自动采集并发布
