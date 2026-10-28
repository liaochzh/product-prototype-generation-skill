---
name: product-prototype-generation
description: 从产品需求到可交互原型的完整工作流。当用户表达产品想法（如'我想做一个...'、'帮我设计...'）时触发。支持：1) 零提问直出PRD 2) 平台选择确认 3) 生成Awwwards级别的高保真HTML/Tailwind原型（移动端/PC端）。端到端产品设计流程。仅做「产品想法→PRD→原型」全流程；不用于纯视觉重塑/美化现有 UI（Web 用 frontend-design、App 用 app-design）、不用于深度产品咨询/竞品/数据分析（用 product-manager）、不用于无障碍专项审计（用 accessibility）。
compatibility: 需 Node.js 18+；浏览器层 harness 需本机 Chrome（缺失则明确跳过并返回 0）；图片依赖 Unsplash 稳定池或 text-generate-image MCP。
metadata:
  version: "2026.10.27"
  updated: "2026-10-27"
---

# PRD to Prototype — 从想法到可交互原型

> 下文 `<S>` 指本 skill 的 base directory（加载时由系统给出绝对路径）；`<WORKSPACE>` 指目标项目根目录（由 `WORKSPACE` 环境变量指定，默认当前工作目录）。
> **渐进披露**：本文件只放「结论 + 何时读哪份」。要动手改模板/词典/生成链路/基线时，按各节指针读 `references/` 对应文件（一层深，不再二次跳转）。

## 触发条件
- 用户表达产品想法、需求、痛点或创意，例如：“我想做一个商城”“帮我设计一个二手书APP”。
- 关键词：原型、PRD、产品设计、高保真、可交互、移动端原型、PC端原型。
- **边界**：仅做「产品想法→PRD→原型」全流程。纯视觉层重塑/美化现有页面用 `frontend-design`（Web）/ `app-design`（App）；深度产品咨询/竞品/数据分析/路线图用 `product-manager`。同一需求不要混用。

## ⚠️ 核心铁律
1. 禁止提问：无论需求多模糊，绝不在生成PRD前询问。
2. 直接脑补：基于行业标准自动补全细节，直出完整PRD。
3. 强制两步：先PRD，再原型。绝不跳过PRD。

## Workflow

### 🟢 第一阶段：直出PRD与交互流程
执行：`node <S>/scripts/generate-prd.js "<用户原话>"` ｜ `node <S>/scripts/generate-prd.js --from=<需求文档.md>`
- 意图识别走 `utils/prompt-engine.js`（电商/SaaS/工具/社区/内容/通用）。
- 优先LLM（`tryLLM`预留`@opencode-ai/plugin`调用点），不可用自动降级规则引擎。
- **已有需求文档**（Markdown）用 `--from=<path>`（**只支持等号式**，按进程 cwd 解析；不可与原话同时给）：页面只从「页面 / 页面清单 / 核心页面」小节取，业务词按 `PAGE_ALIASES` 收敛到双端交集 10 页，未登记/桌面专属页**只记假设、不进页集**；**解析出 0 页即 exit 1**（不回退默认页集）。规则见 `references/input-docs.md`。
- **只有截图/设计稿**时：先按 `templates/design-spec.md` 整理成一份 md（**只写看得见的五项**：平台、品牌色、页集（独立页面）、流程、功能；像素/字号/圆角不写，写了也不生效；注释块会被自动剥掉），再用 `--from=` 走同一条通道。不要为一张图另造输入路径。
- 输出写入 `<WORKSPACE>/docs/prd.md`，写入前过敏感词与XSS转义；文档导入时缺口假设另存 `<WORKSPACE>/docs/prd-assumptions.json`（本脚本独占写），并在 PRD 的页面清单末尾以 `> [假设]` 标出**被丢弃的页名**、终端逐条打印。
- 生成后立即展示 `templates/confirmation-form.md`（替换`{{prdPath}}`），格式严格一致。

GenUI确认模板（必须原样）：
见 `templates/confirmation-form.md`。用户回复映射：
- “确认移动端”/“确认PC端”→进入第二阶段；
- “修改: …”→按意见改PRD后重展表单；
- “重写”→重新生成PRD后重展表单。

