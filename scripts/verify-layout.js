#!/usr/bin/env node
/**
 * 版式不变量回归（F6-lite，需本机 Chrome；找不到时明确跳过）
 *
 * WHY 不做像素基线：像素回归要把 Tailwind Play CDN、Unsplash 图、系统字体全部本地化/钉版，
 * 否则同一份产物在不同机器上必然有差；那会改掉 `head` 的 `<script src>`，与「默认产物逐字节不变」
 * 这条廉价护栏冲突（golden 34 个 HTML 全要重冻）。而像素回归真正要抓的是**版式塌**——横向溢出、
 * 底部导航压住内容、文本被截断、图片撑破容器、首屏空白；这些都能用几何量断言，零基线、零资产、
 * 不改 head、不动 golden。视觉审美仍归人工评审，本脚本不越界。
 *
 * 断言（每页 × 每个视口各一条）：
 *   ① 无横向溢出（`scrollWidth - clientWidth <= 1`）
 *   ② 文本不**纵向**截断（`overflow:hidden` 且 `scrollHeight > clientHeight` 的文本节点为 0；
 *      排除 `.sr-only` 与 `-webkit-line-clamp` 这两类**有意**裁切；横向 `truncate`/ellipsis 不在此项）
 *   ③ 图片不撑破容器（图片渲染宽 ≤ 父容器宽）
 *   ④ 首屏有主内容（`main` 的首个子块顶部落在视口内）
 *   ⑤ 移动端：含底部导航的页，内容容器 `padding-bottom ≥ nav 高 + nav 下边距`（否则内容被浮层遮挡）
 *   ⑥ 桌面端：侧栏右边界 ≤ 主区左边界（否则侧栏压盖主区）
 *
 * 用法：`node scripts/verify-layout.js`（可用 `CHROME=/path/to/chrome` 指定浏览器）
 * 退出码：0 = 全绿或已跳过；1 = 有断言失败
 *
 * 实现注记（踩过的坑）：
 *  - **每个平台独立工作区**：`generate-prototype` 不清旧产物，同目录先生成 mobile 再生成 desktop
 *    会把上一平台的 `pages/*.html` 留在原地，量出来是「桌面端首页还有底部导航」这种假象。
 *  - **跳转桩不算页面**：桌面端首页外的页不在页集时，`index.html` 只是 `<meta http-equiv=refresh>`
 *    跳转桩（实测 292 字节），`page.goto` 后立刻导航会让 `addStyleTag` 报「context destroyed」。
 *    故先读文件判桩、再决定是否打开。
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { findChrome, runAssertions } from '../utils/browser-runner.js';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CHROME = findChrome();

/** 改完视口后等重排/字体落定；系统字体栈下 150ms 足够，超出只是变慢。显式命名避免散落魔法数。 */
const MEASURE_SETTLE_MS = 150;
if (!CHROME) {
  console.log('⚠ 未找到 Chrome/Chromium —— 跳过版式不变量回归（设 CHROME=/path/to/chrome 可指定）');
  process.exit(0);
}

/**
 * 视口取「常见极值」而不是单一值：375 是老款机型逻辑宽、390 是 iPhone 14/15，
 * 1280 是笔记本最小常见宽、1440 是桌面常规宽。窄的那一档才是溢出高发区。
 */
const JOBS = [
  { platform: 'mobile', fixture: 'ecommerce.md', viewports: [{ width: 375, height: 812 }, { width: 390, height: 844 }] },
  { platform: 'mobile', fixture: 'account.md', viewports: [{ width: 375, height: 812 }, { width: 390, height: 844 }] },
  { platform: 'desktop', fixture: 'saas.md', viewports: [{ width: 1280, height: 800 }, { width: 1440, height: 900 }] },
  { platform: 'desktop', fixture: 'account.md', viewports: [{ width: 1280, height: 800 }, { width: 1440, height: 900 }] },
];

