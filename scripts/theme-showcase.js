#!/usr/bin/env node
/**
 * 主题预览页（F4-a）：把 `themes/index.js` 里所有主题渲染成一页，供「挑选主题」时肉眼比对。
 *
 * WHY 单独一个脚本、而不是塞进 generate-prototype：
 *   1) 预览页是**给人和 agent 看的对照表**，不是产物的一部分（不该混进 prototype/ 或 golden）；
 *   2) 它必须能在**没有 PRD**的情况下跑——选主题发生在生成之前。
 *
 * 输出：`<WORKSPACE>/theme-showcase.html`（`--out` 可改）。**纯内联样式、零 CDN**：离线可看，
 * 也不受 Tailwind Play CDN 可达性影响（对照表自己就是「颜色 + 字体」的样张）。
 *
 * 用法：
 *   WORKSPACE=$(mktemp -d) node scripts/theme-showcase.js
 *   node scripts/theme-showcase.js --out /tmp/themes.html [--theme indigo]
 *
 * 退出码：0 = 已写出；1 = 参数/工作区非法。
 */
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { isMain } from '../utils/is-main.js';
import { listThemes, getTheme } from '../themes/index.js';
import { generateColorScheme, getPresets } from '../utils/color-scheme.js';
import { generatePlaceholder } from '../utils/unsplash.js';
import { escapeHtml } from '../utils/sanitize.js';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const getArg = (k, d) => {
  const i = args.findIndex((a) => a === k || a.startsWith(`${k}=`));
  if (i < 0) return d;
  const v = args[i];
  return v.includes('=') ? v.split('=')[1] : args[i + 1] ?? d;
};

const WORKSPACE = process.env.WORKSPACE || process.cwd();
const OUT = resolve(getArg('--out', resolve(WORKSPACE, 'theme-showcase.html')));
const ONLY = getArg('--theme', '');

// 护栏：不要把预览页写进 skill 目录（和 generate-prototype 同一条理由：污染模板与快照）
{
  const ws = resolve(WORKSPACE);
  if (OUT === resolve(SKILL_DIR) || OUT.startsWith(resolve(SKILL_DIR) + sep)) {
    console.error(`✘ 预览页不能写进 skill 目录：${OUT}\n  请用 WORKSPACE=<你的工作区> 或 --out <路径>。`);
    process.exit(1);
  }
}

/** 一条色阶（50–950）的色块条 */
function scaleStrip(scale, label) {
  const cells = Object.entries(scale)
    .map(([step, color]) => `<div class="cell" style="background:${color}" title="${step} · ${escapeHtml(color)}"><span>${step}</span></div>`)
    .join('');
  return `<div class="row"><div class="label">${escapeHtml(label)}</div><div class="strip">${cells}</div></div>`;
}

/** 单个主题卡 */
function themeCard(theme) {
  const scheme = generateColorScheme('other', null, { theme });
  const accentStrips = Object.entries(scheme.accents).map(([slot, scale]) => scaleStrip(scale, `accent: ${slot}`)).join('');
  const gradientChips = Object.entries(scheme.gradients)
    .filter(([, v]) => typeof v === 'string')
    .slice(0, 3)
    .map(([k, v]) => `<div class="grad" style="background:${v}"><span>${escapeHtml(k)}</span></div>`)
    .join('');
  const placeholder = generatePlaceholder(['主题样张'], 400, 300, 'other', { theme });

  return `
  <section class="card" id="theme-${escapeHtml(theme.key)}">
    <header>
      <h2>${escapeHtml(theme.name)} <code>--theme ${escapeHtml(theme.key)}</code></h2>
      <p class="mood">${escapeHtml(theme.mood)}</p>
    </header>
    ${scaleStrip(scheme.primary, 'primary')}
    ${accentStrips}
    <div class="row"><div class="label">gradients</div><div class="grads">${gradientChips}</div></div>
    <div class="row"><div class="label">字体配对</div>
      <div class="fonts">
        <div style="font-family:${theme.fontStacks.sans}"><span class="tag">sans</span> 正文样张 · 商品详情与价格 ¥199</div>
        <div class="display" style="font-family:${theme.fontStacks.display}"><span class="tag">display</span> 标题样张：让每一次点击都有回响</div>
      </div>
    </div>
    <div class="row"><div class="label">占位图</div>
      <img class="ph" src="${placeholder}" alt="${escapeHtml(theme.name)}占位图样张" loading="lazy" />
    </div>
  </section>`;
}

