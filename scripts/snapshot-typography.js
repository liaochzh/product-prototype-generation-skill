#!/usr/bin/env node
/**
 * 排版视觉留档：把「micro(11) 只服务微标签/图标尺寸、信息性标签 ≥ xs(12)」的**实际渲染**
 * 截成一张并排图，供人工比对与回归存档（需本机 Chrome；找不到时明确跳过）。
 *
 * WHY 保留成脚本而不是手工截图：静态断言只能证明「类名写对了」，证明不了**渲染出来几 px**
 * ——本轮 micro→xs 提质就是靠浏览器 `getComputedStyle` 才敢说完成（培训里的教训：验证不可重放
 * ＝下次没人能复现）。故本脚本既出图、又**当场断言实测字号**，图与断言同源：
 *   · 底部导航标签 12/500   · 快捷入口标签 12/500   · `.meta` 时间戳 12/400
 *   · hero/计数/「即将上线」微标签 11/600·500        · `.delta` 胶囊 12/500
 *
 * 产出：`docs/visual/typography-snapshot-<YYYYMMDD>.png`（4 张并排：登录密码态 / 登录验证码态
 *       （纯 CSS）/ 移动端时间戳 / 桌面端时间戳与计数徽标）。
 *
 * 用法（workdir = skill 目录）：`node scripts/snapshot-typography.js`（可用 `CHROME=` 指定浏览器）
 * 退出码：0 = 出图且字号断言全过（或已明确跳过）；1 = 断言失败 / 截图失败。
 */
import { execFileSync } from 'node:child_process';
import { findChrome } from '../utils/browser-runner.js';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { isMain } from '../utils/is-main.js';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(SKILL_DIR, 'docs', 'visual');

/** 断言脚本：在页面里量实际字号（含外框隐藏/缩放重置），把结果写进 #probe */
const PROBE = `<script>
setTimeout(function(){
  var out=[];
  function m(sel,label){var e=document.querySelector(sel);out.push(label+(e?'='+getComputedStyle(e).fontSize+'/'+getComputedStyle(e).fontWeight:'=MISSING'));}
  m('nav[aria-label="底部导航"] a','tabbar标签');
  m('span.text-xs.font-medium.text-neutral-600','快捷入口标签');
  m('span.text-micro.font-medium','hero徽标');
  m('p.meta','meta时间戳');
  m('span.text-micro.font-semibold','计数徽标');
  m('span.text-micro.text-neutral-400','即将上线徽标');
  m('p.delta','delta胶囊');
  var d=document.createElement('div');d.id='probe';d.textContent=out.join(' | ');document.body.appendChild(d);
},1500);
</script>`;

/** 实测期望：元素 → 字号/字重。未出现在目标页的元素**自动跳过**（如 chat 页无 tabbar） */
const EXPECT = {
  'tabbar标签': '12px/500',
  '快捷入口标签': '12px/500',
  'hero徽标': '11px/500',
  'meta时间戳': '12px/400',
  '计数徽标': '11px/600',
  'delta胶囊': '12px/500',
};

/**
 * 探测目标（**按页分组**：探测在外壳的 iframe 外做不了同源访问，故直接量页面文件本身；
 * 且部分页 `TABBAR_HIDDEN`（如 chat）本就不含底部导航，必须项按页声明，避免「元素不在＝假绿」）。
 */
const PROBES = [
  { key: 'mobile-home', page: 'pages/home.html', required: ['tabbar标签', '快捷入口标签', 'hero徽标'] },
  { key: 'mobile-chat', page: 'pages/chat.html', required: ['meta时间戳'] },
  { key: 'desktop-chat', page: 'pages/chat.html', required: ['meta时间戳', '计数徽标'] },
];

