#!/usr/bin/env node
/**
 * 原型生成入口：
 * node scripts/generate-prototype.js --platform mobile [--page home,list] [--clean]
 * 读取 <WORKSPACE>/docs/prd.md → eta 渲染 → 输出 <WORKSPACE>/prototype/
 */
import { resolve, dirname, posix, sep } from 'path';
import { fileURLToPath } from 'url';
import { cpSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { readFileSafe, writeFileAtomic, ensureDir, removeRecursive, exists, listFiles, statSafe } from '../utils/fs-extra.js';
import { log, setVerbose, setQuiet, startProgress, updateProgress, succeedProgress, failProgress } from '../utils/logger.js';
import { parsePRD, validatePRD, getPagePriority, extractUnknownPageNames, KNOWN_PAGES } from '../utils/prd-parser.js';
import { generateTailwindConfig, generateHeadResources, generateSizeClassScript } from '../utils/tailwind-config.js';
import { generateColorScheme } from '../utils/color-scheme.js';
import { generateImageMap } from '../utils/unsplash.js';
import { render, precompileAll } from '../utils/eta-renderer.js';
import { escapeHtml } from '../utils/sanitize.js';
import { buildCopyPack, badgeToneClass } from '../utils/copy-domain.js';
import { resolveDevice } from '../utils/device-profile.js';
import { detectCapabilities, capabilityWarnings } from '../utils/preflight.js';
import { getTheme, listThemes } from '../themes/index.js';
import { DEVICES, ASPECT_CLASSES, SHELL_STAGE_PAD, TABBAR_HIDDEN } from '../constants.js';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.findIndex((a) => a === k || a.startsWith(k + '=')); if (i < 0) return d; const v = args[i]; return v.includes('=') ? v.split('=')[1] : args[i + 1] ?? d; };
const platform = (getArg('--platform', 'mobile') || 'mobile').toLowerCase();
if (!['mobile', 'desktop'].includes(platform)) {
  console.error(`不支持的平台：${platform}（仅支持 mobile / desktop）`);
  process.exit(1);
}
const pageFilter = (getArg('--page', '') || '').split(',').filter(Boolean);
const doClean = args.includes('--clean');
const doWatch = args.includes('--watch');
if (args.includes('--verbose')) setVerbose(true);
if (args.includes('--quiet')) setQuiet(true);

// 设备参数（仅 mobile 有外壳；desktop 忽略）
// 三个覆盖参数彼此独立：--device-width/height 覆盖尺寸、--aspect 覆盖派生档位、--crease 覆盖折痕；
// 全不给时用默认设备 iphone16。未知设备且无自定义尺寸会报错退出。
const deviceKey = getArg('--device', 'iphone16');
const aspectOverride = getArg('--aspect', '');
const creaseOverride = getArg('--crease', '');
const parseDim = (flag, v) => {
  if (v === '' || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`${flag} 需为正数，收到：${v}`);
    process.exit(1);
  }
  return Math.round(n);
};
const customW = parseDim('--device-width', getArg('--device-width', ''));
const customH = parseDim('--device-height', getArg('--device-height', ''));
if (aspectOverride && !Object.prototype.hasOwnProperty.call(ASPECT_CLASSES, aspectOverride)) {
  console.error(`不支持的档位：${aspectOverride}（仅支持 ${Object.keys(ASPECT_CLASSES).join(' / ')}）`);
  process.exit(1);
}

// ── 折叠姿态（--posture）：折算成 crease 覆盖，**不改 mobile-template/*.eta** ──
// flat=1px 分割线（观感近似；Apple 语义是 division 区宽度 0）、half=预设带宽（Duo 40pt）、
// closed=无折痕带（仅报告标注）。与 --crease 互斥：两者改同一字段，静默覆盖会撒谎。
const POSTURES = ['flat', 'half', 'closed'];
const postureArg = (getArg('--posture', '') || '').trim().toLowerCase();
if (postureArg && !POSTURES.includes(postureArg)) {
  console.error(`不支持的姿态：${postureArg}（仅支持 ${POSTURES.join(' / ')}）`);
  process.exit(1);
}
if (postureArg && creaseOverride) {
  console.error('--posture 与 --crease 互斥：两者都改折痕带，请只给一个');
  process.exit(1);
}
if (postureArg && platform !== 'mobile') {
  console.error('--posture 仅用于 mobile（桌面端无设备外壳与折痕）');
  process.exit(1);
}

