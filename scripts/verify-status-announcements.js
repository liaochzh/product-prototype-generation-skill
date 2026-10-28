#!/usr/bin/env node
/**
 * 过程反馈的**状态播报**回归（WCAG 4.1.3）——真在 Chrome 里点击，验证两处产品的过程反馈：
 *   ① 导出按钮（桌面 orders）：点击 → 常驻 `role="status"` 区域按「进行中 / 完成」两次变化，
 *      等待期间**不重复改写**（防逐秒刷屏），按钮不禁用（焦点不丢）。
 *   ② 发布成功提示（桌面 publish）：必须是「**常驻** live region + 内层节点切换」——旧形态把
 *      `hidden` 挂在 live region 自身上，隐藏期间的内容变化多数读屏器**不播报**（lecture 见 plan §11.11）。
 * WHY 必须有浏览器层：静态断言只看得到标记形态，测不到「区域是否真常驻可见」「点击后文本是否真变」
 * （§11.10 的「类属性漏收尾引号」就是静态断言全绿、浏览器里全灭）。
 * 用法（workdir = skill 目录）：`node scripts/verify-status-announcements.js`
 * 断言走 `utils/browser-runner.js` 的 `runAssertions()`（Playwright）：点击是 Playwright 的真点击，
 * 文案变化读的是渲染后的 `textContent`，不再靠页面内脚本自报。
 * 需本机 Chrome / Chromium（可用 `CHROME=/path/to/chrome` 指定）；无 Chrome 时**明确跳过**并 exit 0。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome, runAssertions } from '../utils/browser-runner.js';

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

const CHROME = findChrome();
if (!CHROME) {
  console.log('⚠ 未找到 Chrome/Chromium —— 跳过过程反馈播报回归（设 CHROME=/path/to/chrome 可指定）');
  process.exit(0);
}

const txt = (page, sel) => page.$eval(sel, (el) => String(el.textContent).trim());
const disp = (page, sel) => page.$eval(sel, (el) => getComputedStyle(el).display);

const CASES = [
  {
    hash: 'export',
    page: 'orders.html',
    desc: '导出按钮 → 开始/完成两次播报，中途不重播',
    steps: async (page, rec) => {
      const exists = await page.evaluate(() => !!document.querySelector('[data-export]') && !!document.querySelector('[data-export-status]'));
      rec('导出按钮与状态区域都存在', exists);
      if (!exists) return;
      const aria = await page.$eval('[data-export-status]', (el) => ({
        role: el.getAttribute('role'), live: el.getAttribute('aria-live'), atomic: el.getAttribute('aria-atomic'),
      }));
      rec('状态区域 role=status + aria-live=polite + aria-atomic=true', aria.role === 'status' && aria.live === 'polite' && aria.atomic === 'true');
      rec(`状态区域**常驻可见**（display=${await disp(page, '[data-export-status]')}）`, (await disp(page, '[data-export-status]')) !== 'none');
      rec('初始为空（未播报）', (await txt(page, '[data-export-status]')) === '');
      const meta = await page.$eval('[data-export]', (b) => ({ pending: b.getAttribute('data-pending'), done: b.getAttribute('data-done') }));
      rec('按钮带词典文案（data-pending / data-done）', !!meta.pending && !!meta.done);
      await page.click('[data-export]');
      rec(`点击即播报「进行中」（${await txt(page, '[data-export-status]')}）`, (await txt(page, '[data-export-status]')) === meta.pending);
      rec('点击后按钮未禁用（焦点不丢）', (await page.$eval('[data-export]', (b) => b.disabled)) !== true);
      await page.waitForTimeout(400);
      rec(`等待中不重复改写（${await txt(page, '[data-export-status]')}）← 防刷屏`, (await txt(page, '[data-export-status]')) === meta.pending);
      await page.waitForTimeout(900);
      rec(`完成即播报「导出完成」（${await txt(page, '[data-export-status]')}）`, (await txt(page, '[data-export-status]')) === meta.done);
    },
  },
  {
    hash: 'publish',
    page: 'publish.html',
    desc: '发布成功提示 → 常驻区域 + 内层切换',
    steps: async (page, rec) => {
      const ok = await page.evaluate(() => {
        const w = document.querySelector('#publishWizard');
        return !!w && !!w.querySelector('p[role="status"]') && !!w.querySelector('[data-status]') && !!w.querySelector('[data-next]');
      });
      rec('常驻区域 / 内层提示 / 下一步按钮齐备', ok);
      if (!ok) return;
      const REGION = '#publishWizard p[role="status"]';
      const INNER = '#publishWizard [data-status]';
      rec(`初始：**区域本身可见**（display=${await disp(page, REGION)}）← 旧形态此处隐藏、不可播报`, (await disp(page, REGION)) !== 'none');
      rec(`初始：内层提示隐藏（display=${await disp(page, INNER)}）`, (await disp(page, INNER)) === 'none');
      const expect = await txt(page, INNER);
      for (let i = 0; i < 8; i++) await page.click('#publishWizard [data-next]'); // 连点走到最后一步（脚本会 clamp 到末步）
      rec(`末步：区域仍可见（display=${await disp(page, REGION)}）`, (await disp(page, REGION)) !== 'none');
      rec(`末步：内层提示显示（display=${await disp(page, INNER)}）← 内容进入无障碍树即播报`, (await disp(page, INNER)) !== 'none');
      const now = await txt(page, INNER);
      rec(`末步文案=词典成功文案（${now}）`, now === expect && expect.length > 0);
    },
  },
];

let pass = 0;
const fail = [];
const workdir = mkdtempSync(join(tmpdir(), 'status-announce-'));
try {
  const ws = join(workdir, 'ws');
  mkdirSync(join(ws, 'docs'), { recursive: true });
  cpSync(join(SKILL_DIR, 'fixtures/prd/ecommerce.md'), join(ws, 'docs', 'prd.md'));
  execFileSync(process.execPath, [join(SKILL_DIR, 'scripts', 'generate-prototype.js'), '--platform', 'desktop', '--quiet'], {
    cwd: SKILL_DIR, env: { ...process.env, WORKSPACE: ws, PREFLIGHT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  console.log('\n── ecommerce / desktop ──');
  for (const c of CASES) {
    const src = readFileSync(join(ws, 'prototype', 'pages', c.page), 'utf8');
    const file = join(workdir, `${c.hash}.html`);
    writeFileSync(file, src, 'utf8');
    const r = await runAssertions({ chrome: CHROME, file, hash: c.hash, workdir, steps: c.steps });
    if (r.error) {
      fail.push(`${c.hash}: ${r.error}`);
      console.log(`  ✘ ${c.hash.padEnd(8)} ${c.desc} —— ${r.error}`);
      continue;
    }
    const f = r.results.filter((x) => !x.pass);
    pass += r.results.length - f.length;
    for (const x of f) fail.push(`${c.hash}: FAIL ${x.name}`);
    console.log(`  ${f.length ? '✘' : '✔'} ${c.hash.padEnd(8)} ${c.desc} —— ${r.results.length - f.length}/${r.results.length}`);
    for (const x of f) console.log(`      ${x.name}`);
  }
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

console.log(`\n过程反馈播报断言：${pass} 通过${fail.length ? `，${fail.length} 失败` : '，0 失败'}`);
process.exit(fail.length ? 1 : 0);
