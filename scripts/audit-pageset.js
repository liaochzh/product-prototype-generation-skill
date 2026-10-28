#!/usr/bin/env node
/**
 * 页集变更审计：逐维比对「旧 golden 基线」与「新生成产物」
 *
 * WHY：给既有 fixture 加页/删页（改页集）时，页集是布局的一部分——桌面侧栏导航渲染进每个页面、
 * 移动端外壳列页清单，页集变化会改写**全部重叠页**的 text/attrs，与真回归在三维上不可区分，
 * 故 `freeze-golden.js` 的冻结门禁一律硬拒（`classifyFileSet`）。真的需要改页集时的 SOP 是
 * 「先逐维审计 → 删旧基线 → `--init` 重建」（该组会经历一次保护空窗）。本模块做第一步：
 * 把差异拆成 text / attrs / class 三维的**多重集增删条目**，供逐条判断「是否可解释」。
 *
 * 现在它已被 `freeze-golden.js --reinit` 接成**强制前置步骤**：审计报告先落 BAK_ROOT
 * （`~/.local/share/opencode/backups/product-prototype-generation`）的
 * `pageset-audit-<fixture>-<platform>-<ts>.log`，且必须 `--allow-pageset-change` 显式授权才重建
 * （避免「删旧基线 → 重建」把真回归一起固化）。本文件的 CLI 仍可用于手工比对任意两个目录。
 *
 * CLI 用法（workdir = skill 目录）：
 *   node scripts/audit-pageset.js <旧基线目录> <新产物目录>
 *   退出码：0 = 三维与文件集完全一致；1 = 存在差异（需逐条判读）；2 = 用法/目录错误。
 *
 * 判读基线：`[text]`/`[attrs]` 出现非「页集副作用」的条目即视为真回归，此时**不要**重建基线。
 * 页集副作用的典型形态：导航项增删、外壳页数文案（`共 N 个页面`）、新页面文件本身。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeText, normalizeAttrs, normalizeClasses } from '../utils/copy-golden.js';
import { isMain } from '../utils/is-main.js';

/** 不参与比对：生成器的旁路产物（基线不收录） */
const IGNORED = new Set(['generation-report.json']);

function listFiles(dir, base = '') {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, join(base, e.name)));
    else if (!IGNORED.has(e.name)) out.push(join(base, e.name));
  }
  return out.sort();
}

/** 多重集差异：返回 removed/added（按出现次数配对，保留重复计数） */
function multisetDiff(a, b) {
  const count = (arr) => {
    const m = new Map();
    for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
    return m;
  };
  const ca = count(a);
  const cb = count(b);
  const removed = [];
  const added = [];
  for (const [k, v] of ca) {
    const w = cb.get(k) || 0;
    for (let i = w; i < v; i++) removed.push(k);
  }
  for (const [k, v] of cb) {
    const w = ca.get(k) || 0;
    for (let i = w; i < v; i++) added.push(k);
  }
  return { removed, added };
}

const cap = (arr, n = 8) => (arr.length <= n ? arr : [...arr.slice(0, n), `…共 ${arr.length} 条`]);

/**
 * 逐维审计两个目录（旧基线 / 新产物）。
 * @param {string} oldRoot 旧基线目录
 * @param {string} newRoot 新产物目录
 * @param {(line: string) => void} [log] 实时输出回调（默认静默；CLI 传 console.log，`--reinit` 传 process 输出）
 * @returns {{ oldFiles: string[], newFiles: string[], addedFiles: string[], missingFiles: string[],
 *             dirty: number, clean: boolean, lines: string[] }}
 *          `clean` = 三维与文件集全都一致（即「什么都没变」）
 */
export function auditPageset(oldRoot, newRoot, log = () => {}) {
  if (!existsSync(oldRoot)) throw new Error(`目录不存在：${oldRoot}`);
  if (!existsSync(newRoot)) throw new Error(`目录不存在：${newRoot}`);
  const lines = [];
  const out = (s = '') => { lines.push(s); log(s); };

  const oldFiles = listFiles(oldRoot);
  const newFiles = listFiles(newRoot);
  out(`旧基线 ${oldFiles.length} 文件 / 新产物 ${newFiles.length} 文件`);
  out(`新增文件: ${newFiles.filter((f) => !oldFiles.includes(f)).join(', ') || '(无)'}`);
  out(`消失文件: ${oldFiles.filter((f) => !newFiles.includes(f)).join(', ') || '(无)'}`);
  out('='.repeat(72));

  let dirty = 0;
  for (const f of oldFiles.filter((x) => newFiles.includes(x))) {
    const a = readFileSync(join(oldRoot, f), 'utf8');
    const b = readFileSync(join(newRoot, f), 'utf8');
    const t = multisetDiff(normalizeText(a), normalizeText(b));
    const at = multisetDiff(normalizeAttrs(a), normalizeAttrs(b));
    const c = multisetDiff(normalizeClasses(a), normalizeClasses(b));
    const same = !t.added.length && !t.removed.length && !at.added.length && !at.removed.length && !c.added.length && !c.removed.length;
    if (same) {
      out(`\n### ${f}  ← 三维完全一致`);
      continue;
    }
    dirty++;
    out(`\n### ${f}`);
    if (t.removed.length || t.added.length) {
      out('  [text]  - ' + cap(t.removed).join(' | - '));
      out('  [text]  + ' + cap(t.added).join(' | + '));
    }
    if (at.removed.length || at.added.length) {
      out('  [attrs] - ' + cap(at.removed).join(' | - '));
      out('  [attrs] + ' + cap(at.added).join(' | + '));
    }
    if (c.removed.length || c.added.length) out(`  [classes] 删除 ${c.removed.length} / 新增 ${c.added.length}（仅计数；class 差异需另判是否属角色类收编）`);
  }

  const addedFiles = newFiles.filter((f) => !oldFiles.includes(f));
  const missingFiles = oldFiles.filter((f) => !newFiles.includes(f));
  out('\n' + '='.repeat(72));
  out(`小结：变化文件 ${dirty} 个；新增 ${addedFiles.length} 个；消失 ${missingFiles.length} 个。`);
  out('逐条确认差异均为「页集副作用 / 本次模板改动」后方可重建基线：node scripts/freeze-golden.js --reinit --only <fixture> --allow-pageset-change --write');

  return {
    oldFiles, newFiles, addedFiles, missingFiles, dirty,
    clean: dirty === 0 && addedFiles.length === 0 && missingFiles.length === 0,
    lines,
  };
}

// CLI：仅直接执行时运行（作为模块被 import 时不产生副作用）
if (isMain(import.meta.url)) {
  const [oldRoot, newRoot] = process.argv.slice(2);
  if (!oldRoot || !newRoot) {
    console.error('用法：node scripts/audit-pageset.js <旧基线目录> <新产物目录>');
    process.exit(2);
  }
  let r;
  try {
    r = auditPageset(oldRoot, newRoot, (s) => console.log(s));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  process.exit(r.clean ? 0 : 1);
}