/** 姿态只对折叠形态有意义：非折叠设备给 --posture 会画出假中缝并让 data-panes 与档位互斥 */
function assertPostureSupported(key) {
  const preset = DEVICES[key];
  if (!preset || !preset.crease) {
    const folds = Object.keys(DEVICES).filter((k) => DEVICES[k].crease);
    console.error(`--posture 仅适用于折叠设备：${key} 不是折叠形态（可用：${folds.join(', ')}）`);
    process.exit(1);
  }
}

/** 姿态 → --crease 规格串（复用 device-profile 的 parseCrease，不新增渲染分支）。
 *  调用前必先 assertPostureSupported，故 DEVICES[key].crease 必然存在。 */
function creaseSpecFor(key, posture) {
  if (!posture) return '';
  if (posture === 'closed') return 'none';            // parseCrease('none') → null
  const base = DEVICES[key].crease;
  const axis = base.axis === 'h' ? 'h' : 'v';
  const positions = Array.isArray(base.positions) && base.positions.length ? base.positions : [0.5];
  const width = posture === 'flat' ? 1 : base.width;
  return `${axis}-${positions.length}@${positions.map((x) => Math.round(x * 100)).join(',')}:${width}`;
}

// ── 多帧预览（--frame-set k1,k2[,...]）：每帧额外产出根级 device-<key>.html ──
// 帧语法 `key[:posture]`，帧级 posture 优先、缺省继承全局 --posture。
// 契约：index.html 恒为 --device 主帧；--aspect/--device-width/height 只作用于主帧
//（它们描述「这台设备」，套到别的设备上会产出错误几何）。
const frameSetRaw = (getArg('--frame-set', '') || '').trim();
const frames = [];
if (frameSetRaw) {
  if (platform !== 'mobile') {
    console.error('--frame-set 仅用于 mobile（桌面端无设备外壳）');
    process.exit(1);
  }
  const specs = frameSetRaw.split(',').map((s) => s.trim()).filter(Boolean);
  if (specs.length > 4) {
    console.error(`--frame-set 最多 4 帧，收到 ${specs.length}：${specs.join(',')}`);
    process.exit(1);
  }
  const seen = new Set();
  for (const spec of specs) {
    const [rawKey, rawPosture] = spec.split(':');
    const key = (rawKey || '').trim();
    const fp = (rawPosture || '').trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(DEVICES, key)) {
      console.error(`--frame-set 未知设备：${key}（可用：${Object.keys(DEVICES).join(', ')}）`);
      process.exit(1);
    }
    if (fp && !POSTURES.includes(fp)) {
      console.error(`--frame-set 姿态非法：${fp}（仅支持 ${POSTURES.join(' / ')}）`);
      process.exit(1);
    }
    if (seen.has(key)) {
      log.prototype.warn(`--frame-set 重复设备 ${key}：产物文件名按 key 固定（device-${key}.html），已保留首次出现的帧；同一设备要对比多姿态请分两次生成`);
      continue;
    }
    seen.add(key);
    frames.push({ key, posture: fp || postureArg || null });
  }
}

let device = null;
if (platform === 'mobile') {
  if (postureArg) assertPostureSupported(deviceKey);
  try {
    device = resolveDevice({
      deviceKey, aspectOverride, customW, customH,
      creaseOverride: postureArg ? creaseSpecFor(deviceKey, postureArg) : creaseOverride,
    });
  } catch (e) { console.error(e.message); process.exit(1); }
  if (!device) {
    console.error(`不支持的设备：${deviceKey}（可用：${Object.keys(DEVICES).join(', ')}）`);
    process.exit(1);
  }
}
const frameDevices = frames.map((f) => {
  if (f.posture) assertPostureSupported(f.key);
  let d = null;
  try {
    d = resolveDevice({ deviceKey: f.key, creaseOverride: creaseSpecFor(f.key, f.posture) });
  } catch (e) { console.error(e.message); process.exit(1); }
  return { ...f, device: d };
});

// 竖排系统栏只支持「物理右缘」：左缘达标（横持 landscapeLeft 的镜像）降级为横排，不画半套。
if (device?.systemBar?.degradedLeftRail) {
  log.prototype.warn('左侧系统栏暂未实现（本轮仅右侧）：已按横排渲染，勿据此判读竖排观感');
}
// 页面侧几何只跟主帧 device（pages/*.html 是一套共享产物）⇒ 混帧无法同时正确，直接拒绝：
// 否则会产出「chrome 压住未避让的内容」或「横排帧里悬着一条竖排 TabBar」的假预览。
// 比较键：横排帧各画各的状态栏带（每帧外壳自带 device），彼此无影响，故只比形态；
// 竖排才把厚度/栏高/底避让算进键里——页面侧的 --rail-w、TabBar 的 top 与 padding-bottom
// 都只认主帧，几何不同必然错位。
const barSig = (b) => (b.orientation === 'vertical'
  ? `vertical/${b.thickness}/${b.chromeHeight}/${b.bottomInset}`
  : 'horizontal');
