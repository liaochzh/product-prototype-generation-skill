# 语义排版与组件契约

> 本文件由 SKILL.md 拆出（2026-10-27 F1 分层）。SKILL.md 只保留结论与触发条件；需要动手改生成链路/模板/词典时读本文件。本文件不再链向其它 references 文件（引用只一层深）。

来源：SKILL.md「设计系统」段（原 68–94 行）。

### 语义搭配契约（跨模板统一，唯一数值源见 `constants.js`）

**排版角色**（`TYPE_ROLES`；桌面端信息密度高，分组标题/统计各升一档）——同类元素跨页一律引用同一角色类：

| 角色类 | mobile | desktop | 用途 |
|---|---|---|---|
| `.page-title` | 2xl (24) | 2xl (24) | 页面主标题 |
| `.nav-title` | lg (18) | lg (18) | 页内导航/头部标题 |
| `.hero-title` | xl (20) | 2xl (24) | Hero / 详情主标题 |
| `.section-title` | base (16) | lg (18) | 分组标题 |
| `.item-title` | base (16) | base (16) | 卡片 / 列表行 / 菜单标题 |
| `.price` | lg (18) | lg (18) | 卡片价格 |
| `.price-hero` | 2xl (24) | 3xl (30) | 详情主价 |
| `.stat-value` | lg (18) | xl (20) | 统计数值 |
| `.stat-hero` | 2xl (24) | 3xl (30) | 大号 KPI |
| `.label` | sm (14) | sm (14) | 字段标签 / 指标小标题（中性色行内标签，颜色另给） |
| `.meta` | xs (12) | xs (12) | 时间戳 / 元信息 / 次要标签（聊天时间、日期分隔、在线状态等） |
| `.eyebrow` | micro (11) | micro (11) | 眉标 |
| （正文） | `text-sm` (14) | `text-sm` (14) | 段落 / 描述 |

**注意**：角色类走 `addUtilities`（层叠后于核心 utility）→ 会**覆盖**同元素的裸 `text-lg` 等尺寸类；但角色类**不设 color**，故颜色覆盖（如 `.section-title text-rose-600`）依然生效，默认色继承 layout body 的 `text-neutral-900`。

**圆角角色**：大容器 surface = `rounded-2xl`（`.card`）｜控件 control = `rounded-xl`（`.btn`/`.input`/缩略图/图标方块）｜胶囊 pill = `rounded-full`（`.chip`/`.badge`/`.delta`/圆形按钮）｜首屏大图 = `rounded-3xl`。

**组件类**（`utils/tailwind-config.js` 的 `addComponents`，字号一律经 `typeSize()`/`typeLineHeight()` 解包）：`.card`/`.badge`（微标签 micro=11、600）/`.delta`（涨跌/变化量胶囊 xs=12、500）/`.chip`/`.btn`/`.input` 等；`.badge`/`.delta` **不设 color**，颜色由调用方的语义色类（如 `text-rose-600`）决定。**同一串裸类在两处以上重复出现即应收纳为组件类**（`.delta` 就是这样来的：`rounded-full px-2 py-0.5 text-xs font-medium` 曾散落在 desktop `home`/`dashboard`，改档位必漏一处；棘轮见 `selfcheck` 场景 24）。

**组件尺寸**：页头导航图标按钮 = 移动端 40（`h-10 w-10`）/ 桌面端 36（`h-9 w-9`，与桌面 36 头像同一视觉量级）｜卡片内图标方块 36（`h-9 w-9`）｜桌面表格操作按钮 32（`h-8 w-8`）｜桌面输入区操作按钮 40（`h-10 w-10`）。**边框**统一 `ring-1 ring-neutral-200/70`。

> 主题（`--theme`）只引用本文件的色板/字体栈名，不改这里的值；形状与边界见 `references/themes.md`。
