# selfcheck 覆盖清单与页集规则

> 本文件由 SKILL.md 拆出（2026-10-27 F1 分层）。SKILL.md 只保留结论与触发条件；要动手改生成链路/模板/词典时读本文件。本文件不再链向其它 references 文件（引用只一层深）。

## 页集 ↔ fixture ↔ golden 规则

改动模板或词典后**必须**跑 `node <S>/scripts/selfcheck.js`：内含文案词典形状一致性（含数组元素键与叶子类型深校验）、移动/桌面全页集闸门、非电商 4 类型 × 双端 e2e，以及 golden 的三维零回归（可见文本 / 交互属性 / class 布局指纹，基线在 `fixtures/golden/`，归一化实现唯一位于 `utils/copy-golden.js`）——共三套 fixture：`ecommerce`（mobile+desktop）、`saas`（desktop，补 `settings/form/dashboard` 这三个桌面专属模板）、`account`（mobile+desktop，补 `login`/`register` 双端模板与短信验证码流程，且 type=other 兜底词典），另有「模板覆盖完备性」断言保证每端模板都被某套 fixture 覆盖（无 golden 盲区）。**给既有 fixture 加页面会被硬拒**：页集是布局的一部分（桌面侧栏导航渲染进每个页面、移动端外壳列页清单），加页会改写全部重叠页面的 text/attrs，与真回归不可区分——新增页面请新建 fixture 承载（`--init` 首建基线，不动既有基线）；确需在同一 fixture 上增删页时走 **`--reinit`**（`node <S>/scripts/freeze-golden.js --reinit --only <fixture>`）——**该入口同样适用于「新增/变更文本」**（`text` 维永远硬、不提供按条授权，故任何合法新文案——如无障碍播报文案——都只能走「审计 → 显式授权 → 先备份后重建」）——它把「逐维审计 → 删旧基线 → 重建」固化成一条流程：**强制前置**跑 `scripts/audit-pageset.js`（逐条列出 text/attrs/class 增删条目与文件集变化，报告落 `~/.local/share/opencode/backups/product-prototype-generation/pageset-audit-<fixture>-<platform>-<ts>.log`），**未给 `--allow-pageset-change` 时硬拒**（退出码 1），授权后还须过「文件集 == PRD 页面集」+「产物零任意字号」，`--write` 时旧基线**先入 `.bak` 再入位新基线**（不再有保护空窗）。手工比对任意两目录仍可用 `node <S>/scripts/audit-pageset.js <旧目录> <新目录>`（退出码 0=完全一致 / 1=有差异）。

**页集来自 PRD 解析**——**新页面名须登记在 `utils/prd-parser.js` 的 `KNOWN_PAGES`/`zhMap`/`standardPages`/`priorityOrder` 四处**（漏任一处即「注册」被静默归一成 `login`，表现为新页面凭空消失）。另建议 fixture PRD 含 `## 非功能性需求` 章节以覆盖该解析路径（缺节已不报错：`parseFeatures`/`parseNonFunctional` 的三条 `match` 链尾有 `|| []` 兜底，缺节只得到空数组、不中断后续解析）。

## 回归自检覆盖面（场景 1–40）