for (const f of frameDevices) {
  if (device && f.device && barSig(f.device.systemBar) !== barSig(device.systemBar)) {
    console.error(`--frame-set 第 ${f.key} 帧的系统栏几何（${barSig(f.device.systemBar)}）与主帧（${barSig(device.systemBar)}）不同：`
      + '页面产物只有一套，混帧会画出错误预览。请拆成两次生成（例如先竖排、再横排）。');
    process.exit(1);
  }
}

// 帧文件名白名单：只认 `device-<DEVICES 键>.html`，避免清理时误删用户手放进 prototype/ 的同类名文件。
const DEVICE_FRAME_RE = new RegExp(`^device-(${Object.keys(DEVICES).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\.html$`);

// 可选主题（F4-a）：只做加法——不给 --theme 时三消费点入参与旧行为完全一致。
// 未知键**硬失败**（不静默回退）：否则「选了主题但没生效」是最难查的一类问题。
const themeKey = getArg('--theme', '');
let theme = null;
if (themeKey) {
  try {
    theme = getTheme(themeKey);
  } catch (e) {
    console.error(`✘ ${e.message}`);
    process.exit(1);
  }
  if (!theme) {
    console.error(`不支持的主题：${themeKey}（可用：${listThemes().map((t) => t.key).join(', ')}）`);
    process.exit(1);
  }
}

const WORKSPACE = process.env.WORKSPACE || process.cwd();
// 护栏：WORKSPACE 落在 skill 目录内（例如漏设 WORKSPACE、cwd 正好是 skill 目录）时**直接报错**——
// 否则会在模板/基线旁边写出 `prototype/`，污染 skill 目录与快照（本轮真踩：一次漏设 WORKSPACE 的
// 试跑留下了空 `prototype/pages/` 并被快照收录）。产物应当只落在调用方自己的工作区。
{
  const root = resolve(SKILL_DIR);
  const ws = resolve(WORKSPACE);
  if (ws === root || ws.startsWith(root + sep)) {
    console.error(`✘ WORKSPACE 不能落在 skill 目录内：${ws}\n  产物会污染模板/基线；请设置 WORKSPACE=<你的工作区>（如 mktemp -d）后再生成。`);
    process.exit(1);
  }
}
const prdPath = getArg('--prd', resolve(WORKSPACE, 'docs/prd.md'));
const outDir = resolve(WORKSPACE, 'prototype');
const assetsDir = resolve(outDir, 'assets');
const pagesDir = resolve(outDir, 'pages');
const tplDir = resolve(SKILL_DIR, platform === 'desktop' ? 'desktop-template' : 'mobile-template');

const PAGE_TITLES = { home: '首页', discover: '发现', list: '列表', 'list-detail': '列表详情', detail: '详情', publish: '发布', chat: '消息', orders: '订单', profile: '我的', dashboard: '工作台', settings: '设置', form: '表单', login: '登录', register: '注册' };

// 需求文档导入（F2-docs）的「假设清单」：由 generate-prd.js --from= 独占写，
// 这里只读。它带 `prdSha1`——只看路径会被 `--prd docs/prd.md`（相对）与
// `resolve()` 后的绝对路径字面差异坑到，导致假设静默丢失。
const ASSUMPTIONS_FILE = resolve(WORKSPACE, 'docs', 'prd-assumptions.json');
const sha1 = (text) => createHash('sha1').update(text, 'utf8').digest('hex');

/**
 * 读回假设清单。**双条件**才认：路径归一相等 + 内容摘要一致。
 * @param {string} prd 本次实际解析的 PRD 正文
 * @returns {Promise<{prdSource:'prd'|'doc', assumptions:string[]}>}
 */
