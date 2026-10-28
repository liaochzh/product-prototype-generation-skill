/**
 * golden 重冻门禁的纯逻辑（无副作用，便于单测）。
 *
 * 单一事实来源：任意字号模式、字号 token 模式、受控映射表、classes 差异判定。
 * 被 `scripts/freeze-golden.js`（重冻）与 `scripts/selfcheck.js`（负例单测）共同引用，
 * 避免两处正则口径漂移。
 *
 * 覆盖边界（重要，勿过度承诺）：
 *  - `gateClasses`：只处理 HTML 标签的 `class="…"`（剥 `<script>`/`<style>`）。
 *  - `gateRawClasses`：额外覆盖**字符串形式**的 `class="…"` / `class='…'` / `className="…"` / `className='…'`
 *    （含 `<script>` 体内）。**不覆盖** `classList.add('…')`、模板字面量 `` class={`…`} ``、转义 `class=\"…\"`；
 *    值含插值（`class="' + x + '"`）时会把 `+`/变量名当 token → 可能误报（当前代码库无此写法）。
 *  - `structuralDiff`：仅报告，不阻断。
 */
import { SPU_PATTERN, SPUN_PLACEHOLDER, stripNoise } from './copy-golden.js';

/** 受控映射表：任意字号 → 设计 token（字号归一时唯一允许的 class 变化） */
export const SIZE_MAP = {
  'text-[10px]': 'text-micro',
  'text-[11px]': 'text-micro',
  'text-[12px]': 'text-xs',
  'text-[13px]': 'text-xs',
  'text-[15px]': 'text-sm',
  'text-[16px]': 'text-base',
  'text-[17px]': 'text-lg',
  'text-[18px]': 'text-lg',
  'text-[19px]': 'text-xl',
  'text-[26px]': 'text-2xl',
};

// 允许变体前缀（hover:/sm:/dark: 等），如 `hover:text-[16px]` → `hover:text-base`
const VARIANT = '(?:[a-z-]+:)*';
// 长度单位集合（px 为主；rem/em/pt 一并识别，避免「扫描到但形状比对当非字号」的口径分裂）
const LEN_UNITS = 'px|rem|em|pt';
export const ARB_RE = new RegExp(`^${VARIANT}text-\\[[\\d.]+(?:${LEN_UNITS})\\]$`);
export const TOKEN_SIZE_RE = new RegExp(`^${VARIANT}text-(micro|xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$`);

// 任意字号「扫描」源码（单一事实来源，供场景 23 与 countArbitrarySizes 共用）。
// 注意边界：仅识别 `text-[<数字><长度单位>]`；`text-[length:14px]`/`text-[120%]`/`text-[calc(...)]`
// 不在口径内（当前代码库无此写法）。用 `arbScanRe()` 取全新实例（避免 /g lastIndex 污染）。
export const ARB_SCAN_SRC = `text-\\[[0-9.]+(?:${LEN_UNITS})\\]`;
export const arbScanRe = () => new RegExp(ARB_SCAN_SRC, 'g');

// class 属性（含 JS 字符串内的 className 写法）；`\b` 防止 data-class/xclass 误命中
const CLASS_ATTR_RE = /\b(?:className|class)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

const MAX_SAMPLES = 3;   // 结构探针最多展示的差异样本数
const SAMPLE_WIDTH = 120; // 样本行截断宽度

/** 任意字号在整段 HTML 中的出现次数（用于「归一已完成」断言） */
export function countArbitrarySizes(html) {
  return (html.match(arbScanRe()) || []).length;
}

/** 拆出「变体前缀 + 基础字号类」：hover:text-[16px] → { prefix:'hover:', base:'text-[16px]' } */
function splitVariant(token) {
  const i = token.lastIndexOf('text-');
  return { prefix: token.slice(0, i), base: token.slice(i) };
}

/** 把某 size token 经 SIZE_MAP（保留变体前缀）映射；无映射则恒等 */
function mapSize(token) {
  const { prefix, base } = splitVariant(token);
  return prefix + (SIZE_MAP[base] || base);
}

/** 把 class 指纹行拆成 shape(tag+非字号类名) 与 sizeTokens(字号类名，含变体) */
export function splitShape(line) {
  const idx = line.indexOf('|');
  const tag = line.slice(0, idx);
  const toks = line.slice(idx + 1).split(' ').filter(Boolean);
  const sizes = toks.filter((t) => ARB_RE.test(t) || TOKEN_SIZE_RE.test(t)).sort();
  const others = toks.filter((t) => !(ARB_RE.test(t) || TOKEN_SIZE_RE.test(t))).sort();
  return { key: `${tag}|${others.join(' ')}`, sizes };
}

/**
 * 校验 newHtml 相对 oldHtml 的 classes 差异是否 100% 可被 SIZE_MAP 解释。
 * 返回问题字符串数组（空数组 = 通过）。
 * 判定依据：非字号类名变化必改变 shape key → 落到元素数不等；
 * 字号变化必须经 SIZE_MAP（多重集消元，不依赖排序配对）。
 */
