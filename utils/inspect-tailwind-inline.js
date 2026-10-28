/**
 * 校验生成的 HTML 内联 `tailwind.config` 是否可在浏览器端安全执行。
 *
 * 背景：`config.plugins` 是函数数组，若被 `JSON.stringify` 误序列化会退化成 `null`
 * （多插件时为多个 `null`），浏览器端 Tailwind Play CDN 执行到非函数项会抛错，
 * 导致全部工具类/组件类失效 —— 输出裸 HTML。本模块把「字符串形状检查」升级为
 * 「隔离求值 + 类型检查」，verify 与 selfcheck 共用，避免两处正则不一致导致漏报。
 *
 * 安全：对从磁盘 HTML 提取的表达式一律在 `node:vm` 沙箱内求值——
 *  - 沙箱无 Node 全局（process/require/fetch 等）；
 *  - `timeout` + `microtaskMode:'afterEvaluate'` 约束同步与微任务；
 *  - 求值、属性访问、异常序列化**全部**在沙箱内完成，仅以 JSON 字符串把结果
 *    送回宿主，任何沙箱对象（含异常值）都不会越界进入宿主 realm。
 */
import vm from 'node:vm';

const INLINE_EVAL_TIMEOUT_MS = 1000;
const INLINE_INVOKE_TIMEOUT_FACTOR = 2;

/**
 * 提取 HTML 内联 `tailwind.config` 的对象字面量源码；找不到返回 null。
 * 正则锚定「脚本块内首条语句即为 tailwind.config =」，避免跨脚本块误捕获。
 */
export function extractInlineTailwindConfig(html) {
  const match = html.match(/<script(?:\s[^>]*)?>\s*tailwind\.config\s*=\s*([\s\S]*?);\s*<\/script>/);
  return match ? match[1] : null;
}

