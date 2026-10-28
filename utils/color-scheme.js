/**
 * 配色方案生成器 - 根据产品类型、品牌偏好生成完整配色
 */

import { DESIGN_TOKENS, semanticColors } from '../constants.js';
import { log } from './logger.js';

const { brandColors } = DESIGN_TOKENS;

/**
 * 产品类型配色预设
 */
const COLOR_PRESETS = {
  ecommerce: {
    name: '电商交易',
    mood: '信任、成交、绿色生态',
    primary: brandColors.ecommerce,
    accents: {
      success: { h: 142, s: 76, l: 36 },
      promo: { h: 38, s: 92, l: 50 },
      trust: { h: 210, s: 100, l: 45 },
    },
    gradients: [
      'linear-gradient(135deg, hsl(158, 64%, 42%), hsl(158, 64%, 32%))',
      'linear-gradient(135deg, hsl(158, 64%, 50%), hsl(142, 76%, 36%))',
    ],
  },
  saas: {
    name: 'SaaS 专业',
    mood: '专业、技术、蓝色智慧',
    primary: brandColors.saas,
    accents: {
      analytics: { h: 199, s: 89, l: 48 },
      growth: { h: 142, s: 76, l: 36 },
      enterprise: { h: 262, s: 83, l: 58 },
    },
    gradients: [
      'linear-gradient(135deg, hsl(221, 83%, 53%), hsl(221, 83%, 43%))',
      'linear-gradient(135deg, hsl(221, 83%, 60%), hsl(199, 89%, 48%))',
    ],
  },
  tool: {
    name: '效率工具',
    mood: '高效、智能、紫色创新',
    primary: brandColors.tool,
    accents: {
      automation: { h: 280, s: 100, l: 60 },
      speed: { h: 38, s: 92, l: 50 },
      focus: { h: 210, s: 100, l: 45 },
    },
    gradients: [
      'linear-gradient(135deg, hsl(262, 83%, 58%), hsl(262, 83%, 48%))',
      'linear-gradient(135deg, hsl(262, 83%, 65%), hsl(280, 100%, 60%))',
    ],
  },
  community: {
    name: '社区社交',
    mood: '温暖、连接、粉色活力',
    primary: brandColors.community,
    accents: {
      social: { h: 330, s: 81, l: 60 },
      live: { h: 0, s: 84, l: 60 },
      creator: { h: 280, s: 100, l: 60 },
    },
    gradients: [
      'linear-gradient(135deg, hsl(330, 81%, 60%), hsl(330, 81%, 50%))',
      'linear-gradient(135deg, hsl(330, 81%, 65%), hsl(0, 84%, 60%))',
    ],
  },
  content: {
    name: '内容创作',
    mood: '创意、表达、橙色灵感',
    primary: brandColors.content,
    accents: {
      editorial: { h: 35, s: 92, l: 50 },
      reading: { h: 210, s: 100, l: 45 },
      publish: { h: 142, s: 76, l: 36 },
    },
    gradients: [
      'linear-gradient(135deg, hsl(35, 92%, 50%), hsl(35, 92%, 40%))',
      'linear-gradient(135deg, hsl(35, 92%, 55%), hsl(45, 100%, 55%))',
    ],
  },
  other: {
    name: '通用中性',
    mood: '极简、专业、深灰克制',
    primary: brandColors.other,
    accents: {
      primary: { h: 215, s: 28, l: 17 },
      muted: { h: 215, s: 16, l: 47 },
      accent: { h: 221, s: 83, l: 53 },
    },
    gradients: [
      'linear-gradient(135deg, hsl(215, 28%, 17%), hsl(215, 28%, 10%))',
      'linear-gradient(135deg, hsl(215, 28%, 25%), hsl(215, 28%, 15%))',
    ],
  },
};

/**
 * 把已解析主题折成 `COLOR_PRESETS` 的同形状，供 `generateColorScheme` 复用后续流程。
 * 渐变串在这里拼：主题只给色源 `{h,s,l}`，避免 `themes/` 里出现颜色字面量。
 */
function themePreset(theme) {
  const gradient = (hsl) => `linear-gradient(135deg, ${hslToString(hsl.h, hsl.s, hsl.l)}, ${hslToString(hsl.h, hsl.s, Math.max(15, hsl.l - 10))})`;
  const secondary = theme.gradients.secondary || theme.gradients.primary;
  return {
    name: theme.name,
    mood: theme.mood,
    primary: theme.primaryHsl,
    accents: theme.accents,
    gradients: [gradient(theme.gradients.primary), gradient(secondary)],
  };
}

