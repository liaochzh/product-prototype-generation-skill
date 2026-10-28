/**
 * Tailwind 配置生成器 - 根据产品类型、平台、品牌色生成完整配置
 */

import { DESIGN_TOKENS, semanticColors, TYPE_ROLES } from '../constants.js';
import { resolvePrimaryHsl } from './color-scheme.js';
import { log } from './logger.js';

const { breakpoints, radius, shadows, blur, fontFamily, fontSize, spacing, transition, zIndex } = DESIGN_TOKENS;

/**
 * 生成完整的 Tailwind 配置对象
 * @param {object} prdMeta 至少含 `productType`（可选 `brandColor`）
 * @param {'mobile'|'desktop'} platform
 * @param {{theme?:object|null}} [options] `theme` 来自 `themes/index.js` 的 `getTheme()`；null=默认路径
 */
export function generateTailwindConfig(prdMeta, platform, { theme = null } = {}) {
  const { productType, brandColor } = prdMeta;

  // 品牌色：裁决逻辑**不在本文件**（三消费点共用 `resolvePrimaryHsl`，避免同一条规则抄三遍）
  const brandHsl = resolvePrimaryHsl(productType, brandColor, theme);

  // 生成语义色系
  const colors = semanticColors(brandHsl);

  // 基础配置
  const config = {
    content: [], // 由外部指定
    theme: {
      extend: {
        // 颜色系统
        colors: {
          // 品牌色
          brand: colors.primary,
          // 语义色
          success: generateColorScale(colors.success),
          warning: generateColorScale(colors.warning),
          error: generateColorScale(colors.error),
          info: generateColorScale(colors.info),
          // 中性色
          neutral: colors.neutral,
          // 语义别名
          background: 'neutral.50',
          surface: 'white',
          'surface-hover': 'neutral.100',
          border: 'neutral.200',
          'border-hover': 'neutral.300',
          text: 'neutral.900',
          'text-muted': 'neutral.500',
          'text-inverse': 'white',
        },

        // 字体（主题命中时用主题的字体栈，缺省仍是设计令牌里的系统栈）
        fontFamily: {
          sans: (theme ? theme.fontStacks.sans : fontFamily.sans).split(',').map(f => f.trim().replace(/^["']|["']$/g, '')),
          mono: fontFamily.mono.split(',').map(f => f.trim().replace(/^["']|["']$/g, '')),
          display: (theme ? theme.fontStacks.display : fontFamily.display).split(',').map(f => f.trim().replace(/^["']|["']$/g, '')),
        },

        // 字距
        letterSpacing: {
          tighter: '-0.03em',
          tight: '-0.02em',
          normal: '0em',
          wide: '0.02em',
          wider: '0.05em',
          widest: '0.14em',
        },

        // 字号
        fontSize,

        // 行高
        lineHeight: {
          tight: '1.25',
          normal: '1.5',
          relaxed: '1.6',
          loose: '2',
        },

        // 间距
        spacing,

        // 圆角
        borderRadius: radius,

        // 阴影
        boxShadow: shadows,

        // 模糊
        backdropBlur: blur,

        // 断点
        screens: breakpoints,

        // 过渡动画
        transitionDuration: {
          fast: transition.fast,
          normal: transition.normal,
          slow: transition.slow,
          slower: transition.slower,
        },
        transitionTimingFunction: {
          'ease-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
          'ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
          'ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
          spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        },

        // 动画关键帧
        keyframes: {
          'fade-in': {
            '0%': { opacity: '0' },
            '100%': { opacity: '1' },
          },
          'fade-out': {
            '0%': { opacity: '1' },
            '100%': { opacity: '0' },
          },
          'slide-up': {
            '0%': { transform: 'translateY(10px)', opacity: '0' },
            '100%': { transform: 'translateY(0)', opacity: '1' },
          },
          'slide-down': {
            '0%': { transform: 'translateY(-10px)', opacity: '0' },
            '100%': { transform: 'translateY(0)', opacity: '1' },
          },
          'scale-in': {
            '0%': { transform: 'scale(0.95)', opacity: '0' },
            '100%': { transform: 'scale(1)', opacity: '1' },
          },
          'spin': {
            '0%': { transform: 'rotate(0deg)' },
            '100%': { transform: 'rotate(360deg)' },
          },
          'pulse-soft': {
            '0%, 100%': { opacity: '1' },
            '50%': { opacity: '0.7' },
          },
          'shimmer': {
            '0%': { backgroundPosition: '-200% 0' },
            '100%': { backgroundPosition: '200% 0' },
          },
        },

        // 动画
        animation: {
          'fade-in': 'fade-in 200ms ease-out',
          'fade-out': 'fade-out 150ms ease-in',
          'slide-up': 'slide-up 300ms ease-out',
          'slide-down': 'slide-down 300ms ease-out',
          'scale-in': 'scale-in 200ms ease-out',
          'spin': 'spin 1s linear infinite',
          'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
          'shimmer': 'shimmer 2s linear infinite',
        },

        // Z-index
        zIndex,

        // 语义排版角色：role → { token, weight }，按平台解析（模板只准引用语义类）
        // 置于 extend 末尾，使内联配置的 diff 为纯追加（减少结构探针位移噪声）
        typeRole: TYPE_ROLES[platform] || TYPE_ROLES.mobile,
      },
    },
    plugins: [
      // 自定义工具类
      function ({ addUtilities, addComponents, theme }) {
        /**
         * fontSize token 为 [size, { lineHeight, letterSpacing }] 数组形态，
         * theme('fontSize.xs') 返回整个数组；直接赋给 fontSize 会生成
         * `font-size: 0.75rem,1.5` 这样的非法 CSS 并被整条丢弃。
         * 因此组件类里的字号必须经这两个助手解包，禁止再写裸字面量。
         */
        const typeSize = (key) => {
          const v = theme(`fontSize.${key}`);
          return Array.isArray(v) ? v[0] : v;
        };
        const typeLineHeight = (key) => {
          const v = theme(`fontSize.${key}`);
          return Array.isArray(v) ? (v[1] && v[1].lineHeight) || theme('lineHeight.normal') : theme('lineHeight.normal');
        };

        // 文本截断
        addUtilities({
          '.text-balance': { 'text-wrap': 'balance' },
          '.line-clamp-1': { display: '-webkit-box', '-webkit-line-clamp': '1', '-webkit-box-orient': 'vertical', overflow: 'hidden' },
          '.line-clamp-2': { display: '-webkit-box', '-webkit-line-clamp': '2', '-webkit-box-orient': 'vertical', overflow: 'hidden' },
          '.line-clamp-3': { display: '-webkit-box', '-webkit-line-clamp': '3', '-webkit-box-orient': 'vertical', overflow: 'hidden' },
        });

        // 滚动条隐藏
        addUtilities({
          '.scrollbar-hide': {
            '-ms-overflow-style': 'none',
            'scrollbar-width': 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          },
        });

        // 毛玻璃
        addUtilities({
          '.glass': {
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
          },
          '.glass-dark': {
            background: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          },
        });

        // 排版与装饰工具类
        // 语义排版角色：role → 解包后的 { fontSize, lineHeight, fontWeight }
        // （token 来自 theme.typeRole，由 generateTailwindConfig 按平台注入）
        const role = (name, letterSpacing) => {
          const r = theme(`typeRole.${name}`) || {};
          const token = r.token || 'base';
          const out = {
            fontSize: typeSize(token),
            lineHeight: typeLineHeight(token),
            fontWeight: r.weight || '400',
          };
          if (letterSpacing) out.letterSpacing = letterSpacing;
          return out;
        };
        addUtilities({
          // 眉标：大写、宽字距的小标签
          '.eyebrow': {
            fontSize: typeSize('micro'),
            fontWeight: '600',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            lineHeight: '1',
          },
          // ── 语义排版角色：同类元素一律引用，禁止再用裸 text-* 表达这些角色 ──
          // 注意：这些类走 addUtilities（层叠后于核心 text-* utility），
          // 故不再设置 color —— 否则会覆盖 `text-rose-600` 之类的颜色类；
          // 默认颜色靠 layout body 的 text-neutral-900 继承。
          '.page-title': role('pageTitle', '-0.015em'),
          '.nav-title': role('navTitle', '-0.01em'),
          '.hero-title': role('heroTitle', '-0.015em'),
          '.section-title': role('sectionTitle', '-0.01em'),
          '.item-title': role('itemTitle', '-0.005em'),
          '.price': role('price'),
          '.price-hero': role('priceHero', '-0.015em'),
          '.stat-value': role('statValue', '-0.015em'),
          '.stat-hero': role('statHero', '-0.015em'),
          '.label': role('label'),
          '.meta': role('meta'),
          // 极细分割线
          '.hairline': {
            height: '1px',
            background: theme('colors.neutral.200'),
            border: 'none',
          },
          // 图片底部渐隐遮罩（用于图文叠加可读性）
          '.hero-overlay': {
            background: 'linear-gradient(to top, rgba(2,6,23,0.82) 0%, rgba(2,6,23,0.30) 45%, rgba(2,6,23,0) 100%)',
          },
          // 卡片悬停轻抬升
          '.card-lift': {
            transition: 'transform 250ms cubic-bezier(0.4,0,0.2,1), box-shadow 250ms cubic-bezier(0.4,0,0.2,1)',
            '&:hover': { transform: 'translateY(-2px)', boxShadow: theme('boxShadow.lg') },
          },
          // 焦点环
          '.focus-ring': {
            outline: 'none',
            '&:focus-visible': { outline: '2px solid', outlineOffset: '2px', outlineColor: theme('colors.brand.500') },
          },
        });

        // 组件类
        addComponents({
          '.btn': {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            fontWeight: '600',
            fontSize: typeSize('sm'),
            letterSpacing: '-0.005em',
            borderRadius: theme('borderRadius.xl'),
            transition: 'background-color 150ms ease-out, box-shadow 150ms ease-out, transform 120ms ease-out',
            cursor: 'pointer',
            border: 'none',
            outline: 'none',
            whiteSpace: 'nowrap',
            '&:disabled': { opacity: '0.5', cursor: 'not-allowed' },
            '&:focus-visible': { outline: '2px solid', outlineOffset: '2px', outlineColor: theme('colors.brand.500') },
          },
          '.btn-primary': {
            backgroundColor: theme('colors.brand.600'),
            color: 'white',
            boxShadow: '0 1px 2px 0 rgb(15 23 42 / 0.12)',
            '&:hover:not(:disabled)': { backgroundColor: theme('colors.brand.700'), boxShadow: '0 4px 10px -2px rgb(15 23 42 / 0.18)' },
            '&:active:not(:disabled)': { backgroundColor: theme('colors.brand.800'), transform: 'translateY(1px)' },
          },
          '.btn-secondary': {
            backgroundColor: theme('colors.neutral.100'),
            color: theme('colors.neutral.900'),
            '&:hover:not(:disabled)': { backgroundColor: theme('colors.neutral.200') },
            '&:active:not(:disabled)': { backgroundColor: theme('colors.neutral.300') },
          },
          '.btn-ghost': {
            backgroundColor: 'transparent',
            color: theme('colors.neutral.700'),
            '&:hover:not(:disabled)': { backgroundColor: theme('colors.neutral.100') },
            '&:active:not(:disabled)': { backgroundColor: theme('colors.neutral.200') },
          },
          '.btn-outline': {
            backgroundColor: 'white',
            border: `1px solid ${theme('colors.neutral.200')}`,
            color: theme('colors.neutral.800'),
            '&:hover:not(:disabled)': { borderColor: theme('colors.neutral.300'), backgroundColor: theme('colors.neutral.50') },
          },
          '.input': {
            width: '100%',
            padding: '0.625rem 0.875rem',
            fontSize: typeSize('sm'),
            lineHeight: typeLineHeight('sm'),
            color: theme('colors.neutral.900'),
            backgroundColor: 'white',
            border: `1px solid ${theme('colors.neutral.200')}`,
            borderRadius: theme('borderRadius.xl'),
            transition: 'border-color 150ms ease-out, box-shadow 150ms ease-out',
            boxShadow: '0 1px 2px 0 rgb(15 23 42 / 0.03)',
            '&:focus': { outline: 'none', borderColor: theme('colors.brand.400'), boxShadow: `0 0 0 3px ${theme('colors.brand.100')}` },
            '&::placeholder': { color: theme('colors.neutral.400') },
            '&:disabled': { backgroundColor: theme('colors.neutral.100'), cursor: 'not-allowed' },
          },
          '.card': {
            backgroundColor: 'white',
            borderRadius: theme('borderRadius.2xl'),
            boxShadow: theme('boxShadow.sm'),
            border: `1px solid ${theme('colors.neutral.200')}`,
            transition: 'box-shadow 220ms cubic-bezier(0.4,0,0.2,1), border-color 220ms ease-out, transform 220ms cubic-bezier(0.4,0,0.2,1)',
            '&:hover': { boxShadow: theme('boxShadow.lg'), borderColor: theme('colors.neutral.300') },
          },
          '.badge': {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.1875rem 0.5rem',
            fontSize: typeSize('micro'),
            fontWeight: '600',
            lineHeight: typeLineHeight('micro'),
            borderRadius: theme('borderRadius.full'),
          },
          // 涨跌/变化量胶囊（数值型 delta）。WHY 与 .badge（micro=11、600）分开：
          // 它承载的是带图标的数值对比短语（`+18.3% 环比`），档位为 xs=12、字重 500，
          // 两页（desktop home/dashboard）此前各自写死 `rounded-full px-2 py-0.5 text-xs font-medium`
          // —— 形似 .badge 而档位不同，属「未被契约覆盖的同值重复」，本轮收纳为独立组件类。
          // 不设 color：颜色由调用方的语义色类（text-rose-600 / text-emerald-600）决定。
          '.delta': {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.125rem 0.5rem',
            fontSize: typeSize('xs'),
            fontWeight: '500',
            lineHeight: typeLineHeight('xs'),
            borderRadius: theme('borderRadius.full'),
          },
          // 柔性胶囊标签（品牌色调）
          '.chip': {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.3125rem 0.75rem',
            fontSize: typeSize('xs'),
            fontWeight: '500',
            color: theme('colors.neutral.600'),
            backgroundColor: theme('colors.neutral.100'),
            borderRadius: theme('borderRadius.full'),
            border: `1px solid ${theme('colors.neutral.200')}`,
            transition: 'background-color 150ms ease-out, color 150ms ease-out',
            '&:hover': { backgroundColor: theme('colors.neutral.200'), color: theme('colors.neutral.800') },
          },
          // 统计块
          '.stat': {
            backgroundColor: 'white',
            borderRadius: theme('borderRadius.2xl'),
            border: `1px solid ${theme('colors.neutral.200')}`,
            boxShadow: theme('boxShadow.sm'),
            padding: '1.25rem',
          },
        });
      },
    ],
  };

  // 可选主题：把 display 字体接到**真实消费点**（否则主题换了 display 栈，产物渲染毫无变化
  // —— `font-display` 工具类模板从不引用，属于「看起来生效、其实没接线」）。
  // WHY 用 `theme('fontFamily.display')` 而不是闭包变量：插件经 `Function.prototype.toString()`
  // 序列化进内联 config，闭包变量在浏览器端是 undefined。
  // 只在给主题时追加：默认路径的 plugins 数组保持不变（产物逐字节不变）。
  if (theme) {
    config.plugins.push(function ({ addComponents, theme: tw }) {
      const displayStack = tw('fontFamily.display').join(', ');
      addComponents({
        '.page-title': { fontFamily: displayStack },
        '.hero-title': { fontFamily: displayStack },
      });
    });
  }

  // 平台特定调整
  if (platform === 'mobile') {
    config.theme.extend.animation['touch-feedback'] = 'scale-in 100ms ease-out';
    config.theme.extend.keyframes['touch-feedback'] = {
      '0%': { transform: 'scale(1)' },
      '50%': { transform: 'scale(0.96)' },
      '100%': { transform: 'scale(1)' },
    };
  }

  log.template.debug(`Generated Tailwind config for ${productType} (${platform})`);
  return config;
}

/**
 * 注：品牌色的解析与裁决已统一到 `utils/color-scheme.js`（`resolvePrimaryHsl` + `parseColor`），
 * 本文件不再保留第二份 parseColor/rgbToHsl —— 同一条规则两份实现时，改一处漏一处，
 * 且「配色用了主题、字体/配置没跟上」这类割裂在产物里看不出来。
 */

/**
 * 生成颜色阶梯
 */
function generateColorScale(baseHsl) {
  const { h, s, l } = baseHsl;
  return {
    50: `hsl(${h}, ${s}%, ${Math.min(95, l + 50)}%)`,
    100: `hsl(${h}, ${s}%, ${Math.min(90, l + 45)}%)`,
    200: `hsl(${h}, ${s}%, ${Math.min(80, l + 35)}%)`,
    300: `hsl(${h}, ${s}%, ${Math.min(70, l + 25)}%)`,
    400: `hsl(${h}, ${s}%, ${Math.min(60, l + 15)}%)`,
    500: `hsl(${h}, ${s}%, ${l}%)`,
    600: `hsl(${h}, ${Math.min(90, s + 10)}%, ${Math.max(35, l - 10)}%)`,
    700: `hsl(${h}, ${Math.min(90, s + 15)}%, ${Math.max(30, l - 15)}%)`,
    800: `hsl(${h}, ${Math.min(90, s + 20)}%, ${Math.max(25, l - 20)}%)`,
    900: `hsl(${h}, ${Math.min(90, s + 25)}%, ${Math.max(20, l - 25)}%)`,
    950: `hsl(${h}, ${Math.min(90, s + 30)}%, ${Math.max(15, l - 30)}%)`,
  };
}

/**
 * 将函数型插件序列化为可注入浏览器的 JS 源码。
 * - 非函数项（null / 字符串 / 对象）在浏览器端无法执行，跳过并告警；
 * - 转义 `</script`，避免插件源码含该串时提前闭合内联脚本标签。
 */
function serializePlugins(plugins) {
  const list = plugins || [];
  // 先分流、后统一告警（查询与副作用分离）：非函数项无法在浏览器端执行，跳过
  const fns = list.filter((fn) => typeof fn === 'function');
  for (const nonFn of list.filter((x) => typeof x !== 'function')) {
    log.template.warn(`忽略非函数插件（无法注入浏览器端）：${Object.prototype.toString.call(nonFn)}`);
  }
  return fns.map((fn) => `(${fn.toString()})`).join(',\n    ');
}

/**
 * 生成内联脚本标签内容
 */
export function generateInlineScript(config) {
  // 关键：plugins 是函数数组，JSON.stringify 会把函数丢弃成 null，
  // 浏览器端 Tailwind Play CDN 执行到 null 会抛错 → 全部工具类/组件类失效（输出裸 HTML）。
  // 故将 plugins 从 JSON 剥离，改以真实 JS 源码（Function.prototype.toString）形式注入。
  const { plugins, ...serializable } = config;
  const json = JSON.stringify(serializable, null, 2);
  const pluginSrc = serializePlugins(plugins);
  // 注意：JSON.stringify 会丢弃函数/undefined 值，故不能用 Object.keys(serializable).length 判断，
  // 否则 `{ theme: () => {} }` 之类会 stringify 成 '{}'，slice 后产出非法 `{,`
  const hasFields = json !== '{}';

  let body;
  if (!pluginSrc) {
    // 无插件：原样输出（不含 plugins 键）
    body = json;
  } else if (hasFields) {
    // serializable 非空 → json 形如 `{...}`，砍掉末位 } 后追加 plugins 字段
    body = `${json.slice(0, -1)},\n  "plugins": [\n    ${pluginSrc}\n  ]\n}`;
  } else {
    // serializable 为空对象 → 不能砍末位（否则得到非法 `{,`），显式构造
    body = `{\n  "plugins": [\n    ${pluginSrc}\n  ]\n}`;
  }
  // 统一转义 `</script`（覆盖 JSON 值与插件源码两条路径），避免提前闭合内联脚本标签
  const safeBody = body.replace(/<\/(script)/gi, '<\\/$1');
  return `<script>
  tailwind.config = ${safeBody};
</script>`;
}

/**
 * 生成完整的 HTML head 所需资源
 */
export function generateHeadResources(config, title, description = '') {
  const inlineScript = generateInlineScript(config);

  return `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="description" content="${description}">
  <meta name="theme-color" content="${config.theme.extend.colors.brand[600]}">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  <script>window.addEventListener('DOMContentLoaded',function(){window.lucide&&window.lucide.createIcons();});</script>
  ${inlineScript}
  <style>
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      font-family: ${config.theme.extend.fontFamily.sans.join(', ')};
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }
    ::selection { background-color: ${config.theme.extend.colors.brand[200]}; color: ${config.theme.extend.colors.brand[900]}; }
    .lucide { width: 1em; height: 1em; display: inline-block; vertical-align: -0.125em; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${config.theme.extend.colors.neutral[300]}; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: ${config.theme.extend.colors.neutral[400]}; }
  </style>`;
}

export default {
  generateTailwindConfig,
  generateInlineScript,
  generateHeadResources,
};