# 可选主题（`--theme`）

> 本文件是 SKILL.md「设计系统 → 可选主题」的细则。只在**新增/修改主题**时读。

## 一句话模型

主题 = **一组色板引用 + 一对字体栈引用**。色值与字体串的唯一事实来源是 `constants.js`；`themes/index.js` 只写名字，`selfcheck` 场景 38 扫「主题目录不得出现颜色字面量」。

## 形状

```js
// themes/index.js
<key>: {
  name, mood,                                     // 展示文案
  primary: '<色板名>',                             // THEME_PALETTE（颜色名）∪ brandColors（productType 名）
  accents: { <语义键>: '<色板名>' },                // 语义键由主题自定（success/promo/trust…）
  gradients: { primary: '<色板名>', secondary: '<色板名>' },
  fonts: { sans: '<fontStacks 键>', display: '<fontStacks 键>' },
}
```

- 现有色板名：`emerald/blue/violet/rose/amber/slate`（`brandColors` 的颜色别名，见 `constants.js` 的 `THEME_PALETTE`）+ `indigo/cyan/teal/lime/fuchsia/orange/stone/graphite`（`themePalette`）。
- 字体栈键：`systemSans` / `humanistSans` / `geometricSans` / `editorialSerif`（全部**零外链**）。
- **accents 的键是语义名、值是色板名**。不要把 `COLOR_PRESETS[productType].accents` 的键（`growth`/`editorial` 等）当色板写进来——那类名字 `resolveSwatch` 不认，场景 38a 会红。

## 新增一个主题（四步）

1. `constants.js`：若需要新颜色，在 `themePalette` 加一条 hsl（**不要**在 themes 里写值）；若需要新字体栈，在 `fontStacks` 加一条 CSS 栈串。
2. `themes/index.js`：照形状加一条；`primary`/`accents`/`gradients`/`fonts` 全部用名字引用。
3. 自检：`node scripts/selfcheck.js`（场景 38 应仍全绿）。
4. 看效果：`WORKSPACE=$(mktemp -d) node scripts/theme-showcase.js`（全主题对照页），再 `--theme <key>` 生成真实产物。

## 优先级与作用域（判据）

| 情形 | 结果 |
|---|---|
| 只给 `--theme` | primary/accents/渐变/字体都取主题 |
| `brandColor` + `--theme` | **primary 取 brandColor**，accents/渐变取主题 |
| `brandColor` 解析失败 | 打 `WARN`，按「没给」处理（主题 > 预设），不静默取 `other` |
| 不给 `--theme` | 完全走 productType 预设，产物与旧版**逐字节一致** |

**主题作用域 = primary / accents / 渐变 / 字体。** `success/warning/error/info` 是固定色相（`constants.js` 的 `semanticColors`），模板里 `text-emerald-600` 这类字面类也不随主题变——不要期待「全站换肤」。

## 字体配对的两个约束

1. **零外链**：只用系统/已装字体，缺字体时按栈顺序回退——因此「配对效果」依赖浏览机已装字体，不是所有机器都一样。
2. **display 必须真的被消费**：主题命中时 `tailwind-config.js` 会追加一个插件，把 display 栈写到 `.page-title`/`.hero-title`（模板里从不写 `font-display`，不接这一步等于没生效）。该插件**只能用 `theme('fontFamily.display')` 取栈**，禁止闭包引用外层变量——插件经 `Function.prototype.toString()` 序列化，闭包变量在浏览器端是 `undefined`。

## 预览页

`node scripts/theme-showcase.js` → `<WORKSPACE>/theme-showcase.html`（`--out` 可改，`--theme <key>` 只渲其一）。纯内联样式、零 CDN，离线可看。它展示的是**主题本身**（色阶/渐变/字体/占位图），整页效果请用 `--theme` 真生成一次。

## 与其它模块的边界

- `getPresets()` / `recommendByKeywords()`（`utils/color-scheme.js`）是**产品类型预设**链路，与主题无关；主题不改变它们的输出。
- 降级占位图（Unsplash 不可用时的 SVG）跟随主题主色——同一个 `resolvePrimaryHsl()` 裁决点，不会再出现「配色换了、占位图没换」。
- 主题只作用于生成期，产物没有运行时依赖；`--watch` 下主题是进程常量（改主题需重跑）。