export function gateClasses(oldHtml, newHtml) {
  const problems = [];
  const collect = (html) => {
    const map = new Map();
    const src = stripNoise(html);
    for (const m of src.matchAll(/<\s*([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
      const tag = m[1].toLowerCase();
      const cm = /\bclass\s*=\s*"([^"]*)"/i.exec(m[2]);
      const toks = (cm ? cm[1] : '').split(/\s+/).filter(Boolean).sort();
      const { key, sizes } = splitShape(`${tag}|${toks.join(' ')}`);
      if (!map.has(key)) map.set(key, { count: 0, sizes: [] });
      const e = map.get(key);
      e.count++;
      e.sizes.push(...sizes);
    }
    return map;
  };
  const oldMap = collect(oldHtml);
  const newMap = collect(newHtml);
  const keys = new Set([...oldMap.keys(), ...newMap.keys()]);
  for (const key of keys) {
    const o = oldMap.get(key) || { count: 0, sizes: [] };
    const n = newMap.get(key) || { count: 0, sizes: [] };
    if (o.count !== n.count) { problems.push(`shape 元素数变化「${key}」old=${o.count} new=${n.count}`); continue; }
    const pool = new Map();
    for (const t of n.sizes) pool.set(t, (pool.get(t) || 0) + 1);
    for (const t of o.sizes) {
      const mapped = mapSize(t);
      const left = pool.get(mapped) || 0;
      if (!left) { problems.push(`字号映射未授权「${key}」${t} → ${mapped}（new 中无对应）`); continue; }
      pool.set(mapped, left - 1);
    }
    for (const [t, c] of pool) if (c > 0) problems.push(`新增未授权字号「${key}」${t} ×${c}`);
  }
  return problems;
}

/**
 * 裸 class 门禁：对**未剥离 `<script>`** 的整段 HTML，收集所有字符串形式 class 属性
 * （`class="…"` / `class='…'` / `className="…"` / `className='…'`）的 token 多重集，
 * 字号 token 经 SIZE_MAP 映射后要求与旧基线严格相等。
 * 目的：补上 `gateClasses`（剥 script）与 `structuralDiff`（抹 class 值）双双看不到的盲区
 * ——`<script>` 内以字符串写死的类名（如状态栏 `innerHTML='<i class="text-micro">'`）。
 * 注意：全局多重集、位置无关；「把类名从 markup 挪进 script」这类等量挪移不可见
 * （由 `structuralDiff` 探针提示人工核对）。返回问题字符串数组。
 */
export function gateRawClasses(oldHtml, newHtml) {
  const collect = (html) => {
    const multiset = new Map();
    for (const m of html.matchAll(CLASS_ATTR_RE)) {
      const val = m[1] ?? m[2] ?? '';
      for (const t of val.split(/\s+/).filter(Boolean)) {
        const mapped = (ARB_RE.test(t) || TOKEN_SIZE_RE.test(t)) ? mapSize(t) : t;
        multiset.set(mapped, (multiset.get(mapped) || 0) + 1);
      }
    }
    return multiset;
  };
  const o = collect(oldHtml);
  const n = collect(newHtml);
  const problems = [];
  for (const [t, c] of o) {
    const have = n.get(t) || 0;
    if (have < c) problems.push(`裸 class 缺失「${t}」×${c - have}`);
  }
  for (const [t, c] of n) {
    const was = o.get(t) || 0;
    if (c > was) problems.push(`裸 class 新增「${t}」×${c - was}`);
  }
  return problems;
}

/** 逐行标注所在区域（用开闭标签的近似状态机），用于结构探针的区域归类 */
function lineRegions(lines) {
  const out = [];
  let inScript = 0, inStyle = 0;
  for (const l of lines) {
    if (/<script\b/i.test(l)) inScript++;
    if (/<style\b/i.test(l)) inStyle++;
    out.push(inScript > 0 ? '<script>' : inStyle > 0 ? '<style>' : '其它/空白');
    if (/<\/script>/i.test(l)) inScript = Math.max(0, inScript - 1);
    if (/<\/style>/i.test(l)) inStyle = Math.max(0, inStyle - 1);
  }
  return out;
}

/**
 * 结构性差异探针：抹掉所有 class 值后若仍不同，说明重冻基线吸收了
 * 非 class 区域的改动（`<script>`/`<style>`/其它属性/空白），需人工核对。
 * 先剥离两侧公共首尾行，避免行插入导致的错位放大 count；区域按开闭标签状态归类。
 * 返回 `{ count, lineDelta, samples:[{line,old,new}], regions }`，或 null（无差异）。仅报告，不阻断。
 */
export function structuralDiff(oldHtml, newHtml) {
  const stripClassValues = (h) => h
    .replace(CLASS_ATTR_RE, 'class=""')
    .replace(SPU_PATTERN, SPUN_PLACEHOLDER); // 与三维比对同口径：随机商品 ID 归一，避免假告警
  const a = stripClassValues(oldHtml).split('\n');
  const b = stripClassValues(newHtml).split('\n');
  const regA = lineRegions(a);
  const regB = lineRegions(b);

  let lo = 0;
  const minLen = Math.min(a.length, b.length);
  while (lo < minLen && a[lo] === b[lo]) lo++;
  let eA = a.length - 1, eB = b.length - 1;
  while (eA >= lo && eB >= lo && a[eA] === b[eB]) { eA--; eB--; }

  const changedA = eA - lo + 1;    // 旧基线尾段中变化的行数
  const changedB = eB - lo + 1;    // 新产物尾段中变化的行数
  if (changedA === 0 && changedB === 0) return null;

  const samples = [];
  for (let i = lo; i < lo + Math.max(changedA, changedB) && samples.length < MAX_SAMPLES; i++) {
    if (a[i] !== b[i]) {
      samples.push({
        line: i + 1,
        region: regB[i] || regA[i] || '其它/空白',
        old: (a[i] || '').slice(0, SAMPLE_WIDTH),
        new: (b[i] || '').slice(0, SAMPLE_WIDTH),
      });
    }
  }
  const regions = new Set();
  for (let i = lo; i < lo + Math.max(changedA, changedB); i++) {
    if (a[i] !== b[i]) regions.add(regB[i] || regA[i] || '其它/空白');
  }
  return { count: changedA + changedB, lineDelta: changedB - changedA, samples, regions: [...regions] };
}