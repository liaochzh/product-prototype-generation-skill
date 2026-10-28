#!/usr/bin/env node
/** 质量自检：node scripts/verify-prototype.js */
import { resolve, relative } from 'path';
import { readFileSafe, listFiles } from '../utils/fs-extra.js';
import { log } from '../utils/logger.js';
import { collectDeadLinks } from '../utils/check-links.js';
import { checkInlineTailwindConfig } from '../utils/inspect-tailwind-inline.js';
import { assertCopyDomain } from '../utils/copy-domain.js';
import { stripNoise } from '../utils/copy-golden.js';
import { measureConsistency } from '../utils/consistency.js';

const WORKSPACE = process.env.WORKSPACE || process.cwd();
const outDir = resolve(WORKSPACE, 'prototype');
const files = await listFiles(outDir, { extensions: ['.html'] }).catch(() => []);
if (!files.length) { log.verify.error('无 HTML 文件，先运行 prototype'); process.exit(1); }

// 死链默认计入 pass（本地相对链接目标必须存在）；设 ENFORCE_DEAD_LINKS=0 可临时降级为仅报告
const ENFORCE_DEAD_LINKS = process.env.ENFORCE_DEAD_LINKS !== '0';

// 文案域闸门：读取生成报告中的 productType（缺失→跳过，兼容旧产物）
let genReport = null;
try { genReport = JSON.parse(await readFileSafe(resolve(outDir, 'generation-report.json'))); } catch { /* 无报告 */ }
let copyFail = 0, copyWarn = 0;
const copyDomainSkipped = !genReport || !genReport.productType;
if (copyDomainSkipped) {
  log.verify.warn('generation-report.json 缺 productType，跳过文案域闸门（旧产物向后兼容）');
}

// 环境能力矩阵只做 advisory：生成环境本身不该让产物判死（同一份 HTML 在联网/断网下都能交付），
// 但「样式全失效」这种必须让人看见，不能只留在生成期的日志里。
const caps = genReport && genReport.capabilities;
if (caps) {
  if (caps.tailwindCdn === false) log.verify.warn('capabilities.tailwindCdn=false：样式依赖 Tailwind Play CDN 且当前不可达，预览可能完全无样式（advisory，不计入 passed）');
  if (caps.chrome === false) log.verify.warn('capabilities.chrome=false：浏览器层 harness 将跳过，交互与播报未经真浏览器验证（advisory）');
  if (caps.unsplash === false && caps.localAssets === 0) log.verify.warn('capabilities：Unsplash 不可达且 assets/ 无本地图，图片全为 SVG 占位（advisory）');
}

