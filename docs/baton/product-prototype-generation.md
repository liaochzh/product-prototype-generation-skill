# product-prototype-generation · 接力棒（最近收尾于 2026-11-11 · Duo 竖排系统栏）

> 范围：`~/.config/opencode/skills/product-prototype-generation`（生成链路 / 模板 / 词典 / 自检 / 文档）。
> 本轮方案与审查已归档：`docs/archive/2026-11-原型四批修复与一致性闸门.md`（原 27 份 plan/review，含 14 份逐轮审查）；度量基线仍在 `docs/test/20261027-consistency-baseline.md` + 双端 JSON。
> 「多形态适配」两期的方案与审查都在外仓：一期 `/Users/lcr/docs/plan/20261109-adaptive-multiform-design.md` + `/Users/lcr/docs/review/adaptive-multiform-phase1{,.r2}.md`；二期 `/Users/lcr/docs/plan/20261110-adaptive-multiform-phase2.md`（含 §7 执行记录）+ `/Users/lcr/docs/review/adaptive-multiform-phase2{,.r2}.md`。
> Duo 竖排系统栏（本轮）方案 `/Users/lcr/docs/plan/20261111-iphone-duo-vertical-system-rail.md`（含「实施期修订」）+ 审查 `/Users/lcr/docs/review/20261111-iphone-duo-vertical-system-rail{,.r2}.md`（首轮有条件通过 → 二轮 PASS）。

## 当前状态

四批缺陷修复 + 一致性闸门 + **多形态适配一/二期（2026-11-10）** + **Duo 竖排系统栏（2026-11-11）** 全部落地并验证完毕，**无待办缺陷**：

- `selfcheck` **311/311**（`--browser` 297 的基线不变，浏览器 harness 本轮未跑）；**四套** fixture golden 三维零差异。
- **Duo 竖排系统栏（2026-11-11）**：`device.systemBar`（`resolveSystemBar()`，输入 = `safeInsets` + `systemChrome`）成为外壳与页面的唯一派生点；外壳只画栏顶 chrome（`#system-rail`：竖排状态簇 + 竖排灵动岛，时间为静态 9:41、**不挂时钟脚本**——`aria-hidden` 装饰层 + 样机口径，模板内有注释），**TabBar 仍由页面渲染**（`data-rail-tabbar`，保 `TABBAR_HIDDEN` / `aria-current`；**竖排 `aria-label="侧边导航"`**，横排仍「底部导航」= 槽位锚，两套各自稳定），页面 `body{padding-right:var(--rail-w)}` 避让；仅 `edge:'right'`（左栏降级横排 + warn）；混帧 exit 1（竖排比 `thickness/chromeHeight/bottomInset`、横排只比形态）。校验：`verifyVerticalSystemBar()` 六项 + 场景 22b（1 正例 + 7 负例 + 2 函数级：左缘降级 / 缺 `systemChrome` fail-fast）+ 场景 43 **(b2) 移动端产物与 golden 原文逐字节锁**（SPU 归一 + 文件集）。**默认设备产物逐字节不变**（sha256 9 文件全等）。遗留 5 项评估结论见方案「追加修订 5」。
- **多形态适配一期（2026-11-10）**：平板 3 款预设 + `SIZE_CLASSES`/`resolveSizeClass` + `--posture`（折算 crease，仅折叠设备）+ `--frame-set`（≤4 帧，产 `device-<key>.html` + `gallery.html`）+ 陈旧帧清理；`report` 纯加法新增 `device.sizeClass/posture` 与 `frames[]`。
- **多形态适配二期（2026-11-10）**：移动端页面级重排（`tbl`=600 / `tbl-lg`=840 / `tbl-xl`=1200，由 `SIZE_CLASSES.maxWidth+1` 派生，**只注入 mobile**）+ `html[data-size-class]` 镜像属性（只诊断/断言，不驱动布局）+ `list-detail` 复合页（mobile-only 双 pane，新 fixture `listdetail`）。**desktop golden 零字节变更**（`screens` 不注入 + head 第 4 参空串），mobile golden 已重冻。
- **一致性闸门（2026-10-28）**：`utils/consistency.js` 纯计算 + `verify-prototype.js` 5 条硬项（左右 gutter、槽位单值、槽位必须 `=== pagePx`、`negMargin.mismatch`、全外壳判红）+ `buttonKinds` advisory；`selfcheck` 场景 41（基线 + 3 个注入负例）。`verify-prototype` 双端 rc=0。
- 静默失败出口已穷尽覆盖：缺 PRD / 未知 `--device` / 未知 `--theme` / 非法 `--aspect` / `--posture` 用于非折叠或 desktop / `--frame-set` 未知键·超 4 帧·desktop → rc≠0 明确失败；无模板页、超 10 页、未登记页名、`--page` 未命中 → 报告字段 + warn。