async function readPrdAssumptions(prd) {
  if (!(await exists(ASSUMPTIONS_FILE))) return { prdSource: 'prd', assumptions: [] };
  try {
    const raw = JSON.parse(await readFileSafe(ASSUMPTIONS_FILE));
    // 标量/`null`/数组都要挡住：`null.prdPath` 会抛 TypeError 走到 warn 分支，
    // 与「标量走不匹配分支」行为不一致（审查 P2）。
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      log.prototype.warn('prd-assumptions.json 结构不合法（应为对象），按「无假设」处理');
      return { prdSource: 'prd', assumptions: [] };
    }
    const samePath = typeof raw.prdPath === 'string' && resolve(raw.prdPath) === resolve(prdPath);
    const sameContent = raw.prdSha1 === sha1(prd);
    if (samePath && sameContent) {
      return { prdSource: 'doc', assumptions: Array.isArray(raw.assumptions) ? raw.assumptions.map(String) : [] };
    }
    log.prototype.debug('prd-assumptions.json 与本次 PRD 不同源（或用原话重新生成过），已忽略');
  } catch (e) {
    log.prototype.warn(`读取 prd-assumptions.json 失败，按「无假设」处理：${e.message}`);
  }
  return { prdSource: 'prd', assumptions: [] };
}

