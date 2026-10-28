# 状态播报（WCAG 4.1.3）接线契约

> 本文件由 SKILL.md 拆出（2026-10-27 F1 分层）。SKILL.md 只保留结论与触发条件；需要动手改生成链路/模板/词典时读本文件。本文件不再链向其它 references 文件（引用只一层深）。

来源：SKILL.md「设计系统」段（原 96–100 行）。

**交互与状态播报**：切换类交互**纯 CSS 优先**（`radio` + `has-[:checked]` / `group-has-[#id:checked]/<group>`），脚本只做时间类（倒计时）。**凡「不改变焦点、不改变上下文」的状态变化都要可播报**（WCAG 4.1.3）：
- **面板/状态切换**（如登录态）→ 旁侧 `role="status" aria-live="polite" aria-atomic="true"` 区域，**每个态一个 span**，靠**同一套** `group-has-[#…:checked]` 机制决定谁进入无障碍树（切换 → 区域文本变化 → 播报；初始加载不播报）——模板里的 `[data-mode-status]`。
- **逐秒变动的文案**（倒计时按钮）→ **禁止**把 live region 挂在按钮上（按钮文案每秒都变 → 每秒播报）；改为只在「开始 / 结束」两次写入旁侧 `role="status"` 节点（`[data-code-status]`，文案来自词典 `codeButton.statusSent`（含 `{{s}}` 占位符）/`statusReady`，可见文案仍逐秒更新）。
- **过程反馈**（点击后需要等待的动作：导出/提交等）→ 状态写进 `role="status"` 区域（示例 `[data-export-status]`，文案由词典经 `data-*` 透传，脚本不硬编码）。**区域必须常驻**：`hidden` 只允许挂在**内层**节点上（把 `hidden` 挂在 live region 自身 = 隐藏期间的内容变化多数读屏器不播报，本轮真踩过发布成功提示的旧形态）；文案按「开始 / 完成」两次变化，不要每次进度都改写。
- 棘轮：`selfcheck` **场景 34/35**（接线齐备 + 按钮上出现 `aria-live` 即报错 + **播报区域必须常驻**（`hidden` 挂在区域自身即报错）+ 产物级类名/文案解析）；浏览器层由 `scripts/verify-login-state.js`（每态恰 1 条进入树、中途不逐秒重播）与 `scripts/verify-status-announcements.js`（点击后真播报、区域真常驻）实测。
