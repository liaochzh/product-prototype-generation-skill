#!/usr/bin/env node
/**
 * 一致性度量（只读，恒 exit 0）
 *
 * 用途：把「元素不对齐 / 控件不统一 / 跨页漂移 / 无转场」变成可核对的数字，
 * 为模板收敛（B 阶段）与 verify 闸门提供**同一口径**的阈值来源。
 *
 * 用法：
 *   WORKSPACE=<ws> node scripts/measure-consistency.js [--out <json>] [--proto <dir>] [--quiet]
 *   node scripts/measure-consistency.js --workspace <ws> --out ~/docs/test/baseline.json
 *
 * 口径（与方案 §4A 一致）：
 *   - class → px 反查表 = Tailwind 默认刻度 ⊕ constants.spacing ⊕ constants.layout 新增刻度；
 *     未识别刻度单独计数（非 0 即度量不可信）。
 *   - gutter_delta / slot_drift **只看左右内边距**（上下 padding 各页有意分档）。
 *   - 可点控件按族分开统计：button（button 元素 / 含 btn 类）· input（input 元素）· other（其余 h-* 容器）。
 *   - 外壳与重定向 index.html 无 header/main ⇒ 不入集合，单列 shellOnly。
 *
 * 设计约束：只读、无缓存、不写 prototype/；**不判红**（度量不是闸门）。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { listFiles } from '../utils/fs-extra.js';
import { DESIGN_TOKENS } from '../constants.js';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const getArg = (k, d) => {
  const i = args.findIndex((a) => a === k || a.startsWith(k + '='));
  if (i < 0) return d;
  const v = args[i];
  return v.includes('=') ? v.split('=').slice(1).join('=') : args[i + 1] ?? d;
};
const quiet = args.includes('--quiet');

const workspace = resolve(getArg('--workspace', process.env.WORKSPACE || process.cwd()));
const protoDir = resolve(getArg('--proto', join(workspace, 'prototype')));
const outPath = getArg('--out', '');

// ---------- class → px ----------

/** Tailwind v3 默认 spacing 刻度（数字键 → n × 4px）；constants.spacing 覆盖同键。 */
const DEFAULT_SCALE = {
  px: 1,
  0: 0, 0.5: 2, 1: 4, 1.5: 6, 2: 8, 2.5: 10, 3: 12, 3.5: 14, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32,
  9: 36, 10: 40, 11: 44, 12: 48, 14: 56, 16: 64, 20: 80, 24: 96, 28: 112, 32: 128, 36: 144,
  40: 160, 44: 176, 48: 192, 52: 208, 56: 224, 60: 240, 64: 256, 72: 288, 80: 320, 96: 384,
};

/** rem → px（按 16px 根字号；本仓 `spacing` 全为 rem 字符串）。 */
function remToPx(v) {
  const m = /^([\d.]+)rem$/.exec(String(v));
  return m ? Number(m[1]) * 16 : null;
}

const SCALE = { ...DEFAULT_SCALE };
for (const [k, v] of Object.entries(DESIGN_TOKENS.spacing || {})) {
  const px = remToPx(v);
  if (px != null) SCALE[k] = px;
}
// B 阶段新增的布局刻度（当前不存在则跳过；存在则并入同一张表，避免 `px-page` 被判未识别）
const LAYOUT = DESIGN_TOKENS.layout || {};
const LAYOUT_PAGE = LAYOUT.gutter ? Object.values(LAYOUT.gutter)[0] : null;
const layoutPagePx = LAYOUT_PAGE ? (remToPx(LAYOUT_PAGE) ?? Number(LAYOUT_PAGE) ?? null) : null;
if (layoutPagePx != null) SCALE.page = layoutPagePx;

/** 记为「任意值」而非「未识别」：`[70vh]` 等是显式写法，不是刻度缺失 */
function noteUnknown(token) {
  const key = String(token).replace(/^-?(?:p|px|py|pl|pr|h|w|inset-x|max-w)-/, '');
  if (/^\[.+\]$/.test(key)) arbitrary.add(token);
  else unknown.add(token);
}

/** 解析单个刻度键（支持 `[18px]` 任意值，便于把任意值单列而不是静默当 0） */
function scaleOf(key) {
  if (Object.prototype.hasOwnProperty.call(SCALE, key)) return SCALE[key];
  const arb = /^\[(.+)\]$/.exec(key);
  if (arb) {
    const px = /^(\d+(?:\.\d+)?)px$/.exec(arb[1]);
    if (px) return Number(px[1]);
    const rem = remToPx(arb[1]);
    if (rem != null) return rem;
  }
  return null;
}

const unknown = new Set();
const arbitrary = new Set();
const UNKNOWN_PREFIX = /^(?:p|px|py|pl|pr|pt|pb|h|w|inset-x|max-w|gap|space-x|space-y)-(.+)$/;
/** 非间距型高度/宽度关键字：合法但不可换算，既不计数也不记为「未识别」 */
const SIZE_KEYWORDS = new Set(['full', 'auto', 'screen', 'min', 'max', 'fit', 'svh', 'lvh', 'dvh', '1/2', '1/3', '2/3']);