### 🔵 第二阶段：原型设计与生成
执行：`node <S>/scripts/generate-prototype.js --platform mobile|desktop [--page home,list] [--clean] [--device <key>] [--aspect phone|pane|wide] [--device-width N --device-height N] [--crease v-1@50:24] [--theme <key>]`
（**护栏**：`WORKSPACE` 必须指向调用方自己的工作区（`WORKSPACE=$(mktemp -d)`）——若落在 skill 目录内，入口**直接报错退出 1**，避免把 `prototype/` 写在模板/基线旁边污染 skill 与快照。）
（设备参数仅对 mobile 生效，详见「多设备适配」；`--theme` 见「设计系统 → 可选主题」）
0. **AI 生图（≤6 张）**：读 PRD 确定氛围位（hero / 空态插画）与**图片列表页**（discover / list / detail）的内容图，调 `text-generate-image` MCP 的 `bailian_image_gen({ prompt, size, n })` 生成，存 `<WORKSPACE>/assets/<role>.webp`。**命名必须匹配 `<page>` 或 `<page>-<n>`**（如 `discover-1.webp`…`discover-6.webp`、`hero.webp`）——脚本按页名优先命中本地文件，未命中才降级 Unsplash 稳定池。并登记 manifest（见「资源与技术规范」）。
1. 读PRD→`utils/prd-parser.js`解析（产品名/类型/页面/流程/功能/非功能）。
2. `utils/color-scheme.js`+`utils/tailwind-config.js`生成配色与Tailwind主题。
3. `utils/unsplash.js`取图：**本地资产优先**（`<WORKSPACE>/assets/` 按 `<role>.ext` 或 `<role>-<n>.ext` 命名）→ 缺失降级 Unsplash 备用池 → 再降级 SVG 占位。
4. `utils/eta-renderer.js`渲染`mobile-template/`或`desktop-template/`到`<WORKSPACE>/prototype/`（`index.html`为入口，子页在`pages/`）。
5. 跑`node <S>/scripts/verify-prototype.js`做质量自检；双重交付：原型路径+PRD路径。

## 文案域（copy domain）

原型的**所有可见文案与 4 类交互属性（`placeholder`/`aria-label`/`title`/`alt`）必须来自文案包**，不得在 `.eta` 模板里硬编码领域词。

- 词典 `utils/copy-lexicon.js`（6 类型，`COPY_LEXICON.other` 是规范载体，新槽位先加 `other`）→ 逻辑 `utils/copy-domain.js`（`buildCopyPack` 组装 / `assertCopyDomain` 闸门）→ 模板取词 `<%= it.copy.<group>.<slot> %>`（`autoEscape:true`，**不要再包 `it.esc()`**；`<%~ %>` 仅限白名单 `head/signature/brandMark/pageContent/tabbar`）。
- 闸门由 `verify-prototype.js` 对全部产物执行，跨类型词泄漏即 **fail**（计入 `passed`）；合理例外走 `override.allowTerms`。
- **桌面专属差异一律放 `<page>.desktop.*` 子槽位**，与移动端共用同名槽位会打破 golden。
- 细节（词典形状、数组元素深校验、`desktop` 子槽位边界）见 `references/copy-domain.md`。

## 设计系统
- **单一事实来源**：所有设计令牌（色彩 / 字体 / 间距 / 圆角 / 阴影 / 模糊 / 断点 / 字阶比）定义在 `constants.js` 的 `DESIGN_TOKENS`，由 `utils/tailwind-config.js` 消费注入 Tailwind 主题。**改值只改 `constants.js`**，本文件不重抄数值。
- 消费规则（结论）：色彩/间距/圆角/阴影 **一律走令牌派生类**，禁止硬编码色号与任意值（`bg-blue-500`、`#3b82f6`、`text-[Npx]`、`rounded-[Npx]`）；排版走**语义角色类**而非裸 `text-*`；质感为多层柔和阴影 + 大圆角 + 毛玻璃；审美对标 Awwwards/Dribbble/Apple，拒绝系统蓝与 Bootstrap 风。
- **`micro`（11px）只服务微标签与图标尺寸**（眉标、徽标/计数、状态微标签、外壳状态栏图标）；**承载信息的交互标签一律 ≥ `xs`（12px）**。
- 角色表（`.page-title`/`.item-title`/`.meta`/`.eyebrow`… 双端档位）、圆角角色、组件类（`.card`/`.badge`/`.delta`…）、组件尺寸与边框统一值 → **`references/design-tokens.md`**。
- **可选主题（`--theme <key>`）**：`themes/index.js` 注册「色彩 + 字体配对」，**只引用** `constants.js` 的色板/字体栈名，不写值；**不给 `--theme` 时产物逐字节不变**（纯加法）。优先级：`brandColor` > 主题 > productType 预设（只覆盖 primary；accents/渐变随主题）。挑选前可跑 `node <S>/scripts/theme-showcase.js` 生成对照页；新增主题与边界（状态色恒定、字体回退）→ **`references/themes.md`**。
- **交互与状态播报（WCAG 4.1.3）**：切换类交互**纯 CSS 优先**（`radio` + `has-[:checked]`/`group-has-[#id:checked]/<group>`），脚本只做时间类。两条硬禁令：**live region 不得把 `hidden` 挂自身**（要常驻、用内层节点变化驱动）；**按钮上不得挂 `aria-live`**（倒计时会逐秒播报）。三形态接线与棘轮 → **`references/a11y-announce.md`**。