`scripts/selfcheck.js` 回归自检：全页集双端 0 死链、移动端外壳单 iframe 指向 `pages/*.html`、缩减页集导航回退、空页集报错、注入死链负例、内联 Tailwind 插件真求值可执行、内联 plugins 损坏负例、**文案词典形状一致性 + 数组元素深校验**、**非电商 4 类型 × 移动/桌面双端文案域闸门**、**设备表归档自洽 + 设备闸门负例**、**多 fixture golden 三维零回归（ecommerce 双端 + saas 桌面 + account 双端）+ 模板覆盖完备性（每端 `pages/*.eta` 全部被某套 fixture 覆盖，防新增模板出现 golden 盲区）**、**文件集（页面集）差异分类（`classifyFileSet`：新增/缺失均判硬拒）**、**验证码/登录态契约自洽（`sendCode` 字段 ↔ `codeButton` 槽位 ↔ 两端模板 `data-*` 钩子；登录态为**纯 CSS**切换——断言 `role="radiogroup"`/`has-[:checked]`/`group-has-[#…:checked]/login:` 齐备、产物中已解析成具体类名，并**禁止**回退到脚本切换钩子）**、**源码任意字号零容忍（含 JS 生成器）+ 组件类字号解包正确性 + 实际字号 token 必在内联 fontSize + 重冻门禁负例（含 `--allow-class-refactor` 决策路径）**、**语义排版契约（角色类按平台产出且与 `TYPE_ROLES` 一致）+ 源码任意值圆角零容忍**、**图标名可用性（词典 `icon` 键 + 模板/脚本里的 `data-lucide` 字面量 + `data-lucide="…|| 'circle'"` 回退 + 「变量名含 `icon` 的赋值语句」内的字面量，都必须在离线清单 `utils/lucide-icons.js` 内；并按 `LUCIDE_COUNT` 断言清单未被截断）**、**全模板 `has-[…]` 变体必须带状态伪类（漏写即「元素存在即匹配」，静默状态失效）**、**涨跌 delta 胶囊已收纳为 `.delta`（禁裸重复写法）**、**`micro` 档只服务微标签/图标尺寸（信息性交互标签 ≥ xs 的方向性棘轮）**、**`--reinit` 页集重建 SOP（未授权时审计已产出仍硬拒 / 缺 `--only` 被拒 / 与 `--init` 互斥 / 授权 + `--write` 后旧基线入 `.bak` 且审计留档 / 重建后基线自洽）**、**状态消息播报接线（面板切换 + 倒计时；按钮上出现 `aria-live` 即报错，防逐秒播报）+ 产物级解析**、**`has-[…]` 白名单机制（默认拒绝 / 登记放行 / 无死条目）**、**过程反馈播报形态（区域常驻 / 显式 aria / 导出接线 ↔ 词典）**、**logger 轮转纯逻辑（树内守卫判定 + 归档正则，零 IO）**、**文档-代码一致性（SKILL.md 点名的 `interfaces.js` 接口必须在 `@typedef` 里存在；SKILL.md 引用的 `场景 NN` 必须在 selfcheck 里真有定义）**、**可选主题（注册表色板/字体栈引用全部可解析 + `themes/` 零颜色字面量 + 缺省主题与旧签名逐值相同 + **三个消费点真接线**（配色/内联配置与标题 display 字体/降级占位图各随主题变）+ 四个字体栈两两不同）**、**节截断锚点（`###` 子标题不得截断用户流程/页面清单；上界止于下一个 `##`；缺节不得中断解析；`getPagePriority` 频次序生效）**、**未闭合标签门禁（`verify-prototype.js` 的 `malformedTag`：标签内再出现 `<` 即红 + `<script>` 开合对账；含负例/两条正例自测）**、**非电商桌面 form 去电商化（正文/属性不含 `¥`/价格/交付/发货/包邮；主按钮取 `form.submit`；actions 按钮文本非空；`select ≥ 1`；并前置断言 `productType` 真等于该类型，防「按类型断言」退化成空断言）**、**电商桌面 form 反例保护（价格与描述 / 发货设置 / `¥` / 9 个图片槽仍在——ecommerce 页集用 `publish`，此路径无 golden 兜底）**、**产物确定性（同输入两次生成 `prototype/**/*.html` 逐字节一致，桌面与移动各一对独立工作区）**、**列表行 ID 前缀自洽（`SPU/TSK/ITM/ART/ID`，漏配即 golden 假回归）**、**移动端跳过无模板页（`report.skippedPages` = PRD 页集差集且产物无同名文件；页集全不可用必须 exit≠0，`--page` 滤空仍报「未解析出任何页面」）**、**10 页上限截断留痕（`report.truncatedPages` 与 `pages` 互补、并集 = 请求页集；warn 说明「用户流程频次 → 固定页序」排序与收敛手段；移动端因模板数=容量不触发）**、**页名未命中留痕（`report.unknownPages`：PRD 未登记页名 / 整节全未识别回退默认页集必须 warn；`--page` 不在页集必须 warn；原话生成 PRD 含「- 跳转：home → …」不得假留痕）**、**平台页集可发现性（跳过 warn 必须给出另一平台出口 + 本平台可用页；SKILL.md 声明的两端可用页/桌面专属页必须与模板目录同源）**、**需求文档导入（`--from=`：freeform 文档页集 = 规范值 6 页且全在 `INTER_10` 内 / 「钱包」「会员卡包」只进假设不污染页集 / 「功能」小节词不参与页集推断 / 产出 PRD 过 `validatePRD` 双零且回读页集仍是规范 6 页 / 三条 fixture 默认解析页集 8-7-4 未漂移 / 默认分支不吃别名 / 原话重生成后假设清单自动失效 / CLI 端到端 `prdSource='doc'` 且闸门 `copyDomainSkipped===false` / 四条退出码 0-1-1-1 + `--dry-run` 不落盘 / 被丢弃页在 PRD 页面清单末尾可见（`> [假设]`，非列表项）/ 含连字符的未登记页名净化后不回流页集）**、**截图/设计稿导入（`templates/design-spec.md`：六节齐全无兜底 / 平台与品牌色被解析 / design-spec → PRD → 原型端到端闸门绿且 `prdSource=doc` / 品牌色真进内联配色——只断言 PRD 文本里有颜色是不够的，两次搬运任一处漏读都会退化成类型预设色 / 注释里的行业词不参与类型判定）**——改动生成链路、模板或词典后应运行。

> 场景 37 的边界：只扫「有确定契约的两类」（接口名、场景号），**不扫自由散文**——那会逼着文档写死措辞，反而制造新的漂移。例外：`平台构建策略` 里的「可用页（N）：`a/b/…`」「桌面专属页（N）：`a/b/…`」是机器可读清单（非散文），已纳入断言；改模板必须同步该行。

## 浏览器层 harness（`--browser`，需本机 Chrome）

