#!/usr/bin/env node
/**
 * 登录态「纯 CSS 切换」的交互级回归（需本机 Chrome；找不到时明确跳过）
 *
 * WHY：`selfcheck` 场景 29 只能证明「类名书写正确 + 产物里已解析成具体类名」——**证明不了浏览器里
 * 真的会切换**。而这类纯 CSS 交互最典型的错（`has-[#id]` 漏 `:checked` → 变体退化为无条件生效）
 * 在静态层面「看起来完全正常」，静态断言必然假绿（本轮真踩过，见 plan §11.2）。故把一次性 harness
 * 固化成脚本，避免「验证不可重放」。
 *
 * 三个用例（各跑 mobile + desktop）：
 *   switch   —— **移除页面自身 `<script>`** 后仍能切换（证明不依赖脚本）
 *   precheck —— 静态预置 `checked`、零交互即让验证码面板可见（真·无脚本场景）
 *   count    —— 倒计时按钮：禁用 / 文案切「重新获取（60s）」/ 倒计时到秒
 *
 * 用法：`node scripts/verify-login-state.js`（可用 `CHROME=/path/to/chrome` 指定浏览器）
 * 断言执行走 `utils/browser-runner.js` 的 `runAssertions()`（Playwright 驱动）：断言写在 Node 侧、
 * 由 `page.evaluate` 取真值——不再把测试逻辑塞进被测页面（旧形态漏一个 class 引号，harness 连同
 * 页面一起失效，反而"全绿"）。需要页面内合成事件也一律走 Playwright（真 `check()`/`click()`/`focus()`）。
 * 退出码：0 = 全绿或已跳过；1 = 有断言失败
 *
 * 注：`runAssertions` 会注入 `*{transition-duration:0s!important}` —— 真实渲染下过渡会推进，
 * 等中途读 `getComputedStyle` 会读到插值，高亮断言会抖。
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { findChrome, runAssertions } from '../utils/browser-runner.js';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CHROME = findChrome();
if (!CHROME) {
  console.log('⚠ 未找到 Chrome/Chromium —— 跳过登录态交互回归（设 CHROME=/path/to/chrome 可指定）');
  process.exit(0);
}

/** 一次取全部可观测量（避免多次往返 + 保证同一帧内的一致性） */
async function snapshot(page) {
  return page.evaluate(() => {
    const r0 = document.getElementById('login-mode-password');
    const r1 = document.getElementById('login-mode-code');
    const pw = document.getElementById('login-account');
    const codeF = document.getElementById('login-phone');
    const pPw = pw && pw.closest('.space-y-4');
    const pCode = codeF && codeF.closest('.space-y-4');
    const labels = document.querySelectorAll('[role="radiogroup"] label');
    const disp = (el) => (el ? getComputedStyle(el).display : 'MISSING');
    const bg = (el) => (el ? getComputedStyle(el).backgroundColor : 'MISSING');
    const spans = document.querySelectorAll('[data-mode-status] span');
    const shown = [...spans].filter((s) => getComputedStyle(s).display !== 'none');
    const region = document.querySelector('[data-mode-status]');
    return {
      hasR0: !!r0, hasR1: !!r1, r0Checked: !!(r0 && r0.checked), r1Checked: !!(r1 && r1.checked),
      liveOk: !!region && region.getAttribute('role') === 'status' && region.getAttribute('aria-live') === 'polite',
      msgShown: shown.length,
      msgText: shown.length === 1 ? shown[0].textContent : 'MISSING',
      pwDisp: disp(pPw), codeDisp: disp(pCode),
      panels: !!pPw && !!pCode,
      labelCount: labels.length,
      l0Bg: bg(labels[0]), l1Bg: bg(labels[1]),
    };
  });
}

/** 六个用例共用的初始断言 */
function common(rec, s, precheckMode) {
  rec(`两个 radio 存在`, s.hasR0 && s.hasR1);
  rec(`面板播报区域 role=status + aria-live=polite`, s.liveOk);
  rec(`初始：播报区域恰 1 条进入无障碍树（实际 ${s.msgShown}）`, s.msgShown === 1);
  if (precheckMode) rec(`预置态（静态 checked）播报文案=验证码态（${s.msgText}）`, /验证码登录/.test(s.msgText));
  else rec(`初始播报文案=密码态（${s.msgText}）`, /密码登录/.test(s.msgText));
  rec(`两个面板可定位（密码/验证码）`, s.panels);
  rec(`标签数=2（实际 ${s.labelCount}）`, s.labelCount === 2);
}

