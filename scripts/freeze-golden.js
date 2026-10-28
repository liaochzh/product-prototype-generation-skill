#!/usr/bin/env node
/**
 * golden 基线冻结（带硬门禁）：node scripts/freeze-golden.js [--write] [--init] [--allow-structural] [--allow-class-refactor]
 *
 * 目的：重冻 golden 基线前，强制校验本次改动未破坏三维契约，并报告非 class
 * 区域差异（不阻断，须人工核对）。
 *
 * 覆盖 = `utils/golden-fixtures.js` 的 GOLDEN_FIXTURES 表（fixture × 平台）。
 * 多套 fixture 的必要性见该文件；覆盖完备性由 selfcheck 断言。
 *
 * 门禁（未过则拒绝冻结并退出码 1）：
 *   1) text  维度：与旧基线逐字零差异（文案未被改动）
 *   2) attrs 维度：与旧基线逐字零差异（交互属性文案未被改动）
 *   3) classes 维度：所有差异必须 100% 可由「任意字号 → token」映射表解释；
 *      若为**有意的语义类重构**（如 text-sm → .item-title），须加 --allow-class-refactor
 *      显式授权 —— 未授权时**硬拒**（退出码 1）。差异全量样本写入
 *      `~/.local/share/opencode/backups/product-prototype-generation/class-refactor-<ts>.log` 供人工核对。
 *   3b) 裸 class（含 `<script>` 内字符串写死的类名）差异同样必须全部可解释
 *   4) 产物零残留：新产物中不得再出现任意字号（px/rem/em/pt，见 `golden-gate.arbScanRe`）
 *   5) 文件集（页面集）变化：页面消失/改名 → 硬拒；**新增页面同样硬拒**（不是遗漏）——
 *      页集是布局的一部分（桌面侧栏导航出现在每个页面、移动端外壳列页清单），加页会改写
 *      **全部**重叠页面的 text/attrs，三维门禁无法区分「新增页面导致」与「真回归」，任何
 *      授权都会把真回归一起吞掉。新增页面的正确做法：新建 fixture → `--init` 首建基线。
 * 附加（不阻断，仅告警）：结构性差异探针——抹掉 class 值后若仍有差异，
 *   说明基线同时吸收了 <script>/<style>/空白等非 class 改动，须人工核对。
 *
 * 退出码：0 通过（干跑/写盘）；1 硬拒（text/attrs/任意字号/文件集，或未授权 class 差异）；
 *   2 写盘遇未授权结构差异（advisory，加 --allow-structural 即可）。
 *
 * 用法：
 *   node scripts/freeze-golden.js                          # 干跑：报告差异并跑门禁
 *   node scripts/freeze-golden.js --write                  # 门禁通过后换盘写基线（先入 .bak 再入位）
 *   node scripts/freeze-golden.js --write --allow-structural  # 授权固化非 class 区域差异
 *   node scripts/freeze-golden.js --write --allow-class-refactor  # 授权语义类重构（本轮回填）
 *   node scripts/freeze-golden.js --init                   # 干跑「首次创建」（校验文件集==PRD 页面集、产物零任意字号）
 *   node scripts/freeze-golden.js --write --init            # 首次创建基线（无旧基线可比，故不产 .bak）
 *   node scripts/freeze-golden.js --only ecommerce          # 只处理指定 fixture（多个用逗号分隔）
 *   node scripts/freeze-golden.js --write --allow-class-refactor --only ecommerce,saas
 *   node scripts/freeze-golden.js --reinit --only ecommerce   # 页集变更 SOP：审计既有基线 vs 新产物（干跑，硬拒）
 *   node scripts/freeze-golden.js --reinit --only ecommerce --allow-pageset-change --write  # 审计通过后重建
 *
 * `--only <fixture>[,<fixture>…]`：把本轮处理面收窄到指定 fixture（大表迭代/只改了一类 PRD 时省时）。
 * 未登记的名字**直接报错**（不静默忽略、不静默全跑）；与其余开关正交，门禁强度完全不变。
 *
 * `--reinit [--only <fixture>] [--allow-pageset-change] [--write]`：**重建既有基线**（页集变更 SOP）。
 * 页集（文件集）变化一律硬拒（见上），因为页集是布局的一部分、会改写全部重叠页的 text/attrs，
 * 与真回归不可区分。确需改页集时（如 PRD 增删页）走本开关，它把 §10.3 的手工三步固化成流程：
 *   1) **强制前置**：对每个既有基线跑 `auditPageset(旧基线, 新产物)`，逐维列出 text/attrs/class
 *      增删条目与文件集变化，报告落 `~/.local/share/opencode/backups/product-prototype-generation/pageset-audit-<fixture>-<platform>-<ts>.log`；
 *   2) 未给 `--allow-pageset-change` → **硬拒**（退出码 1）——审计结果必须逐条人工判读后显式授权；
 *   3) 授权后仍校验「产物文件集 == PRD 页面集」+「产物零任意字号」，`--write` 时旧基线移入
 *      `.bak/<fixture>-<platform>-<ts>` 再入位新基线（不是「先删后建」，无保护空窗）。
 * 安全护栏：`--reinit` **必须** 配 `--only`（禁止全量重建）；既有基线在新产物里消失、或反之，都不会
 * 被静默接受——它们都会出现在审计报告里，且文件集校验必须与 PRD 一致。
 *
 * `--init` 只处理**尚无基线**的 fixture-平台；已有基线一律跳过（不会借 --init 绕过门禁）。
 * 新 fixture 的正确流程：先在 `utils/golden-fixtures.js` 登记 → `--init` 干跑核对 → `--write --init` 落盘。
 * 页集变化（页面增删/改名）一律硬拒：改页集请**新建 fixture** 走同一流程，不要在既有 fixture 上加页。
 *
 * 写盘为两阶段：先对**全部**平台跑门禁并收集结果，判定通过后才统一写盘，
 * 保证「授权判定」发生在任何写操作之前（避免先写后拒 / 双端基线不一致）。
 * 换盘为「旧基线 move 进 .bak → 新基线 rename 入位」两步（move 同设备走原子 rename，
 * 跨设备 EXDEV 降级 cp+rm），中间短暂窗口内崩溃
 * 可从 `~/.local/share/opencode/backups/product-prototype-generation/<fixture>-<platform>-<ts>` 手工恢复。
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, renameSync, readdirSync, statSync } from 'fs';
import { tmpdir, homedir } from 'os';
import { resolve, dirname, join, sep } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { compareHtml, listHtmlFiles } from '../utils/copy-golden.js';
import { gateClasses, gateRawClasses, structuralDiff, countArbitrarySizes } from '../utils/golden-gate.js';
import { GOLDEN_FIXTURES, prdPathOf, goldenDirOf, BAK_ROOT } from '../utils/golden-fixtures.js';
import { auditPageset } from './audit-pageset.js';
import { isMain } from '../utils/is-main.js';
import { parsePRD, getPagePriority } from '../utils/prd-parser.js';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GEN = join(SKILL_DIR, 'scripts', 'generate-prototype.js');
const GENERATE_TIMEOUT_MS = 120000;
const MAX_BAK = 3;   // 每个「fixture-平台」组各保留最近 N 份（组内裁剪，故不会互相挤掉回滚点）

/** 展示路径：优先相对 homedir（`~` 起）—— 备份/审计已迁出 skill 目录，不能再按 SKILL_DIR 截断 */
function relToHome(p) {
  const h = homedir();
  return p.startsWith(h + sep) ? '~' + p.slice(h.length) : p;
}

