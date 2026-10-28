/**
 * 文案域层（Copy Domain Layer）
 *
 * 职责：
 * 1. buildCopyPack  —— 按 productType 组装文案包（词典 + 可选 override），供模板以 it.copy 消费；
 * 2. assertCopyDomain —— 文案域泄漏闸门：去标签可见文本 / 属性文本中是否残留他类领域词；
 * 3. assertLexiconConformance —— 词典形状一致性兜底（类型间叶子键集必须相同）；
 * 4. BADGE_TONES —— 语义色名 → Tailwind class，模板不硬编码色板。
 *
 * 设计约束（见 docs/plan/copy-domain-parameterization.md）：
 * - 三源合流：override > COPY_LEXICON[type] > COPY_LEXICON.other（后者由构建保证，见 copy-lexicon.js）。
 * - 本模块只做“取数 + 校验”，不做关键词检测/文本猜测。
 */
import { COPY_LEXICON } from './copy-lexicon.js';

export { COPY_LEXICON };

// 语义色名 → Tailwind class（模板通过 BADGE_TONES[tone] 取色，禁止内联色板）
export const BADGE_TONES = {
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  sky: 'bg-sky-50 text-sky-700',
  rose: 'bg-rose-50 text-rose-600',
  neutral: 'bg-neutral-100 text-neutral-600',
  brand: 'bg-brand-50 text-brand-700',
};

export function badgeToneClass(tone) {
  return BADGE_TONES[tone] || BADGE_TONES.neutral;
}

// 文案域泄漏分级：
// - fail：他类强签名词（电商域），出现即视为回归（当 productType !== ecommerce）
// - warn：跨类型弱词，出现仅提示（不计入 passed）
export const COPY_LEAK_TIERS = {
  fail: [
    '购物车', '加入购物车', '立即购买', '包邮', '运费险', '二手', '闲置',
    '卖家', '买家', '成色', '9成新', '8成新', '7成新', 'ISBN', 'SPU',
    '菜鸟驿站', '到手价', 'GMV', '销量',
  ],
  warn: {
    ecommerce: ['¥', '订单', '下单', '价格'],
    saas: ['工作台', '任务', '席位'],
    tool: ['待办', '清单'],
    community: ['动态', '话题', '粉丝'],
    content: ['文章', '专栏', '阅读量'],
  },
};

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// 深拷贝：保留函数引用（词典型槽位含函数），仅拷贝普通对象/数组
function cloneDeep(v) {
  if (Array.isArray(v)) return v.map(cloneDeep);
  if (isPlainObject(v)) {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = cloneDeep(x);
    return out;
  }
  return v;
}

function mergeInto(target, patch, path, warnings) {
  for (const [k, v] of Object.entries(patch)) {
    if (DANGEROUS_KEYS.has(k)) {
      warnings.push(`忽略危险键：${path}${k}`);
      continue;
    }
    // 用 own-property 判定，避免 `valueOf/toString/constructor` 等继承键绕过 schema 白名单
    if (!Object.prototype.hasOwnProperty.call(target, k)) {
      warnings.push(`忽略未知槽位：${path}${k}`);
      continue;
    }
    const cur = target[k];
    if (typeof v === 'function') {
      warnings.push(`忽略函数值（override 仅支持数据）：${path}${k}`);
      continue;
    }
    if (typeof cur === 'function') {
      warnings.push(`函数槽位不可覆盖：${path}${k}`);
      continue;
    }
    if (Array.isArray(v)) {
      if (!Array.isArray(cur)) {
        warnings.push(`类型不符（期望数组），忽略：${path}${k}`);
        continue;
      }
      target[k] = v.slice();
      continue;
    }
    if (isPlainObject(v)) {
      if (isPlainObject(cur)) mergeInto(cur, v, `${path}${k}.`, warnings);
      else warnings.push(`类型不符（期望对象），忽略：${path}${k}`);
      continue;
    }
    // 标量写向对象/数组槽位会静默摧毁整棵子树，必须拒写
    if (isPlainObject(cur) || Array.isArray(cur)) {
      warnings.push(`类型不符（期望${Array.isArray(cur) ? '数组' : '对象'}），忽略：${path}${k}`);
      continue;
    }
    target[k] = v;
  }
}

/**
 * 组装文案包。
 * @param {object} meta 至少含 productType
 * @param {object} [opts]
 * @param {object|null} [opts.override] 覆盖数据（可含 allowTerms）
 * @param {object|null} [opts.logger] 需有 warn(msg)
 * @returns {{pack:object, copySource:string, copyType:string, allowTerms:string[], warnings:string[]}}
 */