let chineseFail = 0, imgFail = 0, semanticFail = 0, tailwindFail = 0, malformedFail = 0;
for (const f of files) {
  const rel = relative(outDir, f);
  const html = await readFileSafe(f);
  const noScript = stripNoise(html);
  const text = noScript.replace(/<[^>]+>/g, ' ');
  const t = text.replace(/\s+/g, ' ').trim(); // 合并空白，避免模板缩进稀释中文占比
  const zh = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
  const ratio = t.length ? zh / t.length : 0;
  // 页面类型感知阈值：列表/聊天/订单/发现等 UI 密集页放宽到 8%，其余 12%
  const isUIHeavy = /(list|chat|orders|discover)\.html$/.test(f);
  const threshold = isUIHeavy ? 0.08 : 0.12;
  if (ratio < threshold) { chineseFail++; log.verify.warn(`${rel} 中文占比过低(${(ratio * 100).toFixed(1)}% < ${threshold * 100}%)`); }
  if (/lorem ipsum/i.test(html)) { chineseFail++; log.verify.warn(`${rel} 含 Lorem Ipsum`); }
  if (/via\.placeholder\.com|placehold\.it/.test(html)) { imgFail++; log.verify.warn(`${rel} 含占位图服务`); }
  if (!/viewport/.test(html)) { semanticFail++; log.verify.warn(`${rel} 缺 viewport`); }
  if (!/<(header|main|nav|footer)/.test(html)) log.verify.warn(`${rel} 建议补充语义化标签`);
  // 未闭合标签：标签内部又出现 '<' ⇒ 前一个标签没闭合（历史 bug：<textarea ...</textarea> 把后续 DOM 吞成属性）。
  // 剔除 script/style 后判定，口径与 golden 三维一致。
  // 边界：属性值含 '>' 会截断 [^>]* ⇒ 漏报；文件末个标签缺 '>' 无后继 '<' ⇒ 漏报；属性值含 '<'+字母 ⇒ 误报。
  //       故这是样本门禁，不是完整 HTML 校验器。
  const badTag = /<[a-zA-Z][^>]*</.exec(noScript);
  if (badTag) {
    malformedFail++;
    const line = noScript.slice(0, badTag.index).split('\n').length;
    log.verify.error(`${rel}:${line} 存在未闭合标签：${badTag[0].replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  // 剔除逻辑自身的对账：畸形 <script 若被整段吞掉，上面的判据会假阴性。
  const openScripts = (html.match(/<script\b/gi) || []).length;
  const closeScripts = (html.match(/<\/script>/gi) || []).length;
  if (openScripts !== closeScripts) {
    malformedFail++;
    log.verify.error(`${rel} script 标签不配对：<script ${openScripts} / </script> ${closeScripts}（剔除可能吞掉畸形脚本）`);
  }
  // Tailwind 内联配置必须可在浏览器端执行：plugins 被 JSON.stringify 丢成 null（或含非函数项）→ CDN 抛错、全部样式失效
  const tw = checkInlineTailwindConfig(html);
  if (tw.present && !tw.ok) { tailwindFail++; log.verify.error(`${rel} Tailwind 内联配置不可执行：${tw.reason}`); }
  // 文案域泄漏：扫描去标签可见文本 + 交互属性值（不扫整段 HTML，避免类名/脚本噪声）
  if (!copyDomainSkipped) {
    const attrs = [...html.matchAll(/\b(?:aria-label|alt|placeholder|title)="([^"]*)"/gi)].map((m) => m[1]).join(' ');
    const hay = `${noScript.replace(/<[^>]+>/g, ' ')} ${attrs}`;
    const cd = assertCopyDomain(hay, genReport.productType, genReport.allowTerms || []);
    if (cd.fail.length) { copyFail++; log.verify.error(`${rel} 文案域泄漏(fail)：${cd.fail.join('、')}`); }
    if (cd.warn.length) { copyWarn++; log.verify.warn(`${rel} 文案域弱词(warn)：${cd.warn.join('、')}`); }
  }
}

// 设备维度闸门：移动端外壳的设备几何必须与 generation-report.json 一致。
// 断言字段存在（缺 device → layoutFail），消除「缺字段即静默跳过」的假绿路径。
// 折痕为【估计】值，仅做「数量一致性」校验，不阻塞视觉差异。
let layoutFail = 0, creaseFail = 0;
const deviceInfo = genReport && genReport.platform === 'mobile' ? genReport.device : null;
if (genReport && genReport.platform === 'mobile' && !deviceInfo) {
  layoutFail++;
  log.verify.error('移动端 generation-report.json 缺 device 字段：该产物由本参数化之前的版本生成，请重新运行 generate-prototype.js 后再验');
}
if (deviceInfo) {
  const shell = await readFileSafe(resolve(outDir, 'index.html')).catch(() => null);
  if (!shell) { layoutFail++; log.verify.error('移动端外壳 index.html 缺失，无法校验设备几何'); }
  else {
    // `\s` 前缀避开 <style> 内 [data-aspect="..."] 选择器的误匹配
    const attr = (n) => { const m = new RegExp(`\\s${n}="([^"]*)"`).exec(shell); return m ? m[1] : null; };
    const dv = attr('data-device'), da = attr('data-aspect'), dp = attr('data-panes'), dvs = attr('data-vertical-space');
    if (dv !== deviceInfo.key) { layoutFail++; log.verify.error(`外壳 data-device=${dv} ≠ 报告 ${deviceInfo.key}`); }
    if (da !== deviceInfo.aspectClass) { layoutFail++; log.verify.error(`外壳 data-aspect=${da} ≠ 报告 ${deviceInfo.aspectClass}`); }
    if (dp !== String(deviceInfo.panes)) { layoutFail++; log.verify.error(`外壳 data-panes=${dp} ≠ 报告 ${deviceInfo.panes}`); }
    if (dvs !== deviceInfo.verticalSpace) { layoutFail++; log.verify.error(`外壳 data-vertical-space=${dvs} ≠ 报告 ${deviceInfo.verticalSpace}`); }
    // 档位硬约束：pane/wide 至少双栏（栏数由折痕派生，不得低于档位下界）
    if ((deviceInfo.aspectClass === 'pane' || deviceInfo.aspectClass === 'wide') && Number(dp) < 2) {
      layoutFail++; log.verify.error(`${deviceInfo.aspectClass} 档应至少双栏，实为 ${dp} 栏`);
    }
    if (!new RegExp(`width:${deviceInfo.frameWidth}px;height:${deviceInfo.frameHeight}px`).test(shell)) {
      layoutFail++; log.verify.error(`外壳帧尺寸与报告不符（应 ${deviceInfo.frameWidth}×${deviceInfo.frameHeight}）`);
    }
    // 状态栏带高断言：golden 三维不比对 style，状态栏几何是唯一「闸门外的视觉回归」高发点。
    // 历史上把 statusBarHeight 误当 padding-top 会把文字压到页面 pt-14 标题行上，必须机器守住。
    // 注意属性顺序为 class/style/aria-hidden/id，须先截出整个标签再取 height。
    const sbTag = /<div\b[^>]*\sid="status-bar"[^>]*>/.exec(shell);
    const sb = sbTag ? /height:(\d+)px/.exec(sbTag[0]) : null;
    if (!sb || Number(sb[1]) !== deviceInfo.statusBarHeight) {
      layoutFail++; log.verify.error(`状态栏带高 ${sb ? sb[1] : '缺失'} ≠ 报告 ${deviceInfo.statusBarHeight}`);
    }
    const creaseDivs = (shell.match(/class="crease-line"/g) || []).length;
    const expectCrease = deviceInfo.crease ? deviceInfo.crease.positions.length : 0;
    if (creaseDivs !== expectCrease) { creaseFail++; log.verify.error(`外壳折痕数 ${creaseDivs} ≠ 期望 ${expectCrease}`); }
  }
}