## 关键约束（改之前必读）

1. **无模板页不再回退 home 副本**：跳过 + `report.skippedPages`；全平台皆无模板 → rc≠0。
2. **10 页上限**：超出记 `truncatedPages` + warn（排序键是「用户流程频次 → 固定页序」，不是清单顺序）。
3. **页名判定的唯一事实来源是 `extractCorePages` 的那一个循环**（可传 sink）。新增「同口径判定」必须复用它，禁止另写正则/循环。
4. **`unknownPages`**：PRD 页面清单里 `normalizePageName` 认不出的条目（展示名取冒号前）；与 `--from=` 的假设清单是两条出口。
5. **关闭区块只能改空非数组叶子**（`title=''` / `slots:0` / `label=''`），禁止置空数组或 `null`；`other`/`ecommerce` 双侧同步删对象键。
6. **warn 必须带可执行出口**：跳过 warn = `--platform desktop`（按另一平台真实模板目录判定）+ 本平台可用页（动态取自模板目录）。
7. **SKILL.md 的两处计数是硬断言**：场景块数（`全链路回归（N 个场景块）`，现 **54**）与「两端可用页集」声明（移动 **11** / 桌面 **13** = 双端交集 10 + 桌面专属 3；`list-detail` 是 mobile-only，**不进** `INTER_10`）。改模板必须同步，否则自检红。
8. **页面左右留白只有一个来源**：`constants.js` › `DESIGN_TOKENS.layout.gutter[platform]` → `utils/tailwind-config.js` 注入 `spacing.page`。模板只许写 `px-page` / `-mx-page` / `inset-x-page`（桌面容器 `max-w-page`），**禁止再写 `px-4/5/6/8`**。`gutter` 与负 margin 必须成对（`-mx-page` ⇔ `px-page`），否则 `consistencyFail` 红。
9. **一致性阈值的度量口径**：`controlKinds` 按**渲染高度**聚类（`h-*` 优先，否则 `py×2 + 字号线盒`，不计边框），不按 class 字符串 —— 改写法不改变档位，改尺寸才改变。`hasSlots` 保持宽松（假红风险 > 漏报收益）。
10. **`buttonKinds` 是 advisory**：当前移动 5 档（30/34/37/40/45）、桌面 6 档（32/34/36/37/40/41）是「控件族 × 语境」的真实分层，不是缺陷；收敛必须先定「每平台目标档位阶梯」（设计决策），别只压阈值。
11. **尺寸类（`SIZE_CLASSES`）不是布局档位**：`ASPECT_CLASSES` 决定骨架（单栏/双栏），`SIZE_CLASSES` 进 `generation-report.json`/文档，**同时是平板断点 `TABLET_SCREENS` 的派生源**（`maxWidth + 1`，不写字面量）。同一设备可「sizeClass=expanded、档位=pane」（`ipad-pro-13`）。断点只在 `constants.js` 一处（`maxWidth` 单值定义，`minWidth` 不写），文档**不复制数值**。
12. **`--posture` 只折算 crease，不进模板**：先 `assertPostureSupported`（`DEVICES[key].crease` 为空即 exit 1），再 `creaseSpecFor` → `--crease` 规格串。`flat` = 1px 仅观感近似（Apple 语义 division 宽度为 0）。
13. **帧文件名按设备键固定**（`device-<key>.html`）：同设备多姿态只能分两次生成（重复键 warn 后去重）。清理白名单由 `DEVICES` 键生成（`DEVICE_FRAME_RE`），**任何平台**都跑，避免换帧集 / 切平台残留。
14. **gallery iframe 尺寸 = 帧外框 + `SHELL_STAGE_PAD`(48)**：外壳 `body` 是 `p-6`，只给 `frameWidth` 会裁掉一圈 bezel 与半个状态栏；verify 按 `report.frames[].frameWidth/Height` 逐帧精确断言（含 `src` 与帧序）。
15. **`tbl` 三档只注入移动端**：`tailwind-config.js` 的 `mobileScreens()` 按 min-width 升序合并 `TABLET_SCREENS` 与既有 `breakpoints`；desktop 走原 `breakpoints`。**桌面 head 的 `screens` 与 `generateHeadResources` 第 4 参（传空串）任何改动都会被场景 43 的原文锁判红** —— 那是「桌面零回归」的唯一硬证据（场景 17 的 `stripNoise` 吞 `<script>/<style>` 与标签间空白）。
16. **`data-size-class` 只镜像、不驱动布局**：删掉脚本视觉不变；`verify-layout` 只在 `platform === 'mobile'` 断言它与 `resolveSizeClass(视口)` 相等，**缺属性判红**（不放行）。
17. **禁双份结构**：同一内容只写一份，断点只切**容器**显隐。`hidden … tbl:*` **只允许**出现在 `data-pane` 容器上（当前唯一位置是 `list-detail` 右 pane），其它模板出现即被场景 43(c) 的 lint 判红（token 级匹配，`overflow-hidden` 不误伤）。
18. **`space-y-*` 与 grid 互斥**：某容器加 `tbl:grid` 时必须同时给 `tbl:space-y-0`，否则 `space-y` 的 `margin-top` 会在多列下把第二列首项顶下去（`detail` 踩过，已计入重冻审计）。