export function buildCopyPack(meta, opts = {}) {
  const { override = null, logger = null } = opts;
  const warnings = [];
  const requested = (meta && meta.productType) || 'other';
  const known = Object.prototype.hasOwnProperty.call(COPY_LEXICON, requested);
  const copyType = known ? requested : 'other';
  if (!known) warnings.push(`未知 productType「${requested}」，回退 other`);

  const pack = cloneDeep(COPY_LEXICON[copyType]);
  let copySource = 'lexicon';
  let allowTerms = [];

  if (isPlainObject(override)) {
    allowTerms = Array.isArray(override.allowTerms) ? override.allowTerms.map(String) : [];
    // 必须用 null 原型对象：普通对象上 `patch['__proto__'] = v` 会走 setter
    // 静默改原型，导致 mergeInto 的 DANGEROUS_KEYS 守卫变成不可达死代码
    const patch = Object.create(null);
    for (const [k, v] of Object.entries(override)) {
      if (k !== 'allowTerms') patch[k] = v;
    }
    if (Object.keys(patch).length) {
      mergeInto(pack, patch, '', warnings);
      copySource = 'override';
    }
  }

  if (logger && typeof logger.warn === 'function') {
    for (const w of warnings) logger.warn(`[copy] ${w}`);
  }
  return { pack, copySource, copyType, allowTerms, warnings };
}

// 点路径取值：resolvePath(pack, 'home.hero.title')
export function resolvePath(pack, dotPath) {
  return String(dotPath)
    .split('.')
    .reduce((acc, k) => (acc == null ? undefined : acc[k]), pack);
}

// 叶子形状路径（数组 / 函数 / 标量 均为叶子）
export function shapePaths(obj, prefix = '') {
  if (Array.isArray(obj) || typeof obj === 'function' || obj === null || typeof obj !== 'object') {
    return [prefix.replace(/\.$/, '')];
  }
  const out = [];
  for (const [k, v] of Object.entries(obj)) out.push(...shapePaths(v, `${prefix}${k}.`));
  return out;
}

// 规范形状：以 other 为载体（COPY_LEXICON.other 必须完整）
export const COPY_SCHEMA = shapePaths(COPY_LEXICON.other).sort();

// 叶子类型指纹（function/string/number/boolean/null/array/object）
export function leafType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/**
 * 递归收集「路径::类型」条目，可选递归进数组元素（deepArrays）。
 * over() 对数组是整体替换 → 构造**不能**保证数组元素形状，
 * 必须在断言里显式校验，否则 form.settings/fields、settings.notifs 这类
 * 数组密集槽位会在渲染期才炸。
 */
export function typedPaths(obj, deepArrays = true) {
  const out = [];
  const walk = (v, path) => {
    if (Array.isArray(v)) {
      out.push(`${path}::array`);
      if (!deepArrays) return;
      for (const el of v) {
        if (el === null || typeof el !== 'object' || Array.isArray(el)) continue;
        for (const k of Object.keys(el).sort()) out.push(`${path}[].${k}::${leafType(el[k])}`);
      }
      return;
    }
    if (v === null || typeof v !== 'object') {
      out.push(`${path}::${leafType(v)}`);
      return;
    }
    for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  walk(obj, '');
  return out.sort();
}

// 规范「路径::类型」表（含数组元素键与叶子类型）
export const COPY_TYPED_SCHEMA = typedPaths(COPY_LEXICON.other, true);

// 类型间形状一致性兜底
// @param {{deepArrays?: boolean}} [opts] deepArrays=true 时额外校验数组元素键与叶子类型
export function assertLexiconConformance(opts = {}) {
  const { deepArrays = true } = opts;
  const base = deepArrays ? COPY_TYPED_SCHEMA : COPY_SCHEMA;
  const problems = [];
  for (const [type, lex] of Object.entries(COPY_LEXICON)) {
    if (type === 'other') continue;
    const cur = deepArrays ? typedPaths(lex, true) : shapePaths(lex).sort();
    const missing = base.filter((p) => !cur.includes(p));
    const extra = cur.filter((p) => !base.includes(p));
    if (missing.length || extra.length) problems.push({ type, missing, extra });
  }
  return { ok: problems.length === 0, problems, base, deepArrays };
}

/**
 * 文案域闸门。
 * @param {string} text 待扫描文本（已去标签的可见文本 + 属性值，或整段 HTML）
 * @param {string} productType
 * @param {string[]} [allowTerms] 白名单（override.allowTerms）
 * @returns {{fail:string[], warn:string[]}}
 */
export function assertCopyDomain(text, productType, allowTerms = []) {
  const hay = String(text || '');
  const allow = new Set((allowTerms || []).map(String));
  const type = productType || 'other';
  const fail = [];
  const warn = [];

  if (type !== 'ecommerce') {
    for (const w of COPY_LEAK_TIERS.fail) if (!allow.has(w) && hay.includes(w)) fail.push(w);
  }
  for (const [t, words] of Object.entries(COPY_LEAK_TIERS.warn)) {
    if (t === type) continue;
    for (const w of words) if (!allow.has(w) && hay.includes(w)) warn.push(w);
  }
  return { fail: [...new Set(fail)], warn: [...new Set(warn)] };
}