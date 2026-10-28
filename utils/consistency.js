/**
 * 一致性度量核心（纯计算，无副作用、无 argv、不写盘）
 *
 * WHY 抽成 utils：度量与闸门必须**同一口径**（`measure-consistency.js` 出报告、
 * `verify-prototype.js` 判红）。脚本顶层带副作用（解析 argv / 打印 / 写文件），
 * 无法被 import，故计算部分单列于此，CLI 与闸门都消费本模块。
 *
 * 口径（方案 §4A）：
 *   - class → px 反查表 = Tailwind 默认刻度 ⊕ `constants.spacing` ⊕ `constants.layout.gutter[platform]`
 *   - `gutter_delta` / `slot_drift` 只看左右内边距（上下 padding 各页有意分档）
 *   - 可点控件按族分开统计：button / input / other（容器外壳）
 *   - 负 margin 只判「-mx-N 与同元素 px-M 是否相等」，孤儿单列（可能用 p-* 统一，不判死）
 */
import { readFileSync, existsSync } from 'fs';
import { relative, join } from 'path';
import { listFiles } from './fs-extra.js';
import { DESIGN_TOKENS } from '../constants.js';

/** Tailwind v3 默认 spacing 刻度（数字键 → n × 4px）；`constants.spacing` 覆盖同键。 */
const DEFAULT_SCALE = {
  px: 1,
  0: 0, 0.5: 2, 1: 4, 1.5: 6, 2: 8, 2.5: 10, 3: 12, 3.5: 14, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32,
  9: 36, 10: 40, 11: 44, 12: 48, 14: 56, 16: 64, 20: 80, 24: 96, 28: 112, 32: 128, 36: 144,
  40: 160, 44: 176, 48: 192, 52: 208, 56: 224, 60: 240, 64: 256, 72: 288, 80: 320, 96: 384,
};

/** 非间距型高度/宽度关键字：合法但不可换算，既不计数也不记为「未识别」 */
const SIZE_KEYWORDS = new Set(['full', 'auto', 'screen', 'min', 'max', 'fit', 'svh', 'lvh', 'dvh', '1/2', '1/3', '2/3']);

/**
 * 字号刻度 → 行盒高度（px）。`constants.fontSize` 的值是 `['0.6875rem', { lineHeight: '1.4' }]`，
 * 控件「没有固定高度、只有 py-*」时，渲染高度 = py×2 + 字号×行高。
 * 不建模 `.btn` 之外的自定义组件：`.btn` 的 fontSize 固定为 sm（见 tailwind-config 组件定义），
 * 故 btn 元素未写 `text-*` 时按 sm 计。边框（+2px）不计入档位口径 —— 见 `controlHeightPx` 注释。
 */
const FONT_BOX = Object.fromEntries(
  Object.entries(DESIGN_TOKENS.fontSize || {}).map(([k, v]) => {
    const size = Array.isArray(v) ? v[0] : v;
    const lhRaw = Array.isArray(v) && v[1] && v[1].lineHeight;
    const sizePx = remToPx(size);
    const lh = lhRaw == null ? null : (String(lhRaw).endsWith('rem') ? remToPx(lhRaw) / (sizePx || 1) : Number(lhRaw));
    return [k, sizePx == null ? null : sizePx * (Number.isFinite(lh) && lh > 0 ? lh : 1.5)];
  }).filter(([, v]) => v != null),
);


/** rem → px（按 16px 根字号；本仓 `spacing` / `layout` 全为 rem 字符串） */
function remToPx(v) {
  const m = /^([\d.]+)rem$/.exec(String(v));
  return m ? Number(m[1]) * 16 : null;
}

/** 平台从产物报告取：`page` 刻度与平台绑定（移动 1rem / 桌面 2rem），不能恒取 gutter 首值 */
function detectPlatform(protoDir, override) {
  if (override === 'mobile' || override === 'desktop') return override;
  try {
    const rep = JSON.parse(readFileSync(join(protoDir, 'generation-report.json'), 'utf8'));
    if (rep && (rep.platform === 'mobile' || rep.platform === 'desktop')) return rep.platform;
  } catch { /* 无报告（旧产物 / 手造目录）→ 按移动口径 */ }
  return 'mobile';
}

/**
 * 构建 class → px 反查表。
 * @param {'mobile'|'desktop'} platform
 */
export function buildScale(platform = 'mobile') {
  const scale = { ...DEFAULT_SCALE };
  for (const [k, v] of Object.entries(DESIGN_TOKENS.spacing || {})) {
    const px = remToPx(v);
    if (px != null) scale[k] = px;
  }
  const gutter = (DESIGN_TOKENS.layout && DESIGN_TOKENS.layout.gutter) || null;
  const pageRaw = gutter ? (gutter[platform] ?? gutter.mobile) : null;
  const pagePx = pageRaw == null ? null : (remToPx(pageRaw) ?? (Number.isFinite(Number(pageRaw)) ? Number(pageRaw) : null));
  if (pagePx != null) scale.page = pagePx;
  return { scale, pagePx };
}