/** 一次取全部可观测量（同一帧内，避免多次往返导致数量对不上） */
async function measure(page, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(MEASURE_SETTLE_MS);
  return page.evaluate(() => {
    const de = document.documentElement;
    const nav = document.querySelector('nav[aria-label="底部导航"]');
    const main = document.querySelector('main');
    // 补偿内边距在**页面根容器**上（mobile `layout-page.eta`：单一根 div 包 header+main，`pb-28`）。
    // 不用 `nav.previousElementSibling`：那是模板结构不变量，body 尾部加 toast/script 就会取错节点。
    const shell = main ? main.parentElement : null;
    const aside = document.querySelector('aside');
    const first = main ? main.querySelector(':scope > *') : null;

    // ② 有意裁切的两类：`.sr-only`（1px 视觉隐藏，供读屏）与 `-webkit-line-clamp`（多行省略）
    const clipped = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (!(cs.overflowY === 'hidden' || cs.overflow === 'hidden')) continue;
      if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') continue;
      if (el.classList.contains('sr-only')) continue;
      if (el.clientHeight <= 1 || el.clientWidth <= 1) continue;
      if (el.scrollHeight > el.clientHeight + 1 && el.textContent.trim()) {
        clipped.push(`${el.tagName}.${String(el.className).slice(0, 24)}(${el.clientHeight}<${el.scrollHeight})`);
      }
    }

    const imgOver = [];
    for (const img of document.querySelectorAll('img')) {
      const parent = img.parentElement;
      if (!parent) continue;
      if (img.getBoundingClientRect().width > parent.getBoundingClientRect().width + 1) imgOver.push(img.getAttribute('src')?.slice(-20) || 'img');
    }

    return {
      overflowPx: de.scrollWidth - de.clientWidth,
      clipped,
      imgOver,
      hasMain: !!main,
      firstTop: first ? Math.round(first.getBoundingClientRect().top) : null,
      viewportH: window.innerHeight,
      navH: nav ? Math.round(nav.getBoundingClientRect().height) : 0,
      navGap: nav ? Math.round(window.innerHeight - nav.getBoundingClientRect().bottom) : 0,
      shellPadB: shell ? Math.round(parseFloat(getComputedStyle(shell).paddingBottom)) : null,
      asideRight: aside ? Math.round(aside.getBoundingClientRect().right) : null,
      mainLeft: main ? Math.round(main.getBoundingClientRect().left) : null,
    };
  });
}

/** 几何量 → 断言（返回 [名称, 是否通过, 详情] 三元组；详情只在失败时有意义） */
function assertionsFor(m, platform, viewport) {
  const tag = `${viewport.width}px`;
  const out = [
    [`${tag} 无横向溢出`, m.overflowPx <= 1, `溢出 ${m.overflowPx}px`],
    [`${tag} 文本未截断`, m.clipped.length === 0, m.clipped.join('；')],
    [`${tag} 图片未撑破容器`, m.imgOver.length === 0, m.imgOver.join('；')],
    [`${tag} 首屏有主内容`, m.hasMain && m.firstTop !== null && m.firstTop < m.viewportH, `main=${m.hasMain} 首块 top=${m.firstTop} 视口=${m.viewportH}`],
  ];
  if (platform === 'mobile' && m.navH > 0) {
    // 底部导航是 `fixed bottom-4` 浮层：内容容器必须自己留出 ≥ nav 高 + 下边距的空间
    out.push([`${tag} 底部导航未遮挡内容`, m.shellPadB !== null && m.shellPadB >= m.navH + m.navGap,
      `padding-bottom=${m.shellPadB}px，需要 ≥ ${m.navH}+${m.navGap}px`]);
  }
  if (platform === 'desktop' && m.asideRight !== null && m.mainLeft !== null) {
    out.push([`${tag} 侧栏未压盖主区`, m.asideRight <= m.mainLeft + 1, `侧栏右=${m.asideRight} 主区左=${m.mainLeft}`]);
  }
  return out;
}

let pass = 0;
const fail = [];
const workdir = mkdtempSync(join(tmpdir(), 'layout-'));

/**
 * 环境守卫：Tailwind Play CDN 必须真的生成了工具类样式，否则几何断言测的是「无样式文档」——
 * 那会全绿（块级流式布局天然无溢出），而真实产物在有网环境下可能版式塌。
 * WHY 用探针而不是「查 <style> 标签」：CDN 注入时机与内容都不可依赖，`.p-4` 算出 16px 才是事实。
 * 失败走 throw → `runAssertions` 收成 `error` → 本脚本记 fail → 退出码 1（不静默跳过）。
 */