/**
 * 取元素的左右内边距（px）。`px-N` 优先于 `p-N`；`pl/pr` 单独出现时取对应侧。
 * 返回 { left, right }，缺失侧为 null。
 */
function paddingOf(cls) {
  let p = null, px = null, pl = null, pr = null;
  for (const t of cls.split(/\s+/).filter(Boolean)) {
    let m;
    if ((m = /^px-(.+)$/.exec(t))) {
      const v = scaleOf(m[1]);
      if (v == null) noteUnknown(t); else px = v;
    } else if ((m = /^pl-(.+)$/.exec(t))) {
      const v = scaleOf(m[1]);
      if (v == null) noteUnknown(t); else pl = v;
    } else if ((m = /^pr-(.+)$/.exec(t))) {
      const v = scaleOf(m[1]);
      if (v == null) noteUnknown(t); else pr = v;
    } else if ((m = /^p-(.+)$/.exec(t))) {
      const v = scaleOf(m[1]);
      if (v == null) noteUnknown(t); else p = v;
    }
  }
  return { left: pl ?? px ?? p, right: pr ?? px ?? p };
}

// ---------- 扫描 ----------

const files = existsSync(protoDir)
  ? (await listFiles(protoDir, { extensions: ['.html'] })).sort()
  : [];

if (!files.length) {
  console.error(`✘ 未找到 HTML：${protoDir}（先跑 generate-prototype.js）`);
  process.exit(0);   // 度量脚本恒 exit 0；缺产物由调用方判定
}

const attrOf = (tag, name) => {
  const m = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  return m ? m[1] : '';
};

/** 取第一个匹配标签的 class 字串 */
function firstTagClass(html, tagName) {
  const re = new RegExp(`<${tagName}\\b[^>]*>`, 'i');
  const m = re.exec(html);
  return m ? attrOf(m[0], 'class') : null;
}

const pages = [];
const buttons = new Set();
const inputs = new Set();
const others = new Set();
const negMismatch = [];
const negOrphan = [];
let transitionPages = 0;

for (const f of files) {
  const html = readFileSync(f, 'utf8');
  const rel = relative(protoDir, f);
  const headerCls = firstTagClass(html, 'header');
  const mainCls = firstTagClass(html, 'main');
  const tabbarTag = /<nav\b[^>]*aria-label="底部导航"[^>]*>/i.exec(html);
  const tabbarCls = tabbarTag ? attrOf(tabbarTag[0], 'class') : null;

  const hp = headerCls ? paddingOf(headerCls) : null;
  const mp = mainCls ? paddingOf(mainCls) : null;
  const tp = tabbarCls ? paddingOf(tabbarCls) : null;

  const shellOnly = !headerCls && !mainCls;
  const gutterDelta = hp && mp && hp.left != null && mp.left != null ? mp.left - hp.left : null;

  if (/@view-transition|view-transition-name|prefers-reduced-motion/.test(html)) transitionPages++;

  // 遍历元素：可点控件按族统计；负 margin 与 px 是否配对
  const tagRe = /<(button|a|input|div|span)\b[^>]*>/gi;
  let m;
  while ((m = tagRe.exec(html))) {
    const tag = m[0];
    const cls = attrOf(tag, 'class');
    if (!cls) continue;

    const hasBtn = /(^|\s)btn(\s|$)/.test(cls);
    const hKey = (/(?:^|\s)h-(.+?)(?=\s|$)/.exec(cls) || [])[1];
    const pyKey = (/(?:^|\s)py-(.+?)(?=\s|$)/.exec(cls) || [])[1];
    const hIsKeyword = hKey && SIZE_KEYWORDS.has(hKey);
    const pyIsKeyword = pyKey && SIZE_KEYWORDS.has(pyKey);

    if (hKey && !hIsKeyword && scaleOf(hKey) == null) noteUnknown(`h-${hKey}`);
    if (pyKey && !pyIsKeyword && scaleOf(pyKey) == null) noteUnknown(`py-${pyKey}`);

    const kind = hKey && !hIsKeyword ? `h-${hKey}` : pyKey && !pyIsKeyword ? `py-${pyKey}` : null;
    if (kind) {
      const t = m[1].toLowerCase();
      const hPx = hKey && !hIsKeyword ? scaleOf(hKey) : null;
      // 控件判定：button 元素 / 含 btn 类 / input 元素 / 「容器型控件外壳」（>=28px 且带水平内边距或圆角）
      const looksLikeControlShell =
        (t === 'div' || t === 'span') &&
        hPx != null && hPx >= 28 &&
        (/(?:^|\s)px-/.test(cls) || /(?:^|\s)rounded-(?:full|xl|2xl|3xl)/.test(cls));
      if (t === 'input') {
        // 复选框/单选不是「文本控件」，高度由浏览器决定，不计入 input 族
        if (!/type\s*=\s*"(?:checkbox|radio)"/i.test(tag)) inputs.add(kind);
      } else if (t === 'button' || hasBtn) buttons.add(kind);
      else if (looksLikeControlShell) others.add(kind);
    }

    // 负 margin 抵消：`-mx-N` 应与同元素 `px-N` 相等
    const nm = /(?:^|\s)-mx-(.+?)(?=\s|$)/.exec(cls);
    if (nm) {
      const negV = scaleOf(nm[1]);
      if (negV == null) noteUnknown(`-mx-${nm[1]}`);
      const pxm = /(?:^|\s)px-(.+?)(?=\s|$)/.exec(cls);
      if (!pxm) negOrphan.push(`${rel}: -mx-${nm[1]} 无配对 px-*`);
      else {
        const posV = scaleOf(pxm[1]);
        if (negV != null && posV != null && negV !== posV) {
          negMismatch.push(`${rel}: -mx-${nm[1]}(${negV}px) ≠ px-${pxm[1]}(${posV}px)`);
        }
      }
    }
  }

  pages.push({
    file: rel,
    header: hp, main: mp, tabbar: tp,
    gutterDelta,
    shellOnly,
  });
}