## 平台构建策略
- 移动端：**外壳与内容分离**——`layout-shell.eta` 渲染 `index.html`（设备外框+挖孔+状态栏+页面导航+`<iframe name="phone">`），`layout-page.eta` 渲染 `pages/*.html`（完整文档，底部 TabBar 由 `it.tabbar` 注入，全屏页 chat/detail/publish/login/register 自动隐藏）；按钮`active:scale-95`；卡片左右留边。外壳几何**全部由 `it.device` 驱动**（见「多设备适配」），不再硬编码机型尺寸。
- PC端：`desktop-template/layout.eta`为Sidebar+Header+Content，`max-w-7xl`居中；Hover上浮、Tooltip、表格行高亮。
- **两端可用页集**（自检钉死与模板目录同源，改模板必须同步本行）：移动端可用页（10）：`home/discover/list/detail/publish/chat/orders/profile/login/register`；桌面端可用页（13）= 移动端 10 页 + 桌面专属页（3）：`dashboard/form/settings`。PRD 页面清单写了桌面专属页却选移动端 ⇒ 生成器**跳过该页**并在 `report.skippedPages` 留痕（warn 同时给出 `--platform desktop` 出口与本平台可用页）；`saas`/`tool` 类型建议直接用桌面端。自由格式文档请走 `--from=`（其未登记词进假设清单）。

## 多设备适配
设备为**单一事实来源**：`constants.js` 的 `DEVICES`（13 款机型）+ `ASPECT_CLASSES`（档位）。外壳 `layout-shell.eta` 只消费 `it.device.*`，新增设备只需在 `DEVICES` 填一行。

- 关键结论：三个覆盖参数（`--device-width/height`、`--aspect`、`--crease`）**彼此独立**，缺省 `iphone16`；档位以**逻辑宽度为主判据**（`<600px` → `phone`，`≥600px` 且宽高比 `>1.30` → `wide`，其余 `pane`）；栏数由**竖**折痕派生（横折不计）；给了自定义尺寸时外壳文案必须**诚实标注**不谎报机型。
- 派生属性、折痕语法、数据来源等级标注、外壳几何契约（`layoutFail`/`creaseFail` 计入 `passed`）、13 款机型清单 → **`references/devices.md`**。

## 资源与技术规范
- 图片：**氛围类**（hero / 空态插画 / 品牌故事页）用 **AI 生成**——调 `text-generate-image` MCP 的 `bailian_image_gen`（走 Harness 权益，独立计量、不占 Credits）；**功能类**（头像 / 列表缩略图 / 装饰）用 Unsplash 或矢量。本地图命名契约：`<role>.ext`（`avatar` / `hero`）或 `<page>-<n>.ext`（列表内容图 `discover-1`…、`list-1`…、`detail-1`…），脚本按页名优先命中，避免稳定池重复。
- **单次原型 AI 生图上限 ≤6 张**（Pro 权益 50 张/月，勿单次吃光）：该上限为**单次总量**，优先投给配额最高的 1–2 个列表页（`discover`/`list`/`home`），勿按页均摊。
- AI 图存 `<WORKSPACE>/assets/<role>.webp` 或 `<role>-<n>.webp`（role ∈ home/detail/hero/avatar…）；脚本生成时自动复制到 `prototype/assets/` 并优先引用。
- **每张 AI 图必须登记** `<WORKSPACE>/docs/assets/ai-generated-manifest.md`（模板见哲学层 §贴图规范），由 **agent 写**，脚本不落盘。
- 降级：MCP 不可用或未生图 → 自动退回 Unsplash 备用池；**禁** `via.placeholder/placehold.it`；模板 `img` 带 `onerror` 兜底。
- 图标：lucide（CDN，模板内以 `data-lucide="<name>"` 声明）。**写错图标名不报错**——浏览器端静默渲染成空方块，且 `data-lucide` 不进 golden 三维；故图标名由 `selfcheck` 场景 30 对离线清单 `utils/lucide-icons.js` 校验（清单是上游 `lucide-static` 的确定性快照，用 `node <S>/scripts/update-lucide-icons.js` 刷新）。**图标名必须落在场景 30 扫得到的四处之一**：词典 `icon` 键 / `data-lucide="字面量"` / `data-lucide="…|| 'circle'"` 回退 / **变量名含 `icon` 的赋值语句内**（如 `const _icons = {home:'layout-dashboard',…}`、`const icon=bat>50?'battery-full':…`）——写在别处（如别的变量命名的映射）会绕过校验。
- 技术栈：纯HTML5+Tailwind CDN+Vanilla JS，禁React/Vue等编译框架。**CDN 为 Tailwind v3 Play CDN（`cdn.tailwindcss.com`，≥3.4）**——纯 CSS 交互依赖 v3.4+ 能力（`has-*` 变体、命名组 `group/<name>` 与 `group-has-[…]/<name>`）；切到 v4 的 `@tailwindcss/browser` 前需先验证这些变体写法仍成立。
- 语言：全简体中文，禁Lorem Ipsum与英文标题残留。
- 可访问性：语义化标签、iframe有title、交互有aria-label、图片懒加载。