function buildHtml() {
  const all = ONLY ? [getTheme(ONLY)].filter(Boolean) : listThemes().map((t) => getTheme(t.key));
  if (!all.length) throw new Error(`没有可渲染的主题：${ONLY}`);
  const defaults = getPresets()
    .map((p) => `<div class="def"><span class="dot" style="background:${p.primary}"></span>${escapeHtml(p.key)}</div>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>可选主题预览 · product-prototype-generation</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; background: #f8fafc; color: #0f172a;
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif; }
  h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: -0.02em; }
  h2 { font-size: 18px; margin: 0; letter-spacing: -0.01em; }
  h2 code { font-size: 12px; font-weight: 500; color: #475569; background: #e2e8f0; padding: 2px 6px; border-radius: 6px; }
  .hint { color: #64748b; font-size: 13px; margin: 0 0 24px; }
  .defaults { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 28px; font-size: 12px; color: #475569; }
  .def { display: inline-flex; align-items: center; gap: 6px; background: #fff; border: 1px solid #e2e8f0;
         border-radius: 999px; padding: 4px 10px; }
  .dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px 20px 16px;
          margin-bottom: 20px; box-shadow: 0 1px 2px rgba(15,23,42,0.06); }
  .card header { margin-bottom: 14px; }
  .mood { margin: 4px 0 0; color: #64748b; font-size: 13px; }
  .row { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 10px; }
  .label { width: 96px; flex: 0 0 96px; font-size: 12px; color: #64748b; padding-top: 3px; }
  .strip { display: flex; flex: 1; border-radius: 8px; overflow: hidden; height: 34px; }
  .cell { flex: 1; display: flex; align-items: flex-end; justify-content: center; }
  .cell span { font-size: 9px; color: rgba(255,255,255,0.85); padding-bottom: 2px; }
  .grads { display: flex; flex: 1; gap: 8px; flex-wrap: wrap; }
  .grad { min-width: 120px; height: 34px; border-radius: 8px; flex: 1; }
  .grad span { font-size: 10px; color: #fff; padding: 4px 6px; display: inline-block; }
  .fonts { flex: 1; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
  .display { font-size: 18px; }
  .tag { font-size: 10px; color: #64748b; border: 1px solid #cbd5e1; border-radius: 4px; padding: 0 4px; margin-right: 6px; }
  .ph { width: 160px; height: 120px; object-fit: cover; border-radius: 10px; border: 1px solid #e2e8f0; }
  footer { color: #94a3b8; font-size: 12px; margin-top: 8px; }
</style>
</head>
<body>
<h1>可选主题预览</h1>
<p class="hint">本页只展示主题本身的色阶/渐变/字体栈。真实产物请用 <code>--theme &lt;key&gt;</code> 生成后再看整页效果。</p>
<div class="defaults"><strong style="font-weight:600">默认（按 productType，不给 --theme 时）：</strong>${defaults}</div>
${all.map(themeCard).join('\n')}
<footer>由 scripts/theme-showcase.js 生成；色值唯一来源 constants.js，主题只做引用。</footer>
</body>
</html>
`;
}

function main() {
  let html;
  try {
    html = buildHtml();
  } catch (e) {
    console.error(`✘ ${e.message}`);
    process.exit(1);
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, html, 'utf8');
  console.log(`✔ 主题预览已写出：${OUT}`);
}

if (isMain(import.meta.url)) main();
