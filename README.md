# product-prototype-generation

Agent skill：**从产品想法到可交互原型**——PRD（或自由文档 / 截图整理稿）→ 高保真 HTML + Tailwind 原型（移动端 / PC 端）。

> `SKILL.md` 是唯一入口（frontmatter `name` / `description` 供 opencode、Claude 等宿主识别触发）。细则在 `references/`，按需读，正文不重抄。

## 能力

- **零提问直出 PRD**，或让用户确认平台后生成；支持 `--from=<doc.md>` 吃自由格式 Markdown（未登记页名进假设清单，不污染页集）。
- **截图 / 设计稿**：先按 `templates/design-spec.md` 整理成 md（只写看得见的五项），再走同一条 `--from=` 通道，不另造输入路径。
- **双端页集**：移动端 10 页 / 桌面端 13 页，与模板目录同源；选了不支持的页会跳过并留痕（`report.skippedPages`）。
- **可选主题**（`--theme`）：色彩 + 字体配对，三个消费点（配色 / 内联配置与标题字体 / 降级占位图）一次贯穿。
- **质量闸门**：`verify-prototype.js`（中文占比、死链、语义化、设备几何…）+ `generation-report.json`（含 `capabilities`、`skippedPages`、`assumptions` 等）。

## 结构

```
SKILL.md              # 入口：流程、硬约束、目录契约
references/           # 细则：设计令牌 / 需求导入 / 自检闸门 / golden 重冻 / 设备 / 播报 / 文案域
scripts/              # generate-prd / generate-prototype / verify-prototype / selfcheck / harness
utils/                # 配色、Tailwind 内联配置、解析器、浏览器执行器、预检
templates/            # PRD 模板、截图整理模板、确认表单
themes/               # 主题注册表（只引用色板与字体栈名）
mobile-template/      # 移动端 Eta 模板（含 pages/*.eta）
desktop-template/     # 桌面端 Eta 模板
fixtures/             # PRD 与 golden 三维基线（文本 / 属性 / class）
evals/                # 能力级 eval（`npm run eval`），报告不进库
docs/visual/          # 渲染留档（人工比对用，非测试基线）
```

## 安装

```bash
git clone https://github.com/liaochzh/product-prototype-generation-skill.git \
  ~/Projects/product-prototype-generation-skill
ln -s ~/Projects/product-prototype-generation-skill \
  ~/.config/opencode/skills/product-prototype-generation
cd ~/Projects/product-prototype-generation-skill && npm install
```

也可以把仓库直接放在宿主的 skills 目录下，不建软链。

## 依赖

- Node.js 18+（生成链路无第三方运行时依赖；`npm install` 只装 `playwright-core` 供浏览器层 harness 用）
- 可选：本机 Chrome/Chromium（浏览器层 harness 找不到时会**明确跳过并返回 0**，不会假绿）
- 可选：图片依赖 Unsplash 稳定池或 `text-generate-image` MCP；不可用时降级为 SVG 占位并在 `capabilities` 里留痕

## 验证

```bash
node scripts/selfcheck.js            # 全链路回归（50 个场景块）+ 多 fixture golden 三维零回归
node scripts/selfcheck.js --browser  # 追加四个浏览器 harness（需本机 Chrome）
node scripts/eval-runner.js          # 能力级 eval（客观断言）
node scripts/freeze-golden.js        # golden 干跑（改动产物后先干跑，再决定是否 --write）
```

改动生成链路、模板或词典后必须跑 `selfcheck`。

## 文档说明

`docs/visual/` 随仓库发布（人工比对用的渲染留档）。`docs/plan`、`docs/review`、`docs/baton` 是本项目的
本地工作文档（方案、审查报告、接力棒），**按 `.gitignore` 不发布**——它们含本地路径与门禁内部细节。

## License

MIT（见 `LICENSE`）。