## 未完成 / 待产品口径决策

| 项 | 现状 | 做的话要动什么 |
|---|---|---|
| `mobile-template/pages/form.eta` 不存在 | saas/tool 兜底 PRD 选移动端只剩 3 页；已有 warn + 出口 + SKILL 声明 | 新模板 60-90 行；17c 两条断言；场景 18（`MOBILE_TPL.size===11`）；18c「模板数=容量」不变式；`INTER_10` **18 处引用**（含改名/文档口径）；1 次 golden reinit |
| 非电商桌面 form 附件槽 | `other.form.desktop.imageBlock.slots: 0` 是**刻意**（去电商化），不是 bug | 若要附件须新增独立槽位，不得复用 `imageBlock`（或明确否决） |
| `freeze-golden.js:218 expectedFilesFor` | 无平台过滤/截断语义；当前 fixture ≤8 页不触发；触发即**硬拒**（可判红） | 对齐语义需动 golden 判据核心，收益低 |
| 整节全未识别 | warn + 回退默认页集（rc=0） | 升硬失败属口径变更，需立项 |
| ~~**多形态二期**：页面级响应式重排 + `data-size-class` DOM 属性~~ | **已落地（2026-11-10）**，见「当前状态」；desktop 侧有意不做响应式 | — |
| 二期两条可选 P3（不阻断） | ① 复合词页名的归属翻转语义（当前只有 `list-detail` 一个复合页）；② `[data-grid]` 全部位于 `data-pane` 内时 ⑧ 跳过，`--selftest` 未覆盖该绿例路径 | 均为「收益 < 改造成本」，需先出现第二个复合页再谈 |
| ~~`iphone-duo-inner` 669×951~~ | **已复核（2026-11-10）**：官方 SDK `iPhone Duo.simdevicetype` 的 `displays[1]` = 2007×2853@3x（+ 运行时 framebuffer 同值）⇒ 669×951 成立，**单源解除**；连带把外屏圆角改正为**逐角 8/59/59/8**（原 55 单值，方向也曾写反） | — |
| `iphone-duo-inner` **折痕 40pt** | **已复核（2026-11-10，二证）**：半折 90° 与 130° 的 `divisionRegionKind.frame` 均 `40×669`、`margins` 左右各 20；flat 180° 与折叠态为空 ⇒ 与 Apple 语义吻合；`constants.js` 去掉「仍单源」 | — |
| 内屏 **Split View 半边**的安全区 | 未测：官方文档称 App 占内屏半边时栏位在窗口左缘（`left 84`），本次只测了全屏姿态 | 展开态把 App 拖到一侧 → 探针读 `window.bounds`（约半宽）+ `safeAreaInsets` + `reserved.occlusion.frame.x` 交叉验证。**自动化不可行**：`simctl`/`devicectl` 无触摸通道，内屏触摸还要按 display id 投递（`0x101` 外屏 / `0x103` 内屏）；`safeInsets` 外壳不消费，故不做 |
| Duo 内屏 `safeInsets` 旧值方位 | 已订正（竖持 上82/右0/下34/左0；横持 上0/右84/下34/左0），原「right 34 / bottom 0」是把 34 记错了边 | — |