加 `--browser` 追加四个需 Chrome 的 harness；默认不跑并**明说跳过**（防「以为跑过了」）。四者都靠 `utils/browser-runner.js` 的两个执行器：`runAssertions()`（Playwright，断言在 Node 侧，供三个回归用）与 `runHarness()`（`--dump-dom` + `#test-result` 协议，留给截图类脚本）。**无 Chrome 时每个脚本自己打印「未找到 Chrome」并 exit 0**——`selfcheck` 靠这句判跳过，所以这句文案不能改。另：`--browser` 分支末尾有「浏览器 harness 全部通过」这条 check，**harness 失败会进退出码**（此前只打印、不进退出码，等于跑了不算数）。

### `scripts/verify-login-state.js` —— 登录态纯 CSS 切换（90/90）

生成 account 双端登录页 → 三种用例（**移除页面自身 `<script>`** 后仍能切换 / 静态预置 `checked` 零交互 / 倒计时）→ Playwright 读断言（mobile 19+9+17、desktop 同，合计 **90**）。存在理由：`selfcheck` 只能证明「类名书写与产物解析正确」，**证明不了浏览器里真的切换**——`has-[#id]` 漏 `:checked` 这类错在静态层面看起来完全正常（假绿），见 plan §11.2。

### `scripts/verify-status-announcements.js` —— 过程反馈播报（15/15）

生成 ecommerce 桌面产物 → 真点击「导出」（常驻区域按开始/完成两次变化、等待期不重播、按钮不禁用）与走完发布向导（成功提示=常驻区域 + 内层节点切换，区域始终可见）；无 Chrome 明确跳过。

### `scripts/verify-layout.js` —— 版式不变量（220/220）

四个组合（mobile × ecommerce/account、desktop × saas/account）× 两个视口（375/390、1280/1440）逐页断言：**无横向溢出** / **文本未纵向截断**（排除 `.sr-only` 与 `-webkit-line-clamp` 这两类有意裁切；横向 `truncate`/ellipsis 不在此项）/ **图片未撑破容器** / **首屏有主内容** / 移动端「底部导航未遮挡内容」（**页面根容器**（`main` 的父元素）`padding-bottom ≥ nav 高 + 下边距`）/ 桌面端「侧栏未压盖主区」。每页先过**环境守卫**：`.p-4` 探针必须算出 `1rem`（按 root font-size 计，不写死 16px）；**首屏即未生效** ⇒ 打印「⚠ Tailwind CDN 未生效 —— 跳过」并 **exit 0**（`selfcheck` 计「跳过 n/4」，`LAYOUT_FORCE=1` 时改为判失败）——既不拿无样式文档的几何量假绿，也不把环境缺失当回归。
存在理由：像素回归（F6 全量）要先本地化 Tailwind CDN / 图片 / 字体并重冻 34 个 golden，成本与「默认产物逐字节不变」这条护栏冲突；而这些几何量能抓住像素回归真正关心的「版式塌」，且零基线、零资产。视觉审美仍归人工评审。
`--selftest` 是**双向自测**：两个坏页（溢出 + 截断 + 导航无补偿；侧栏绝对定位压盖主区）必须被抓到；两个绿例（移动端补偿内边距在 `main` 父容器上、桌面端侧栏与主区并排）必须零误报——防止「闸门恒真」与「闸门恒红」两种失真。全部离线可跑（绿例自带一条 `.p-4` 桩规则）。
**环境不可用按跳过计**：首屏探针发现 Tailwind CDN 未生效时，打印「⚠ Tailwind CDN 未生效 —— 跳过…」并 exit 0（`selfcheck` 把它与「未找到 Chrome」一样记为跳过；`LAYOUT_FORCE=1` 可强制判定）。原因：无样式文档的几何量恒无溢出，宁可不判定也不假绿。
两处实现坑：① **每个平台必须独立工作区**（`generate-prototype` 不清旧产物，同目录先 mobile 后 desktop 会量到上一平台的页面）；② 桌面端 `index.html` 可能是 `<meta http-equiv=refresh>` **跳转桩**（292 字节），直接 `page.goto` 会报「Execution context destroyed」，须先读文件判桩。

### `scripts/snapshot-typography.js` —— 排版实测 + 视觉留档

生成 ecommerce/account 产物 → 4 张并排截图（移动端登录密码态 / 登录验证码态（纯 CSS）/ 移动端时间戳·在线状态 / 桌面端时间戳·日期分隔·未读计数徽标）→ 合成一张 `docs/visual/typography-snapshot-<YYYYMMDD>.png`（含实测脚注）。它**同时是断言**：出图前用 headless Chrome 的 `getComputedStyle` 实测底部导航/快捷入口 12px·500、`.meta` 时间戳 12px·400、徽标 11px·500·600、`.delta` 12px·500（按页声明必须项，元素不在的页自动跳过——例如 `chat` 页 `TABBAR_HIDDEN` 本就不含底部导航），实测与期望不符即退出 1。存在理由：静态断言只能证明「类名写对了」，证明不了**渲染出来几 px**；且视觉留档必须可重放，否则下次无人能复现。（提示：外壳页的 iframe 无法同源访问，故量字号在 `pages/*.html` 上做；截图变体必须写回产物目录内，否则相对路径 `pages/…` 全断、设备框里只剩占位图。）