/** 顶层必须为对象字面量（拒绝 IIFE/await 等可构造异步副作用的形态）；不合规返回原因 */
function literalGate(expr) {
  return /^\s*\{/.test(expr) ? null : '内联配置非对象字面量';
}

/** 沙箱内把异常安全序列化为字符串（异常值不越界） */
const SAFE_MSG = `(e) => { try { return String((e && e.message) || e); } catch { return '[unserializable]'; } }`;

/** 在沙箱内求值并判定；始终返回 JSON 字符串（不把沙箱对象交给宿主） */
function checkSnippet(expr) {
  return `(() => {
    const safeMsg = ${SAFE_MSG};
    let cfg;
    try { cfg = (${expr}); } catch (e) { return JSON.stringify({ kind: 'eval-throw', message: safeMsg(e) }); }
    if (cfg === null || typeof cfg !== 'object') return JSON.stringify({ kind: 'not-object' });
    let plugins;
    try { plugins = cfg.plugins; } catch (e) { return JSON.stringify({ kind: 'access-throw', message: safeMsg(e) }); }
    if (plugins === undefined) return JSON.stringify({ kind: 'ok', plugins: 0 });
    if (!Array.isArray(plugins)) return JSON.stringify({ kind: 'not-array' });
    const bad = plugins.filter((p) => typeof p !== 'function').length;
    if (bad) return JSON.stringify({ kind: 'non-function', bad, total: plugins.length });
    return JSON.stringify({ kind: 'ok', plugins: plugins.length });
  })()`;
}

/** 在沙箱内实际调用每个插件，返回其产出的工具类数量；始终返回 JSON 字符串 */
function invokeSnippet(expr) {
  return `(() => {
    let cfg;
    try { cfg = (${expr}); } catch { return JSON.stringify({ ok: false, reason: 'eval-throw' }); }
    try {
      const seen = {};
      // 按 cfg.theme.extend 真实解析路径：此前恒返回 '0'，导致 typeSize 解包是否正确无法被测到。
      // 配置只提供 extend（Tailwind 默认值在浏览器端合并，沙箱内无从得知），
      // 故未命中路径仍回退 '0'，保持既有调用方行为不变。
      const t = cfg && cfg.theme;
      const root = (t && typeof t === 'object' && t.extend && typeof t.extend === 'object') ? t.extend : {};
      const stub = {
        addUtilities: (o) => Object.assign(seen, o),
        addComponents: (o) => Object.assign(seen, o),
        theme: (path) => {
          let cur = root;
          for (const seg of String(path).split('.')) {
            if (cur === null || typeof cur !== 'object' || !(seg in cur)) return '0';
            cur = cur[seg];
          }
          return cur === undefined ? '0' : cur;
        },
      };
      for (const fn of (cfg && cfg.plugins) || []) fn(stub);
      return JSON.stringify({ ok: true, count: Object.keys(seen).length, seen });
    } catch { return JSON.stringify({ ok: false, reason: 'invoke-throw' }); }
  })()`;
}

function runSandboxed(source, timeout) {
  return vm.runInNewContext(source, Object.create(null), { timeout, microtaskMode: 'afterEvaluate' });
}

/** 求值并把结果解析为纯数据对象；任何异常/非字符串出口一律 fail-closed */
function evalToVerdict(source, timeout, failReason) {
  let raw;
  try {
    raw = runSandboxed(source, timeout);
  } catch {
    // 超时或内部错误：宿主 realm Error，不插值沙箱值，返回通用原因
    return { ok: false, reason: failReason };
  }
  if (typeof raw !== 'string') return { ok: false, reason: `${failReason}（结果非原始值）` };
  try {
    const verdict = JSON.parse(raw);
    if (verdict === null || typeof verdict !== 'object') return { ok: false, reason: `${failReason}（结果异常）` };
    return { ok: true, verdict };
  } catch {
    return { ok: false, reason: `${failReason}（结果异常）` };
  }
}

/**
 * 校验内联配置是否可在浏览器端执行（plugins 必须全部为函数）。
 * @returns {{ present: boolean, ok: boolean, reason?: string, plugins?: number }}
 *   present=false 表示无内联配置（不适用，视为 ok）。
 */
export function checkInlineTailwindConfig(html) {
  const expr = extractInlineTailwindConfig(html);
  if (expr === null) return { present: false, ok: true };
  const gate = literalGate(expr);
  if (gate) return { present: true, ok: false, reason: gate };

  const res = evalToVerdict(checkSnippet(expr), INLINE_EVAL_TIMEOUT_MS, '内联配置求值失败');
  if (!res.ok) return { present: true, ok: false, reason: res.reason };

  const verdict = res.verdict;
  switch (verdict.kind) {
    case 'ok': return { present: true, ok: true, plugins: verdict.plugins };
    case 'not-object': return { present: true, ok: false, reason: '内联配置不是对象' };
    case 'not-array': return { present: true, ok: false, reason: 'plugins 非数组' };
    case 'eval-throw': return { present: true, ok: false, reason: '内联配置求值抛错' };
    case 'access-throw': return { present: true, ok: false, reason: '读取 plugins 抛错' };
    case 'non-function': return { present: true, ok: false, reason: `plugins 含 ${verdict.bad}/${verdict.total} 个非函数项（null/字符串/对象），浏览器端会抛错` };
    default: return { present: true, ok: false, reason: '内联配置校验返回未知结果' };
  }
}

/**
 * 在沙箱内实际调用内联插件（供回归自检验证「可独立执行」）。
 * @returns {{ found: boolean, ok: boolean, count?: number, reason?: string }}
 */
export function invokeInlinePlugins(html) {
  const expr = extractInlineTailwindConfig(html);
  if (expr === null) return { found: false, ok: false, reason: '未找到内联 tailwind.config' };
  const gate = literalGate(expr);
  if (gate) return { found: true, ok: false, reason: gate };

  const res = evalToVerdict(invokeSnippet(expr), INLINE_EVAL_TIMEOUT_MS * INLINE_INVOKE_TIMEOUT_FACTOR, '插件调用失败');
  if (!res.ok) return { found: true, ok: false, reason: res.reason };

  const r = res.verdict;
  if (r.ok !== true) return { found: true, ok: false, reason: '插件调用抛错' };
  if (typeof r.count !== 'number') return { found: true, ok: false, reason: '插件调用计数非数值' };
  return { found: true, ok: r.count > 0, count: r.count };
}

/**
 * 在沙箱内调用内联插件并取回指定类的实际产出值。
 *
 * 用途：验证 token 解包是否正确——`fontSize` 是数组形态，
 * 若插件里直接 `theme('fontSize.xs')`，产出会是 `"0.75rem,1.5"` 这种非法 CSS。
 * 该值在浏览器端才致命（整条规则被丢弃），三维闸门与肉眼都不易发现，故在此断言。
 *
 * @param {string} html
 * @param {string[]} classNames 如 ['.badge', '.btn']
 * @returns {{ found: boolean, ok: boolean, values?: Record<string, any>, reason?: string }}
 */
export function resolveInlineUtilities(html, classNames) {
  const expr = extractInlineTailwindConfig(html);
  if (expr === null) return { found: false, ok: false, reason: '未找到内联 tailwind.config' };
  const gate = literalGate(expr);
  if (gate) return { found: true, ok: false, reason: gate };

  const res = evalToVerdict(invokeSnippet(expr), INLINE_EVAL_TIMEOUT_MS * INLINE_INVOKE_TIMEOUT_FACTOR, '插件调用失败');
  if (!res.ok) return { found: true, ok: false, reason: res.reason };
  const r = res.verdict;
  if (r.ok !== true || !r.seen || typeof r.seen !== 'object') return { found: true, ok: false, reason: '插件未产出规则' };

  const values = {};
  for (const name of classNames) {
    values[name] = Object.prototype.hasOwnProperty.call(r.seen, name) ? r.seen[name] : null;
  }
  return { found: true, ok: true, values };
}