/** 生成产物到临时工作区 */
function genWorkspace(prdName, platform) {
  const ws = mkdtempSync(join(tmpdir(), `snap-${prdName}-${platform}-`));
  mkdirSync(join(ws, 'docs'), { recursive: true });
  cpSync(join(SKILL_DIR, 'fixtures', 'prd', `${prdName}.md`), join(ws, 'docs', 'prd.md'));
  execFileSync(process.execPath, [join(SKILL_DIR, 'scripts', 'generate-prototype.js'), '--platform', platform, '--quiet'], {
    cwd: SKILL_DIR, env: { ...process.env, WORKSPACE: ws }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return ws;
}

/** 移动端外壳：把 iframe 指向指定页，并（仅截图用）隐藏左栏说明、重置设备缩放、露出设备框 */
function shellFor(ws, pageFile) {
  const src = readFileSync(join(ws, 'prototype', 'index.html'), 'utf8');
  const withPage = src.replace(/(<iframe name="phone"[^>]*?src=")[^"]*(")/, `$1pages/${pageFile}$2`);
  if (withPage === src) throw new Error('未找到外壳 iframe（模板结构变了？）');
  const style = `<style>
    section[aria-label="原型说明"]{display:none!important}
    main{display:block!important;max-width:none!important;gap:0!important}
    [data-aspect]{transform:none!important}
    body{background:#eef1f6!important}
  </style>`;
  return withPage.replace('</head>', `${style}</head>`);
}

/** 登录「验证码态」：把 checked 从密码 radio 挪到验证码 radio（等价于用户点选后，纯 CSS 生效） */
function precheckCodeRadio(html) {
  const a = html.replace(/(id="login-mode-password"[^>]*?)\s+checked/, '$1');
  const b = a.replace(/(id="login-mode-code"[^>]*?)\s*\/>/, '$1 checked />');
  if (b === a) throw new Error('precheck 变换未生效（radio 标记形态变了？）');
  return b;
}

function chromeArgs(file, outPng, w, h, profile) {
  return ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=2',
    `--user-data-dir=${profile}`,
    '--virtual-time-budget=15000', `--window-size=${w},${h}`, `--screenshot=${outPng}`, `file://${file}`];
}

function shoot(chrome, file, outPng, w, h, profile) {
  execFileSync(chrome, chromeArgs(file, outPng, w, h, profile), { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  if (!existsSync(outPng)) throw new Error(`截图未产出：${outPng}`);
}

/** 从产物里量设备框外尺寸（外壳 style="width:Wpx;height:Hpx;…padding:Bpx"） */
function deviceBox(shellHtml) {
  const m = shellHtml.match(/data-device="[^"]*"[^>]*style="width:(\d+)px;height:(\d+)px;background:[^"]*padding:(\d+)px/);
  if (!m) throw new Error('未解析到设备框尺寸（外壳结构变了？）');
  const [, w, h, bezel] = m.map(Number);
  return { w: w + bezel * 2 + 48, h: h + bezel * 2 + 48 };
}

export function snapshotTypo() {
  const chrome = findChrome();
  if (!chrome) {
    console.log('⚠ 未找到 Chrome/Chromium —— 跳过排版视觉留档（设 CHROME=/path/to/chrome 可指定）');
    return { skipped: true, fails: [] };
  }
  const fails = [];
  const work = mkdtempSync(join(tmpdir(), 'snapshot-typo-'));
  try {
    mkdirSync(join(work, 'shots'), { recursive: true });
    // Chrome 的一次性 profile 放临时工作区内（**不要**放 docs/visual：会被当成产物留在 skill 目录里）
    const profile = join(work, 'chrome-profile');
    const accM = genWorkspace('account', 'mobile');
    const ecoM = genWorkspace('ecommerce', 'mobile');
    const ecoD = genWorkspace('ecommerce', 'desktop');

    // ① 移动端登录（密码态）② 移动端登录（验证码态，纯 CSS）③ 移动端时间戳 ④ 桌面端时间戳/计数
    const loginCodePage = precheckCodeRadio(readFileSync(join(accM, 'prototype', 'pages', 'login.html'), 'utf8'));
    writeFileSync(join(accM, 'prototype', 'pages', 'login-code.html'), loginCodePage, 'utf8');

    const shellLogin = shellFor(accM, 'login.html');
    const shellLoginCode = shellFor(accM, 'login-code.html');
    const shellChat = shellFor(ecoM, 'chat.html');
    const box = deviceBox(shellLogin);
    const boxChat = deviceBox(shellChat);

    // 先量字号（在**页面文件**上量，与出图同源同一份产物；外壳 iframe 无法同源访问）
    const measured = [];
    for (const pr of PROBES) {
      const ws = pr.key.startsWith('desktop') ? ecoD : ecoM;
      const target = join(ws, 'prototype', pr.page);
      const probeFile = join(work, `probe-${pr.key}.html`);
      writeFileSync(probeFile, readFileSync(target, 'utf8').replace('</body>', `${PROBE}\n</body>`), 'utf8');
      const dom = execFileSync(chrome, [...chromeArgs(probeFile, join(work, 'shots', `probe-${pr.key}.png`), 1440, 900, profile).slice(0, -2), '--dump-dom', `file://${probeFile}`],
        { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).toString();
      const m = dom.match(/<div id="probe">([^<]*)</);
      const seen = {};
      if (m) for (const kv of m[1].split(' | ')) { const [k, v] = kv.split('='); if (k) seen[k.trim()] = (v || '').trim(); }
      for (const k of pr.required) {
        if (!seen[k] || seen[k] === 'MISSING') fails.push(`${pr.key} ${k} 未找到（选择器/文案结构变了？）`);
      }
      for (const [k, want] of Object.entries(EXPECT)) {
        if (seen[k] === undefined || seen[k] === 'MISSING') continue;   // 该页不含此元素：跳过
        if (seen[k] !== want) fails.push(`${pr.key} ${k} 实测 ${seen[k]} ≠ 期望 ${want}`);
      }
      measured.push({ key: pr.key, page: pr.page, seen });
    }

    // 注意：变体 HTML 必须写在**产物目录内**——外壳的 iframe 用相对路径 `pages/*.html`，
    // 挪到临时目录会让相对引用全断（表现为设备框里只有占位图）。
    const jobs = [
      { id: '1-login-password', label: '移动端 · 登录（密码态）', ws: accM, html: shellLogin, w: box.w, h: box.h },
      { id: '2-login-code', label: '移动端 · 登录（验证码态，纯 CSS 切换）', ws: accM, html: shellLoginCode, w: box.w, h: box.h },
      { id: '3-mobile-chat', label: '移动端 · 时间戳 / 在线状态（.meta 12/400）', ws: ecoM, html: shellChat, w: boxChat.w, h: boxChat.h },
      { id: '4-desktop-chat', label: '桌面端 · 时间戳 / 日期分隔 / 未读计数徽标', ws: ecoD, page: 'pages/chat.html', w: 1440, h: 900 },
    ];

    const shots = [];
    for (const j of jobs) {
      // 就地（产物目录内）出 HTML：相对引用才不会断
      const file = j.page ? join(j.ws, 'prototype', j.page) : join(j.ws, 'prototype', `__shot-${j.id}.html`);
      if (!j.page) writeFileSync(file, j.html, 'utf8');
      const png = join(work, 'shots', `${j.id}.png`);
      shoot(chrome, file, png, j.w, j.h, profile);
      shots.push({ ...j, png });
    }

    // 并排图（移动端三张 + 桌面端一张 + 实测值脚注）
    const cells = shots.map((s) => `
      <figure>
        <img src="file://${s.png}" alt="${s.label}" />
        <figcaption>${s.label}</figcaption>
      </figure>`).join('');
    const footnote = measured.map((mm) =>
      `<b>${mm.page}</b>（${mm.key}）：${Object.entries(mm.seen).filter(([, v]) => v && v !== 'MISSING').map(([k, v]) => `${k} ${v}`).join('｜')}`).join('<br/>');
    const montage = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>
      *{box-sizing:border-box} body{margin:0;background:#0f172a;color:#e2e8f0;font:13px/1.6 -apple-system,"PingFang SC",sans-serif}
      header{padding:26px 34px 12px} h1{margin:0 0 6px;font-size:21px;font-weight:700;letter-spacing:-.01em}
      .rule{color:#94a3b8} .rule b{color:#7dd3fc}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:10px 34px 6px;align-items:start}
      .grid figure:nth-child(4){grid-column:1 / -1}
      figure{margin:0;background:#1e293b;border-radius:14px;padding:10px;box-shadow:0 10px 30px -12px rgb(0 0 0/.6)}
      figure img{display:block;width:100%;height:auto;border-radius:8px;background:#fff}
      figcaption{padding-top:8px;color:#cbd5e1;font-size:12px}
      footer{padding:8px 34px 26px;color:#94a3b8;font-size:12px}
      code{color:#fbbf24}
    </style></head><body>
      <header>
        <h1>排版留档：micro(11) 只服务微标签 / 图标尺寸，信息性标签 ≥ xs(12)</h1>
        <div class="rule">时间戳 → 角色类 <code>.meta</code>（12/400）　|　底部导航、快捷入口、统计值 → <code>text-xs</code>（12/500）　|　<b>徽标 / 计数 / 图标尺寸保持 micro（11）</b></div>
      </header>
      <div class="grid">${cells}</div>
      <footer>实测（headless Chrome getComputedStyle，图与断言同源）：<br/>${footnote || '(无)'}<br/>
      生成：<code>node scripts/snapshot-typography.js</code>（本页由 scripts/audit/snapshot 流程产出，可重跑）</footer>
    </body></html>`;
    const montageFile = join(work, 'montage.html');
    writeFileSync(montageFile, montage, 'utf8');

    mkdirSync(OUT_DIR, { recursive: true });
    const out = join(OUT_DIR, `typography-snapshot-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.png`);
    shoot(chrome, montageFile, out, 1500, 1760, profile);

    console.log(`✔ 并排留档：${out.slice(SKILL_DIR.length + 1)}`);
    for (const s of shots) console.log(`  · ${s.label} → ${s.w}×${s.h}`);
    console.log('  实测：'); for (const mm of measured) console.log(`  · ${mm.page} → ${Object.entries(mm.seen).filter(([, v]) => v && v !== 'MISSING').map(([k, v]) => `${k}=${v}`).join(' ')}`);
    if (fails.length) console.error(`✘ 字号断言失败：\n  ${fails.join('\n  ')}`);
    else console.log('✔ 字号断言全过（实测值与设计一致）');
    return { skipped: false, fails, out };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  const r = snapshotTypo();
  process.exit(r.fails && r.fails.length ? 1 : 0);
}