async function assertTailwindActive(page) {
  const ok = await page.evaluate(async () => {
    const probe = document.createElement('div');
    probe.className = 'p-4';
    probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:0;height:0';
    document.body.appendChild(probe);
    // 期望值取 root font-size（`p-4` = 1rem），不写死 16px：主题若改根字号，写死会误判「未生效」
    const expected = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    let hit = false;
    for (let i = 0; i < 20 && !hit; i++) {
      await new Promise((r) => setTimeout(r, 100));
      hit = Math.abs(parseFloat(getComputedStyle(probe).paddingTop) - expected) < 0.5;
    }
    probe.remove();
    return hit;
  });
  if (!ok) throw new Error('Tailwind CDN 未生效（探针 .p-4 未得到 1rem padding）：离线或被拦，本次版式结果无效');
}

/**
 * 跑一个页面文件（`assertionsFor` 的取数 + 断言在此收口，主流程与 `--selftest` 共用）。
 * @returns {Promise<{error?:string, results?:Array<{name:string,pass:boolean,detail:string}>}>}
 */
async function runFile(file, platform, viewports) {
  return runAssertions({
    chrome: CHROME, file, workdir,
    steps: async (page, rec) => {
      await assertTailwindActive(page);
      for (const viewport of viewports) {
        const m = await measure(page, viewport);
        for (const [name, ok, detail] of assertionsFor(m, platform, viewport)) rec(name, ok, detail);
      }
    },
  });
}

// ---- `--selftest`：证明闸门不是空断言（负例）。不做任何产物生成，纯造一个坏页面 ----
// WHY 要负例：本项目的已知失败模式是「断言恒真」（改动后闸门仍全绿）。没有负例，
// 「220 条通过」只说明脚本跑起来了，不说明它能红。
if (process.argv.includes('--selftest')) {
  const bad = join(workdir, 'bad.html');
  const WIDE = '<div style="width:2000px;height:8px">溢出</div>';
  const CLIPPED = '<p style="height:8px;overflow:hidden">这段文字比容器高，应被判为截断</p>';
  // 移动端坏页：横向溢出 + 文本截断 + 底部导航无 padding 补偿
  // 负例页需自带一条 `.p-4` 规则：`assertTailwindActive` 会先验「工具类真的生成了样式」，
  // 否则坏页在环境守卫处就 throw，测不到 ①–⑥ 本身（真实产物用的是 Tailwind CDN，负例不联网）。
  const STUB_CSS = '<style>.p-4{padding:1rem}</style>';
  const mobileBad = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${STUB_CSS}</head>
<body><main style="padding-bottom:0">${WIDE}${CLIPPED}</main>
<nav aria-label="底部导航" style="position:fixed;bottom:16px;left:0;right:0;height:64px">导航</nav></body></html>`;
  // 桌面端坏页：侧栏右边界越过主区左边界
  const desktopBad = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${STUB_CSS}</head>
<body><aside style="position:absolute;left:0;top:0;width:300px">侧栏</aside><main>${WIDE}</main></body></html>`;
  // 绿例：⑤ 的取数口径（补偿内边距在 `main` 的**父容器**上）。没这条的话 ⑤ 改坏了也只会「更红」，
  // 分不清「闸门有效」和「闸门恒红」。离线可跑（不依赖 CDN），故安排在负例之后。
  const mobileGood = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${STUB_CSS}</head>
<body><div style="padding-bottom:112px"><main><p>正常内容</p></main></div>
<nav aria-label="底部导航" style="position:fixed;bottom:16px;left:0;right:0;height:64px">导航</nav></body></html>`;
  // 桌面端绿例：侧栏与主区**并排**（flex，不重叠）——钉住 ⑥「侧栏未压盖主区」在正常布局下不误报
  // （负例只证明它能红，不能证明它不会恒红）。
  const desktopGood = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${STUB_CSS}</head>
<body><div style="display:flex"><aside style="width:300px;flex:none">侧栏</aside><main><p>正常内容</p></main></div></body></html>`;
  const cases = [
    ['负例', 'mobile', mobileBad, ['无横向溢出', '文本未截断', '底部导航未遮挡内容'], [{ width: 375, height: 812 }]],
    ['负例', 'desktop', desktopBad, ['无横向溢出', '侧栏未压盖主区'], [{ width: 1280, height: 800 }]],
    ['绿例', 'mobile', mobileGood, [], [{ width: 375, height: 812 }]],
    ['绿例', 'desktop', desktopGood, [], [{ width: 1280, height: 800 }]],
  ];
  let ok = true;
  for (const [kind, platform, html, mustFail, viewports] of cases) {
    const file = `${bad}-${kind}-${platform}.html`;
    writeFileSync(file, html, 'utf8');
    const r = await runFile(file, platform, viewports);
    const failedNames = new Set((r.results || []).filter((x) => !x.pass).map((x) => x.name.replace(/^\d+px\s*/, '')));
    if (kind === '绿例') {
      const unexpected = [...failedNames];
      console.log(`  ${unexpected.length ? '✘' : '✔'} 绿例（${platform}）：${(r.results || []).length} 条断言应全过，实失败 ${unexpected.length} 条`);
      if (unexpected.length) {
        console.log(`      误报：${unexpected.join('、')}`);
        ok = false;
      }
      continue;
    }
    const missing = mustFail.filter((n) => !failedNames.has(n));
    console.log(`  ${missing.length ? '✘' : '✔'} 负例（${platform}）：应失败的断言 ${mustFail.length} 条，实失败 ${failedNames.size} 条`);
    if (missing.length) {
      console.log(`      未被抓到：${missing.join('、')}（实得：${[...failedNames].join('、') || '无'}）`);
      ok = false;
    }
  }
  rmSync(workdir, { recursive: true, force: true });
  console.log(`\n自测：${ok ? '闸门双向有效（负例能红、绿例不误报）' : '闸门失效（负例漏抓或绿例误报）'}`);
  process.exit(ok ? 0 : 1);
}