const WHITE = 'rgb(255, 255, 255)';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const CASES = [
  {
    name: 'switch',
    desc: '移除页面自身脚本后仍能切换',
    html: (s) => stripTemplateScript(s),
    steps: async (page, rec, mode) => {
      const s0 = await snapshot(page);
      common(rec, s0, false);
      if (!s0.hasR0 || !s0.hasR1 || !s0.panels) return;
      rec(`初始：密码面板可见`, s0.pwDisp !== 'none');
      rec(`初始：验证码面板隐藏`, s0.codeDisp === 'none');
      rec(`初始：密码标签高亮（${s0.l0Bg}）`, s0.l0Bg === WHITE);
      rec(`初始：验证码标签未高亮（${s0.l1Bg}，露出底槽灰）`, s0.l1Bg === TRANSPARENT);

      // 页面自身脚本已移除：这一步只能靠 CSS（radio 状态 + has-/group-has- 变体）
      await page.evaluate(() => { document.getElementById('login-mode-code').checked = true; });
      const s1 = await snapshot(page);
      rec(`选「验证码」后密码面板隐藏（CSS）`, s1.pwDisp === 'none');
      rec(`选「验证码」后验证码面板可见（CSS）`, s1.codeDisp !== 'none');
      rec(`切换后播报文案=验证码态（${s1.msgText}）`, s1.msgShown === 1 && /验证码登录/.test(s1.msgText));
      rec(`验证码标签转为高亮（${s1.l1Bg}）`, s1.l1Bg === WHITE);
      rec(`密码标签取消高亮（${s1.l0Bg}）`, s1.l0Bg === TRANSPARENT);

      await page.click('[role="radiogroup"] label');
      const s2 = await snapshot(page);
      rec(`点击标签 → radio 联动（label 包裹 input）`, s2.r0Checked === true);
      rec(`切回密码态面板状态正确`, s2.pwDisp !== 'none' && s2.codeDisp === 'none');
      rec(`切回后播报文案复位为密码态（${s2.msgText}）`, /密码登录/.test(s2.msgText));
      await page.focus('#login-mode-password');
      rec(`radio 可聚焦（键盘方向键可切换）`, await page.evaluate(() => document.activeElement === document.getElementById('login-mode-password')));
    },
  },
  {
    name: 'precheck',
    desc: '静态预置 checked、零交互',
    html: (s) => precheck(stripTemplateScript(s)),
    steps: async (page, rec) => {
      const s0 = await snapshot(page);
      common(rec, s0, true);
      rec(`静态标记已预选 radio1`, s0.r1Checked === true);
      rec(`验证码面板直接可见（纯 CSS 生效，零脚本参与）`, s0.codeDisp !== 'none');
      rec(`密码面板相应隐藏`, s0.pwDisp === 'none');
    },
  },
  {
    name: 'count',
    desc: '倒计时按钮',
    html: (s) => s,
    steps: async (page, rec) => {
      const s0 = await snapshot(page);
      common(rec, s0, false);
      const btn = await page.$('[data-send-code]');
      rec(`「获取验证码」按钮存在`, !!btn);
      if (!btn) return;
      const norm = (t) => String(t).replace(/\s/g, '');
      rec(`初始文案=获取验证码`, norm(await btn.textContent()) === '获取验证码');
      const meta = await page.evaluate(() => {
        const b = document.querySelector('[data-send-code]');
        const st = document.querySelector('[data-code-status]');
        return {
          sent: b.getAttribute('data-status-sent'),
          ready: b.getAttribute('data-status-ready'),
          stOk: !!st && st.getAttribute('role') === 'status' && st.getAttribute('aria-live') === 'polite',
          stText: st ? st.textContent : 'MISSING',
        };
      });
      rec(`验证码播报节点 role=status + aria-live=polite`, meta.stOk);
      rec(`初始：播报节点为空（未播报）`, meta.stText === '');
      await page.evaluate(() => {
        document.querySelector('[data-send-code]').setAttribute('data-countdown', '2'); // 缩短倒计时，便于断言「结束态」播报
        document.getElementById('login-mode-code').checked = true;
      });
      await page.click('[data-send-code]');
      rec(`点击后按钮禁用`, (await page.$eval('[data-send-code]', (b) => b.disabled)) === true);
      rec(`文案切「重新获取」`, /重新获取/.test(await btn.textContent()));
      const stText = () => page.$eval('[data-code-status]', (s) => s.textContent);
      rec(`开始即播报「已发送」（${await stText()}）`, (await stText()) === meta.sent.replace('{{s}}', '2'));
      await page.waitForTimeout(1200);
      rec(`倒计时含秒数（${(await btn.textContent()).trim()}）`, /\d+\s*s/.test(await btn.textContent()));
      rec(`中途不逐秒重播（播报节点文本未变：${await stText()}）`, (await stText()) === meta.sent.replace('{{s}}', '2'));
      await page.waitForTimeout(1500);
      rec(`结束即播报「可重新获取」（${await stText()}）`, (await stText()) === meta.ready);
      rec(`按钮复位`, (await page.$eval('[data-send-code]', (b) => b.disabled)) === false && norm(await btn.textContent()) === '获取验证码');
    },
  },
];