function runGenerate(prd, platform) {
  const ws = mkdtempSync(join(tmpdir(), 'freeze-golden-'));
  mkdirSync(join(ws, 'docs'), { recursive: true });
  writeFileSync(join(ws, 'docs', 'prd.md'), prd);
  const r = spawnSync(process.execPath, [GEN, '--platform', platform, '--quiet'], {
    env: { ...process.env, WORKSPACE: ws }, encoding: 'utf8', timeout: GENERATE_TIMEOUT_MS,
  });
  return { ws, status: r.status, stderr: r.stderr, timedOut: r.error && r.error.code === 'ETIMEDOUT' };
}

/** 决策（纯函数，便于单测）：返回 { code, message }，code 为进程退出码 */
export function decideFreeze({ allOk, sawStructural, sawClassRefactor, write, allowStructural, allowClassRefactor }) {
  if (!allOk) return { code: 1, message: '门禁未通过，拒绝冻结。' };
  // class 差异是核心回归信号（text/attrs 两维看不见 class）→ 未授权时**硬拒**（code 1）。
  // 与结构差异的「advisory + code 2」有意不对称：结构差异天然含噪声（空白/<script>），
  // class 差异则必须逐条授权，避免误当「重构样本」漏核后被永久固化。
  if (sawClassRefactor && !allowClassRefactor) {
    return { code: 1, message: '存在未授权的 class 差异：若为有意语义类重构，核对样本后加 --allow-class-refactor 显式授权。' };
  }
  if (write && sawStructural && !allowStructural) {
    return { code: 2, message: '检测到非 class 区域差异：重冻会一并固化这些改动。请人工核对后加 --allow-structural 显式授权。' };
  }
  if (!write) {
    const extra = sawStructural ? '（存在非 class 差异：--write 需加 --allow-structural）' : '';
    return { code: 0, message: `干跑通过；加 --write 即可冻结。${extra}` };
  }
  return { code: 0, message: '冻结完成。' };
}