let envSkipped = false;
try {
  jobLoop: for (const job of JOBS) {
    // 独立工作区：见文件头「实现注记」第 1 条
    const ws = join(workdir, `${job.platform}-${basename(job.fixture, '.md')}`);
    mkdirSync(join(ws, 'docs'), { recursive: true });
    cpSync(join(SKILL_DIR, 'fixtures/prd', job.fixture), join(ws, 'docs', 'prd.md'));
    execFileSync(process.execPath, [join(SKILL_DIR, 'scripts', 'generate-prototype.js'), '--platform', job.platform, '--quiet'], {
      cwd: SKILL_DIR, env: { ...process.env, WORKSPACE: ws, PREFLIGHT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
    });

    const outDir = join(ws, 'prototype');
    const pageFiles = readdirSync(join(outDir, 'pages')).filter((f) => f.endsWith('.html')).map((f) => join(outDir, 'pages', f));
    const files = job.platform === 'desktop' ? [join(outDir, 'index.html'), ...pageFiles] : pageFiles;

    console.log(`\n── ${job.platform} / ${job.fixture} ──`);
    for (const file of files) {
      const label = basename(file);
      // 跳转桩不算页面：见文件头「实现注记」第 2 条
      if (/http-equiv="refresh"/i.test(readFileSync(file, 'utf8'))) {
        console.log(`  ○ ${label.padEnd(16)} 跳过（跳转桩）`);
        continue;
      }
      const r = await runFile(file, job.platform, job.viewports);
      // 样式没生效时几何量无意义（块级流式布局天然无溢出 ⇒ 会假绿）。**第一页**就发现即判环境不可用：
      // 明确跳过并 exit 0（与「无 Chrome」同一口径）；`LAYOUT_FORCE=1` 时改为硬失败，便于排查。
      if (r.error && /Tailwind CDN 未生效/.test(r.error) && pass === 0 && !fail.length && process.env.LAYOUT_FORCE !== '1') {
        envSkipped = true;
        console.log('⚠ Tailwind CDN 未生效 —— 跳过版式不变量回归（离线/被拦？设 LAYOUT_FORCE=1 可强制判定）');
        break jobLoop;
      }
      if (r.error) {
        fail.push(`${job.platform}/${label}: ${r.error}`);
        console.log(`  ✘ ${label.padEnd(16)} ${r.error}`);
        continue;
      }
      const bad = r.results.filter((x) => !x.pass);
      pass += r.results.length - bad.length;
      for (const x of bad) fail.push(`${job.platform}/${label}: FAIL ${x.name}${x.detail ? ` → ${x.detail}` : ''}`);
      console.log(`  ${bad.length ? '✘' : '✔'} ${label.padEnd(16)} ${r.results.length - bad.length}/${r.results.length}`);
      for (const x of bad) console.log(`      ${x.name} → ${x.detail}`);
    }
  }
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

if (envSkipped) {
  console.log('（未判定：环境不可用，版式结果不作数）');
  process.exit(0);
}
console.log(`\n版式断言：${pass} 通过${fail.length ? `，${fail.length} 失败` : '，0 失败'}`);
process.exit(fail.length ? 1 : 0);