/** 删掉模板自带的 <script>（识别依据：只该脚本引用选择器 [data-send-code]） */
function stripTemplateScript(s) {
  const chunks = s.split('<script');
  const out = [chunks[0]];
  let dropped = 0;
  for (const c of chunks.slice(1)) {
    if (c.includes('[data-send-code]')) {
      out.push(c.slice(c.indexOf('</script>') + '</script>'.length));
      dropped += 1;
    } else {
      out.push(`<script${c}`);
    }
  }
  if (dropped !== 1) throw new Error(`期望恰好删除 1 个模板脚本，实际 ${dropped}`);
  return out.join('');
}

/** 把 checked 从 password radio 挪到 code radio（模拟无脚本环境的静态状态） */
function precheck(s) {
  const a = s.replace(/(id="login-mode-password"[^>]*?)\s+checked/, '$1');
  const b = a.replace(/(id="login-mode-code"[^>]*?)\s*\/>/, '$1 checked />');
  if (b === a) throw new Error('precheck 变换未生效（radio 标记形态变了？）');
  return b;
}

let pass = 0;
const fail = [];
const workdir = mkdtempSync(join(tmpdir(), 'login-state-'));
try {
  for (const platform of ['mobile', 'desktop']) {
    const ws = join(workdir, platform);
    mkdirSync(join(ws, 'docs'), { recursive: true });
    cpSync(join(SKILL_DIR, 'fixtures/prd/account.md'), join(ws, 'docs', 'prd.md'));
    execFileSync(process.execPath, [join(SKILL_DIR, 'scripts', 'generate-prototype.js'), '--platform', platform, '--quiet'], {
      cwd: SKILL_DIR, env: { ...process.env, WORKSPACE: ws, PREFLIGHT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const src = readFileSync(join(ws, 'prototype', 'pages', 'login.html'), 'utf8');
    console.log(`\n── ${platform} ──`);
    for (const c of CASES) {
      const file = join(workdir, `${platform}-${c.name}.html`);
      writeFileSync(file, c.html(src), 'utf8');
      const r = await runAssertions({ chrome: CHROME, file, hash: c.name, workdir, steps: async (page, rec) => c.steps(page, rec, c.name) });
      if (r.error) {
        fail.push(`${platform}/${c.name}: ${r.error}`);
        console.log(`  ✘ ${c.name.padEnd(9)} ${c.desc} —— ${r.error}`);
        continue;
      }
      const f = r.results.filter((x) => !x.pass);
      pass += r.results.length - f.length;
      for (const x of f) fail.push(`${platform}/${c.name}: FAIL ${x.name}${x.detail ? ` → ${x.detail}` : ''}`);
      console.log(`  ${f.length ? '✘' : '✔'} ${c.name.padEnd(9)} ${c.desc} —— ${r.results.length - f.length}/${r.results.length}`);
      for (const x of f) console.log(`      ${x.name}`);
    }
  }
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

console.log(`\n交互断言：${pass} 通过${fail.length ? `，${fail.length} 失败` : '，0 失败'}`);
process.exit(fail.length ? 1 : 0);
