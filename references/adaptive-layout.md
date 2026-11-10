# 自适应布局（尺寸类 → 范式 → 原型呈现）

> 一层深引用：只服务 `product-prototype-generation`。规范口径（断点数值、平台差异、判据）以 `design-spec/references/ui-design-philosophy.md` §自适应布局 / §形态与共存 为唯一权威源，本文件**不复制断点数值**，只写「原型层怎么落」与经验档。

## 1. 两套口径，别混用

| 口径 | 是什么 | 谁持有 | 影响什么 |
|---|---|---|---|
| **布局档位** `ASPECT_CLASSES` | `phone` / `pane` / `wide`，决定外壳骨架用哪套（单栏 / 双栏 / 横排） | `constants.js` | 模板产物、外壳 `data-aspect`、golden 三维 |
| **尺寸类** `SIZE_CLASSES` | `compact` / `medium` / `expanded` / `large`，平台口径（Android 窗口尺寸类） | `constants.js` | 报告面（`report.device.sizeClass`）+ **平板断点派生源**（`TABLET_SCREENS`） |

同一台设备可以「尺寸类 = expanded，布局档位 = pane / 2 栏」（如 `ipad-pro-13`）。这不是矛盾：档位管骨架，尺寸类只是对齐外部规范的命名。

> iOS 参考：Apple 只认 size class（compact / regular）与容器 bounds，**不认固定断点、不认机型**。故 `resolveSizeClass` 是**原型演示口径**，不得在交付文档里表述为「iOS 实现判据」。

## 2. 尺寸类 → 范式 → 原型呈现

| 尺寸类 | 设计范式 | 原型呈现（当前能力） |
|---|---|---|
| compact | 单列 feed，底部 TabBar | `--device iphone16` 等手机帧；单栏 + TabBar |
| medium | 单列或 list-detail（高度紧凑时退回单列） | `--device ipad-air-11` / `android-tablet`：双栏骨架 + Rail；导航平台差异属二期 |
| expanded | list-detail 常驻 | `--device ipad-pro-13`：双栏骨架 |
| large | supporting pane（主 + 辅，≤3 栏） | 无内置预设；用 `--device-width/--device-height` 造自定义帧 |

平板帧是**形态容器**：演示外壳几何与可用空间；**页面级重排自二期起已生效**（见 §6），但帧本身仍不演示状态连续性。

## 3. 多形态判据（原型层）

- **宽度优先、高度可否决**：宽到 medium 但高很矮（横持折叠内屏、横屏手机）时不做双栏。判定用宽高两维，**不看方向**——折叠内屏可能不响应方向请求（只有 bounds 变化）。
- **导航按平台定，不按宽度定**：iOS 全宽度都是 TabBar（折叠机横持时系统把 TabBar 与工具栏竖排到侧边，属系统行为）；Android medium 以上换 Rail；iPadOS 18+ 是**顶部 Tab 条**（可变形为侧栏），**不要**再做「左侧常驻 rail + 列表 + 内容」三列。
- **断点别用 `@media` 判「帧宽」**：原型舞台是「桌面页 + 设备帧」，外壳层的 `@media` 量的是**浏览器窗口**，不是帧宽——外壳若要按帧改排布，只能由帧宽换算成 `data-*` 属性再消费（本项目外壳走 `data-aspect` / `data-panes`）。**页面层不同**：产物把页面放进 `<iframe>`，iframe 视口宽 = 该帧的逻辑宽，故页面模板里的 `@media` 是有效的；二期若统一走 `data-size-class`，理由是「口径统一 + 免多套断点」，不是因为 `@media` 失效。
- **外壳导航与未登录屏**：外壳克隆主导航后，登录 / 注册等屏必须**隐藏导航且让位内距归零**（否则未登录可点主导航）；命中条件按**精确屏 ID**，不要用复用类（`:has(.screen-auth)` 会误命中「我的」）。
- **多帧预览不演示状态连续性**：`--frame-set` 只并排展示外形，不做状态迁移；也不要把它当多窗口模拟。

## 4. 经验档（项目实证，非规范硬值）

以下是三个真实项目的实测值，**只作参考**，不进哲学层硬规则；换项目须重新测。