## 目录契约
- `templates/`：`prd-template.md`、`design-spec.md`（截图/设计稿 → md，见第一阶段）、`confirmation-form.md`；`themes/`：可选主题注册表（`index.js`，仅引用色板/字体栈名）；`references/`：本 skill 的细则（设计令牌/主题/播报/设备/文案域/需求文档导入/自检/golden 重冻），仅在需要动手改时读。
- `mobile-template/`：`layout-shell.eta`（外壳，仅渲染 `index.html`）+ `layout-page.eta`（页面文档，渲染 `pages/*.html`，含 `it.tabbar` 插槽）；`desktop-template/`：`layout.eta`（每页为独立文档，首页落根目录 `index.html`）。页面插槽统一 `it.head/it.nav/it.pageContent/it.tabbar`；页面内相对链接**一律用 `it.link(name, ...fallbacks)` 生成**（页面集感知：按 `name→fallbacks` 取首个存在于 PRD 页面清单者；`home` 在桌面端返回根目录 `index.html`、移动端返回 `home.html`；导航类链接应传回退链如 `it.link('list','home')`；均不存在才 `#`）。
- 接口见`interfaces.js`（TemplateProvider）。`LLMClient`/`ImageProvider` **尚未实现**（规划项），新增平台只需实现 `TemplateProvider`。

## 跨页一致性与衔接（消费哲学层）
- **哲学层指针**：唯一权威源 = `~/.config/opencode/design-spec/references/ui-design-philosophy.md`（反面案例库 `design-spec/references/ui-design-anti-patterns.md`）；本文件只消费、不复制其条款。
- 骨架继承：所有页面共用外壳（移动端 `mobile-template/layout-shell.eta` + `layout-page.eta`；桌面端 `desktop-template/layout.eta`）；页内 `header`/`main`/`footer` 槽位高度与 gutter 只在模板定一次，页面插槽不得改结构。
- 跨页不变量：品牌标识、导航、页脚、主 CTA 同位同尺寸同顺序；导航当前态同位置同视觉。
- 衔接：外壳内切页走直切或交叉淡化；不引入路由库；不减失返回路径。
- 兼容：产物按哲学层 §兼容基线 的宽度矩阵抽样，未测项在交付说明写 N/A 与理由。
- **边界**：本轮只加规范，不改 `.eta` / `constants.js` / `fixtures/`；故无需 `selfcheck`，记 N/A 并写理由。模板层对齐与转场列二期。

## 原型生成规范条款（消费哲学层「交付闸门」）

App 记录项 5 条（**记录项**，非硬禁令，交付时自检回填）与 Web 淘汰闸门 11 项（无 Brief 依据时命中即淘汰）见哲学层 §交付闸门；本文件不重复。`PRD 即 Brief`。

## 质量自检

- `verify-prototype.js`：中文占比、Lorem/占位图、viewport、语义化、**死链**、未解析站内导航、**内联 Tailwind 配置可执行性**、**设备几何一致性**（`layoutFail`/`creaseFail` 计入 `passed`）；`generation-report.json` 随产物输出（含 `device`、`capabilities`、`skippedPages`（无模板而跳过的页，恒存在）、`truncatedPages`（超 10 页上限被截断的页，恒存在）、`unknownPages`（页面清单里未登记、已忽略的页名，恒存在），以及文档导入三字段 `prdSource`（`prd`/`doc`）、`assumptions`、`prdWarnings`）。
- `selfcheck.js`：全链路回归（51 个场景块）+ 多 fixture golden 三维零回归。**改动生成链路、模板或词典后必须跑**。
- 覆盖面清单（每个场景锁什么、页集↔fixture↔golden 规则、四个浏览器 harness 各自证明什么）→ **`references/selfcheck-gates.md`**。
- 浏览器层（需本机 Chrome，`selfcheck --browser`）：交互/播报/版式/字号实测。**版式塌（横向溢出、底部导航遮内容、文本截断、侧栏压主区）用 `scripts/verify-layout.js` 的几何断言兜住**——不建像素基线（那会改 `head` 并重冻 golden）。