async function buildOnce() {
  const t0 = Date.now();
  if (doClean && await exists(outDir)) await removeRecursive(outDir);
  await ensureDir(pagesDir);
  // 复制 <WORKSPACE>/assets 到 prototype/assets，使原型目录自包含（本地图优先于 Unsplash）
  const assetsSrc = resolve(WORKSPACE, 'assets');
  if (await exists(assetsSrc)) {
    try { cpSync(assetsSrc, assetsDir, { recursive: true }); } catch (e) { log.prototype.warn(`assets 复制失败：${e.message}`); }
  }
  const isMobile = platform === 'mobile';
  const LAYOUTS = isMobile
    ? { shell: 'layout-shell.eta', page: 'layout-page.eta' }
    : { page: 'layout.eta' };
  for (const name of Object.values(LAYOUTS)) {
    if (!(await exists(resolve(tplDir, name)))) throw new Error(`模板缺失：${tplDir}/${name}`);
  }

  const prd = await readFileSafe(prdPath);
  const v = validatePRD(prd);
  v.warnings.forEach((w) => log.prototype.warn(w));
  if (v.errors && v.errors.length) throw new Error(`PRD 校验失败：${v.errors.join('；')}`);
  const meta = parsePRD(prd);
  const prdAssumptions = await readPrdAssumptions(prd);
  if (platform === 'mobile' || platform === 'desktop') meta.targetPlatform = platform;

  // 页面清单的「未登记页名」必须留痕：严格路径只收 normalizePageName 认识的页名，
  // 其余被静默丢弃（产物少页、rc=0、无痕迹）。tolerant 的 --from= 路径另有假设清单。
  const unknownPages = extractUnknownPageNames(prd);
  if (unknownPages.length) {
    log.prototype.warn(`页面清单含未登记页名，已忽略：${unknownPages.join('、')}（可识别页名：${[...KNOWN_PAGES].sort().join('/')}；自由格式文档请用 --from= 导入）`);
  }
  // 整节一个都没识别出来 ⇒ parsePRD 回退默认页集：产物与 PRD 无关，必须显式提示。
  if (meta.pageListFallback && prdAssumptions.prdSource !== 'doc') {
    log.prototype.warn(`页面清单未识别出任何登记页名，已回退默认页集（${meta.corePages.join('/')}）`);
  }

  // 文案域：按 productType 组装文案包（override > 词典 > other），供模板以 it.copy.xxx 消费
  const copy = buildCopyPack(meta, { override: meta.copyOverride || null, logger: log.prototype });
  const copyPack = copy.pack;
  const copyNav = (p) => (copyPack.nav && copyPack.nav[p]) || PAGE_TITLES[p] || p;

  let pages = getPagePriority(meta);
  if (pageFilter.length) {
    // 显式 --page 里拼错/写了不存在的页名同样不得静默：PRD 页集是判据（此处尚未做
    // 10 页截断与平台模板过滤，故被截断页/桌面专属页都不会误报）。
    const unmatched = pageFilter.filter((p) => !pages.includes(p));
    if (unmatched.length) {
      log.prototype.warn(`--page 指定的页名不在 PRD 页面清单，已忽略：${unmatched.join('、')}（PRD 页集：${pages.join('/') || '空'}）`);
    }
    pages = pages.filter((p) => pageFilter.includes(p));
  }
  if (!pages.length) throw new Error('PRD 未解析出任何页面（页面清单为空，或全部被 --page 过滤）');
  // 平台模板过滤：mobile 只有 10 个页面模板（无 form/dashboard/settings）。
  // 旧行为是静默用 home 模板顶替——产物页名与内容不符（重复首页），而 report.pages /
  // 死链 / 文案域闸门全绿，无法排查。改为跳过 + 在报告里留痕（report.skippedPages）。
  const requestedPages = pages.slice();
  // 本平台可用页（动态取自模板目录：跳过 warn 与「全无模板」错误共用，避免手抄漂移）
  const available = readdirSync(resolve(tplDir, 'pages')).filter((f) => f.endsWith('.eta')).map((f) => f.slice(0, -4)).sort();
  const pagesWithTpl = [];
  const skippedPages = [];
  for (const p of pages) {
    if (await exists(resolve(tplDir, 'pages', `${p}.eta`))) pagesWithTpl.push(p);
    else skippedPages.push(p);
  }
  if (skippedPages.length) {
    // 出口必须可执行：只说「已跳过」用户无从预判/补救。这里按**真实模板目录**判定另一平台
    // 是否真有这些页的模板（不硬编码 desktop），两端都没有时不给平台建议。
    const otherPlatform = platform === 'mobile' ? 'desktop' : 'mobile';
    const otherDir = resolve(SKILL_DIR, otherPlatform === 'desktop' ? 'desktop-template' : 'mobile-template', 'pages');
    const otherPages = (await exists(otherDir))
      ? readdirSync(otherDir).filter((f) => f.endsWith('.eta')).map((f) => f.slice(0, -4))
      : [];
    const movable = skippedPages.filter((p) => otherPages.includes(p));
    const usableHint = movable.length ? `；改用 --platform ${otherPlatform} 有这些页的模板（${movable.join('/')}）` : '';
    log.prototype.warn(`${platform} 无以下页面模板，已跳过：${skippedPages.join('、')}（页名仅存在于其它平台模板，不再用 home 副本顶替）${usableHint}；${platform} 可用页：${available.join('/')}`);
  }
  if (!pagesWithTpl.length) {
    throw new Error(`页面清单中的页面在本平台均无模板：${requestedPages.join('、')}（${platform} 可用页：${available.join('/')}）。请调整页面清单或改用 --platform desktop`);
  }
  // 10 页上限同样不得静默丢页：超出部分记入 report.truncatedPages 并 warn。
  // 注意排序不是「页面清单顺序」，而是（用户流程频次 → 固定页序），故提示要给出真实收敛手段。
  const truncatedPages = pagesWithTpl.slice(10);
  if (truncatedPages.length) {
    log.prototype.warn(`页集上限 10 页，已截断：${truncatedPages.join('、')}（排序依据：用户流程频次 → 固定页序；如需保留某页，请在用户流程中引用它或收敛页面清单）`);
  }
  pages = pagesWithTpl.slice(0, 10);

  const scheme = generateColorScheme(meta.productType, meta.brandColor, { theme });
  const twConfig = generateTailwindConfig(meta, platform, { theme });
  const head = generateHeadResources(twConfig, `${meta.productName}原型`, `${meta.productName}高保真可交互原型`, isMobile ? generateSizeClassScript() : '');
  const images = await generateImageMap(meta, pages, { assetsDir, theme });
  await precompileAll(tplDir).catch(() => {});

  // 品牌签名元素（monogram + wordmark）——产品无关，供布局与页面复用
  const brandHex = scheme.primary[600];
  const _name = String(meta.productName || 'P').trim();
  const _initial = (_name.split(/\s+/)[0] || 'P').charAt(0).toUpperCase();
  const signature = `<span class="inline-flex items-center gap-2.5"><span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold text-white shadow-sm" style="background:${brandHex}">${escapeHtml(_initial)}</span><span class="text-sm font-semibold tracking-tight text-neutral-900">${escapeHtml(_name)}</span></span>`;
  const brandMark = `<span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold text-white shadow-sm" style="background:${brandHex}" aria-hidden="true">${escapeHtml(_initial)}</span>`;

  const nav = pages.map((p) => ({ name: p, title: copyNav(p) }));
  const total = pages.length + (isMobile ? 1 : 0);
  let done = 0;

  // 页面集感知的链接契约：解析「当前页 → 目标页」的相对路径
  // 产物目录：移动端所有页在 pages/；桌面端首页在根（index.html），其余页在 pages/
  const pageSet = new Set(pages);
  const dirOf = (p) => (isMobile || p !== 'home' ? 'pages' : '.');
  const fileOf = (n) => (isMobile ? `pages/${n}.html` : n === 'home' ? 'index.html' : `pages/${n}.html`);
  const relHref = (from, n) => posix.relative(dirOf(from), fileOf(n));
  // name→fallbacks 取首个存在于页集者；均不存在→'#'
  const linkFor = (from) => (name, ...fallbacks) => {
    for (const n of [name, ...fallbacks]) if (pageSet.has(n)) return relHref(from, n);
    return '#';
  };
  // 桌面端页集无 home 时的入口重定向页（0 内联样式、不引外链，Tailwind CDN 环境下仍可读）
  const redirectHtml = (page, title) => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="0; url=pages/${page}.html">
<title>${escapeHtml(title || page)}</title>
</head>
<body>
<p>正在进入<a href="pages/${page}.html">${escapeHtml(title || page)}</a>…</p>
</body>
</html>
`;

  // 移动端外壳（index.html）导航与首屏（均以 pages/ 为基准）
  const shellLink = (name) => (pageSet.has(name) ? `pages/${name}.html` : '#');
  // 首屏回退优先取带 TabBar 的主导航页，避免落在 chat/detail 等无导航页
  const homeFallback = ['home', 'discover', 'list', 'profile', 'orders', 'publish'].find((n) => pageSet.has(n)) || pages[0];
  const homeHref = homeFallback ? `pages/${homeFallback}.html` : '#';
  // 竖排系统栏（iPhone Duo 外屏等）：页面侧只消费 thickness/chromeHeight/bottomInset，
  // 与外壳读同一个 `device.systemBar`，不在这里另做几何派生。
  const railBar = device?.systemBar?.orientation === 'vertical' ? device.systemBar : null;
  // 本地资源前缀（按当前页所在目录深度）：pages/ 下回退一级，根目录不加前缀
  const assetBase = (p) => (dirOf(p) === '.' ? '' : '../');
  const shapeImg = (p) => (src) => (/^(?:https?:|data:|\/\/)/i.test(src) ? src : assetBase(p) + src);

  // 底部 TabBar（抽取自各页重复的内联实现）——仅渲染当前页集中存在的项；全屏页不注入
  // TABBAR_HIDDEN 从 constants.js 导入（校验侧同源，勿在此重抄名单）
  // 竖排系统栏（iPhone Duo 外屏）：TabBar 挪进侧栏，但仍由**页面**渲染 ——
  // 全屏页隐藏与 aria-current 是页面级语义，外壳跨文档读不到 iframe 当前页（file:// 属不透明源）。
  const TAB_ITEMS = (Array.isArray(copyPack.tabbar) ? copyPack.tabbar : []).map((t) => [t.target, t.icon, t.label]);
  const buildTabbar = (p) => {
    if (!isMobile || TABBAR_HIDDEN.has(p)) return '';
    const items = TAB_ITEMS.filter(([name]) => pageSet.has(name)).map(([name, icon, label]) => {
      const on = p === name;
      return `<a href="${linkFor(p)(name)}"${on ? ' aria-current="page"' : ''} class="flex flex-col items-center gap-1 text-xs font-medium ${on ? 'text-brand-600' : 'text-neutral-500'} active:scale-95 transition"><i data-lucide="${icon}" class="text-xl"></i>${escapeHtml(label)}</a>`;
    }).join('');
    if (!items) return '';
    if (railBar) {
      // 竖排：无 px-*/inset-x-*（consistency 的 tabbar 槽位只认横向内距，竖排不参与漂移统计），
      // 材质与外壳栏顶 chrome 同款；y 从 chromeHeight 起，内容让出 home indicator 区。
      return `<nav aria-label="底部导航" data-rail-tabbar="1" class="fixed right-0 z-20 flex flex-col items-center justify-evenly bg-white/85 backdrop-blur-xl ring-1 ring-white/60 shadow-xl" style="top:${railBar.chromeHeight}px;bottom:0;width:${railBar.thickness}px;padding-bottom:${railBar.bottomInset}px">${items}</nav>`;
    }
    return `<nav class="fixed bottom-4 inset-x-page z-20 bg-white/85 backdrop-blur-xl ring-1 ring-white/60 shadow-xl rounded-3xl px-page py-3 flex justify-between" aria-label="底部导航">${items}</nav>`;
  };

  const baseCtx = (p, extra = {}, dev = device) => ({ meta, platform, page: p, title: copyNav(p), head, nav, scheme, signature, brandMark, esc: escapeHtml, link: linkFor(p), copy: copyPack, badgeTone: badgeToneClass, tone: badgeToneClass, device: dev, ...extra });

  const renderPage = async (p) => {
    // 页集已在 buildOnce 头部按平台模板过滤（无模板的页根本不会进来）；
    // 此处只作竞态/误用的安全网，绝不回退 home 副本。
    const tplPath = resolve(tplDir, `pages/${p}.eta`);
    if (!(await exists(tplPath))) throw new Error(`页面模板缺失：${tplPath}`);
    const pageImgs = (images[p] || []).map(shapeImg(p));
    const placeholder = images.common.placeholder;
    // 循环内取图：按索引取模循环，避免「所有行同一张图」。空图集回退占位图。
    const pick = (i = 0) => (pageImgs.length ? pageImgs[((i % pageImgs.length) + pageImgs.length) % pageImgs.length] : placeholder);
    if (pageImgs.length === 0) log.prototype.warn(`${p}：无可用图片，循环项将回退占位图（建议检查 PRD 图片配额/Unsplash 映射）`);
    const body = await render(tplPath, baseCtx(p, { images: pageImgs, placeholder, pick }));
    const html = await render(resolve(tplDir, LAYOUTS.page), baseCtx(p, { pageContent: body, images, tabbar: buildTabbar(p) }));
    if (p === 'home' && !isMobile) await writeFileAtomic(resolve(outDir, 'index.html'), html);
    else await writeFileAtomic(resolve(pagesDir, `${p}.html`), html);
    // 桌面端页集不含 home 时（如 dashboard/orders 起手），index.html 会缺失，
    // 而入口提示固定指向它 → 落到不存在的文件。此处写重定向页而非复制内容：
    // 复制会让该页的相对链接（orders.html 等）从根目录解析而全部变成死链。
    if (!isMobile && p !== 'home' && pages[0] === p) {
      await writeFileAtomic(resolve(outDir, 'index.html'), redirectHtml(p, copyNav(p)));
    }
    done++; updateProgress(done / total * 100, `已生成 ${done}/${total}：${p}`);
  };
  const results = await Promise.allSettled(pages.map(renderPage));

  // 移动端：渲染外壳 index.html（内含 iframe 指向首屏页）
  // 陈旧多帧产物清理（**任何平台都跑**）：上一轮 `--frame-set` 的 device-*.html / gallery.html
  // 若不在本轮 frameDevices 内就删掉——否则换帧集（3 帧→2 帧）、切平台（mobile→desktop）都会
  // 把旧帧混进交付，而 report.frames=[] 又让闸门跳过 frames 断言（静默残留）。
  // 只删「设备键命名的帧文件 + gallery.html」，不碰用户自己的其它 HTML。
  {
    const keep = new Set(frameDevices.map((f) => `device-${f.key}.html`));
    if (await exists(outDir)) {
      const stale = readdirSync(outDir).filter((n) => DEVICE_FRAME_RE.test(n) || n === 'gallery.html').filter((n) => !keep.has(n));
      for (const n of stale) {
        try { await removeRecursive(resolve(outDir, n)); }
        catch (e) { log.prototype.warn(`陈旧帧清理失败：${n}（${e.message}）`); }
      }
    }
  }
  if (isMobile) {
    const shellHtml = await render(resolve(tplDir, LAYOUTS.shell), baseCtx('home', { pageContent: '', images, shellLink, homeHref, link: shellLink }));
    await writeFileAtomic(resolve(outDir, 'index.html'), shellHtml);
    done++; updateProgress(done / total * 100, `已生成 ${done}/${total}：外壳`);
    // 多帧预览：每帧一份同深度外壳（相对路径与 index.html 一致），仅 --frame-set 时产出
    for (const f of frameDevices) {
      const html = await render(resolve(tplDir, LAYOUTS.shell), baseCtx('home', { pageContent: '', images, shellLink, homeHref, link: shellLink }, f.device));
      await writeFileAtomic(resolve(outDir, `device-${f.key}.html`), html);
    }
    // gallery.html 仅随 --frame-set 产出；**不做额外缩放**（外壳内建 scale 已生效，再叠一层会双重缩小）
    // iframe 尺寸 = 帧外框 + 外壳 body 的 p-6（SHELL_STAGE_PAD），否则每帧被裁掉 48px（bezel / 状态栏切半）。
    // transform:scale 只缩视觉、不改布局盒，故按布局尺寸给足。
    if (frameDevices.length) {
      const stageW = (f) => f.device.frameWidth + SHELL_STAGE_PAD;
      const stageH = (f) => f.device.frameHeight + SHELL_STAGE_PAD;
      const cards = frameDevices.map((f) => `<figure class="card"><figcaption><strong>${escapeHtml(f.device.label)}</strong> · ${escapeHtml(f.device.logicalWidth)}×${escapeHtml(f.device.logicalHeight)} · ${escapeHtml(f.device.sizeClass)}${f.posture ? ` · ${escapeHtml(f.posture)}` : ''}</figcaption><iframe src="device-${escapeHtml(f.key)}.html" title="${escapeHtml(f.device.label)}" width="${stageW(f)}" height="${stageH(f)}" style="width:${stageW(f)}px;height:${stageH(f)}px" loading="lazy"></iframe></figure>`).join('\n');
      const gallery = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(meta.productName)} · 多形态预览</title>
<style>
  body{margin:0;padding:24px;background:#f6f7f9;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1f2937}
  h1{font-size:18px;margin:0 0 4px} p.note{margin:0 0 20px;color:#6b7280;font-size:12px}
  .grid{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}
  .card{margin:0;background:#fff;border-radius:12px;padding:12px;box-shadow:0 1px 2px rgb(15 23 42/.06),0 8px 24px -12px rgb(15 23 42/.18)}
  figcaption{font-size:12px;color:#4b5563;margin-bottom:8px}
  iframe{border:0;display:block}
</style>
</head>
<body>
<h1>多形态预览</h1>
<p class="note">形态容器演示，不代表页面已按断点重排；多帧预览不演示状态连续性，也不演示真实多窗口/姿态事件。</p>
<div class="grid">
${cards}
</div>
</body>
</html>
`;
      await writeFileAtomic(resolve(outDir, 'gallery.html'), gallery);
    }
  }
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length && failed.length === pages.length) throw failed[0].reason;
  failed.forEach((f) => log.prototype.error('页面失败：', f.reason?.message));

  // 统计
  const files = await listFiles(outDir, { extensions: ['.html'] }).catch(() => []);
  let totalSize = 0, imgCount = 0;
  for (const f of files) {
    const st = await statSafe(f);
    if (st) totalSize += st.size;
    const html = await readFileSafe(f);
    imgCount += (html.match(/<img\s/gi) || []).length;
  }
  const duration = Date.now() - t0;
  // 环境能力矩阵：记录项，不参与 pass/fail。PREFLIGHT=0 可关（自检里反复生成时省掉探测耗时）
  let capabilities = null;
  if (process.env.PREFLIGHT !== '0') {
    capabilities = await detectCapabilities({ workspace: WORKSPACE });
    for (const w of capabilityWarnings(capabilities)) log.prototype.warn(w);
  }
  const report = { success: failed.length === 0, platform, pages, skippedPages, truncatedPages, unknownPages, productType: meta.productType || 'other', theme: theme ? theme.key : null, prdSource: prdAssumptions.prdSource, assumptions: prdAssumptions.assumptions, prdWarnings: v.warnings, copySource: copy.copySource, copyType: copy.copyType, allowTerms: copy.allowTerms, capabilities, homeHref, device: device ? { key: device.key, label: device.label, category: device.category, logicalWidth: device.logicalWidth, logicalHeight: device.logicalHeight, frameWidth: device.frameWidth, frameHeight: device.frameHeight, aspectClass: device.aspectClass, sizeClass: device.sizeClass, panes: device.panes, verticalSpace: device.verticalSpace, statusBarHeight: device.statusBarHeight, systemBar: device.systemBar, crease: device.crease, posture: postureArg || null } : null, frames: frameDevices.map((f) => ({ key: f.key, label: f.device.label, sizeClass: f.device.sizeClass, aspectClass: f.device.aspectClass, panes: f.device.panes, frameWidth: f.device.frameWidth, frameHeight: f.device.frameHeight, posture: f.posture, systemBar: f.device.systemBar, note: '形态容器，非布局结论' })), files: files.length, totalSize, imgCount, duration, warnings: failed.map((f) => String(f.reason?.message)), at: new Date().toISOString() };
  await writeFileAtomic(resolve(outDir, 'generation-report.json'), JSON.stringify(report, null, 2));
  succeedProgress(`原型生成完成：${outDir}（${files.length} 个页面，${(totalSize/1024).toFixed(1)} KB，${imgCount} 张图，${duration}ms）`);
  console.log(`\n预览：直接用浏览器打开 ${resolve(outDir, 'index.html')}\nPRD：${prdPath}\n`);
}

async function main() {
  startProgress('生成原型中…');
  try {
    if (doWatch) {
      const { default: chokidar } = await import('chokidar');
      await buildOnce();
      const watcher = chokidar.watch([resolve(tplDir, '**/*.eta'), prdPath], { ignoreInitial: true });
      watcher.on('change', async (path) => {
        log.prototype.info(`检测到变更：${path}，重新生成…`);
        startProgress('热重载中…');
        try { await buildOnce(); } catch (e) { failProgress('重载失败'); log.prototype.error(e.message); }
      });
      log.prototype.info('Watch 模式已启动，按 Ctrl+C 退出');
    } else {
      await buildOnce();
    }
  } catch (e) { failProgress('生成失败'); log.prototype.error(e.message); process.exit(1); }
}
main();