// 死链检查（本地相对链接目标必须存在）
const deadLinks = await collectDeadLinks(files, outDir);
if (deadLinks.length) {
  log.verify.warn(`发现 ${deadLinks.length} 条死链`);
  deadLinks.slice(0, 20).forEach((d) => log.verify.warn(`  ${d.from} -> ${d.href}`));
}

// 未解析的站内导航：href="#" 且未显式标注 aria-disabled（配置的链接目标页不在 PRD 页面清单内）
// 用于给「页面集回退后仍无落点」的导航链接一个可见信号（不阻塞，仅告警）
let unresolvedLinks = 0;
for (const f of files) {
  const rel = relative(outDir, f);
  const html = await readFileSafe(f);
  const anchors = html.match(/<a\b[^>]*href="#"[^>]*>/gi) || [];
  const n = anchors.filter((a) => !/aria-disabled/i.test(a)).length;
  if (n) { unresolvedLinks += n; log.verify.warn(`${rel} 有 ${n} 个 href="#" 未解析导航链接（目标页不在页面清单内）`); }
}

const deadLinkFail = ENFORCE_DEAD_LINKS ? deadLinks.length : 0;

// ---- 一致性闸门（布局槽位）----
// WHY 必须在这里而不只靠 golden：golden 三维比的是**单个元素的 class 字符串**，
// 表达不了「header 与 main 的左右内边距必须相等」这类**跨元素约束**。B1 之前
// 8/8 页恒定出现「内容比标题偏左 4px」，三维门禁全绿却无人发现，就是这条缺口。
// 口径与 measure-consistency.js 共用 utils/consistency.js（同一实现，避免两套阈值漂移）。
// button 档暂为 advisory：B2（按钮档收敛）未做，硬接会立刻红（当前移动 5 种 / 桌面 6 种）。
const consistency = await measureConsistency(outDir);
const cs = consistency.summary;
let consistencyFail = 0;
let controlKindsWarn = false;
if (cs) {
  const slotLabels = [
    ['headerLeft', 'header 左内边距'], ['headerRight', 'header 右内边距'],
    ['mainLeft', 'main 左内边距'], ['mainRight', 'main 右内边距'],
    ['tabbarLeft', 'tabbar 左内边距'], ['tabbarRight', 'tabbar 右内边距'],
  ];
  if (cs.gutterDelta.max != null && cs.gutterDelta.max !== 0) {
    consistencyFail++;
    log.verify.error(`gutter 不一致：header 与 main 的**左**内边距最大差 ${cs.gutterDelta.max}px（取值 ${JSON.stringify(cs.gutterDelta.values)}）—— 两者须同一刻度（px-page）`);
  }
  if (cs.gutterDelta.rightMax != null && cs.gutterDelta.rightMax !== 0) {
    consistencyFail++;
    log.verify.error(`gutter 不一致：header 与 main 的**右**内边距最大差 ${cs.gutterDelta.rightMax}px（取值 ${JSON.stringify(cs.gutterDelta.rightValues)}）—— 右侧同样须同一刻度`);
  }
  // 全站只有外壳（无 header/main）⇒ 一致性无从判定；不判红就成了「只剩 index 也能过」的假绿
  if (cs.files > 0 && cs.shellOnly === cs.files) {
    consistencyFail++;
    log.verify.error(`全部 ${cs.files} 个 HTML 均为外壳/重定向（无 header/main），一致性闸门无从判定 —— 检查是否静默丢页`);
  }
  for (const [key, label] of slotLabels) {
    const vals = cs.slotDrift[key] || [];
    // 唯一值 >1 ⇒ 跨槽位漂移（如 header 20 / main 16 / tabbar 24）；空数组=该槽位不存在（桌面无 tabbar）
    if (vals.length > 1) {
      consistencyFail++;
      log.verify.error(`槽位漂移：${label} 出现 ${vals.length} 个值 ${JSON.stringify(vals)} —— 全站槽位须单值`);
    }
    // 单值也可能整体漂移（模板统一回退 px-5）：须等于 page 令牌，否则「统一但不正确」照样过闸。
    // 仅在「有 header 且 main」的真实产物上执行：手写样本/片段页（只有 <main>）不是本模板形态，
    // 按 page 令牌判会误红（selfcheck 的未闭合标签正例就是这种单页样本）。
    const hasSlots = (cs.slotDrift.headerLeft || []).length > 0 && (cs.slotDrift.mainLeft || []).length > 0;
    if (hasSlots && consistency.pagePx != null) {
      for (const v of vals) {
        if (v !== consistency.pagePx) {
          consistencyFail++;
          log.verify.error(`槽位未用 page 刻度：${label} = ${v}px ≠ ${consistency.pagePx}px（应写 px-page）`);
        }
      }
    }
  }
  if (cs.negMargin.mismatch.length) {
    consistencyFail += cs.negMargin.mismatch.length;
    cs.negMargin.mismatch.slice(0, 5).forEach((d) => log.verify.error(`负 margin 与内边距不配对：${d}`));
  }
  if (cs.negMargin.orphan.length) {
    // 孤儿可能是「-mx-N + p-N」的合法写法，故不判死；但不配对即意味着左右不对称，必须可见
    cs.negMargin.orphan.slice(0, 5).forEach((d) => log.verify.warn(`负 margin 无配对水平内边距（advisory）：${d}`));
  }
  if (cs.unknownClasses.length) {
    log.verify.warn(`未识别刻度 ${cs.unknownClasses.length} 个 ${JSON.stringify(cs.unknownClasses.slice(0, 8))}：度量口径不覆盖，一致性数值可能偏低（advisory）`);
  }
  if (cs.controlKinds.button.length > 3) {
    controlKindsWarn = true;
    log.verify.warn(`控件渲染高度档 ${cs.controlKinds.button.length} 种 ${JSON.stringify(cs.controlKinds.button)}（目标 ≤3，B2 未做 ⇒ advisory）`);
  }
}