## 踩过的坑

- **并发写入**：另一条工作流会往 `scripts/selfcheck.js` 加场景（本轮 `F2-shot`、`F2-docs ⑧/⑤`）。必须局部 `edit`，禁止整文件覆盖；收尾用两轮 `✔` 行 `diff` 核对新增断言归属。
- **「先剥冒号再判定」会造成每次假留痕**：原话生成的 PRD 含 `- 跳转：home → list → …`（在页面清单节内），剥冒号后会判成未登记 `跳转`；判定必须**整行**入参（与 `extractCorePages` 逐字一致），冒号只用于展示。
- **场景块数连续三批漂移**（47→48→49→50）——已加断言兜住；新增/合并场景必须同步 SKILL.md。
- `freeze-golden --only account|ecommerce` 的 3 行结构性探针告警（`layout-shell` 电量行）是**既有**，不要加 `--allow-structural --write`。
- `--reinit --write` 必须带 `--allow-pageset-change`；`--reinit` 干跑预期 rc=1。
- Eta 不支持 `<%# %>`，注释用 `<% /* … %>`。
- **gallery 只给 `frameWidth` 会裁帧**：外壳 `body p-6` 的 48px 必须另加（`SHELL_STAGE_PAD`）；`transform:scale` 只缩视觉、不改布局盒，别拿它当「省尺寸」的理由。
- **清理条件别写 `isMobile && !frames.length`**：换帧集（3→2 帧）、mobile→desktop 切换都不会命中，旧帧就留在交付里；正确口径是「不在本轮 keep 集即删」，且 `DEVICE_FRAME_RE` 白名单由 `DEVICES` 键生成，别用 `/^device-.*\.html$/` 误删用户文件。
- **`docs/review/20261104-…quarterly-review.md` 里的「`DEVICES` 14 款」是历史快照**（当次核读结论），不是现状；现状以 `constants.js` 为准（现 17 款）。
- **`stripNoise` 证明不了「逐字节」**：场景 17 的三维归一化会抹掉 `<script>/<style>` 段、折叠标签间空白 ⇒ head 里多一行它看不见。要证明桌面零回归只能靠场景 43 的**原文比对**（`SPU_PATTERN` 归一后逐文件 `===`）。同理，`read()` 的空串兜底遇「基线文件缺失」会退化成「双方都空 ⇒ 相等」，只能靠「基线存在」的前置断言兜住。
- **复合页名会被短名吞**：`KNOWN_PAGES` 用 `includes` 判定时，`list` 在 `list-detail` 之前会先命中 ⇒ 行内回退必须**按页名长度降序**；`zhMap` 里 `'列表详情'` 必须**排在 `'列表'` 前面**（按字面量插入序首个命中）。两处是同一知识点的两个面，改一处必须同时看另一处。
- **`space-y-*` 与 `tbl:grid` 同时用要给 `tbl:space-y-0`**：`space-y` 是给所有子项加 `margin-top`，多列时第二列首项被顶下去（`detail.eta` 踩过）。
- **`hidden tbl:block` 的 lint 别用子串匹配**：`overflow-hidden` 会被误判；正确做法是切 class token，`tokens.includes('hidden')` 且任 token 命中 `/^tbl(-lg|-xl)?:/`（`tbl:` 单写会漏 `tbl-lg:`/`tbl-xl:`）。
- **模板里新增页面，`INTER_10` 不要跟着加**：它是**双端交集白名单**（mobile-only 页加进去，场景 17c「交集=10」立刻红）；页集扩展的正确位置是 `KNOWN_PAGES` / `zhMap` / `priorityOrder` 三处（`standardPages` 对规范英文名有 `|| p` 兜底，仅别名页才需登记）。
- **Eta 会吞掉标签紧邻的换行**（v3、`rmWhitespace:false` 亦然）：给模板加条件块时，`%>` 与下一行 `<div` 之间的换行会被吃掉 ⇒ 产物空行消失、逐字节回归失败。补偿写法是成对 `<% if (c) { %><%~ '\n' %>…<% } %><%~ '\n' %>`；已用探针（`eta.renderStringAsync` 对拍 base/v_on/v_off）验证「开=基线逐字相同、关=只剩一个 `\n`」。改 `layout-shell.eta` / `layout-page.eta` 后必须跑 sha256 基线比对，golden 三维**看不见**这类退化。
- **竖排栏内几何别把「旋转 cutout」当岛高**：Duo 外屏实测遮挡区只有 37×37 @y=29.3；若按横排 126×37 旋转成 37×126，`29+126=155` 后 174 栏高只剩 19px，状态簇（时间/信号/电量）无处安放——首版就是这么把三行字压成一团的（截图可见）。正确分解：29（时间）+ 37（岛）+ 108（信号/电量）= 174，逐项有实测依据；缺 `systemChrome` 直接 fail-fast，不做「回退横排带高」的猜测。
- **Duo 模拟器默认「折叠态」启动**：应用跑在**外屏**（`UIScreen.bounds` 466×678 / `nativeBounds` 1398×2034），内屏那个 2007×2853 framebuffer 端口虽已 powered，但**不作为 App 的 UIScreen 暴露**（`UIScreen.screens.count == 1`）。所以「跑个 App 读内屏 bounds」这条路走不通，内屏尺寸只能取 SDK 设备配置（`displays[1]`）。
- **iOS 27 SDK 不再接受无 scene 生命周期的 App**：手搓探针 App 若只实现 `AppDelegate` 的 `window`，会报 `Application failed to launch: UIScene life cycle is required for apps built with this SDK`（`UIApplication_RuntimeIssues.m`）。须在 Info.plist 写 `UIApplicationSceneManifest` + 实现 `UIWindowSceneDelegate`，并给 `swiftc` 传 `-module-name` 让 `UISceneDelegateClassName` 能被解析。`--console-pty` 也抓不到崩溃前的 `print`，调试要走 `simctl spawn <dev> log show --predicate 'processImagePath CONTAINS "…"'`。
- **`simctl` / `devicectl` 都没有 posture/fold 命令**：`simctl` 无相关子命令，`io screenConfig` 只有 `power`/`geometry`；`devicectl device simulate` 只有 biometrics/location/statusBar。Device Hub 的姿态按钮还是自绘的（AX 树只有 Controls/工具栏），本机进程也无屏幕录制权限（`screencapture` 报 `could not create image`）⇒ 像素点击不可靠。可脚本化的唯一路径：复刻 Device Hub 的 vendor-defined HID 事件（usagePage `0xFF61` / usage `0x5B`，`hinge-slider-control`+`range` / `orientation-picker-control`+`enum`），在模拟器内 `IOHIDEventSystemClientDispatchEvent`（留档 `docs/test/duo-probe-20261110/duo-pose.m`，协议来自 MIT `artemnovichkov/hinge`）。
- **Duo 姿态有两个反直觉行为**：① **朝向名与界面朝向相反** —— 内屏上发 `landscape-left` 才得到 portrait 界面（`interfaceOrientation=1`），发 `portrait` 界面不动；永远回读 `UIScreen.bounds` / `scene.interfaceOrientation`。② **显示屏切换依赖铰链路径** —— 0°→90° 跳变切内屏，而 180°→60° 会留在外屏（实测 60° 时 `screens.count==1`、bounds 466×678）。要内屏数据就在 90–130° 且 `devicectl` 显示 `LCD-1 (active)` 时读。
- **折叠态下内屏不是 `UIScreen`**：`UIScreen.screens.count == 1`（只有外屏）；展开/半折后变 2。所以「内屏尺寸/安全区」必须在内屏 active 的姿态取，折叠态取不到（早前「跑个 App 读内屏」失败的真因）。
- **`reservedRegionsOfKind:divisionRegionKind` 是 iOS 27.1 的公开 API**（`UIViewReservedRegion`：`frame`/`margins`/`isActive`，配 `UIViewReservedRegionKind` 的 `division`/`occlusion` 两 kind）——取值方式是 `win.perform(NSSelectorFromString("reservedRegionsOfKind:"), with: kind)`（Swift overlay 名与 ObjC 选择器不同，直接用运行时选择器最稳）。它是唯一能拿到 division 带宽的运行时通道。
- **Duo 外屏圆角是「左 8 / 右 59」，不是一刀切 59，也别把方向写反**：官方 `displays[0]` 的 `cornerRadiusUL/UR/LL/LR = 8/59/8/59` ⇒ **上左/下左 8（折痕侧近乎方角）、上右/下右 59（外缘）**（`framebufferMask` PDF 实测同形：mask 恰为 466×678，左缘各角内缩 5pt≈8、右缘 59；设备级 `DeviceCornerRadius=59` 只是单值回退）。曾把方向写成「UL/UR=59、LL/LR=8」并在外壳一刀切 59，等于把折痕侧磨圆。正确做法：`DEVICES.cornerRadii` 逐角建模 → `device-profile.js` 的 `radiusFields()` 派生 `frameRadiusCss` / `screenRadiusCss`（后者减 `bezel` 并负值归零）→ 模板只插字符串不算术；单值机型保持 `${cornerRadius}px` 字形以避开 golden 抖动。棘轮：`selfcheck` 场景 42 (c4)。