| 项 | 值 | 来源 / 状态 |
|---|---|---|
| Android medium+ Rail 宽 | 80dp | 项目实证 |
| iOS 折叠横持：TabBar 胶囊宽 / 内容避让 | 49 / 84（=23+49+12） | 项目实证 |
| 矮横屏控件紧凑档 | 高 < 380 触发（条高 64、缩略图 72×40、步进钮 32） | 项目实证 |
| 折叠横屏左右安全区 | 44 / 59 / 32（左 / 右 / 下） | **[假设]**，逐边独立、勿对称化 |
| Duo 内屏半折保留区带 | 40pt（=20+20） | 【实测·模拟器 2026-11-04】 |

## 5. 验收清单（多形态）

- [ ] `report.device.sizeClass` 属四档枚举；`report.device.posture` 属三档（或 null）。
- [ ] `--frame-set` 产物：每帧 `device-<key>.html` 的 `data-device/data-aspect/data-panes` 与 `report.frames[]` 一致；`gallery.html` 每帧 iframe = `frameWidth/Height + 48`（舞台内边距）；缺省 / 换帧集 / 切平台后不残留旧帧。
- [ ] 折叠姿态只用 `--posture`（预览），**不得**在页面层自绘折痕避让，也不得表述为「运行时判姿态」。
- [ ] 平板帧的说明文案写明「形态容器，非布局结论」（`report.frames[].note`）。
- [ ] DOM 级的尺寸类属性与页面级重排见 §6（二期已落地）。

## 6. 页面级重排（二期）

**机制**：Tailwind `screens` 由 `SIZE_CLASSES.maxWidth + 1` 派生三档（`tbl`=600 / `tbl-lg`=840 / `tbl-xl`=1200），**只注入 mobile**（`tailwind-config.js` 的 `mobileScreens()`）；桌面端沿用 `sm/md/lg/xl/2xl`。页面模板只写 `tbl:*` variants，不写 `@media`、不加 JS 布局。

**为什么能生效**：页面产物被外壳放进 `<iframe>`，iframe 视口宽 = 该帧逻辑宽 ⇒ 页面里的 `@media` 量的是**帧宽**（不是浏览器窗口）。这是页面层与外壳层的分工差：外壳只能用 `data-aspect`/`data-panes` 预换算。

**`data-size-class`**：移动端 head 注入一段 IIFE，按 `innerWidth/innerHeight` 与同一张表写 `html[data-size-class]`，并在 `resize` 时重算。它**只作诊断与断言**（调试、`verify-layout` 取数、取证），**不参与布局**——删掉不影响视觉。

| 页面 | 平板范式（≥600） |
|---|---|
| home | 快捷区 4 → 8 列；推荐横滑 → 4 列网格；hero 加高 |
| list | 卡片 1 → 2/3/4 列（600/840/1200），卡片转纵排、图满宽 |
| list-detail | 左列表 + 右详情同屏；单栏时右 pane 隐藏 |
| detail | 主区 2 列（图集 / 信息），相关推荐 4 列，底部操作栏由 `fixed` 转文档流 |
| orders | 卡片 1 → 2 列，行内纵向居中 |
| chat | 会话列限宽居中，气泡最大宽放大 |
| discover | 封面卡 2 → 4 列 |
| profile | 主区 2 列（资料 / 资源条跨列），菜单与设置并排 |
| publish | 表单限宽居中，图片槽 3 → 6 |
| login / register | 表单限宽居中（`max-w-md`） |

**禁双份结构**：同一内容**只写一份**，断点只切**容器**显隐。当前唯一允许 `hidden … tbl:block` 的位置是 `list-detail` 的 `data-pane="detail"`；其它模板出现 `hidden tbl:*` 会被 selfcheck 场景 43 的 lint 判红。理由：两份内容 = 两份 DOM/文案/图片，既违反「布局切换不改元素树」，也会让 golden 的 text/attrs 维度失去回归意义。

**验收**：`verify-layout.js` 在 375 / 820 / 1032 三档断言「无横向溢出 / 文本不截断 / 图片不撑破 / 底部导航不遮挡 / `data-size-class` 与 `resolveSizeClass` 一致 / 平板下 `[data-grid]` 真的多列」；`verify-prototype.js` 静态断言 `list-detail` 双 pane 存在；`selfcheck` 场景 43 锁「三档注入 + 阈值同源 + desktop 零痕迹」。**桌面端逐字节不变**由场景 43 的原文比对（SPU 归一后）守护——场景 17 的三维归一化看不见 head 里的换行与 `<script>` 段。