/**
 * 度量一个 prototype 目录。
 * @param {string} protoDir 产物目录（含 *.html）
 * @param {{platform?:'mobile'|'desktop'}} [opts] 显式指定平台（默认读 generation-report.json）
 * @returns {Promise<{protoDir:string, platform:string, pagePx:number|null, pages:Array, summary:object|null}>}
 *   `summary === null` 表示目录内无 HTML（由调用方决定提示与退出码）
 */
export async function measureConsistency(protoDir, { platform: forced } = {}) {
  const platform = detectPlatform(protoDir, forced);
  const { scale: SCALE, pagePx } = buildScale(platform);

  const unknown = new Set();
  const arbitrary = new Set();

  /** 记为「任意值」而非「未识别」：`[70vh]` 等是显式写法，不是刻度缺失 */
  const noteUnknown = (token) => {
    const key = String(token).replace(/^-?(?:p|px|py|pl|pr|h|w|inset-x|max-w)-/, '');
    if (/^\[.+\]$/.test(key)) arbitrary.add(token);
    else unknown.add(token);
  };

  /** 解析单个刻度键（支持 `[18px]` 任意值，便于把任意值单列而不是静默当 0） */
  const scaleOf = (key) => {
    if (Object.prototype.hasOwnProperty.call(SCALE, key)) return SCALE[key];
    const arb = /^\[(.+)\]$/.exec(key);
    if (arb) {
      const px = /^(\d+(?:\.\d+)?)px$/.exec(arb[1]);
      if (px) return Number(px[1]);
      const rem = remToPx(arb[1]);
      if (rem != null) return rem;
    }
    return null;
  };

  /** 取左右内边距（px）：`px-N` 优先于 `p-N`；`pl/pr` 单独出现时取对应侧 */
  const paddingOf = (cls) => {
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
  };

  /**
   * 控件**渲染高度**（px，取整）。固定高度优先；否则 `py×2 + 行盒`。
   * 行盒来源：元素自身 `text-*` → 否则含 `btn` 时用 sm（`.btn` 组件固定 sm）→ 否则 base。
   * **不计边框**：`btn-outline` 的 1px 边框会让同档控件差 2px，那是边框口径问题，不是档位问题。
   */
  const controlHeightPx = (cls, hKey, pyKey, hIsKeyword, pyIsKeyword) => {
    if (hKey && !hIsKeyword) return scaleOf(hKey);
    if (!pyKey || pyIsKeyword) return null;
    const py = scaleOf(pyKey);
    if (py == null) return null;
    const textTok = (/(?:^|\s)text-(micro|xs|sm|base|lg|xl|2xl)(?=\s|$)/.exec(cls) || [])[1];
    const isBtn = /(^|\s)btn(\s|$)/.test(cls);
    const box = textTok && FONT_BOX[textTok] != null
      ? FONT_BOX[textTok]
      : isBtn ? (FONT_BOX.sm ?? 21) : (FONT_BOX.base ?? 25.6);
    return Math.round(py * 2 + box);
  };

  const files = existsSync(protoDir)
    ? (await listFiles(protoDir, { extensions: ['.html'] })).sort()
    : [];

  if (!files.length) return { protoDir, platform, pagePx, pages: [], summary: null };

  const attrOf = (tag, name) => {
    const m = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
    return m ? m[1] : '';
  };

  /** 取第一个匹配标签的 class 字串 */
  const firstTagClass = (html, tagName) => {
    const m = new RegExp(`<${tagName}\\b[^>]*>`, 'i').exec(html);
    return m ? attrOf(m[0], 'class') : null;
  };

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

    // 遍历元素：可点控件按族统计；负 margin 与 px 是否配对。
    // WHY 扫**全部标签**而非固定 5 种：横滚行常挂在 `<section>` 上（如
    // `<section class="-mx-page px-page …">`），只扫 button/a/input/div/span 会让
    // 负 margin 检查对最常见的写法**完全空转**（假绿）。控件族判定仍限定原 5 种标签，
    // 避免把表格单元格等纳入 button 族。
    const tagRe = /<([a-z][a-z0-9]*)\b[^>]*>/gi;
    const CONTROL_TAGS = new Set(['button', 'a', 'input', 'div', 'span']);
    let m;
    while ((m = tagRe.exec(html))) {
      const t = m[1].toLowerCase();
      const tag = m[0];
      const cls = attrOf(tag, 'class');
      if (!cls) continue;

      if (CONTROL_TAGS.has(t)) {
        const hasBtn = /(^|\s)btn(\s|$)/.test(cls);
        const hKey = (/(?:^|\s)h-(.+?)(?=\s|$)/.exec(cls) || [])[1];
        const pyKey = (/(?:^|\s)py-(.+?)(?=\s|$)/.exec(cls) || [])[1];
        const hIsKeyword = hKey && SIZE_KEYWORDS.has(hKey);
        const pyIsKeyword = pyKey && SIZE_KEYWORDS.has(pyKey);

        if (hKey && !hIsKeyword && scaleOf(hKey) == null) noteUnknown(`h-${hKey}`);
        if (pyKey && !pyIsKeyword && scaleOf(pyKey) == null) noteUnknown(`py-${pyKey}`);

        // 按**渲染高度**聚类，而不是 class 写法：`h-10` 与 `py-2 + text-sm` 视觉同档，
        // 按写法计数会把「同一档位的两种合法写法」算成两种控件，永远无法验收（历史问题）。
        const heightPx = controlHeightPx(cls, hKey, pyKey, hIsKeyword, pyIsKeyword);
        if (heightPx != null) {
          // 控件判定：button 元素 / 含 btn 类 / input 元素 / 「容器型控件外壳」（>=28px 且带水平内边距或圆角）
          const looksLikeControlShell =
            (t === 'div' || t === 'span') &&
            heightPx >= 28 &&
            (/(?:^|\s)px-/.test(cls) || /(?:^|\s)rounded-(?:full|xl|2xl|3xl)/.test(cls));
          if (t === 'input') {
            // 复选框/单选不是「文本控件」，高度由浏览器决定，不计入 input 族
            if (!/type\s*=\s*"(?:checkbox|radio)"/i.test(tag)) inputs.add(heightPx);
          } else if (t === 'button' || hasBtn) buttons.add(heightPx);
          else if (looksLikeControlShell) others.add(heightPx);
        }
      }

      // 负 margin 抵消：`-mx-N` 应与同元素水平内边距相等。
      // 优先 `px-N`；无 `px-*` 时对 `pl-*` / `pr-*` **各判一次**（只比先匹配到的那侧，
      // 会漏掉 `-mx-4 pr-4 pl-8` 这种「一侧配对、另一侧不对称」的假绿）。
      const nm = /(?:^|\s)-mx-(.+?)(?=\s|$)/.exec(cls);
      if (nm) {
        const negV = scaleOf(nm[1]);
        if (negV == null) noteUnknown(`-mx-${nm[1]}`);
        const pxm = /(?:^|\s)px-(.+?)(?=\s|$)/.exec(cls);
        if (pxm) {
          const posV = scaleOf(pxm[1]);
          if (negV != null && posV != null && negV !== posV) {
            negMismatch.push(`${rel}: -mx-${nm[1]}(${negV}px) ≠ px-${pxm[1]}(${posV}px)`);
          }
        } else {
          const sides = [...cls.matchAll(/(?:^|\s)(pl|pr)-([^\s]+)/g)];
          if (!sides.length) negOrphan.push(`${rel}: -mx-${nm[1]} 无配对水平内边距（px-/pl-/pr-）`);
          for (const s of sides) {
            const posV = scaleOf(s[2]);
            if (negV != null && posV != null && negV !== posV) {
              negMismatch.push(`${rel}: -mx-${nm[1]}(${negV}px) ≠ ${s[1]}-${s[2]}(${posV}px)`);
            }
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
  /** 数值集合 → 升序 `"NNpx"` 列表（按渲染高度聚类后的输出形态） */
  const toPx = (set) => uniq([...set]).sort((a, b) => a - b).map((v) => `${v}px`);
  // 右侧同样要判：B1 缺陷的镜像形态是「header 全页 pr-5、main pr-4」，只看左侧会全绿
  const rightDeltas = pages
    .map((p) => (p.header?.right != null && p.main?.right != null ? p.main.right - p.header.right : null))
    .filter((v) => v != null);
  const summary = {
    files: files.length,
    shellOnly: pages.filter((p) => p.shellOnly).length,
    gutterDelta: {
      max: deltas.length ? Math.max(...deltas.map(Math.abs)) : null,
      values: uniq(deltas),
      rightMax: rightDeltas.length ? Math.max(...rightDeltas.map(Math.abs)) : null,
      rightValues: uniq(rightDeltas),
    },
    slotDrift: {
      headerLeft: slotSet('left'), headerRight: slotSet('right'),
      mainLeft: mainSet('left'), mainRight: mainSet('right'),
      tabbarLeft: tabSet('left'), tabbarRight: tabSet('right'),
    },
    controlKinds: {
      // 三族都按渲染高度（px）聚类：数值可比、与 class 写法无关
      button: toPx(buttons),
      input: toPx(inputs),
      other: toPx(others),   // 容器类（搜索框外壳等），不计入 button 族
    },
    negMargin: { mismatch: negMismatch, orphan: negOrphan },
    transitionPages,
    unknownClasses: [...unknown].sort(),
    arbitraryValues: [...arbitrary].sort(),
  };

  return { protoDir, platform, pagePx, pages, summary };
}