## 仓库化（2026-10-28 收尾）

- 代码仓库：`https://github.com/liaochzh/product-prototype-generation-skill`（**public**），`main`；真实目录 `/Users/lcr/Projects/product-prototype-generation-skill`。
- **目录级软链**：`~/.config/opencode/skills/product-prototype-generation -> /Users/lcr/Projects/product-prototype-generation-skill`（宿主仍按 skills 目录加载；改文件改仓库那份）。
- 仓库局部身份：`git config --local user.email = liaochzh@gmail.com`（`user.name` 未设，回落全局 `LCR` ⇒ 作者 `LCR <liaochzh@gmail.com>`）。
- **docs 策略：迁到 `<repo>/docs/` 但不入库**（`.gitignore` 忽略 `docs/plan|review|baton|test`）。理由：公开仓库 + 内部工作记录。`docs/visual/`（渲染留档）仍入库。
  - `docs/test/` 存放一致性度量证据（`20261027-consistency-baseline.md` + 双端 JSON），2026-10-28 已从 `design-spec` 仓迁回本仓（含本机路径，故同样不发布）。
  - ⚠ `git clean -xfd` / 重新 clone 会丢这些本地文档；要长期留存需另建私有备份。
- **push 权限**：本机配置对 `git push` 是 deny（`opencode.jsonc:752/757`、`:894/899`、`:1132/1137`、`:3669`；全库无对应 `allow`）。`gh api` 不能直接推 git（只能低层 blobs→trees→commits→refs，属绕过，不做）。要走人工 push 或临时放开配置（改后跑 `scripts/verify-env-guard.py --gate --quiet`）。
- ~~**⚠ 待人工 push（2026-10-28）**~~ → **已同步**：`git ls-remote origin refs/heads/main` = `daebc9f…`，与本地 `main` 一致（2026-11-10 核）。
- ~~**2026-11-10 多形态一期尚未提交**~~ → 已提交 `095fef3`（未 push）。二期 → 已提交 `669b682`（未 push）。两者均待人工推送。
- ~~**2026-11-10 多形态二期尚未提交**~~ → **已提交 `669b682`**（`feat: 移动端页面级响应式重排（tbl 三档）+ list-detail 复合页`，46 个文件 / `+5915 −125`，含 golden 重冻 14 个 + 新 fixture 7 个文件）；**已 push（2026-11-11，用户手动，`daebc9f..3fe48e9`）**。**2026-11-11 Duo 竖排系统栏一轮已提交 `9b9e461`**（9 文件 / `+304 −28`，含 constants / device-profile / 3 scripts / 2 eta / SKILL.md / devices.md）；**已 push**。**遗留项评估批次已提交 `3fe48e9`**（5 文件 / `+53 −6`：aria-label「侧边导航」、竖排无时钟脚本注释、场景 22b 两条函数级断言、场景 43 (b2) mobile 字节锁）；**已 push**。<br>三仓同批均已推送（2026-11-11 用户手动）：`design-spec` `1cc93a1`（哲学层 2.9.0，`59502d6..1cc93a1`）、`app-design-skill` `aab438d`（1.7.0，`c079ec8..aab438d`，首次 `-u` 绑 upstream）。