**重冻 golden 的三档语义（判据，必须记住）**：
- **结构差异**（内联设计系统 config/插件源码等非 class 区域）→ `--write` 需 `--allow-structural`，未授权**退出码 2**（advisory）。
- **语义类重构**（`text-sm` → `.item-title` 这类 `SIZE_MAP` 解释不了的）→ 需 `--allow-class-refactor`，未授权**硬拒退出码 1**（干跑也拒）。
- **页集增删 / 文本变更** → 只能走 `--reinit --only <fixture>` + `--allow-pageset-change`；**授权前逐条判读审计报告：`[text]`/`[attrs]` 里出现非页集副作用的条目即为真回归，此时不要授权。**
- 完整 SOP、`--init/--reinit` 边界、`stripNoise` 的门禁盲区 → **`references/golden-freeze.md`**。

## 常见错误
- 生成PRD前提问；跳过PRD直做原型；用占位图；用编译框架；残留英文；用默认系统蓝；忘展示确认表单；PRD缺User Flows。
- **在模板里硬编码领域文案**（如把「包邮」「GMV」写进 `.eta`）——必须走 `it.copy.*`；确需放行时用 `override.allowTerms`，不要改模板。
- 把桌面/移动端差异塞进同名共享槽位——差异一律落 `<page>.desktop.*`。
- **用非 lucide 的图标名**（如 Material 的 `devices`）——浏览器端静默渲染成空方块，须过 `selfcheck` 场景 30（清单见 `utils/lucide-icons.js`）。
- **Tailwind `has-[#id…]` 变体漏写 `:checked`**（如 `group-has-[#login-mode-code]/login:block`）——退化成「元素存在即匹配」，变体无条件生效：页面**看起来仍正常**，但面板/状态恒死、切换全失效。全模板棘轮见 `selfcheck` 场景 31（凡 `has-[…]` 内容只由 id/class 选择器构成即判违规；`has-[:focus-visible]`、`has-[.x:checked]` 不误报）；纯 CSS 交互（radio/has-/group-has-）改动后**必须**跑 `node <S>/scripts/verify-login-state.js`（需本机 Chrome），不能只看静态 HTML——静态断言必然假绿。
- **把 `hidden` 挂在 live region 自身上**（如「发布成功」提示整块 `<p role="status" class="hidden">` 靠去掉 `hidden` 显形）——区域隐藏期间的内容变化**多数读屏器不播报**，看起来一切正常但等于没播报。正确形态：`role="status"` 区域**常驻可见**，状态用**内层**节点/文本变化驱动（棘轮为 `selfcheck` 场景 35）。
- **把 live region 挂在「文案每秒都在变」的元素上**（如倒计时按钮加 `aria-live`）——屏幕阅读器会**每秒播报**（比不播报更糟）。正确做法：只在开始/结束两次写入旁侧 `role="status"` 节点（见「交互与状态播报」，棘轮为 `selfcheck` 场景 34）。
- **类属性漏收尾引号**（如 `class="hidden group-has-[#x:checked]/login:inline>` 少了 `"`）——后续标记会被整段吞进 `class`：**Eta 照常渲染、静态子串断言照常通过**，但浏览器里元素全部失效（本轮真踩：播报 span 全 `display:none`，只有浏览器断言抓到）。断言这类字面量时用**带引号的完整形态**（场景 34 已改为匹配 `…/login:inline">`）。
- **脚本入口判定写成 `import.meta.url === pathToFileURL(process.argv[1]).href`**——在**符号链接路径**下恒为 `false`（macOS 的 `/tmp`→`/private/tmp`、`/var`→`/private/var`，`os.tmpdir()` 返回 `/var/…` 而 `import.meta.url` 已解析成 `/private/var/…`；项目目录本身是软链时同理），表现为**脚本静默 `exit 0`、什么都不做、零输出**，极难排查。新增脚本一律用 `import { isMain } from '../utils/is-main.js'` + `if (isMain(import.meta.url))`（两侧 `realpathSync` 归一，同时兼容相对路径 argv[1]）；本轮由 `selfcheck` 场景 33 的临时副本首次命中。
- **改 `SKILL.md` 里点名的接口名或场景号**而不改代码——`selfcheck` 场景 37 会扫出漂移（纯字符串扫描，零依赖）。
