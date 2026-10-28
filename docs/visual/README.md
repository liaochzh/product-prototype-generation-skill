# 视觉留档（docs/visual）

本目录是**人工比对用的渲染留档**，不是测试基线。基线在 `fixtures/golden/`（三维文本/属性/class）；
这里存的是「肉眼层面长什么样」，用来回答 golden 回答不了的问题：**字号档位改完之后，实际渲染出来协调吗**。

## 现有留档

| 文件 | 内容 |
| --- | --- |
| `typography-snapshot-20261016.png` | 排版留档：micro(11) 只服务微标签/图标尺寸，信息性标签 ≥ xs(12) |
| `typography-snapshot-20261027.png` | 同上四联图，含 F4-a 主题与 F6-lite 版式改动后的实测脚注（无 Chrome 的机器不会生成；旧图保留用于对照） |

`typography-snapshot-<YYYYMMDD>.png` 是 4 张并排图 + 实测脚注：

1. 移动端 · 登录（密码态）
2. 移动端 · 登录（验证码态）——**纯 CSS 切换**（`radio` + `has-[:checked]` + `group-has-[#…:checked]/login:`），页面自身无切换脚本
3. 移动端 · 时间戳 / 在线状态（`.meta` 12/400）
4. 桌面端 · 时间戳 / 日期分隔 / 未读计数徽标（`.meta` 12/400、`.badge` 11/600）

## 重新生成

```bash
cd <skill 目录>
node scripts/snapshot-typography.js      # CHROME=/path/to/chrome 可指定浏览器
```

- 需本机 Chrome/Chromium；找不到时**明确跳过并返回 0**（不会假绿）。
- 脚本**同时是断言**：出图前用 headless Chrome `getComputedStyle` 实测字号字重
  （底部导航/快捷入口 12px·500、`.meta` 12/400、徽标 11px·500·600、`.delta` 12/500），
  实测与期望不符则**退出 1**——图与断言同源同一份产物，避免「图对了但断言没跑」。
- 必须在**产物目录内**写截图变体（外壳 iframe 用相对路径 `pages/*.html`，挪走就只剩占位图）；
  字号探测在 `pages/*.html` 上做（外壳的 iframe 无法同源访问）。
- 产物为 `<日期>.png`，**同日重跑覆盖同名文件**（有意设计：本目录是**人工比对用的当日留档**、不是版本历史——
  同日多跑属同一状态点的多次验证，中间态由**断言**承担证据职责）；跨日会新增文件（历史留档得以保留）。
- 需要交互才出现的状态（过程反馈、倒计时）**不纳入静态图**：截不到有意义的状态（只有空态），
  其行为证据走 `verify-status-announcements.js`（见上表）。

## 与其它验证的分工

| 手段 | 能证明 | 不能证明 |
| --- | --- | --- |
| `selfcheck`（场景 32 等） | 源码里类名写对了、方向性棘轮（信息性标签不得回落 micro） | 浏览器里**渲染成几 px** |
| `snapshot-typography.js` | 实际渲染的字号字重 + 视觉并排观感 | 交互行为 |
| `verify-login-state.js` | 浏览器里登录态**真的能切换** | 视觉档位是否协调 |
| `verify-status-announcements.js` | 浏览器里过程反馈**真的会播报**（导出点击 / 发布向导；区域常驻可见、不逐次重播） | 视觉观感、字号档位 |
| `freeze-golden.js` | 三维（文本/属性/class）零回归 | 几何/字号档位的**观感** |