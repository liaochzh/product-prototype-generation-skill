# 自适应布局（尺寸类 → 范式 → 原型呈现）

> 一层深引用：只服务 `product-prototype-generation`。规范口径（断点数值、平台差异、判据）以 `design-spec/references/ui-design-philosophy.md` §自适应布局 / §形态与共存 为唯一权威源，本文件**不复制断点数值**，只写「原型层怎么落」与经验档。

## 1. 两套口径，别混用

| 口径 | 是什么 | 谁持有 | 影响什么 |
|---|---|---|---|
| **布局档位** `ASPECT_CLASSES` | `phone` / `pane` / `wide`，决定外壳骨架用哪套（单栏 / 双栏 / 横排） | `constants.js` | 模板产物、外壳 `data-aspect`、golden 三维 |
| **尺寸类** `SIZE_CLASSES` | `compact` / `medium` / `expanded` / `large`，平台口径（Android 窗口尺寸类） | `constants.js` | **只进报告面**（`report.device.sizeClass`），不改产物 |

同一台设备可以「尺寸类 = expanded，布局档位 = pane / 2 栏」（如 `ipad-pro-13`）。这不是矛盾：档位管骨架，尺寸类只是对齐外部规范的命名。

> iOS 参考：Apple 只认 size class（compact / regular）与容器 bounds，**不认固定断点、不认机型**。故 `resolveSizeClass` 是**原型演示口径**，不得在交付文档里表述为「iOS 实现判据」。

## 2. 尺寸类 → 范式 → 原型呈现

| 尺寸类 | 设计范式 | 原型呈现（当前能力） |
|---|---|---|
| compact | 单列 feed，底部 TabBar | `--device iphone16` 等手机帧；单栏 + TabBar |
| medium | 单列或 list-detail（高度紧凑时退回单列） | `--device ipad-air-11` / `android-tablet`：双栏骨架 + Rail；导航平台差异属二期 |
| expanded | list-detail 常驻 | `--device ipad-pro-13`：双栏骨架 |
| large | supporting pane（主 + 辅，≤3 栏） | 无内置预设；用 `--device-width/--device-height` 造自定义帧 |

平板帧是**形态容器**：演示外壳几何与可用空间，**不代表页面已按断点重排**（页面级响应式属二期）。

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
- [ ] DOM 级的尺寸类属性 / 页面级重排属**二期**，本层不承诺。