## 下一步

**Duo 取证已收口（2026-11-10）**：尺寸三证、折痕 40pt 二证、内外屏安全区订正，均见「未完成」表与 `references/devices.md` §Duo 数据来源。唯一遗留是 **内屏 Split View 半边安全区未测**（需展开态把 App 拖到一侧）。多形态二期已收尾并提交（`669b682`），Duo 竖排系统栏一轮已提交（`9b9e461`，审查二轮 PASS），遗留项评估批次已提交（`3fe48e9`），无缺陷待办；遗留 5 项的判定与证据见方案「追加修订 5」（3 项明确不做：左栏渲染、横持预览、竖排动态时间）。

`git push` 仍是 deny（本会话内 `git push origin main` 返回 `permission.rejected: shell`），但 **2026-11-11 已由用户手动推送完毕**：ppg `daebc9f..3fe48e9`、design-spec `59502d6..1cc93a1`、app-design `c079ec8..aab438d`（含 `-u` 绑 upstream）。核对：三仓 `origin/main` == 本地 `main`，ppg/design-spec ahead=0、app-design `main@{upstream}` = `origin/main`。ppg 工作区只剩无关 `?? docs/visual/typography-snapshot-20261110.png`（未推送项已清零）。

其余候选（原 2026-10-28 记录，仍成立）：mobile `form` 模板 / 表单附件槽需单独立项（先定产品口径）；一致性闸门之后的三项候选已评估并搁置（2026-10-28）：

| 项 | 结论 |
|---|---|
| B2 全量按钮档收敛 | ❌ 不做。5/6 档是真实分层；`controlKinds ≤3` 阈值本身需重定义，且需先给「每平台目标档位阶梯」（设计决策，非缺陷） |
| B1' 桌面 `px-8/p-8/max-w-7xl` 改名 | ❌ 不做。防漂移收益已被闸门吃掉（槽位必须 `=== pagePx`，写错任何 px 立刻红），只剩命名美观 |
| C 页面转场 | ❌ 不做。移动产物在 iframe 内，跨文档转场不生效；只有桌面直开可见 |

六类原始投诉的最终覆盖：不对齐 ✅ / 跨页漂移 ✅ / 自检无证据 ✅ / 兼容性 ✅（`--browser` 262/262）/ 控件不统一 🟡（剩设计分层）/ 无转场 ❌（场景不成立）。