/**
 * 文件集差异分类（纯函数，便于单测）：
 *   missing —— 旧基线有、新产物无（页面消失/改名）
 *   added   —— 新产物有、旧基线无（新增页面）
 * 两者都硬拒：页集是布局的一部分（导航渲染进每个页面），变化会改写全部重叠页面的
 * text/attrs，与真回归不可区分 —— 见本文件头「门禁 5)」。
 */
export function classifyFileSet(oldFiles, newFiles) {
  const o = new Set(oldFiles);
  const n = new Set(newFiles);
  return {
    missing: [...o].filter((f) => !n.has(f)).sort(),
    added: [...n].filter((f) => !o.has(f)).sort(),
  };
}

/** 跨文件系统安全的「移动」：同设备走原子 rename；EXDEV（如 ~/.config 与 ~/.local/share 分属不同挂载）时
 *  降级为 cp+rm —— 失去原子性但功能不中断。备份根已迁出 skills 树，跨设备场景不再可忽略。 */
function movePath(from, to) {
  try {
    renameSync(from, to);
  } catch (e) {
    if (e?.code !== 'EXDEV') throw e;
    cpSync(from, to, { recursive: true });
    rmSync(from, { recursive: true, force: true });
  }
}

/** 换盘：只写 .html 白名单；旧基线移入 .bak 根（两次移动，崩溃窗口内可从 .bak 恢复） */
function swapBaseline(fromDir, toDir, htmlFiles, bakLabel) {
  const tmp = `${toDir}.tmp-${process.pid}`;
  // 备份名含 fixture：多 fixture 下 `desktop-<ts>` 会无法区分是电商还是 saas 的基线
  const bak = join(BAK_ROOT, `${bakLabel}-${Date.now()}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  for (const rel of htmlFiles) {
    const dest = join(tmp, rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(fromDir, rel), dest);
  }
  mkdirSync(BAK_ROOT, { recursive: true });
  rmSync(bak, { recursive: true, force: true });
  movePath(toDir, bak);   // 旧基线移出（跨设备时降级 cp+rm）
  movePath(tmp, toDir);   // 新基线入位
  pruneBak();
  return bak;
}

/** 备份按「组」裁剪：组名 = 去掉 `-<ts>` 后缀（`ecommerce-mobile` / `saas-desktop` / 旧式 `mobile`），每组各留 MAX_BAK 份 */
function pruneBak() {
  const entries = readdirSync(BAK_ROOT, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      const m = e.name.match(/^(.*)-(\d+)$/);
      let mtime = 0;
      try { mtime = statSync(join(BAK_ROOT, e.name)).mtimeMs; } catch { /* 忽略 */ }
      return { name: e.name, group: m ? m[1] : e.name, key: m ? Number(m[2]) : mtime };
    })
    .sort((a, b) => b.key - a.key);
  const seen = new Map();   // group → 已保留份数
  for (const d of dirs) {
    const n = (seen.get(d.group) || 0) + 1;
    seen.set(d.group, n);
    if (n > MAX_BAK) {
      console.log(`  清理旧备份 ${d.name}`);
      rmSync(join(BAK_ROOT, d.name), { recursive: true, force: true });
    }
  }
  // class 重构 / 页集审计日志同样按组只留最近 MAX_BAK 份
  const logs = entries
    .filter((e) => e.isFile() && /^(class-refactor|pageset-audit-[a-z0-9-]+-\d+)\.log$/.test(e.name))
    .map((e) => ({ name: e.name, key: Number((e.name.match(/-(\d+)\.log$/) || [])[1]) || 0 }))
    .sort((a, b) => b.key - a.key);
  for (const l of logs.slice(MAX_BAK)) rmSync(join(BAK_ROOT, l.name), { force: true });
}

/** 首次创建基线（无旧基线可备份）：只写 .html 白名单，tmp → 原子入位 */
function writeNewBaseline(fromDir, toDir, htmlFiles) {
  const tmp = `${toDir}.tmp-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  for (const rel of htmlFiles) {
    const dest = join(tmp, rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(fromDir, rel), dest);
  }
  mkdirSync(dirname(toDir), { recursive: true });
  rmSync(toDir, { recursive: true, force: true });
  renameSync(tmp, toDir);
}

/**
 * 首次创建基线时的期望文件集（与 generate-prototype 的落盘规则一致）：
 * 移动端每页 → `pages/<p>.html`，另加外壳 `index.html`；
 * 桌面端 `home` → `index.html`，其余 → `pages/<p>.html`；若页集不含 `home`，
 * 另加一个指向首屏的重定向入口 `index.html`（见 generate-prototype.js 的 redirectHtml）。
 * 用 PRD 派生（而非生成器自报的 report），才能独立校验「PRD 列的页都真的产出了」。
 */
function expectedFilesFor(fx, platform) {
  const pages = getPagePriority(parsePRD(readFileSync(prdPathOf(fx), 'utf8'))).slice(0, 10);
  const out = pages.map((p) => (platform === 'desktop' && p === 'home' ? 'index.html' : `pages/${p}.html`));
  if (platform === 'mobile') out.push('index.html');                        // 外壳
  else if (!pages.includes('home')) out.push('index.html');                 // 重定向入口
  return out.sort();
}

function main() {
  const write = process.argv.includes('--write');
  const init = process.argv.includes('--init');
  const allowStructural = process.argv.includes('--allow-structural');
  const allowClassRefactor = process.argv.includes('--allow-class-refactor');
  // --reinit：重建既有基线（页集变更 SOP）。审计为强制前置；须配 --only 与 --allow-pageset-change
  const reinit = process.argv.includes('--reinit');
  const allowPagesetChange = process.argv.includes('--allow-pageset-change');
  if (reinit && process.argv.includes('--init')) {
    console.error('✘ --reinit 与 --init 互斥（前者重建既有基线，后者只创建无基线的 fixture-平台）');
    return 1;
  }
  // --only <fixture>[,<fixture>…]：把处理面收窄到指定 fixture；未登记的名字直接报错（不静默全跑）
  const onlyIdx = process.argv.indexOf('--only');
  const onlyArg = onlyIdx > -1 ? String(process.argv[onlyIdx + 1] || '') : '';
  const only = onlyArg && !onlyArg.startsWith('--') ? onlyArg.split(',').map((s) => s.trim()).filter(Boolean) : null;
  if (onlyIdx > -1 && !only) {
    console.error(`✘ --only 需要一个 fixture 名（多个用逗号分隔），可选：${GOLDEN_FIXTURES.map((f) => f.name).join(', ')}`);
    return 1;
  }
  if (only) {
    const known = new Set(GOLDEN_FIXTURES.map((f) => f.name));
    const unknown = only.filter((n) => !known.has(n));
    if (unknown.length) {
      console.error(`✘ --only 未知 fixture：${unknown.join(', ')}（可选：${[...known].join(', ')}）`);
      return 1;
    }
    console.log(`--only ${only.join(', ')}：只处理这些 fixture`);
  }
  if (reinit && !only) {
    console.error(`✘ --reinit 必须用 --only 限定 fixture（禁止全量重建）：可选 ${GOLDEN_FIXTURES.map((f) => f.name).join(', ')}`);
    return 1;
  }
  const results = [];
  let allOk = true;
  let sawStructural = false;
  let sawClassRefactor = false;
  const classAudit = [];   // 授权重构时的全量差异审计（避免样本截断致漏核）

  try {
    for (const fx of GOLDEN_FIXTURES) {
      if (only && !only.includes(fx.name)) continue;
      const prdFile = prdPathOf(fx);
      if (!existsSync(prdFile)) { console.error(`✘ 缺少 PRD：${prdFile}`); allOk = false; continue; }
      const prd = readFileSync(prdFile, 'utf8');

      for (const platform of fx.platforms) {
        const label = `${fx.name}/${platform}`;   // 报告与备份名都要带 fixture，多套基线才可区分
        const oldDir = join(goldenDirOf(fx), platform);
        const isNew = !existsSync(oldDir);
        const rebuild = !isNew && reinit;   // 页集变更 SOP：既有基线 + --reinit
        if (isNew && !init) { console.error(`✘ 缺少旧基线：${oldDir}（首次创建请加 --init）`); allOk = false; continue; }
        if (rebuild) { console.warn(`⚠ ${label} --reinit：重建既有基线，审计报告为强制前置`); }
        if (!isNew && init && !reinit) { console.log(`  ${label} 已有基线，--init 跳过（重建既有基线用 --reinit）`); continue; }
        if (isNew && reinit) { console.error(`✘ ${label} 无旧基线，--reinit 不适用（首次创建请用 --init）`); allOk = false; continue; }

        const gen = runGenerate(prd, platform);
        results.push({ fixture: fx.name, platform, oldDir, ...gen });   // 始终登记，供 finally 清理
        const { ws, status, stderr, timedOut } = gen;
        if (timedOut) { console.error(`✘ ${label} 生成超时`); allOk = false; continue; }
        const newDir = join(ws, 'prototype');
        if (status !== 0 || !existsSync(newDir)) {
          console.error(`✘ ${label} 生成失败（status=${status}）\n${stderr}`);
          allOk = false; continue;
        }

        const newFiles = listHtmlFiles(newDir).map((p) => p.slice(newDir.length + 1)).sort();
        const rec = results[results.length - 1];
        rec.newDir = newDir;
        rec.newFiles = newFiles;

        if (isNew) {
          // 首次创建：无旧基线可比 → 门禁退化为「文件集 == PRD 页面集」+「产物零任意字号」
          const expect = expectedFilesFor(fx, platform);
          if (newFiles.join() !== expect.join()) {
            console.error(`✘ ${label} 产物文件集与 PRD 页面集不符：expect=[${expect}] new=[${newFiles}]`);
            allOk = false; continue;
          }
          let ok = true;
          for (const rel of newFiles) {
            const arb = countArbitrarySizes(readFileSync(join(newDir, rel), 'utf8'));
            if (arb) { console.error(`✘ ${label}/${rel} 产物含任意字号 ${arb} 处`); ok = false; }
          }
          if (!ok) { allOk = false; continue; }
          rec.init = true;
          console.warn(`⚠ ${label} 无旧基线可比：仅校验「文件集==PRD 页面集」+「产物零任意字号」（${newFiles.length} 个文件）`);
          continue;
        }

        if (rebuild) {
          // 页集变更 SOP：① 强制前置审计（逐维 + 文件集，报告落 .bak）② 显式授权 ③ 校验新产物自身
          let audit;
          try {
            audit = auditPageset(oldDir, newDir, (line) => console.log(line));
          } catch (e) {
            console.error(`✘ ${label} 页集审计失败：${e.message}`); allOk = false; continue;
          }
          try {
            mkdirSync(BAK_ROOT, { recursive: true });
            const auditFile = join(BAK_ROOT, `pageset-audit-${fx.name}-${platform}-${Date.now()}.log`);
            writeFileSync(auditFile, `# 页集变更审计（allow-pageset-change ${allowPagesetChange ? '已给' : '未给'}）\n${audit.lines.join('\n')}\n`);
            console.log(`\nℹ ${label} 审计报告已留档：${relToHome(auditFile)}`);
          } catch (e) { console.warn(`⚠ ${label} 审计留档失败：${e.message}`); }
          if (!allowPagesetChange) {
            console.error(`✘ ${label} 页集重建需先逐条核对审计报告（变化 ${audit.dirty} 文件 / 新增 ${audit.addedFiles.length} / 消失 ${audit.missingFiles.length}），确认均为页集副作用或本次模板改动后，再加 --allow-pageset-change 显式授权`);
            allOk = false; continue;
          }
          // 授权后仍须：产物文件集 == PRD 页面集 + 产物零任意字号（与 --init 同口径）
          const expectFiles = expectedFilesFor(fx, platform);
          if (newFiles.join() !== expectFiles.join()) {
            console.error(`✘ ${label} 产物文件集与 PRD 页面集不符：expect=[${expectFiles}] new=[${newFiles}]`);
            allOk = false; continue;
          }
          let ok = true;
          for (const rel of newFiles) {
            const arb = countArbitrarySizes(readFileSync(join(newDir, rel), 'utf8'));
            if (arb) { console.error(`✘ ${label}/${rel} 产物含任意字号 ${arb} 处`); ok = false; }
          }
          if (!ok) { allOk = false; continue; }
          rec.reinit = true;
          continue;
        }

        const oldFiles = listHtmlFiles(oldDir).map((p) => p.slice(oldDir.length + 1)).sort();
        const { missing, added } = classifyFileSet(oldFiles, newFiles);
        if (missing.length) {
          console.error(`✘ ${label} 基线文件缺失：${missing.join(',')}（页面消失/改名）old=[${oldFiles}] new=[${newFiles}]`);
          allOk = false; continue;
        }
        if (added.length) {
          console.error(`✘ ${label} 文件集扩张 ${added.length} 个：${added.join(',')}（old=[${oldFiles}] new=[${newFiles}]）`);
          console.error('  页面集是布局的一部分（桌面侧栏导航出现在每个页面、移动端外壳列页清单），');
          console.error('  加页会改写全部重叠页面的 text/attrs，无法与真回归区分，故不设授权开关。');
          console.error('  正确做法：在 utils/golden-fixtures.js 新建 fixture 承载新页集 → --init 首建基线。');
          allOk = false; continue;
        }

        let clean = true;
        for (const rel of oldFiles) {
          const oldHtml = readFileSync(join(oldDir, rel), 'utf8');
          const newHtml = readFileSync(join(newDir, rel), 'utf8');
          const r = compareHtml(oldHtml, newHtml, ['text', 'attrs']);
          if (!r.ok) { console.error(`✘ ${label}/${rel} 文案/属性回归：${JSON.stringify(r.diffs)}`); clean = false; }
          const probs = gateClasses(oldHtml, newHtml);
          if (probs.length) {
            sawClassRefactor = true;   // 与是否授权无关：授权与否交由 decideFreeze 裁决（使 code 1 路径可达、可单测）
            classAudit.push(`## ${label}/${rel}  class 差异 ${probs.length} 处`);
            for (const p of probs) classAudit.push(`  ${p}`);
            console.warn(`⚠ ${label}/${rel} class 差异 ${probs.length} 处（${allowClassRefactor ? '已授权，样本落审计文件' : '未授权，须加 --allow-class-refactor'}）`);
          }
          const rawProbs = gateRawClasses(oldHtml, newHtml);
          if (rawProbs.length) {
            sawClassRefactor = true;
            classAudit.push(`## ${label}/${rel}  裸 class 差异 ${rawProbs.length} 处（含 <script> 内）`);
            for (const p of rawProbs) classAudit.push(`  ${p}`);
            console.warn(`⚠ ${label}/${rel} 裸 class 差异 ${rawProbs.length} 处（含 <script> 内，${allowClassRefactor ? '已授权' : '未授权'}）`);
          }
          const arb = countArbitrarySizes(newHtml);
          if (arb) { console.error(`✘ ${label}/${rel} 产物仍含任意字号 ${arb} 处（归一未完成）`); clean = false; }
          const sd = structuralDiff(oldHtml, newHtml);
          if (sd) {
            sawStructural = true;
            console.warn(`⚠ ${label}/${rel} 存在 ${sd.count} 行非 class 区域差异（行数差 ${sd.lineDelta}，涉及 ${sd.regions.join('/')}，须人工核对）：`);
            for (const s of sd.samples) console.warn(`    L${s.line} [${s.region}]\n      - ${s.old}\n      + ${s.new}`);
          }
        }
        if (!clean) allOk = false;
      }
    }

    // 无任何可处理项时不要打出「冻结完成」假象：区分「全都已存在基线（--init 空操作）」与「有错误」
    if (results.length === 0) {
      if (!allOk) { console.error('\n✘ 无可处理的 fixture-平台，且存在错误（见上）。'); return 1; }
      console.log('\n无需处理：全部 fixture-平台均已存在基线（--init 空操作）。');
      return 0;
    }

    const decision = decideFreeze({ allOk, sawStructural, sawClassRefactor, write, allowStructural, allowClassRefactor });
    const note = sawClassRefactor ? '（含已授权语义类重构）' : '';
    // class 差异全量落审计文件（避免控制台样本截断致漏核）；无论授权与否都写，供人工核对
    if (classAudit.length) {
      try {
        mkdirSync(BAK_ROOT, { recursive: true });
        const auditPath = join(BAK_ROOT, `class-refactor-${Date.now()}.log`);
        writeFileSync(auditPath, `# class 差异审计（${sawClassRefactor ? '授权' : '未授权'}：--allow-class-refactor ${allowClassRefactor ? '已给' : '未给'}）\n${classAudit.join('\n')}\n`);
        console.log(`\nℹ class 差异全量样本（${classAudit.length} 行）：${relToHome(auditPath)}`);
      } catch (e) { console.warn(`⚠ 审计文件写入失败：${e.message}`); }
    }
    if (decision.code === 0 && write) {
      for (const r of results) {
        if (r.init) {
          writeNewBaseline(r.newDir, r.oldDir, r.newFiles);
          console.log(`✔ ${r.fixture}/${r.platform} golden 首次创建（无旧基线可比：已过「文件集==PRD 页面集」+「产物零任意字号」）`);
          continue;
        }
        if (r.reinit) {
          const bak = swapBaseline(r.newDir, r.oldDir, r.newFiles, `${r.fixture}-${r.platform}`);
          console.log(`✔ ${r.fixture}/${r.platform} 基线已重建（页集变更：审计已授权并留档；旧基线备份：${relToHome(bak)}）`);
          continue;
        }
        const bak = swapBaseline(r.newDir, r.oldDir, r.newFiles, `${r.fixture}-${r.platform}`);
        console.log(`✔ ${r.fixture}/${r.platform} golden 已重冻（text/attrs 零差异，classes 全可解释${note}，产物零残留）；旧基线备份：${relToHome(bak)}`);
      }
    } else if (decision.code === 0) {
      for (const r of results) {
        if (r.init) { console.log(`✔ ${r.fixture}/${r.platform} 待创建基线（文件集==PRD 页面集、产物零任意字号）；加 --write --init 落盘`); continue; }
        if (r.reinit) { console.log(`✔ ${r.fixture}/${r.platform} 待重建基线（审计已授权并留档）；加 --write 落盘（旧基线会先入 .bak）`); continue; }
        console.log(`✔ ${r.fixture}/${r.platform} 门禁通过（text/attrs 零差异，classes 全可解释${note}，产物零残留）`);
      }
    }
    console.log(`\n${decision.message}`);
    return decision.code;
  } finally {
    for (const r of results) if (r.ws) rmSync(r.ws, { recursive: true, force: true });
  }
}

// 仅直接执行时运行（被 import 时只暴露 decideFreeze 供单测）
if (isMain(import.meta.url)) process.exit(main());