const passed = chineseFail === 0 && imgFail === 0 && semanticFail === 0 && tailwindFail === 0 && deadLinkFail === 0 && copyFail === 0 && layoutFail === 0 && creaseFail === 0 && malformedFail === 0 && consistencyFail === 0;
console.log(JSON.stringify({
  files: files.length,
  chineseFail,
  imgFail,
  semanticFail,
  tailwindFail,
  copyFail,
  copyWarn,
  copyDomainSkipped,
  productType: genReport ? genReport.productType : null,
  device: deviceInfo ? { key: deviceInfo.key, aspectClass: deviceInfo.aspectClass, panes: deviceInfo.panes, verticalSpace: deviceInfo.verticalSpace, crease: deviceInfo.crease || null } : null,
  layoutFail,
  creaseFail,
  malformedFail,
  deadLinks: deadLinks.length,
  deadLinksEnforced: ENFORCE_DEAD_LINKS,
  unresolvedLinks,
  consistencyFail,
  consistency: cs ? {
    platform: consistency.platform,
    pagePx: consistency.pagePx,
    gutterDeltaMax: cs.gutterDelta.max,
    gutterDeltaRightMax: cs.gutterDelta.rightMax,
    slotDrift: cs.slotDrift,
    negMarginMismatch: cs.negMargin.mismatch.length,
    negMarginOrphan: cs.negMargin.orphan.length,
    buttonKinds: cs.controlKinds.button.length,
    buttonKindsList: cs.controlKinds.button,
    buttonKindsAdvisory: controlKindsWarn,
    transitionPages: cs.transitionPages,
    unknownClasses: cs.unknownClasses.length,
  } : null,
  passed,
}, null, 2));
process.exit(passed ? 0 : 2);