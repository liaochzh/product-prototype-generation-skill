# 一致性基线（A 阶段实测）

> 执行：2026-10-27；`node v26.12.0`；fixture `ecommerce`（`fixtures/prd/ecommerce.md`）
> 脚本：`scripts/measure-consistency.js`（只读，恒 exit 0）
> 原始数据：`docs/test/20261027-consistency-mobile.json`、`docs/test/20261027-consistency-desktop.json`
> 生成方式：临时 workspace + `generate-prototype.js --platform mobile|desktop`（无 `assets/`，图片走 Unsplash 降级，**不影响 class 结构**）

## 1 移动端（9 文件 = 8 内容页 + 外壳 index.html）

| 页 | header 左/右 | main 左/右 | tabbar 左/右 | gutterΔ |
|---|---|---|---|---|
| index.html（外壳） | — | — | — | — |
| pages/chat.html | 20/20 | 16/16 | — | **−4** |
| pages/detail.html | 20/20 | 16/16 | — | **−4** |
| pages/discover.html | 20/20 | 16/16 | 24/24 | **−4** |
| pages/home.html | 20/20 | 16/16 | 24/24 | **−4** |
| pages/list.html | 20/20 | 16/16 | 24/24 | **−4** |
| pages/orders.html | 20/20 | 16/16 | 24/24 | **−4** |
| pages/profile.html | 20/20 | 16/16 | 24/24 | **−4** |
| pages/publish.html | 20/20 | 16/16 | — | **−4** |

- `gutter_delta` 最大绝对差 **4px**，取值集合 `[−4]`（8/8 页一致地偏）
- 槽位左内边距：header `[20]` / main `[16]` / tabbar `[24]` → **同一屏三种 gutter**
- 按钮类高度 **5 种**：`h-10`、`py-1.5`、`py-2`、`py-3`、`py-3.5`
- 容器型控件 2 种：`h-11`（搜索框外壳）、`h-9`
- 负 margin 抵消：不配对 **0**、孤儿 **0**（模板内 `-mx-4 px-4` 是配对的 ⇒ 改 gutter 时必须同步改这两处）
- 转场/降级标记：**0/9**
- 未识别刻度 **0**、任意值 **0**（度量可信）

## 2 桌面端（8 文件 = 7 内容页 + 外壳 index.html）

| 页 | header 左/右 | main 左/右 | gutterΔ |
|---|---|---|---|
| index.html 及全部 7 页 | 32/32 | 32/32 | **0** |

- `gutter_delta` = **0**（8/8 页），槽位左内边距唯一值 `[32]`
- 按钮类高度 **6 种**：`h-8`、`h-9`、`h-10`、`py-2`、`py-2.5`、`py-3`
- 容器型控件 3 种：`h-8`、`h-9`、`h-10`
- 负 margin：0 不配对；转场：0/8；未识别 0；任意值 1（`h-[70vh]`，合法显式写法，不计缺陷）

## 3 结论（六类缺陷 → 实测状态）

| # | 缺陷 | 实测结论 |
|---|---|---|
| ① | 元素不对齐 | **确认存在且系统性**：移动端 8/8 页 header 20 vs main 16（−4px）；桌面 0/8 页 ⇒ 修复范围可收窄到移动端模板 |
| ② | 控件样式不统一 | **确认**：移动 5 种按钮高度、桌面 6 种；容器另 2/3 种 |
| ③ | 跨页漂移 | **部分确认**：同一槽位跨页是**一致的**（20/16/32 各自唯一）；真缺陷是**槽位之间**不一致（移动端 20/16/24 三值）⇒ 指标应判「跨槽位唯一」而不是「跨页唯一」 |
| ④ | 无衔接/转场 | **确认**：0/9 与 0/8 页有转场或降级标记 |
| ⑤ | 机型/浏览器不兼容 | **未测**（需浏览器矩阵；本轮只建立 class 结构基线） |
| ⑥ | 自检无证据 | 已由本文件取代：4 项指标可复跑、可 diff |

## 4 B 阶段验收阈值（pinned，基于本基线）

