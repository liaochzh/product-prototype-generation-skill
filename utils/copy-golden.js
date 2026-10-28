/**
 * 文案域 golden 比对（唯一归一化实现）
 *
 * verify-prototype.js / selfcheck.js 共用本模块，避免三处各写一套归一化。
 *
 * 三个比对维度（逐维独立归一化，任一维度不一致即视为回归）：
 *   1) text    —— 去标签可见文本序列（折叠空白、逐行）
 *   2) attrs   —— 交互属性文案序列：aria-label / alt / placeholder / title
 *   3) classes —— 元素布局指纹多重集：(标签名, 排序后的 class token 集合)
 *                 用「多重集」而非「序列」比对：循环会重复同一 class，
 *                 且合法的 DOM 嵌套调整不应被判为回归。
 *
 * 归一化项：
 *   - 随机行 id（desktop list 用 Math.random() 生成）：SPU7i9o6y → SPU______（保留前缀）
 *   - 实体解码（&amp; &lt; &gt; &quot; &#39;）
 *
 * 基线位置：fixtures/golden/<productType>/<platform>/（冻结基线，非备份）
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';

// 行 ID 形如 `SPU7i9o6y`：前缀来自词典 `list.table.idPrefix`（SPU/TSK/ITM/ART/ID…），
// 后缀是 Math.random()，每轮生成都不同。归一化必须覆盖全部前缀，否则冻结非电商基线时必假回归。
// 用捕获组保留前缀：`TSK7i9o6y` → `TSK______`。前缀本身是词典数据，若也抹成同一个哨兵，
// `idPrefix` 被误改（如 TSK→SPU）时三维比对将完全无感，等于放弃了该维度的保护。
export const SPU_PATTERN = /\b(SPU|TSK|ITM|ART|ID)[a-z0-9]{6}\b/g;
export const SPUN_PLACEHOLDER = '$1______';

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
function decodeEntities(s) {
  return s.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (m) => ENTITIES[m]);
}
function normalizeSpu(s) {
  return s.replace(SPU_PATTERN, SPUN_PLACEHOLDER);
}

export function stripNoise(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
}

/** 维度 1：可见文本序列 */
export function normalizeText(html) {
  return stripNoise(html)
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map((line) => normalizeSpu(decodeEntities(line)).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** 维度 2：交互属性文案序列 */
export function normalizeAttrs(html) {
  const out = [];
  const src = stripNoise(html);
  for (const m of src.matchAll(/\b(aria-label|alt|placeholder|title)\s*=\s*"([^"]*)"/gi)) {
    const v = normalizeSpu(decodeEntities(m[2])).replace(/\s+/g, ' ').trim();
    if (v) out.push(`${m[1].toLowerCase()}=${v}`);
  }
  return out;
}

/** 维度 3：元素布局指纹多重集 */
export function normalizeClasses(html) {
  const out = [];
  const src = stripNoise(html);
  for (const m of src.matchAll(/<\s*([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
    const tag = m[1].toLowerCase();
    const cm = /\bclass\s*=\s*"([^"]*)"/i.exec(m[2]);
    const tokens = (cm ? cm[1] : '').split(/\s+/).filter(Boolean).sort();
    out.push(`${tag}|${tokens.join(' ')}`);
  }
  return out.sort();
}

const NORMALIZERS = { text: normalizeText, attrs: normalizeAttrs, classes: normalizeClasses };
export const DEFAULT_DIMS = ['text', 'attrs', 'classes'];

export function compareHtml(expectedHtml, actualHtml, dims = DEFAULT_DIMS) {
  const diffs = [];
  for (const d of dims) {
    const a = NORMALIZERS[d](expectedHtml);
    const b = NORMALIZERS[d](actualHtml);
    if (a.length !== b.length) {
      diffs.push({ dim: d, reason: `长度不同 expected=${a.length} actual=${b.length}`, first: firstMismatch(a, b) });
      continue;
    }
    const m = firstMismatch(a, b);
    if (m) diffs.push({ dim: d, reason: '内容不同', first: m });
  }
  return { ok: diffs.length === 0, diffs };
}

function firstMismatch(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return { i, expected: a[i], actual: b[i] };
  }
  return null;
}

export function listHtmlFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.endsWith('.html')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** 目录级比对：文件集必须一致，逐文件逐维度比对 */
export function compareDirs(expectedDir, actualDir, dims = DEFAULT_DIMS) {
  const eFiles = listHtmlFiles(expectedDir).map((p) => relative(expectedDir, p)).sort();
  const aFiles = listHtmlFiles(actualDir).map((p) => relative(actualDir, p)).sort();
  const files = [];
  const onlyExpected = eFiles.filter((f) => !aFiles.includes(f));
  const onlyActual = aFiles.filter((f) => !eFiles.includes(f));
  for (const rel of [...new Set([...eFiles, ...aFiles])].sort()) {
    if (onlyExpected.includes(rel)) { files.push({ rel, ok: false, missing: 'actual' }); continue; }
    if (onlyActual.includes(rel)) { files.push({ rel, ok: false, missing: 'expected' }); continue; }
    const r = compareHtml(
      readFileSync(join(expectedDir, rel), 'utf8'),
      readFileSync(join(actualDir, rel), 'utf8'),
      dims,
    );
    files.push({ rel, ok: r.ok, diffs: r.diffs });
  }
  return { ok: files.every((f) => f.ok), files, onlyExpected, onlyActual };
}

export function formatGoldenReport(result) {
  const lines = [];
  for (const f of result.files) {
    if (f.ok) { lines.push(`  OK   ${f.rel}`); continue; }
    if (f.missing) { lines.push(`  MISS ${f.rel} (${f.missing})`); continue; }
    lines.push(`  DIFF ${f.rel}`);
    for (const d of f.diffs) lines.push(`       ${d.dim}: ${d.reason} ${JSON.stringify(d.first)}`);
  }
  return lines.join('\n');
}