const uniq = (arr) => [...new Set(arr)];

// 槽位漂移：左右内边距在全部页面上的取值集合（只统计定义了的侧）
const slotSet = (side) => uniq(pages.map((p) => p.header?.[side]).filter((v) => v != null));
const mainSet = (side) => uniq(pages.map((p) => p.main?.[side]).filter((v) => v != null));
const tabSet = (side) => uniq(pages.map((p) => p.tabbar?.[side]).filter((v) => v != null));

const deltas = pages.map((p) => p.gutterDelta).filter((v) => v != null);
const summary = {
  files: files.length,
  shellOnly: pages.filter((p) => p.shellOnly).length,
  gutterDelta: {
    max: deltas.length ? Math.max(...deltas.map(Math.abs)) : null,
    values: uniq(deltas),
  },
  slotDrift: {
    headerLeft: slotSet('left'), headerRight: slotSet('right'),
    mainLeft: mainSet('left'), mainRight: mainSet('right'),
    tabbarLeft: tabSet('left'), tabbarRight: tabSet('right'),
  },
  controlKinds: {
    button: uniq([...buttons]).sort(),
    input: uniq([...inputs]).sort(),
    other: uniq([...others]).sort(),   // 容器类（搜索框外壳等），不计入 button 族
  },
  negMargin: { mismatch: negMismatch, orphan: negOrphan },
  transitionPages,
  unknownClasses: [...unknown].sort(),
  arbitraryValues: [...arbitrary].sort(),
};

const json = { generatedAt: new Date().toISOString(), protoDir, pages, summary };

if (outPath) {
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(resolve(outPath), JSON.stringify(json, null, 2) + '\n');
  if (!quiet) console.log(`✔ 已写 ${outPath}`);
}

if (!quiet) {
  const pad = (v) => (v == null ? '—' : String(v));
  console.log('\n页 | header(L/R) | main(L/R) | tabbar(L/R) | gutterΔ');
  console.log('---|---|---|---|---');
  for (const p of pages) {
    console.log(`${p.file} | ${pad(p.header?.left)}/${pad(p.header?.right)} | ${pad(p.main?.left)}/${pad(p.main?.right)} | ${pad(p.tabbar?.left)}/${pad(p.tabbar?.right)} | ${pad(p.gutterDelta)}`);
  }
  const s = summary;
  console.log(`\n文件 ${s.files}（外壳/重定向 ${s.shellOnly}）`);
  console.log(`gutter_delta 最大绝对差：${pad(s.gutterDelta.max)}px；取值 ${JSON.stringify(s.gutterDelta.values)}`);
  console.log(`slot_drift：header 左 ${JSON.stringify(s.slotDrift.headerLeft)} / 右 ${JSON.stringify(s.slotDrift.headerRight)}；main 左 ${JSON.stringify(s.slotDrift.mainLeft)}；tabbar 左 ${JSON.stringify(s.slotDrift.tabbarLeft)}`);
  console.log(`control kinds：button ${s.controlKinds.button.length} 种 ${JSON.stringify(s.controlKinds.button)}；input ${s.controlKinds.input.length} 种 ${JSON.stringify(s.controlKinds.input)}；容器 ${JSON.stringify(s.controlKinds.other)}`);
  console.log(`负 margin：不配对 ${s.negMargin.mismatch.length} 处，孤儿 ${s.negMargin.orphan.length} 处`);
  console.log(`转场/降级标记页数：${s.transitionPages}/${s.files}`);
  console.log(`未识别刻度：${s.unknownClasses.length} ${JSON.stringify(s.unknownClasses)}；任意值 ${s.arbitraryValues.length} ${JSON.stringify(s.arbitraryValues)}`);
}