/**
 * **三个消费点唯一的品牌色裁决点**（scheme / tailwind config / 图片占位图都调这里）。
 *
 * 优先级：`brandColor`（显式指定）> `theme.primaryHsl`（可选主题）> `productType` 预设。
 * 分离出来是为了避免同一条规则被抄三遍——漏改一处就出现「配色用了主题、占位图还是旧主色」。
 *
 * @param {string} productType
 * @param {string|null} brandColor  #rgb / #rrggbb / hsl(...) / rgb(...)
 * @param {{primaryHsl:{h:number,s:number,l:number}}|null} theme 已由 `themes/index.js` 解析
 * @returns {{h:number,s:number,l:number}}
 */
export function resolvePrimaryHsl(productType, brandColor = null, theme = null) {
  if (brandColor) {
    const parsed = parseColor(brandColor);
    // 解析失败不回退到 theme：用户显式给了品牌色，静默换掉比报错更难查；
    // 这里给出明确告警，再按「没给」处理（主题 > 预设）。
    if (parsed) return parsed;
    log.template.warn(`品牌色无法解析：${brandColor}（支持 #rgb / #rrggbb / hsl(h, s%, l%) / rgb(r, g, b)），已忽略并沿用${theme ? `主题「${theme.name}」` : '产品类型预设'}`);
  }
  if (theme) return theme.primaryHsl;
  return (COLOR_PRESETS[productType] || COLOR_PRESETS.other).primary;
}

/**
 * 生成完整配色方案
 * @param {string} productType
 * @param {string|null} customBrandColor
 * @param {{theme?:object|null}} [options] `theme` 来自 `themes/index.js` 的 `getTheme()`
 */
export function generateColorScheme(productType, customBrandColor = null, { theme = null } = {}) {
  const preset = theme ? themePreset(theme) : (COLOR_PRESETS[productType] || COLOR_PRESETS.other);
  const primaryHsl = resolvePrimaryHsl(productType, customBrandColor, theme);

  // 生成主色阶梯
  const primary = generateScale(primaryHsl);

  // 生成语义色
  const semantic = semanticColors(primaryHsl);

  // 生成渐变
  const gradients = generateGradients(primaryHsl, preset.gradients);

  // 生成暗色模式适配
  const dark = generateDarkMode(primary, semantic);

  const scheme = {
    productType,
    // 可选主题：null 表示走 productType 预设（默认路径逐字节不变）
    themeKey: theme ? theme.key : null,
    presetName: preset.name,
    mood: preset.mood,
    primary,
    semantic: {
      success: generateScale(semantic.success),
      warning: generateScale(semantic.warning),
      error: generateScale(semantic.error),
      info: generateScale(semantic.info),
    },
    neutral: semantic.neutral,
    accents: Object.fromEntries(
      Object.entries(preset.accents).map(([key, hsl]) => [key, generateScale(hsl)])
    ),
    gradients,
    dark,
    // CSS 变量导出
    cssVariables: generateCSSVariables(primary, semantic, gradients),
    // Tailwind 配色
    tailwindColors: generateTailwindColors(primary, semantic),
  };

  log.template.debug(`Generated color scheme for ${productType}: ${preset.name}`);
  return scheme;
}

/**
 * 生成颜色阶梯 (50-950)
 */
function generateScale(hsl) {
  const { h, s, l } = hsl;
  return {
    50: hslToString(h, s, Math.min(95, l + 50)),
    100: hslToString(h, s, Math.min(90, l + 45)),
    200: hslToString(h, s, Math.min(80, l + 35)),
    300: hslToString(h, s, Math.min(70, l + 25)),
    400: hslToString(h, s, Math.min(60, l + 15)),
    500: hslToString(h, s, l),
    600: hslToString(h, Math.min(90, s + 10), Math.max(35, l - 10)),
    700: hslToString(h, Math.min(90, s + 15), Math.max(30, l - 15)),
    800: hslToString(h, Math.min(90, s + 20), Math.max(25, l - 20)),
    900: hslToString(h, Math.min(90, s + 25), Math.max(20, l - 25)),
    950: hslToString(h, Math.min(90, s + 30), Math.max(15, l - 30)),
  };
}

/**
 * 生成渐变变体
 */
function generateGradients(primaryHsl, baseGradients) {
  const { h, s, l } = primaryHsl;
  return {
    primary: baseGradients[0],
    secondary: baseGradients[1] || `linear-gradient(135deg, ${hslToString(h, s, l + 10)}, ${hslToString(h, s, l - 10)})`,
    subtle: `linear-gradient(135deg, ${hslToString(h, Math.max(20, s - 30), l + 40)}, ${hslToString(h, Math.max(20, s - 30), l + 30)})`,
    hero: `linear-gradient(135deg, ${hslToString(h, s, l)} 0%, ${hslToString(h, s, l - 15)} 100%)`,
    card: `linear-gradient(145deg, ${hslToString(h, Math.max(10, s - 40), 98)} 0%, ${hslToString(h, Math.max(10, s - 40), 95)} 100%)`,
    glass: `linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.4) 100%)`,
    glassDark: `linear-gradient(135deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 100%)`,
  };
}

