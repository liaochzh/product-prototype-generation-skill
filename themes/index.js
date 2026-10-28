/**
 * 主题注册表（F4-a）：给「用户可挑选主题」提供一组**色彩 + 字体配对**。
 *
 * WHY 只放引用、不放值：色值与字体串的唯一事实来源是 `constants.js`
 * （`brandColors` / `themePalette` / `fontStacks`）。本文件若内联 `#hex` 或字体族串，
 * 就等于把设计令牌复制了第二份——改一处漏一处，且 golden/自检都看不见。
 * 故本目录**零颜色字面量**（连 HSL 函数写法都不写），由 `selfcheck` 场景 38 扫描兜底。
 *
 * 形状（新增主题照抄即可）：
 *   <key>: {
 *     name, mood,                                  // 展示用文案
 *     primary: '<色板名>',                          // THEME_PALETTE（颜色名）∪ brandColors
 *     accents: { <语义键>: '<色板名>' },             // 语义键由主题自定（success/promo/…）
 *     gradients: { primary: '<色板名>', secondary: '<色板名>' },
 *     fonts: { sans: '<fontStacks 键>', display: '<fontStacks 键>' },
 *   }
 *
 * **accents 的键是语义名、值是色板名**——不要写 `COLOR_PRESETS[productType].accents` 的键
 * （`growth`/`editorial` 那类是「产品类型的 accent 名」，不是色板，`resolveSwatch` 接不住）。
 *
 * 优先级裁决不在这里：`utils/color-scheme.js` 的 `resolvePrimaryHsl()` 是唯一裁决点
 * （`brandColor > theme > productType 预设`），三个消费点都调它。
 */
import { DESIGN_TOKENS, THEME_PALETTE } from '../constants.js';

const { fontStacks } = DESIGN_TOKENS;

/**
 * 色板名 → `{h,s,l}`。`THEME_PALETTE`（颜色名，含 brandColors 的别名）优先，
 * 其次 `brandColors` 本身（允许直接写 productType 名，如 `ecommerce`）。缺失返回 null。
 */
export function resolveSwatch(name) {
  if (!name) return null;
  const swatch = THEME_PALETTE[name] || DESIGN_TOKENS.brandColors[name];
  return swatch ? { h: swatch.h, s: swatch.s, l: swatch.l } : null;
}

/** 主题原始定义（**未解析**；自检扫描引用时用这个，避免一坏就抛）。 */
export const THEMES = {
  emerald: {
    name: '翡翠青',
    mood: '信任、成交、绿色生态',
    primary: 'emerald',
    accents: { success: 'lime', promo: 'amber', trust: 'cyan' },
    gradients: { primary: 'emerald', secondary: 'lime' },
    fonts: { sans: 'systemSans', display: 'editorialSerif' },
  },
  indigo: {
    name: '靛蓝专业',
    mood: '专业、数据、冷静克制',
    primary: 'indigo',
    accents: { analytics: 'cyan', growth: 'teal', enterprise: 'violet' },
    gradients: { primary: 'indigo', secondary: 'cyan' },
    fonts: { sans: 'humanistSans', display: 'geometricSans' },
  },
  sunset: {
    name: '落日橙',
    mood: '创意、表达、暖色灵感',
    primary: 'orange',
    accents: { editorial: 'amber', reading: 'fuchsia', publish: 'lime' },
    gradients: { primary: 'orange', secondary: 'fuchsia' },
    fonts: { sans: 'geometricSans', display: 'editorialSerif' },
  },
  graphite: {
    name: '石墨中性',
    mood: '极简、克制、信息优先',
    primary: 'graphite',
    accents: { muted: 'stone', accent: 'slate', primary: 'slate' },
    gradients: { primary: 'graphite', secondary: 'stone' },
    fonts: { sans: 'geometricSans', display: 'editorialSerif' },
  },
};

/**
 * 把主题定义解析为消费方可直接使用的形状（swatch 名 → `{h,s,l}`；字体键 → CSS 栈串）。
 *
 * 返回：`{ key, name, mood, primaryHsl, accents, gradients:{primary,secondary}, fontStacks:{sans,display} }`
 * - 未知 key → `null`（交由 CLI 报「不支持的主题」并列出可用项）
 * - key 存在但引用坏了 → **抛错**（不要把「配置写错」伪装成「主题不存在」）
 *
 * @param {string} key
 * @returns {Readonly<{key:string,name:string,mood:string,primaryHsl:{h:number,s:number,l:number},
 *   accents:Record<string,{h:number,s:number,l:number}>,
 *   gradients:{primary:{h:number,s:number,l:number},secondary:{h:number,s:number,l:number}},
 *   fontStacks:{sans:string,display:string}}>|null}
 */
export function getTheme(key) {
  if (!key) return null;
  const def = THEMES[key];
  if (!def) return null;

  const primaryHsl = resolveSwatch(def.primary);
  if (!primaryHsl) throw new Error(`主题 ${key} 的 primary 引用了不存在的色板：${def.primary}`);
  if (!fontStacks[def.fonts.sans] || !fontStacks[def.fonts.display]) {
    throw new Error(`主题 ${key} 引用了不存在的字体栈：${def.fonts.sans} / ${def.fonts.display}`);
  }

  const accents = {};
  for (const [slot, swatchName] of Object.entries(def.accents)) {
    const hsl = resolveSwatch(swatchName);
    if (!hsl) throw new Error(`主题 ${key} 的 accents.${slot} 引用了不存在的色板：${swatchName}`);
    accents[slot] = hsl;
  }

  const gradients = {};
  for (const [slot, swatchName] of Object.entries(def.gradients)) {
    const hsl = resolveSwatch(swatchName);
    if (!hsl) throw new Error(`主题 ${key} 的 gradients.${slot} 引用了不存在的色板：${swatchName}`);
    gradients[slot] = hsl;
  }

  const resolved = {
    key,
    name: def.name,
    mood: def.mood,
    primaryHsl,
    accents,
    gradients,
    fontStacks: { sans: fontStacks[def.fonts.sans], display: fontStacks[def.fonts.display] },
  };
  // 浅冻结一层即可：消费方只读，且嵌套对象都是本函数新建的局部值
  return Object.freeze({ ...resolved, accents: Object.freeze(accents), gradients: Object.freeze(gradients), fontStacks: Object.freeze(resolved.fontStacks) });
}

/** 可用主题清单（CLI 报错文案与 showcase 都用它，避免两处各写一遍） */
export function listThemes() {
  return Object.entries(THEMES).map(([key, t]) => ({ key, name: t.name, mood: t.mood }));
}

export default { THEMES, resolveSwatch, getTheme, listThemes };