| 指标 | 当前 | B 的通过线 |
|---|---|---|
| `gutter_delta` 最大值 | 4px（移动） | **0px**（全页，含桌面） |
| 槽位左内边距取值数（移动） | 3（20/16/24） | **1**（header = main = tabbar） |
| `controlKinds.button` 种数 | 移动 5 / 桌面 6 | **≤3**（按用户裁决：input 与 button 分族） |
| `negMargin.mismatch` | 0 | 保持 **0**（改 gutter 后仍须配对） |
| `unknownClasses` | 0 | 保持 **0**（否则度量不可信） |
| `transitionPages` | 0 | C 阶段：桌面直开场景 ≥1 且 `prefers-reduced-motion` 降级存在 |

> 判定口径提醒：本基线的 `controlKinds` 只统计 class 形态，**不代表渲染后像素高度**；B 完成后须重跑本脚本并 diff 本文件，而不是凭肉眼。

## 5 复跑命令

```bash
cd ~/.config/opencode/skills/product-prototype-generation
mkdir -p "$WS/docs"
cp fixtures/prd/ecommerce.md "$WS/docs/prd.md"
WS=<临时 workspace> node scripts/generate-prototype.js --platform mobile
node scripts/measure-consistency.js --workspace "$WS" \
  --out docs/test/20261027-consistency-mobile.json
```

## 6 干跑审计（不写盘）

```
node scripts/freeze-golden.js --only ecommerce
→ ✔ ecommerce/mobile 门禁通过（text/attrs 零差异，classes 全可解释，产物零残留）
→ ✔ ecommerce/desktop 门禁通过（…）
→ 干跑通过；加 --write 即可冻结。
RC=0
```

含义：**当前模板与 golden 完全同步**（text/attrs/classes 三维零差异）。因此 B 一旦改 class，干跑报告会精确列出每一条差异 —— 这条路径已实测可用，且未写盘、未动 baseline。

## 7 B1 验收（gutter 单一化，2026-10-28 实测）

> 改动：`constants.js` 增 `layout` 令牌；`utils/tailwind-config.js` 注入 `spacing.page = layout.gutter[platform]`；移动端 10 个 `.eta` 的 slot 内边距改 `px-page`/`-mx-page`/`inset-x-page`；`scripts/generate-prototype.js` tabbar 同步。桌面模板未改。

| 指标 | B1 前 | B1 后 | 判定 |
|---|---|---|---|
| `gutter_delta.max` | 4（取值 `[-4]`） | **0（取值 `[0]`）** | ✅ |
| 槽位左值（header/main/tabbar） | 20 / 16 / 24（3 值） | **16 / 16 / 16（1 值）** | ✅ |
| `negMargin.mismatch` / `orphan` | 0 / 0 | **0 / 0** | ✅ |
| `unknownClasses` / `arbitraryValues` | 0 / 0 | **0 / 0** | ✅ |
| 桌面端（回归） | Δ0；32/32 | **Δ0；32/32（无变化）** | ✅ |
| `controlKinds.button`（未动，属 B2） | 5 | 5 | — |

**渲染值抽查**：产物内联 `theme.extend.spacing.page = "1rem"`（桌面 `2rem`）；tabbar 实际输出 `inset-x-page … px-page`。非 rem 字符串会变成 `16rem`，已按 §4 风险项确认未发生。

**冻结**：`node scripts/freeze-golden.js --only ecommerce,account,saas --write --allow-class-refactor --allow-structural` → 5 套 golden 全部「text/attrs 零差异」重冻，旧基线备份在 `~/.local/share/opencode/backups/product-prototype-generation/*-1793157981*`。
其中 `--allow-structural` 是计划外新增项：注入 `spacing.page` 会让每页内联 `<script>` 配置多一行 `"page": "1rem"/"2rem"`，属非 class 区域差异（桌面渲染零变化，class 差异 0）。

**其他门禁**：`verify-prototype.js` 移动/桌面均 rc=0；`selfcheck.js` 252/252（rc=0）；`design-spec/scripts/check-design-spec.py --quiet` rc=0（脚本已从 `~/.config/opencode/scripts/` 迁至 `~/.config/opencode/design-spec/scripts/`，旧路径失效）。