/**
 * 生成暗色模式配色
 */
function generateDarkMode(primary, semantic) {
  return {
    background: semantic.neutral[950],
    surface: semantic.neutral[900],
    'surface-hover': semantic.neutral[800],
    border: semantic.neutral[700],
    'border-hover': semantic.neutral[600],
    text: semantic.neutral[50],
    'text-muted': semantic.neutral[400],
    'text-inverse': semantic.neutral[950],
    primary: {
      ...primary,
      500: primary[400],
      600: primary[300],
      700: primary[200],
    },
  };
}

/**
 * 生成 CSS 变量
 */
function generateCSSVariables(primary, semantic, gradients) {
  const vars = {};

  // 主色
  Object.entries(primary).forEach(([key, value]) => {
    vars[`--color-brand-${key}`] = value;
  });

  // 中性色
  Object.entries(semantic.neutral).forEach(([key, value]) => {
    vars[`--color-neutral-${key}`] = value;
  });

  // 语义色
  ['success', 'warning', 'error', 'info'].forEach(name => {
    Object.entries(semantic[name]).forEach(([key, value]) => {
      vars[`--color-${name}-${key}`] = value;
    });
  });

  // 渐变
  Object.entries(gradients).forEach(([key, value]) => {
    vars[`--gradient-${key}`] = value;
  });

  // 语义别名
  vars['--color-bg'] = semantic.neutral[50];
  vars['--color-surface'] = 'white';
  vars['--color-border'] = semantic.neutral[200];
  vars['--color-text'] = semantic.neutral[900];
  vars['--color-text-muted'] = semantic.neutral[500];

  return vars;
}

/**
 * 生成 Tailwind 兼容配色对象
 */
function generateTailwindColors(primary, semantic) {
  return {
    brand: primary,
    neutral: semantic.neutral,
    success: semantic.success,
    warning: semantic.warning,
    error: semantic.error,
    info: semantic.info,
  };
}

/**
 * HSL 对象转字符串
 */
function hslToString(h, s, l) {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

/**
 * 解析颜色字符串
 * 解析失败返回 **null**（而不是静默回退某个色）——调用方需要能区分「用户没给品牌色」
 * 与「给了但解析不了」，否则 `--theme` + 非法品牌色会表现为「主题没生效」。
 */
function parseColor(color) {
  if (typeof color !== 'string') return null;
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (!/^[0-9a-fA-F]{3}$/.test(hex) && !/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;
    return rgbToHsl(r, g, b);
  }
  if (color.startsWith('hsl')) {
    const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (match) return { h: parseInt(match[1]), s: parseInt(match[2]), l: parseInt(match[3]) };
    return null;
  }
  if (color.startsWith('rgb')) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) return rgbToHsl(parseInt(match[1]) / 255, parseInt(match[2]) / 255, parseInt(match[3]) / 255);
    return null;
  }
  return null;
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * 获取预设列表
 */
export function getPresets() {
  return Object.entries(COLOR_PRESETS).map(([key, value]) => ({
    key,
    name: value.name,
    mood: value.mood,
    primary: `hsl(${value.primary.h}, ${value.primary.s}%, ${value.primary.l}%)`,
  }));
}

/**
 * 根据关键词推荐配色
 */
export function recommendByKeywords(keywords) {
  const keywordMap = {
    '电商': 'ecommerce', '购物': 'ecommerce', '交易': 'ecommerce', '商城': 'ecommerce',
    'SaaS': 'saas', '管理': 'saas', '后台': 'saas', '企业': 'saas', '协作': 'saas',
    '工具': 'tool', '效率': 'tool', '生产力': 'tool', '开发': 'tool', '自动化': 'tool',
    '社区': 'community', '社交': 'community', '论坛': 'community', '直播': 'community', '交友': 'community',
    '内容': 'content', '阅读': 'content', '写作': 'content', '博客': 'content', '资讯': 'content',
  };

  for (const [kw, type] of Object.entries(keywordMap)) {
    if (keywords.some(k => k.includes(kw))) {
      return type;
    }
  }
  return 'other';
}

export default {
  generateColorScheme,
  resolvePrimaryHsl,
  getPresets,
  recommendByKeywords,
  COLOR_PRESETS,
};