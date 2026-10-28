#!/usr/bin/env node
/**
 * 能力级 eval（F5a）：跑「完整生成一次产物 + 客观断言」，产出 pass_rate 与体积/耗时指标。
 *
 * WHY 与 golden 分工不同：golden 是**字节级防漂移**（改坏了会红，但改"更差"不会红）；
 * eval 是**能力级防变差**——它只问「给定 PRD 还能不能生成合规产物」，且指标（pass_rate /
 * totalSize / duration）可跨版本对比。
 *
 * 确定性优先（F6 像素回归的前置经验）：本批只做**客观**断言，不做视觉评分、不做 with/without
 * 模型对照（后者需要模型通道，见 plan F5b）。所有用例固定 fixture PRD、固定平台、
 * `PREFLIGHT=0` 关掉网络探测（否则网络抖动会污染耗时指标）。
 *
 * 用法：`node scripts/eval-runner.js [--only <id|name>] [--json]`
 * 产物：`evals/report/<ts>/results.json` + `benchmark.md`
 * 退出码：0 = 全部断言通过；1 = 有失败
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../utils/is-main.js';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVALS_FILE = join(SKILL_DIR, 'evals', 'evals.json');
const GEN = join(SKILL_DIR, 'scripts', 'generate-prototype.js');
const VER = join(SKILL_DIR, 'scripts', 'verify-prototype.js');

/** 产物级扫描：任意字号 / 任意圆角 / 占位图服务 / img 缺 alt */
function scanArtifacts(outDir) {
  const pagesDir = join(outDir, 'pages');
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) files.push(p);
    }
  };
  walk(outDir);
  const problems = { arbitrarySize: [], arbitraryRadius: [], placeholderService: [], imgNoAlt: [] };
  for (const f of files) {
    const html = readFileSync(f, 'utf8');
    const rel = f.slice(outDir.length + 1);
    if (/\btext-\[\d+(?:\.\d+)?px\]/.test(html)) problems.arbitrarySize.push(rel);
    if (/\brounded-\[\d+(?:\.\d+)?px\]/.test(html)) problems.arbitraryRadius.push(rel);
    if (/via\.placeholder|placehold\.(it|co)/.test(html)) problems.placeholderService.push(rel);
    for (const m of html.matchAll(/<img\b[^>]*>/gi)) if (!/\balt=/.test(m[0])) problems.imgNoAlt.push(rel);
  }
  return { problems, pageCount: files.filter((f) => f.startsWith(pagesDir)).length };
}

/**
 * 跑单个 eval 用例，返回 {name, passed, asserts:[{name,pass,detail}], metrics}
 * @param {{id:number,name:string,fixture:string,platform:'mobile'|'desktop'}} ev
 * @param {string} workdir
 */
export function runEval(ev, workdir) {
  const ws = join(workdir, `eval-${ev.id}`);
  mkdirSync(join(ws, 'docs'), { recursive: true });
  cpSync(join(SKILL_DIR, 'fixtures', 'prd', `${ev.fixture}.md`), join(ws, 'docs', 'prd.md'));
  const asserts = [];
  const rec = (name, pass, detail = '') => asserts.push({ name, pass: Boolean(pass), detail: String(detail) });
  const t0 = Date.now();
  let genOk = true;
  let genErr = '';
  try {
    execFileSync(process.execPath, [GEN, '--platform', ev.platform, '--quiet'], {
      cwd: SKILL_DIR, env: { ...process.env, WORKSPACE: ws, PREFLIGHT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    genOk = false;
    genErr = String(e.stderr || e.message).slice(0, 300);
  }
  const genMs = Date.now() - t0;
  rec('生成成功（generate-prototype 退出码 0）', genOk, genErr);

  const outDir = join(ws, 'prototype');
  const reportPath = join(outDir, 'generation-report.json');
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  rec('产物报告存在且 success=true', !!report && report.success === true, report ? `success=${report.success}` : '无 generation-report.json');

  const pages = report && Array.isArray(report.pages) ? report.pages : [];
  // 桌面端 `home` 落根目录 index.html（不是 pages/home.html）——见 SKILL.md 目录契约
  const pageFile = (p) => (ev.platform === 'desktop' && p === 'home' ? join(outDir, 'index.html') : join(outDir, 'pages', `${p}.html`));
  const missing = pages.filter((p) => !existsSync(pageFile(p)));
  rec('页集落盘完整（report.pages 均有对应 HTML）', pages.length > 0 && missing.length === 0, missing.length ? `缺 ${missing.join(',')}` : `${pages.length} 页`);

  let verifyOk = true;
  let verifyErr = '';
  try {
    execFileSync(process.execPath, [VER], { cwd: SKILL_DIR, env: { ...process.env, WORKSPACE: ws }, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    verifyOk = false;
    verifyErr = String(e.stdout || e.stderr || e.message).slice(-300);
  }
  rec('verify-prototype 通过（死链/文案域/设备几何/内联配置）', verifyOk, verifyErr);

  const { problems, pageCount } = scanArtifacts(outDir);
  rec('产物无任意字号 text-[Npx]', problems.arbitrarySize.length === 0, problems.arbitrarySize.join(','));
  rec('产物无任意值圆角（圆角须走 token）', problems.arbitraryRadius.length === 0, problems.arbitraryRadius.join(','));
  rec('无占位图服务（via.placeholder/placehold）', problems.placeholderService.length === 0, problems.placeholderService.join(','));
  rec('所有 <img> 均有 alt', problems.imgNoAlt.length === 0, [...new Set(problems.imgNoAlt)].join(','));

  return {
    id: ev.id,
    name: ev.name,
    fixture: ev.fixture,
    platform: ev.platform,
    passed: asserts.every((a) => a.pass),
    asserts,
    metrics: { pageCount, totalSize: report?.totalSize ?? null, imgCount: report?.imgCount ?? null, genMs, duration: report?.duration ?? null },
  };
}

function summarize(results) {
  const total = results.reduce((n, r) => n + r.asserts.length, 0);
  const passed = results.reduce((n, r) => n + r.asserts.filter((a) => a.pass).length, 0);
  const evalsPassed = results.filter((r) => r.passed).length;
  const sizes = results.map((r) => r.metrics.totalSize).filter((x) => typeof x === 'number');
  const times = results.map((r) => r.metrics.genMs);
  return {
    evals: results.length,
    evalsPassed,
    asserts: total,
    assertsPassed: passed,
    passRate: total ? Number((passed / total).toFixed(4)) : 0,
    totalSizeKB: sizes.length ? Number((sizes.reduce((a, b) => a + b, 0) / 1024).toFixed(1)) : null,
    genMsAvg: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
  };
}

function toMarkdown(run) {
  const lines = [
    `# eval 基准 · ${run.at}`,
    '',
    `- 用例：**${run.summary.evalsPassed}/${run.summary.evals}** 全通过；断言：**${run.summary.assertsPassed}/${run.summary.asserts}**（pass_rate ${(run.summary.passRate * 100).toFixed(1)}%）`,
    `- 产物总大小均值：${run.summary.totalSizeKB ?? '—'} KB；生成耗时均值：${run.summary.genMsAvg ?? '—'} ms`,
    '',
    '| 用例 | 平台 | 断言 | 页数 | 大小(KB) | 耗时(ms) |',
    '|---|---|---|---|---|---|',
    ...run.results.map((r) => {
      const ok = r.asserts.filter((a) => a.pass).length;
      return `| ${r.name} | ${r.platform} | ${ok}/${r.asserts.length} | ${r.metrics.pageCount} | ${r.metrics.totalSize ? (r.metrics.totalSize / 1024).toFixed(1) : '—'} | ${r.metrics.genMs} |`;
    }),
    '',
    '## 失败明细',
    '',
    ...(run.results.flatMap((r) => r.asserts.filter((a) => !a.pass).map((a) => `- \`${r.name}\` · ${a.name}${a.detail ? ` → ${a.detail}` : ''}`)).join('\n')
      ? run.results.flatMap((r) => r.asserts.filter((a) => !a.pass).map((a) => `- \`${r.name}\` · ${a.name}${a.detail ? ` → ${a.detail}` : ''}`))
      : ['（无）']),
    '',
    '> 客观断言集：只覆盖确定性可验项。视觉质量属人工评审，不在此表；模型级 with/without 对照属 F5b（需模型通道）。',
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  const asJson = process.argv.includes('--json');
  const all = JSON.parse(readFileSync(EVALS_FILE, 'utf8')).evals;
  const cases = only ? all.filter((e) => String(e.id) === only || e.name === only) : all;
  if (!cases.length) {
    console.error(`✘ 没有匹配的 eval 用例：${only}（可用：${all.map((e) => e.id).join(',')}）`);
    process.exit(1);
  }
  const workdir = mkdtempSync(join(tmpdir(), 'ppeval-'));
  const results = [];
  try {
    for (const ev of cases) {
      const r = runEval(ev, workdir);
      results.push(r);
      const ok = r.asserts.filter((a) => a.pass).length;
      console.log(`${r.passed ? '✔' : '✘'} ${r.name.padEnd(28)} ${ok}/${r.asserts.length}${r.passed ? '' : '  ← 见明细'}`);
      for (const a of r.asserts.filter((x) => !x.pass)) console.log(`    ✘ ${a.name}${a.detail ? ` → ${a.detail}` : ''}`);
    }
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
  const run = { at: new Date().toISOString(), skill: 'product-prototype-generation', results, summary: summarize(results) };
  const ts = run.at.replace(/[:.]/g, '-');
  const outDir = join(SKILL_DIR, 'evals', 'report', ts);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'results.json'), JSON.stringify(run, null, 2));
  writeFileSync(join(outDir, 'benchmark.md'), toMarkdown(run));
  console.log(`\npass_rate ${(run.summary.passRate * 100).toFixed(1)}%（${run.summary.assertsPassed}/${run.summary.asserts} 断言），报告：${outDir}`);
  if (asJson) console.log(JSON.stringify(run.summary));
  process.exit(run.summary.assertsPassed === run.summary.asserts ? 0 : 1);
}

if (isMain(import.meta.url)) main();
