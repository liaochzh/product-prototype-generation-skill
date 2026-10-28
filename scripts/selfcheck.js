#!/usr/bin/env node
/**
 * 契约回归自检：node scripts/selfcheck.js
 *
 * 覆盖本轮引入的链接契约与外壳/内容分离：
 *  1) it.link(name, ...fallbacks) 页集感知（目标缺失→'#'，desktop home→index.html）
 *  2) 移动端外壳仅一个 iframe 且指向 pages/*.html；pages/*.html 不含 iframe
 *  3) 缩减页集仍 0 死链；空页集应报错退出
 *  4) 负例（注入死链）应 passed:false
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, cpSync } from 'fs';
import { tmpdir, homedir } from 'os';
import { resolve, dirname, join, relative, sep } from 'path';
import { fileURLToPath } from 'url';
import { checkInlineTailwindConfig, invokeInlinePlugins, extractInlineTailwindConfig, resolveInlineUtilities } from '../utils/inspect-tailwind-inline.js';
import { generateInlineScript, generateTailwindConfig } from '../utils/tailwind-config.js';
import { generateColorScheme, resolvePrimaryHsl } from '../utils/color-scheme.js';
import { getTheme, THEMES, resolveSwatch } from '../themes/index.js';
import { generatePlaceholder } from '../utils/unsplash.js';
import { assertLexiconConformance, buildCopyPack, assertCopyDomain, COPY_LEXICON } from '../utils/copy-domain.js';
import { compareDirs, DEFAULT_DIMS, normalizeText, normalizeAttrs } from '../utils/copy-golden.js';
import { gateClasses, gateRawClasses, structuralDiff, countArbitrarySizes, TOKEN_SIZE_RE, arbScanRe } from '../utils/golden-gate.js';
import { decideFreeze, classifyFileSet } from './freeze-golden.js';
import { PRODUCT_TYPES, DEVICES, ASPECT_CLASSES, deviceFrame, TYPE_ROLES, fontSize, fontFamily, fontStacks } from '../constants.js';
import { resolveDevice, parseCrease } from '../utils/device-profile.js';
import { parsePRD, validatePRD, getPagePriority, parseDoc, INTER_10, extractUnknownPageNames, KNOWN_PAGES } from '../utils/prd-parser.js';
import { buildPRDFromTemplate } from '../utils/prompt-engine.js';
import { GOLDEN_FIXTURES, ALL_PLATFORMS, prdPathOf, goldenDirOf, BAK_ROOT } from '../utils/golden-fixtures.js';
import { LUCIDE_ICONS, LUCIDE_VERSION, LUCIDE_COUNT } from '../utils/lucide-icons.js';
import { insideSkillsTree, ARCHIVE_RE } from '../utils/logger.js';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GEN = join(SKILL_DIR, 'scripts', 'generate-prototype.js');
const VER = join(SKILL_DIR, 'scripts', 'verify-prototype.js');
const PRD = join(SKILL_DIR, 'scripts', 'generate-prd.js');

// ecommerce 固定 PRD：单一事实来源 fixtures/prd/ecommerce.md（与 freeze-golden.js 共享，
// 避免「正则跨文件抽 PRD」的脆弱依赖）
const FULL_PRD = readFileSync(join(SKILL_DIR, 'fixtures', 'prd', 'ecommerce.md'), 'utf8');

const MIN_PRD = `# 极简商城
## 产品概述
仅含三个页面的精简原型。
## 目标用户
城市青年。
## 核心功能
- [P0] 商品浏览
## 用户流程
- 首页浏览 → 详情下单
## 页面清单
- home：首页
- list：列表
- detail：详情
`;

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

// 类型识别关键词（PRD 概述用）：`detectProductType` 是全文计数，若概述不命中关键词，
// PRD 会落到 other，「按类型断言文案/前置」就退化成空断言。场景 18/19 共用本表（单一定义）。
const TYPE_KW = {
  tool: '效率工具与清单管理', community: '社区话题与动态',
  content: '专栏文章阅读', saas: '团队协作与权限管理', other: '通用领域产品原型',
};

function newWs(prd) {
  const ws = mkdtempSync(join(tmpdir(), 'pp-selfcheck-'));
  mkdirSync(join(ws, 'docs'), { recursive: true });
  writeFileSync(join(ws, 'docs', 'prd.md'), prd);
  return ws;
}
const run = (script, ws, args = []) =>
  spawnSync(process.execPath, [script, ...args], { env: { ...process.env, WORKSPACE: ws }, encoding: 'utf8' });

function verifyJson(ws) {
  const r = run(VER, ws);
  const m = (r.stdout || '').match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : r.stdout); } catch { return { passed: null, raw: r.stdout + r.stderr }; }
}

/** 去注释（块 / 整行 `//` / HTML），供源码级扫描共用（单一实现，避免口径漂移） */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/**
 * 跑「生成 → 闸门」并断言三件事：生成器退出码、报告 success、闸门 passed。
 * 只看闸门会假绿，两条路径：
 *  a) generate-prototype.js 仅在**全部**页面失败才抛错，单独一页渲染异常且无入链时
 *     （settings/detail 等）产物仍能通过闸门；
 *  b) verify-prototype.js 在 generation-report.json 缺 productType 时**整体跳过文案域闸门**，
 *     此时 copyFail 恒为 0、passed 仍为 true —— 必须断言 copyDomainSkipped===false 才算真跑。
 * @param {string[]} [wantPages] 期望实际生成的页名，用于校验 report.pages 集合。
 *   **注意**：本平台无模板的页不会生成（记入 report.skippedPages），故调用方应传
 *   「请求页集 ∩ 该平台模板集」，不要把桌面专属页（form/dashboard/settings）算进来。
 */
function e2e(ws, platform, wantPages) {
  const g = run(GEN, ws, ['--platform', platform, '--quiet']);
  let report = null;
  try { report = JSON.parse(read(join(ws, 'prototype', 'generation-report.json'))); } catch { /* 无报告 */ }
  const v = verifyJson(ws);
  // report.pages 是实际落盘页序；集合相等可挡住「静默丢页」与「跳过页混进页集」
  const got = report && Array.isArray(report.pages) ? report.pages : [];
  const pagesOk = !wantPages || (got.length === wantPages.length && wantPages.every((p) => got.includes(p)));
  return {
    v, g, report, pagesOk,
    ok: g.status === 0 && !!(report && report.success) && v.copyDomainSkipped === false
      && v.copyFail === 0 && v.passed === true && pagesOk,
  };
}
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

// ---- 场景 1：全页集 mobile ----
{
  const ws = newWs(FULL_PRD);
  const g = run(GEN, ws, ['--platform', 'mobile', '--quiet']);
  const v = verifyJson(ws);
  const idx = read(join(ws, 'prototype', 'index.html'));
  const iframes = (idx.match(/<iframe\b/g) || []).length;
  const iframeSrc = (idx.match(/<iframe\b[^>]*\bsrc="([^"]*)"/) || [])[1] || '';
  const pagesDir = join(ws, 'prototype', 'pages');
  const pagesHaveIframe = ['home', 'list', 'detail'].some((p) => /<iframe\b/.test(read(join(pagesDir, `${p}.html`))));
  check('mobile 全页集生成成功', g.status === 0, g.stderr?.slice(0, 200));
  check('mobile 全页集 0 死链 & passed', v.deadLinks === 0 && v.passed === true, JSON.stringify(v));
  check('外壳仅 1 个 iframe 且指向 pages/*.html', iframes === 1 && /^pages\/.+\.html$/.test(iframeSrc), `iframes=${iframes} src=${iframeSrc}`);
  check('pages/*.html 不含 iframe', !pagesHaveIframe);
  const homeHtml = read(join(pagesDir, 'home.html'));
  const twCheck = checkInlineTailwindConfig(homeHtml);
  check('Tailwind 内联配置可执行且 plugins 为函数', twCheck.present && twCheck.ok, JSON.stringify(twCheck));
  // 真求值 + 实调用：验证注入插件无外部闭包依赖、能产出工具类（形状/正则断言覆盖不到）
  const inv = invokeInlinePlugins(homeHtml);
  check('注入插件可独立执行并产出工具类', inv.ok, JSON.stringify(inv));
  rmSync(ws, { recursive: true, force: true });
}

// ---- 场景 2：全页集 desktop ----
{
  const ws = newWs(FULL_PRD);
  const g = run(GEN, ws, ['--platform', 'desktop', '--quiet']);
  const v = verifyJson(ws);
  check('desktop 全页集生成成功', g.status === 0, g.stderr?.slice(0, 200));
  check('desktop 全页集 0 死链 & passed', v.deadLinks === 0 && v.passed === true, JSON.stringify(v));
  check('desktop 首页仅根目录 index.html（无 pages/home.html）',
    existsSync(join(ws, 'prototype', 'index.html')) && !existsSync(join(ws, 'prototype', 'pages', 'home.html')));
  rmSync(ws, { recursive: true, force: true });
}

// ---- 场景 3：缩减页集 mobile（应 0 死链；导航回退到 home）----
{
  const ws = newWs(MIN_PRD);
  run(GEN, ws, ['--platform', 'mobile', '--quiet']);
  const v = verifyJson(ws);
  check('缩减页集 0 死链 & passed', v.deadLinks === 0 && v.passed === true, JSON.stringify(v));
  check('缩减页集无未解析导航(#)', (v.unresolvedLinks || 0) === 0, JSON.stringify(v));
  rmSync(ws, { recursive: true, force: true });
}

// ---- 场景 4：空页集应报错（--page 过滤掉全部）----
{
  const ws = newWs(MIN_PRD);
  const g = run(GEN, ws, ['--platform', 'mobile', '--page', 'login', '--quiet']);
  check('空页集生成应失败（非 0 退出）', g.status !== 0, `status=${g.status}`);
  rmSync(ws, { recursive: true, force: true });

  // 护栏：WORKSPACE 落在 skill 目录内应直接拒绝（否则会把 prototype/ 写进模板/基线旁边，污染快照）
  const g2 = spawnSync(process.execPath, [GEN, '--platform', 'mobile', '--quiet'], {
    cwd: SKILL_DIR, env: { ...process.env, WORKSPACE: SKILL_DIR }, encoding: 'utf8',
  });
  check('WORKSPACE 落在 skill 目录内应被拒绝',
    g2.status !== 0 && /不能落在 skill 目录内/.test(`${g2.stdout || ''}${g2.stderr || ''}`),
    `status=${g2.status} out=${(`${g2.stdout || ''}${g2.stderr || ''}`).slice(0, 120)}`);
  rmSync(join(SKILL_DIR, 'prototype'), { recursive: true, force: true });   // 万一护栏失效也别留垃圾
}

// ---- 场景 5：负例（注入死链）应 passed:false ----
{
  const ws = newWs(FULL_PRD);
  run(GEN, ws, ['--platform', 'mobile', '--quiet']);
  const homePath = join(ws, 'prototype', 'pages', 'home.html');
  writeFileSync(homePath, read(homePath) + '\n<a href="definitely-missing.html">x</a>\n');
  const v = verifyJson(ws);
  check('注入死链后 passed:false', v.passed === false && v.deadLinks >= 1, JSON.stringify(v));
  rmSync(ws, { recursive: true, force: true });
}

// ---- 场景 6：桌面全页集 + 本地图（验证 split 目录深度下的相对路径）----
{
  const ws = newWs(FULL_PRD);
  mkdirSync(join(ws, 'assets'), { recursive: true });
  writeFileSync(join(ws, 'assets', 'home-1.webp'), 'x');
  writeFileSync(join(ws, 'assets', 'profile-1.webp'), 'x');
  const g = run(GEN, ws, ['--platform', 'desktop', '--quiet']);
  const v = verifyJson(ws);
  const idx = read(join(ws, 'prototype', 'index.html'));
  const prof = read(join(ws, 'prototype', 'pages', 'profile.html'));
  check('desktop+本地图 生成成功', g.status === 0, g.stderr?.slice(0, 200));
  check('desktop+本地图 0 死链 & passed', v.deadLinks === 0 && v.passed === true, JSON.stringify(v));
  check('desktop 首页图 assets/、pages 页图 ../assets/',
    /src="assets\//.test(idx) && /src="\.\.\/assets\//.test(prof),
    `idxHasAssets=${/src="assets\//.test(idx)} profHasUpAssets=${/src="\.\.\/assets\//.test(prof)}`);
  rmSync(ws, { recursive: true, force: true });
}

// ---- 场景 7：桌面缩减页集（验证 pages 内 link('home') 回退 → ../index.html）----
{
  const ws = newWs(FULL_PRD);
  const g = run(GEN, ws, ['--platform', 'desktop', '--page', 'home,profile', '--quiet']);
  const v = verifyJson(ws);
  check('desktop 缩减页集 生成成功', g.status === 0, g.stderr?.slice(0, 200));
  check('desktop 缩减页集 0 死链 & passed', v.deadLinks === 0 && v.passed === true, JSON.stringify(v));
  check('desktop 缩减页集 profile 回首页用 ../index.html',
    /href="\.\.\/index\.html"/.test(read(join(ws, 'prototype', 'pages', 'profile.html'))));
  rmSync(ws, { recursive: true, force: true });
}

// ---- 场景 8：负例（内联 tailwind plugins 损坏）应 tailwindFail 且 passed:false ----
{
  const ws = newWs(FULL_PRD);
  run(GEN, ws, ['--platform', 'mobile', '--quiet']);
  const homePath = join(ws, 'prototype', 'pages', 'home.html');
  // 模拟旧缺陷：多插件时 JSON.stringify 产出多个 null
  writeFileSync(homePath, read(homePath).replace(
    /"plugins":\s*\[[\s\S]*?\]\s*\}/,
    '"plugins": [ null, null ]\n}',
  ));
  const v = verifyJson(ws);
  check('内联 plugins 损坏后 tailwindFail>=1 且 passed:false',
    v.passed === false && v.tailwindFail >= 1, JSON.stringify(v));
  rmSync(ws, { recursive: true, force: true });
}

// ---- 场景 9：generateInlineScript 分支直测（生成侧契约，锁死本轮修复本体）----
{
  const fn = function ({ addUtilities }) { addUtilities({ '.x-test': { color: 'red' } }); };

  const c1 = checkInlineTailwindConfig(generateInlineScript({ content: [], theme: { extend: {} }, plugins: [fn] }));
  check('生成：正常配置可求值且 plugins 为函数', c1.present && c1.ok && c1.plugins === 1, JSON.stringify(c1));

  const c2 = checkInlineTailwindConfig(generateInlineScript({ plugins: [fn] }));
  check('生成：空 serializable 仍产出合法 JS', c2.present && c2.ok, JSON.stringify(c2));

  const raw3 = generateInlineScript({ theme: { extend: {} } });
  const c3 = checkInlineTailwindConfig(raw3);
  check('生成：无插件时不注入 plugins 键且合法', c3.present && c3.ok && !/"plugins"/.test(raw3), JSON.stringify(c3));

  const c4 = checkInlineTailwindConfig(generateInlineScript({ theme: { extend: {} }, plugins: ['@tailwindcss/typography', fn] }));
  check('生成：非函数插件被过滤（仅剩 1 个函数）', c4.ok && c4.plugins === 1, JSON.stringify(c4));

  const c5 = checkInlineTailwindConfig(generateInlineScript({ theme: { extend: {} }, plugins: [fn, fn] }));
  check('生成：多函数插件拼接合法（plugins===2）', c5.ok && c5.plugins === 2, JSON.stringify(c5));

  const c5b = checkInlineTailwindConfig(generateInlineScript({ theme: () => {}, plugins: [fn] }));
  check('生成：非插件字段全为函数仍产出合法 JS', c5b.present && c5b.ok && c5b.plugins === 1, JSON.stringify(c5b));

  const raw6 = generateInlineScript({ theme: { extend: {} }, plugins: [function () { return '</script>'; }] });
  const body6 = extractInlineTailwindConfig(raw6) || '';
  check('生成：插件源码内 </script> 已转义', !body6.includes('</script>') && body6.includes('<\\/script>'), `body6=${body6.slice(0, 60)}`);

  const raw7 = generateInlineScript({ content: ['a</script>b'] });
  const body7 = extractInlineTailwindConfig(raw7) || '';
  check('生成：JSON 值内 </script> 亦被转义', !body7.includes('</script>') && body7.includes('<\\/script>'), `body7=${body7.slice(0, 60)}`);
}

// ---- 场景 10：校验器安全路径回归锁定（门禁/异常出口 fail-closed，锁死沙箱不越界）----
{
  const wrap = (e) => `<script>\n  tailwind.config = ${e};\n</script>`;

  const g = checkInlineTailwindConfig(wrap('(function(){ return {} })()'));
  check('校验：非对象字面量被门禁拒绝', g.present && g.ok === false && /非对象字面量/.test(g.reason), JSON.stringify(g));

  const acc = checkInlineTailwindConfig(wrap('{ get plugins(){ throw new Error("x") } }'));
  check('校验：属性访问抛错不越界', acc.present && acc.ok === false && /读取 plugins 抛错/.test(acc.reason), JSON.stringify(acc));

  const ev = checkInlineTailwindConfig(wrap('{ ...(function(){ throw 1 })() }'));
  check('校验：求值抛错不越界', ev.present && ev.ok === false && /求值抛错/.test(ev.reason), JSON.stringify(ev));

  const ov = checkInlineTailwindConfig(wrap('{ get plugins(){ JSON.stringify = () => ({}); return [] } }'));
  check('校验：出口非字符串 fail-closed', ov.present && ov.ok === false, JSON.stringify(ov));

  const iv = invokeInlinePlugins(wrap('{ get plugins(){ throw new Error("y") } }'));
  check('校验：invoke 抛错不越界', iv.ok === false, JSON.stringify(iv));
}

// ---- 场景 11：文案词典形状一致性（含数组元素键与叶子类型指纹） ----
{
  const c = assertLexiconConformance({ deepArrays: true });
  check('文案词典形状一致（键集 + 数组元素键 + 叶子类型）', c.ok, JSON.stringify(c.problems).slice(0, 400));
  check('深校验覆盖数组元素（typed 条目 > 键条目）', c.base.length > 300 && c.base.some((p) => p.includes('[].')), `entries=${c.base.length}`);
}

// ---- 场景 12：PRODUCT_TYPES 与词典键集一致（新增类型防漏改） ----
{
  const keys = Object.keys(COPY_LEXICON).sort();
  const types = [...PRODUCT_TYPES].sort();
  check('PRODUCT_TYPES 与 COPY_LEXICON 键集一致', JSON.stringify(keys) === JSON.stringify(types), `lex=${keys} types=${types}`);
}

// ---- 场景 13：buildCopyPack 三源合流（override 覆盖 + 未知键告警 + allowTerms） ----
{
  const base = buildCopyPack({ productType: 'saas' });
  check('buildCopyPack 默认取词典', base.copySource === 'lexicon' && base.pack.object.noun === '任务', base.copySource);

  const warnings = [];
  const merged = buildCopyPack({ productType: 'saas' }, {
    override: { object: { noun: '工作项' }, bogusSlot: 'x', allowTerms: ['任务'] },
    logger: { warn: (m) => warnings.push(m) },
  });
  check('override 覆盖已知槽位', merged.copySource === 'override' && merged.pack.object.noun === '工作项');
  check('override 未知槽位告警且不写入', warnings.some((w) => w.includes('bogusSlot')) && merged.pack.bogusSlot === undefined, warnings.join('|'));
  check('override allowTerms 透传', JSON.stringify(merged.allowTerms) === '["任务"]', JSON.stringify(merged.allowTerms));

  const unknown = buildCopyPack({ productType: 'nope' });
  check('未知 productType 回退 other', unknown.copyType === 'other', unknown.copyType);

  // 合并防护分支：原型污染 / 继承键绕过 / 类型守卫
  const w2 = [];
  const proto = buildCopyPack({ productType: 'saas' }, { override: JSON.parse('{"__proto__":{"polluted":true}}'), logger: { warn: (m) => w2.push(m) } });
  check('原型污染键被拒绝', ({}).polluted === undefined && w2.some((m) => m.includes('危险键')), w2.join('|'));

  const w3 = [];
  const inherited = buildCopyPack({ productType: 'saas' }, { override: { object: { valueOf: 'x' } }, logger: { warn: (m) => w3.push(m) } });
  check('继承键（valueOf）不绕过 schema 白名单',
    !Object.prototype.hasOwnProperty.call(inherited.pack.object, 'valueOf') && w3.some((m) => m.includes('未知槽位')), w3.join('|'));

  const w4 = [];
  const scalarIntoObject = buildCopyPack({ productType: 'saas' }, { override: { object: 'oops' }, logger: { warn: (m) => w4.push(m) } });
  check('标量写向对象槽位被拒且子树完好',
    scalarIntoObject.pack.object.noun === '任务' && w4.some((m) => m.includes('类型不符')), w4.join('|'));

  const w5 = [];
  const scalarIntoArray = buildCopyPack({ productType: 'saas' }, { override: { tabbar: 'oops' }, logger: { warn: (m) => w5.push(m) } });
  check('标量写向数组槽位被拒', Array.isArray(scalarIntoArray.pack.tabbar) && w5.some((m) => m.includes('类型不符')), w5.join('|'));

  const w6 = [];
  const fnSlot = buildCopyPack({ productType: 'saas' }, { override: { list: { cards: { name: 'not-a-fn' } } }, logger: { warn: (m) => w6.push(m) } });
  check('函数槽位不可被标量覆盖', typeof fnSlot.pack.list.cards.name === 'function' && w6.some((m) => m.includes('函数槽位')), w6.join('|'));
}

// ---- 场景 14：ecommerce 移动端文案域零回归（fail=0 且 verify passed） ----
{
  const ws = newWs(FULL_PRD);
  run(GEN, ws, ['--platform', 'mobile', '--quiet']);
  const v = verifyJson(ws);
  check('ecommerce 移动端 copyFail=0 且 passed', v.copyFail === 0 && v.passed === true && v.copyDomainSkipped === false, JSON.stringify(v));
  const home = read(join(ws, 'prototype', 'pages', 'home.html'));
  const g = assertCopyDomain(home, 'ecommerce');
  check('ecommerce 自身无 fail 词', g.fail.length === 0, JSON.stringify(g));
  rmSync(ws, { recursive: true, force: true });
}

// ---- 场景 15：非电商（saas）产物不含电商域词（闸门 fail=0） ----
{
  const SAAS_PRD = `# 团队协作台
## 产品概述
面向研发团队的任务协作 SaaS。
## 核心功能
- [P0] 工作台
## 页面清单
- dashboard：工作台
- list：任务
- detail：任务详情
- form：新建任务
- settings：设置
`;
  const ws = newWs(SAAS_PRD);
  run(GEN, ws, ['--platform', 'mobile', '--quiet']);
  const v = verifyJson(ws);
  check('saas 产物 copyFail=0 且 passed', v.copyFail === 0 && v.passed === true, JSON.stringify(v));
  const bad = assertCopyDomain('<p>加入购物车</p><p>包邮</p>', 'saas');
  check('闸门能捕获电商域泄漏（自测）', bad.fail.length >= 2, JSON.stringify(bad));
  rmSync(ws, { recursive: true, force: true });
}

// ---- 场景 16：负例（以 saas 为零基线注入电商域词）应 copyFail 由 0 变为 >=1 ----
{
  const SAAS_PRD16 = `# 团队协作台
## 产品概述
面向研发团队的任务协作 SaaS。
## 核心功能
- [P0] 工作台
## 页面清单
- dashboard：工作台
- list：任务
- detail：任务详情
- form：新建任务
- settings：设置
`;
  const ws = newWs(SAAS_PRD16);
  run(GEN, ws, ['--platform', 'mobile', '--quiet']);
  const before = verifyJson(ws);
  check('负例前置：saas 基线 copyFail===0', before.copyFail === 0, JSON.stringify(before));
  // 注入点必须是 mobile 真实存在的页：dashboard/settings/form 无移动模板，会被跳过
  // （记入 report.skippedPages），不存在同名文件。
  const homePath = join(ws, 'prototype', 'pages', 'list.html');
  const html = read(homePath);
  check('负例前置：注入点存在（replace 未静默失败）', html.includes('</body>'), `path=pages/list.html len=${html.length}`);
  writeFileSync(homePath, html.replace('</body>', '<p>加入购物车</p></body>'));
  const after = verifyJson(ws);
  check('注入电商域词后 copyFail>=1 且 passed:false',
    after.copyFail >= 1 && after.passed === false && after.copyFail > before.copyFail, JSON.stringify(after));
  rmSync(ws, { recursive: true, force: true });
}

// ---- 场景 17：golden 三维逐字回归（文本 / 属性 / class 布局指纹） ----
// 覆盖 = GOLDEN_FIXTURES（fixture × 平台）。saas 只跑桌面：settings/form/dashboard 是
// 桌面专属模板，且仅 saas 语义成立（ecommerce 页面清单无此三页）。
{
  for (const fx of GOLDEN_FIXTURES) {
    const GOLDEN = goldenDirOf(fx);
    check(`golden 基线存在（${fx.name}，skill 内冻结基线，非备份目录）`, existsSync(GOLDEN), GOLDEN);
    const prd = read(prdPathOf(fx));
    for (const platform of fx.platforms) {
      const ws = newWs(prd);
      const g = run(GEN, ws, ['--platform', platform, '--quiet']);
      const r = compareDirs(join(GOLDEN, platform), join(ws, 'prototype'));
      check(`${fx.name} ${platform} golden 三维零回归`,
        g.status === 0 && r.ok,
        `${DEFAULT_DIMS.join('/')}\n${r.files.filter((f) => !f.ok).map((f) => `${f.rel}: ${JSON.stringify(f.diffs || f.missing)}`).join('\n').slice(0, 700)}`);
      rmSync(ws, { recursive: true, force: true });
    }
  }
}

// ---- 场景 17b：内联 <script> 内注入的文案未被 autoEscape 转成实体 ----
// 文案域闸门与 golden 三维都会剔除 <script> 区（前者靠去标签，后者不在比对范围），
// 而 desktop publish.eta 把 nav.submit/nav.next 注进 JS 字符串字面量——
// 若 eta 的 autoEscape 产出 `&#39;` 之类实体，JS 不会解码，按钮会显示实体原文且无人报错。
{
  const ws = newWs(FULL_PRD);
  run(GEN, ws, ['--platform', 'desktop', '--quiet']);
  const html = read(join(ws, 'prototype', 'pages', 'publish.html'));
  const script = (html.match(/<script>[\s\S]*?<\/script>/g) || []).join('\n');
  const injected = [...script.matchAll(/b\.textContent = \(i === last\) \? '([^']*)' : '([^']*)'/g)]
    .flatMap((m) => [m[1], m[2]]).filter(Boolean);
  check('publish 内联 script 的按钮文案未实体化',
    injected.length === 2 && injected.every((s) => !/&(?:amp|lt|gt|quot|#\d+);/.test(s)),
    `注入值=${JSON.stringify(injected)}`);
  rmSync(ws, { recursive: true, force: true });
}

// ---- 场景 17c：fixture 覆盖完备性（每端「各 fixture 页集并集」⊇ 该端 pages/*.eta 模板集） ----
// WHY：settings / form / dashboard 此前因「没有任何 fixture 覆盖」而没有 golden 三维防线
// （只有场景 19 的 e2e 闸门）。此断言把该缺口变成硬失败：新增页面模板却漏配 fixture 会直接红。
{
  const union = Object.fromEntries(ALL_PLATFORMS.map((p) => [p, new Set()]));
  for (const fx of GOLDEN_FIXTURES) {
    const pages = getPagePriority(parsePRD(read(prdPathOf(fx))));
    for (const platform of fx.platforms) for (const page of pages) union[platform].add(page);
  }
  for (const platform of ALL_PLATFORMS) {
    const tplDir = join(SKILL_DIR, platform === 'desktop' ? 'desktop-template' : 'mobile-template', 'pages');
    const templates = readdirSync(tplDir).filter((f) => f.endsWith('.eta')).map((f) => f.replace(/\.eta$/, ''));
    const missing = templates.filter((t) => !union[platform].has(t));
    check(`${platform} 页面模板全部被 fixture 覆盖（无 golden 盲区）`, missing.length === 0,
      `未覆盖模板：${missing.join(', ') || '(无)'}；并集=${[...union[platform]].sort().join(',')}`);
  }

  // `INTER_10` 是文档导入（F2-docs）页集的**唯一准入闸门**，它必须恰好等于「双端模板交集」：
  //  - 新增 mobile 模板却忘了加进白名单 ⇒ 文档里写了这页也会被当「未登记」丢进假设；
  //  - 白名单里有 mobile 没有的页 ⇒ `renderPage` 回退 home.eta（内容错但页集/死链闸门全绿）。
  // 这条把「白名单」与「模板目录」钉在一起，任一侧单改即红。
  {
    const tplSet = (p) => new Set(readdirSync(join(SKILL_DIR, p, 'pages')).filter((f) => f.endsWith('.eta')).map((f) => f.replace(/\.eta$/, '')));
    const mobile = tplSet('mobile-template');
    const desktop = tplSet('desktop-template');
    const inter = [...mobile].filter((p) => desktop.has(p)).sort();
    const want = [...INTER_10].sort();
    check('INTER_10 = 双端模板交集（文档导入白名单与模板目录同源）',
      inter.length === want.length && want.every((p) => inter.includes(p)),
      `交集=${JSON.stringify(inter)}；白名单=${JSON.stringify(want)}`);
  }
}

// ---- 场景 18：非电商类型移动端 e2e（闸门零 fail，覆盖 tool/community/content/other） ----
// WHY 页集期望用「请求集 ∩ 平台模板」而非请求集：mobile 只有 10 个页面模板，
// `form` / `dashboard` / `settings` 是桌面专属。旧生成器会静默用 home 模板顶替，
// 产物变成重复首页、页名与内容不符，而页集/死链/文案域闸门全绿——本场景曾把该
// 错误固化成「期望页集含 form」。现在改为：无模板页必须被跳过（report.skippedPages 留痕）
// 且产物目录不得出现同名文件。
{
  const PAGES = {
    tool: 'home,list,detail,form,settings',
    community: 'home,discover,detail,publish,chat,profile',
    content: 'home,discover,list,detail,publish,profile',
    other: 'home,list,detail,form,profile',
  };
  // 真值来源 = 移动端模板目录（与生成器共用同一事实，非实现镜像）：
  // 若生成器又退回「home 副本」，「产物无同名文件」断言仍会红。
  const MOBILE_TPL = new Set(readdirSync(join(SKILL_DIR, 'mobile-template', 'pages'))
    .filter((f) => f.endsWith('.eta')).map((f) => f.slice(0, -4)));
  check('移动端模板基数（10 页，含 home）——跳过断言的判据前提',
    MOBILE_TPL.size === 10 && MOBILE_TPL.has('home'), `size=${MOBILE_TPL.size}`);
  for (const type of ['tool', 'community', 'content', 'other']) {
    const requested = PAGES[type].split(',');
    // 前提：requested 有效页 ≤ 10（现四组 ≤6），否则 slice(0,10) 截断会让 expect 与实得不等
    const expect = requested.filter((p) => MOBILE_TPL.has(p));
    const wantSkip = requested.filter((p) => !MOBILE_TPL.has(p));
    const prd = `# ${type} 产品\n## 产品概述\n${TYPE_KW[type]}。\n## 核心功能\n- [P0] 核心页\n## 页面清单\n${requested.map((p) => `- ${p}：${p}`).join('\n')}\n`;
    const ws = newWs(prd);
    const { v, g, report, pagesOk, ok } = e2e(ws, 'mobile', expect);
    check(`${type} 移动端 copyFail===0 且 passed`, ok,
      `${JSON.stringify(v)}\n生成: exit=${g.status} success=${report && report.success} pages=${JSON.stringify(report && report.pages)}`);
    check(`${type} 移动端类型识别为该类型（按类型断言的前置）`,
      !!report && report.productType === type, `productType=${report && report.productType}`);
    const repSkip = report && Array.isArray(report.skippedPages) ? report.skippedPages : null;
    check(`${type} 移动端 skippedPages = PRD 页集差集（${wantSkip.join('/') || '无'}）`,
      repSkip !== null && repSkip.length === wantSkip.length && wantSkip.every((p) => repSkip.includes(p)),
      `skippedPages=${JSON.stringify(repSkip)} 期望=${JSON.stringify(wantSkip)}`);
    // 跳过必须是「可发现」的：只说已跳过，用户/上层 agent 无从补救（saas/tool 兜底 PRD 会掉
    // 3 页 → 3 页产品）。warn 必须同时给出另一平台出口与本平台可用页（二者均动态取自模板目录）。
    if (wantSkip.length) {
      const out = `${g.stdout || ''}${g.stderr || ''}`;
      check(`${type} 移动端跳过 warn 给出可执行出口（--platform desktop + 本平台可用页）`,
        out.includes('--platform desktop') && out.includes('mobile 可用页：'),
        `out=${out.slice(-260)}`);
    }
    check(`${type} 移动端产物不含无模板页文件（不再出现首页副本）`,
      wantSkip.every((p) => !existsSync(join(ws, 'prototype', 'pages', `${p}.html`))),
      wantSkip.filter((p) => existsSync(join(ws, 'prototype', 'pages', `${p}.html`))).join('/') || '无残留');
    rmSync(ws, { recursive: true, force: true });
  }
}

// ---- 场景 18b：页面清单全为「本平台无模板」时必须显式失败（不得退化成首页副本）----
// against 假绿：旧行为会 exit 0 并落盘 form.html（内容=首页）。
{
  const FORM_ONLY_PRD = `# 协作台\n## 产品概述\n团队协作与权限管理。\n## 核心功能\n- [P0] 表单\n## 页面清单\n- form：表单\n`;
  const ws = newWs(FORM_ONLY_PRD);
  const g = run(GEN, ws, ['--platform', 'mobile', '--quiet']);
  const out = `${g.stdout || ''}${g.stderr || ''}`;
  check('移动端页集全无模板 → exit≠0 且文案指出「本平台均无模板」',
    g.status !== 0 && out.includes('本平台均无模板') && out.includes('form'),
    `exit=${g.status} out=${out.slice(-240)}`);
  check('该失败不落盘该页（不得留下首页副本）', !existsSync(join(ws, 'prototype', 'pages', 'form.html')));
  // --page 滤空的既有语义不得被新错误劫持（应报「未解析出任何页面」）
  const g2 = run(GEN, ws, ['--platform', 'mobile', '--page', 'nosuchpage', '--quiet']);
  const out2 = `${g2.stdout || ''}${g2.stderr || ''}`;
  check('--page 滤空仍报「PRD 未解析出任何页面」（未被新错误劫持）',
    g2.status !== 0 && out2.includes('未解析出任何页面'), `exit=${g2.status} out=${out2.slice(-240)}`);
  rmSync(ws, { recursive: true, force: true });
}

// ---- 场景 18c：10 页上限截断必须留痕（不静默丢页） ----
// WHY：桌面有 13 个页面模板，页面清单超过 10 页时旧实现直接 slice 丢弃——产物少页、
// report 无痕迹、无 warn。本场景把「截断集的确定性 + 报告留痕」钉死。
// 排序键不是清单顺序：`getPagePriority` 先按用户流程频次、再按固定页序（prd-parser:577-590）。
// 故本 PRD **刻意不写用户流程**（频次全等），期望值才可写死；新增流程节会改变截断集。
// 只读 report、不跑闸门（截断组合不是真实产品形态，verify 不构成判据）。
{
  const TRUNC_PRD = `# 页集上限回归
## 产品概述
通用领域产品原型。
## 核心功能
- [P0] 核心页
## 页面清单
${['home', 'discover', 'list', 'detail', 'publish', 'chat', 'orders', 'profile', 'dashboard', 'settings', 'form', 'login', 'register']
  .map((p) => `- ${p}：${p}`).join('\n')}
`;
  const WANT_PAGES = ['home', 'discover', 'list', 'detail', 'publish', 'chat', 'orders', 'profile', 'dashboard', 'settings'];
  const reportOf = (ws) => { try { return JSON.parse(read(join(ws, 'prototype', 'generation-report.json'))); } catch { return null; } };

  const ws = newWs(TRUNC_PRD);
  const g = run(GEN, ws, ['--platform', 'desktop', '--quiet']);
  const report = reportOf(ws);
  const out = `${g.stdout || ''}${g.stderr || ''}`;
  check('桌面 13 页 PRD：pages 恰为固定的前 10 页（频次全等时按固定页序）',
    g.status === 0 && !!report && (report.pages || []).join() === WANT_PAGES.join(),
    `exit=${g.status} pages=${JSON.stringify(report && report.pages)}`);
  check('桌面 13 页 PRD：truncatedPages 恰为后 3 页（form/login/register）',
    !!report && (report.truncatedPages || []).join() === 'form,login,register',
    `truncatedPages=${JSON.stringify(report && report.truncatedPages)}`);
  check('截断留痕：warn 说明上限与真实收敛手段（用户流程/收敛清单）',
    out.includes('页集上限 10 页') && out.includes('用户流程'),
    `out=${out.slice(-240)}`);
  check('截断语义自洽：pages + truncated === PRD 页集，且桌面无 skipped',
    !!report && report.pages.length + report.truncatedPages.length === 13 && (report.skippedPages || []).length === 0,
    `pages=${report && report.pages.length} truncated=${report && report.truncatedPages.length} skipped=${JSON.stringify(report && report.skippedPages)}`);
  check('截断场景类型钉住 other（防页面清单中文词劫持判定）',
    !!report && report.productType === 'other', `productType=${report && report.productType}`);
  rmSync(ws, { recursive: true, force: true });

  // 移动端同一 PRD：可用模板恰 10 个（dashboard/settings/form 被跳过）⇒ 不触发截断
  const ws2 = newWs(TRUNC_PRD);
  const g2 = run(GEN, ws2, ['--platform', 'mobile', '--quiet']);
  const r2 = reportOf(ws2);
  check('移动端 13 页 PRD：跳过 3 页、截断为空（模板数=容量，不白占配额）',
    g2.status === 0 && !!r2 && (r2.skippedPages || []).join() === 'dashboard,settings,form'
      && (r2.truncatedPages || []).length === 0 && (r2.pages || []).length === 10,
    `exit=${g2.status} pages=${JSON.stringify(r2 && r2.pages)} skipped=${JSON.stringify(r2 && r2.skippedPages)} truncated=${JSON.stringify(r2 && r2.truncatedPages)}`);
  rmSync(ws2, { recursive: true, force: true });
}

// ---- 场景 18d：页名未命中必须留痕（PRD 未登记页名 / --page 未命中 / 全未识别回退）----
// WHY：`extractCorePages` 只收 normalizePageName 认识的页名，其余被 filter 掉——产物少页、
// rc=0、无 warn、report 无痕迹（prd-parser 自己的注释承认「页面凭空消失」）。
// 本场景把三个静默出口都变成可判红：① 部分未登记 → unknownPages + warn；② --page 拼错 →
// warn；③ 整节全未识别 → 回退默认页集必须 warn。判定与页集提取**共用同一循环**，
// 故「原话生成 PRD」（清单含 `- 跳转：home → …`）不得被判为未登记（防假留痕）。
{
  const reportOf = (ws) => { try { return JSON.parse(read(join(ws, 'prototype', 'generation-report.json'))); } catch { return null; } };
  // 刻意不写用户流程节（否则频次排序会改变页集顺序），描述文本不含任何已登记页名/中文别名
  const UNK_PRD = `# 钱包应用
## 产品概述
通用领域产品原型。
## 核心功能
- [P0] 账户
## 页面清单
- home：首页
- 钱包：余额
- 会员卡包：卡片管理
- profile：我的
`;

  const ws = newWs(UNK_PRD);
  const g = run(GEN, ws, ['--platform', 'mobile', '--quiet']);
  const report = reportOf(ws);
  const out = `${g.stdout || ''}${g.stderr || ''}`;
  check('未登记页名不进页集（仍为 home,profile）',
    g.status === 0 && !!report && (report.pages || []).join() === 'home,profile',
    `exit=${g.status} pages=${JSON.stringify(report && report.pages)}`);
  check('未登记页名必须留痕：report.unknownPages 恰为 钱包/会员卡包',
    !!report && (report.unknownPages || []).join() === '钱包,会员卡包',
    `unknownPages=${JSON.stringify(report && report.unknownPages)}`);
  check('未登记页名 warn 明示可识别页名与自由格式导入入口',
    out.includes('未登记页名') && out.includes('可识别页名') && out.includes('--from='),
    `out=${out.slice(-260)}`);

  // ② --page 未命中：显式输入同样不得静默（PRD 页集含 home/list，wallet 不在其中）
  const ws2 = newWs(MIN_PRD);
  const g2 = run(GEN, ws2, ['--platform', 'mobile', '--page', 'home,wallet', '--quiet']);
  const r2 = reportOf(ws2);
  const out2 = `${g2.stdout || ''}${g2.stderr || ''}`;
  check('--page 未命中留痕：仍生成 home，且 warn 点名 wallet',
    g2.status === 0 && !!r2 && (r2.pages || []).join() === 'home' && out2.includes('wallet') && out2.includes('不在 PRD 页面清单'),
    `exit=${g2.status} pages=${JSON.stringify(r2 && r2.pages)} out=${out2.slice(-200)}`);
  rmSync(ws2, { recursive: true, force: true });

  // ③ 整节全未识别 ⇒ parsePRD 回退默认页集，必须有 warn（否则产物与 PRD 无关且全绿）
  const ws3 = newWs(UNK_PRD.replace(/- home：首页\n/, '').replace(/- profile：我的\n/, ''));
  const g3 = run(GEN, ws3, ['--platform', 'mobile', '--quiet']);
  const r3 = reportOf(ws3);
  const out3 = `${g3.stdout || ''}${g3.stderr || ''}`;
  check('页面清单全未识别：回退默认页集且 warn 明示',
    g3.status === 0 && !!r3 && (r3.pages || []).join() === 'home,list,detail,profile' && out3.includes('已回退默认页集'),
    `exit=${g3.status} pages=${JSON.stringify(r3 && r3.pages)} out=${out3.slice(-200)}`);
  check('全未识别时 unknownPages 仍留痕（钱包/会员卡包）',
    !!r3 && (r3.unknownPages || []).length === 2, `unknownPages=${JSON.stringify(r3 && r3.unknownPages)}`);
  rmSync(ws3, { recursive: true, force: true });
  rmSync(ws, { recursive: true, force: true });

  // ④ 标准 PRD 零噪声：MIN_PRD 与「原话生成 PRD」都不得出现未登记页名
  const rawPrd = buildPRDFromTemplate('做一个二手书店', 'ecommerce');
  check('标准 PRD（MIN_PRD）无未登记页名', extractUnknownPageNames(MIN_PRD).length === 0, JSON.stringify(extractUnknownPageNames(MIN_PRD)));
  check('原话生成 PRD（含「- 跳转：home → …」行）不得假留痕',
    extractUnknownPageNames(rawPrd).length === 0, JSON.stringify(extractUnknownPageNames(rawPrd)));
  check('可识别页名表为单一来源（13 个，含 home/form/dashboard）',
    KNOWN_PAGES.size === 13 && KNOWN_PAGES.has('home') && KNOWN_PAGES.has('form') && KNOWN_PAGES.has('dashboard'), `size=${KNOWN_PAGES.size}`);
}

// ---- 场景 19：非电商类型桌面端 e2e（闸门零 fail） ----
// settings/form/profile/dashboard 为桌面专属模板，既不在 ecommerce golden（FULL_PRD 无此页）里，
// 也无移动端场景覆盖；此处补齐桌面侧闸门断言，作为其参数化的唯一回归保护。
{
  // 页面集需覆盖全部 11 个桌面模板：dashboard/orders 仅 saas 语义成立，故单列一组
  const PAGES = {
    tool: 'home,list,detail,form,settings',
    // community/content 平时走 publish，但页面清单写 form 时会落到桌面 form 模板；
    // 二者继承 other 的 sections，正好用来验证「非电商 form 无价格/交付」覆盖面
    community: 'home,discover,detail,publish,chat,profile,form',
    content: 'home,discover,list,detail,publish,profile,form',
    other: 'home,list,detail,form,profile',
  };
  const RUNS = [
    ...['tool', 'community', 'content', 'other'].map((t) => [t, PAGES[t]]),
    // saas：唯一有 dashboard/orders 语义的类型，用于覆盖这两个桌面模板
    ['saas', 'dashboard,orders,list,detail,form,settings,profile'],
  ];
  // 非电商桌面 form 的领域闸门：正文与交互属性不得出现电商计价/交付槽位（历史 bug：
  // form.eta 无条件渲染 price/delivery，5 个类型都渲染出「定价与描述 ¥ / 交付方式」）。
  const EC_FLAVOR = /¥|价格|定价|交付|发货|包邮/;
  for (const [type, pages] of RUNS) {
    const prd = `# ${type} 产品\n## 产品概述\n${TYPE_KW[type]}。\n## 核心功能\n- [P0] 核心页\n## 页面清单\n${pages.split(',').map((p) => `- ${p}：${p}`).join('\n')}\n`;
    const ws = newWs(prd);
    const { v, g, report, pagesOk, ok } = e2e(ws, 'desktop', pages.split(','));
    check(`${type} 桌面端 copyFail===0 且 passed`, ok,
      `${JSON.stringify(v)}\n生成: exit=${g.status} success=${report && report.success} files=${report && report.files} pages=${JSON.stringify(report && report.pages)}`);
    check(`${type} 桌面端类型识别为该类型（文案断言前置）`,
      !!report && report.productType === type, `productType=${report && report.productType}`);

    // form 页专项（只对页集含 form 的类型）
    if (pages.includes('form')) {
      const html = read(join(ws, 'prototype', 'pages', 'form.html'));
      const hay = `${normalizeText(html)} ${normalizeAttrs(html)}`;
      check(`${type} 桌面 form 不含电商计价/交付槽位`,
        html.length > 0 && !EC_FLAVOR.test(hay),
        html.length ? hay.match(EC_FLAVOR) ? `命中: ${hay.match(EC_FLAVOR)[0]}` : '' : 'form.html 缺失');
      const submit = COPY_LEXICON[type].form.submit;
      check(`${type} 桌面 form 主按钮文案取领域 submit（${submit}）`,
        html.includes(`>${submit}<`), `期望按钮文本 ${submit}`);
      const actionButtons = [...html.matchAll(/<button[^>]*id="(form-[a-z]+)"[^>]*>([\s\S]*?)<\/button>/g)]
        .map((m) => ({ id: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() }));
      check(`${type} 桌面 form 的 actions 按钮文本非空`,
        actionButtons.length >= 1 && actionButtons.every((b) => b.text.length > 0),
        JSON.stringify(actionButtons));
      check(`${type} 桌面 form 保留控件覆盖（select ≥ 1）`,
        (html.match(/<select\b/g) || []).length >= 1, `select=${(html.match(/<select\b/g) || []).length}`);
    }
    rmSync(ws, { recursive: true, force: true });
  }
}

// ---- 场景 20：模板文案接入率（结构性闸门，不依赖人工词表） ----
// WHY：`COPY_LEAK_TIERS.fail` 是人工枚举的电商强签名词，¥28.00 / 示例项目A / 数据概览
// 这类硬编码**扫不出来**。P4 阶段曾据此把 orders/home/discover/layout 判为「0 fail 命中、
// 无需改写」，实际是四个模板 0 处 it.copy 引用、非电商产物照样渲染电商文案。
// 这里改为断言「页面模板必须接入文案包」，覆盖词表之外的遗漏。
{
  const SKILL = fileURLToPath(new URL('..', import.meta.url));
  // 外壳模板只做布局与 iframe/tabbar 注入，不承载领域文案，单独豁免
  const SHELLS = new Set(['layout-shell.eta', 'layout-page.eta']);
  const targets = [];
  for (const base of ['mobile-template', 'desktop-template']) {
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.eta') && !SHELLS.has(e.name)) targets.push(p);
      }
    };
    walk(join(SKILL, base));
  }
  const bare = targets.filter((p) => !read(p).includes('it.copy.'));
  check('每个页面模板都接入文案包（it.copy.*）', bare.length === 0,
    `共 ${targets.length} 个模板，未接入 ${bare.length} 个：\n${bare.map((p) => '  ' + p.replace(SKILL, '')).join('\n')}`);
}

// ---- 场景 21：设备表与档位判定自洽性（表驱动，防阈值回归） ----
// WHY：档位判定若用纯比例分档，iPhone Duo 外屏(466×678, 0.687) 与内屏(626×890, 0.703)
// 比例仅差 0.016 却应分属单栏/双栏 → 必须用「逻辑宽度主判据」。此处把 13 款设备的
// 归档期望写成用例表，任何阈值改动导致误判都会在此暴露。
{
  const EXPECT = {
    iphone16: ['phone', 1, 'normal'],
    'iphone16-pro-max': ['phone', 1, 'normal'],
    'android-bar': ['phone', 1, 'normal'],
    'iphone-duo-cover': ['phone', 1, 'tight'],
    'iphone-duo-inner': ['pane', 2, 'normal'],
    'zfold7-cover': ['phone', 1, 'normal'],
    'zfold7-inner': ['pane', 2, 'normal'],
    'zflip7-cover': ['phone', 1, 'tight'],
    'zflip7-inner': ['phone', 1, 'normal'],   // 横折不产生左右多栏
    'matext-1screen': ['phone', 1, 'normal'],
    'matext-2screen': ['pane', 2, 'normal'],
    'matext-3screen': ['pane', 3, 'normal'],  // 双竖折痕 → 3 栏
    purax: ['wide', 2, 'tight'],
  };
  const rows = [];
  for (const [key, d] of Object.entries(DEVICES)) {
    const g = deviceFrame(d);
    const [ec, ep, ev] = EXPECT[key] || [];
    const errs = [];
    if (!Object.prototype.hasOwnProperty.call(ASPECT_CLASSES, g.aspectClass)) errs.push(`档位非法:${g.aspectClass}`);
    if (ec && g.aspectClass !== ec) errs.push(`档位 ${g.aspectClass}≠${ec}`);
    if (ep && g.panes !== ep) errs.push(`栏数 ${g.panes}≠${ep}`);
    if (ev && g.verticalSpace !== ev) errs.push(`垂直 ${g.verticalSpace}≠${ev}`);
    if (g.frameWidth !== d.logicalWidth + 2 * (d.bezel ?? 13)) errs.push('frameWidth 公式不符');
    if (g.frameHeight !== d.logicalHeight + 2 * (d.bezel ?? 13)) errs.push('frameHeight 公式不符');
    if (errs.length) rows.push(`${key}: ${errs.join('; ')}`);
  }
  const unmapped = Object.keys(DEVICES).filter((k) => !EXPECT[k]);
  check('设备表归档自洽（全部设备命中期望档位/栏数/垂直空间）', rows.length === 0 && unmapped.length === 0,
    `${rows.join('\n')}${unmapped.length ? `\n未写期望: ${unmapped.join(',')}` : ''}`);

  const rCustom = resolveDevice({ deviceKey: 'iphone16', customW: 626, customH: 890 });
  check('自定义 626×890 → pane 档 2 栏', !!rCustom && rCustom.aspectClass === 'pane' && rCustom.panes === 2,
    JSON.stringify(rCustom && { a: rCustom.aspectClass, p: rCustom.panes }));
  const rForce = resolveDevice({ deviceKey: 'iphone16', aspectOverride: 'wide' });
  check('aspectOverride 强制 wide 档', !!rForce && rForce.aspectClass === 'wide' && rForce.layoutConstraint === 'dual|triple',
    JSON.stringify(rForce && { a: rForce.aspectClass, l: rForce.layoutConstraint }));
  check('未知设备且无自定义尺寸 → 返回 null（供 CLI 报错）', resolveDevice({ deviceKey: 'no-such-device' }) === null);

  const creaseCases = [
    ['v-1@50:24', { axis: 'v', positions: [0.5], width: 24 }],
    ['v-1@50%:24', { axis: 'v', positions: [0.5], width: 24 }],
    ['v-1@0.5:24', { axis: 'v', positions: [0.5], width: 24 }],
    ['v-2@33,67:24', { axis: 'v', positions: [0.33, 0.67], width: 24 }],
    ['none', null],
  ];
  const creaseBad = creaseCases.filter(([spec, want]) => JSON.stringify(parseCrease(spec)) !== JSON.stringify(want))
    .map(([spec]) => spec);
  check('parseCrease 兼容 50 / 50% / 0.5 与多折痕', creaseBad.length === 0, `失败: ${creaseBad.join(', ')}`);
  let creepThrew = false;
  try { parseCrease('x-9@garbage'); } catch { creepThrew = true; }
  check('parseCrease 非法格式抛错', creepThrew);

  // 诚实标注：覆盖了尺寸就不得继续谎报预设机型（review High #2）
  const rSized = resolveDevice({ deviceKey: 'iphone16', customW: 800, customH: 600 });
  check('预设机型被尺寸覆盖 → label 标注自定义',
    !!rSized && rSized.label === 'iPhone 16（自定义 800×600）', JSON.stringify(rSized && rSized.label));
  const rUnk = resolveDevice({ deviceKey: 'no-such', customW: 800, customH: 600 });
  check('未知设备 + 自定义尺寸 → label「自定义设备」且档位 wide',
    !!rUnk && rUnk.label === '自定义设备' && rUnk.category === 'custom' && rUnk.aspectClass === 'wide',
    JSON.stringify(rUnk && { l: rUnk.label, c: rUnk.category, a: rUnk.aspectClass }));

  // 原型链防护：`--device toString` 取到函数会让几何全 NaN 且静默 exit 0（review Medium）
  check('原型链键（toString）→ null 而非 NaN 几何', resolveDevice({ deviceKey: 'toString' }) === null);

  // 折痕边界：位置钳制 + 显式 0 宽不被 ||22 吞掉 + 数量校验
  const clamp = parseCrease('v-1@150:0');
  check('parseCrease 位置钳制到 (0,1) 且显式 0 宽保留',
    !!clamp && clamp.positions[0] === 1 && clamp.width === 0, JSON.stringify(clamp));
  let countThrew = false;
  try { parseCrease('v-2@50'); } catch { countThrew = true; }
  check('parseCrease 数量不符抛错', countThrew);
}

// ---- 场景 22：设备维度闸门（负例，证明非假绿） ----
// 断言 verify 在「外壳几何与报告不一致 / 折痕数不符 / 报告缺 device」时确实置位。
{
  const ws = newWs(FULL_PRD);
  run(GEN, ws, ['--platform', 'mobile', '--quiet']);
  const base = verifyJson(ws);
  check('设备闸门基线：iphone16 layoutFail===0 且 passed',
    !!base.device && base.device.key === 'iphone16' && base.layoutFail === 0 && base.creaseFail === 0 && base.passed === true,
    JSON.stringify(base.device));

  // (a) 报告 device.key 与外壳 data-device 不一致 → layoutFail
  const repPath = join(ws, 'prototype', 'generation-report.json');
  const rep = JSON.parse(read(repPath));
  rep.device.key = 'iphone-duo-inner';
  writeFileSync(repPath, JSON.stringify(rep));
  const a = verifyJson(ws);
  check('报告设备与外壳不一致 → layoutFail>=1 且 passed:false',
    a.layoutFail >= 1 && a.passed === false, JSON.stringify({ lf: a.layoutFail }));

  // (b) 报告缺 device 字段 → layoutFail（断言字段存在，消除假绿）
  delete rep.device;
  writeFileSync(repPath, JSON.stringify(rep));
  const b = verifyJson(ws);
  check('移动端报告缺 device → layoutFail>=1 且 passed:false',
    b.layoutFail >= 1 && b.passed === false, JSON.stringify({ lf: b.layoutFail }));
  rmSync(ws, { recursive: true, force: true });

  // (c) 折叠屏折痕数不符 → creaseFail
  const ws2 = newWs(FULL_PRD);
  run(GEN, ws2, ['--platform', 'mobile', '--device', 'iphone-duo-inner', '--quiet']);
  const cBase = verifyJson(ws2);
  check('折叠屏基线：iphone-duo-inner pane 2 栏 creaseFail===0',
    !!cBase.device && cBase.device.aspectClass === 'pane' && cBase.creaseFail === 0 && cBase.passed === true,
    JSON.stringify(cBase.device));
  const shellPath = join(ws2, 'prototype', 'index.html');
  writeFileSync(shellPath, read(shellPath).replace(/<div class="crease-line"[^>]*><\/div>/g, ''));
  const c = verifyJson(ws2);
  check('删除折痕元素后 creaseFail>=1 且 passed:false',
    c.creaseFail >= 1 && c.passed === false, JSON.stringify({ cf: c.creaseFail }));

  // (d) 状态栏带高回归（golden 三维测不出的盲区）：改回「误当 padding-top」写法应被拦下
  writeFileSync(shellPath, read(shellPath).replace('style="height:54px;padding-top:0"', 'style="padding-top:54px"'));
  const d = verifyJson(ws2);
  check('状态栏带高被改为 padding-top 后 layoutFail>=1 且 passed:false',
    d.layoutFail >= 1 && d.passed === false, JSON.stringify({ lf: d.layoutFail }));
  rmSync(ws2, { recursive: true, force: true });
}

// ---- 场景 23：字阶零容忍（源码中不得出现任意字号） ----
// WHY：任意值 text-[Npx] 只输出 font-size、丢掉 token 配对的 line-height，
// 是「同类文字块行距不齐」的隐藏来源。JS 生成器（signature/brandMark/tabbar）会注入
// 到外壳 HTML，故扫描范围必须覆盖 SKILL_DIR 顶层 *.js + utils/ + scripts/（递归）+ templates。
// 豁免仅为 utils/golden-gate.js（SIZE_MAP 定义处，唯一合法承载映射表字面量的文件）。
// 局限：源码级棘轮是**尽力而为**——字符串拼接（'text-['+'16px]'）与行内 `//` 注释可绕过；
// 唯一可信兜底是**产物级**门禁 `freeze-golden.js` 的 countArbitrarySizes（对生成结果计数）。
{
  const MAX_ARBITRARY_SIZES = 0;   // 归一完成：零容忍（此值为棘轮，只可保持 0）
  const EXEMPT = join(SKILL_DIR, 'utils', 'golden-gate.js'); // 唯一合法承载映射表字面量的文件
  const offenders = [];
  let total = 0;
  const scan = (p) => {
    if (p === EXEMPT) return;
    const body = stripComments(read(p));
    for (const m of body.matchAll(arbScanRe())) { total++; offenders.push(`${p.replace(SKILL_DIR, '')}: ${m[0]}`); }
  };
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.eta') || e.name.endsWith('.js')) scan(p);
    }
  };
  walk(SKILL_DIR);
  check(`源码任意字号为零（棘轮 ${MAX_ARBITRARY_SIZES}）`, total <= MAX_ARBITRARY_SIZES,
    `任意字号 ${total} 处，上限 ${MAX_ARBITRARY_SIZES}。新增任意字号即回归：\n${offenders.slice(0, 12).join('\n')}`);
}

// ---- 场景 24：字号 token 解包正确性（合法 CSS + 无裸字面量） ----
// WHY：fontSize token 是 [size,{lineHeight}] 数组形态，theme() 返回整个数组；
// 若插件里直接赋值，会生成 `font-size: 0.75rem,1.5` 这类非法 CSS 并被浏览器整条丢弃，
// 而三维闸门与肉眼都不易发现。stub 此前恒返回 '0'，同样测不到 —— 故用真实 theme 求值断言。
{
  const ws = newWs(FULL_PRD);
  run(GEN, ws, ['--platform', 'desktop', '--quiet']);
  const html = read(join(ws, 'prototype', 'index.html'));
  const EXPECT = {
    '.badge': { fontSize: '0.6875rem', lineHeight: '1.4' },
    '.delta': { fontSize: '0.75rem', lineHeight: '1.5' },
    '.btn': { fontSize: '0.875rem' },
    '.input': { fontSize: '0.875rem', lineHeight: '1.5' },
    '.chip': { fontSize: '0.75rem' },
    '.eyebrow': { fontSize: '0.6875rem' },
    '.section-title': { fontSize: '1.125rem', fontWeight: '600' },
  };
  const r = resolveInlineUtilities(html, Object.keys(EXPECT));
  check('内联插件可按类名取回真实产出', r.ok, r.reason || '');
  const bad = [];
  for (const [cls, exp] of Object.entries(EXPECT)) {
    const v = (r.values || {})[cls];
    if (!v) { bad.push(`${cls} 未产出`); continue; }
    for (const [k, want] of Object.entries(exp)) {
      if (v[k] !== want) bad.push(`${cls}.${k}=${JSON.stringify(v[k])} ≠ ${JSON.stringify(want)}`);
    }
    if (typeof v.fontSize === 'string' && v.fontSize.includes(',')) bad.push(`${cls}.fontSize 含逗号（数组未解包）`);
  }
  check('组件类字号走 token 且解包正确（无非法 CSS）', bad.length === 0, bad.join('; '));

  // 源码层面：组件类里不得再出现裸字号字面量
  const src = read(resolve(SKILL_DIR, 'utils', 'tailwind-config.js'));
  const literals = [...src.matchAll(/fontSize:\s*'[\d.]+(?:px|rem)'/g)].map((m) => m[0]);
  check('tailwind-config.js 无裸字号字面量（须走 typeSize）', literals.length === 0,
    `发现 ${literals.length} 处：${[...new Set(literals)].join(' | ')}`);

  // delta 胶囊收纳棘轮：涨跌胶囊必须走组件类，不得再散落裸 px/py/rounded/text-* 组合
  // （两页曾各自写死同一串 `rounded-full px-2 py-0.5 text-xs font-medium`，改档位时必漏一处）
  const pillRe = /inline-flex items-center gap-1 rounded-full[^"]*px-2 py-0\.5[^"]*text-xs font-medium/;
  const leftover = [];
  for (const f of ['desktop-template/pages/home.eta', 'desktop-template/pages/dashboard.eta']) {
    const t = read(resolve(SKILL_DIR, f));
    if (!/\bdelta\b/.test(t)) leftover.push(`${f} 未使用 .delta 组件类`);
    if (pillRe.test(t)) leftover.push(`${f} 仍有裸涨跌胶囊写法（应走 .delta）`);
  }
  const pillOther = [];
  for (const f of ['desktop-template/pages/home.eta', 'desktop-template/pages/dashboard.eta']) {
    for (const m of read(resolve(SKILL_DIR, f)).matchAll(/class="([^"]*px-2 py-0\.5[^"]*)"/g)) {
      if (!/\bdelta\b/.test(m[1])) pillOther.push(`${f}: ${m[1]}`);
    }
  }
  check('涨跌 delta 胶囊已收纳为 .delta（无裸重复写法）', leftover.length === 0 && pillOther.length === 0,
    [...leftover, ...pillOther].join('; '));

  rmSync(ws, { recursive: true, force: true });
}

// ---- 场景 25：工具类字号 token 必须在内联配置中有定义（双向防静默失效） ----
// WHY：P2 把 text-[Npx] 换成 text-micro/xs/.../2xl 后，若某个 token 未写进内联
// tailwind.config 的 theme.extend.fontSize，Tailwind Play CDN 会静默不产出该工具类，
// 字号失效且三维闸门/golden 都测不出（golden 只看 class 名，不看是否真的编译）。
// 反向：模板里若写了配置中不存在的字号 token（如误写 text-2xs）同样会静默失效，
// 故从模板+生成器+产物中派生「实际用到的字号 token」，断言全部存在于配置 fontSize 键中。
{
  const ws = newWs(FULL_PRD);
  run(GEN, ws, ['--platform', 'desktop', '--quiet']);
  const html = read(join(ws, 'prototype', 'index.html'));
  const src = extractInlineTailwindConfig(html);

  // 通用：抽取内联配置中某个顶层对象的键
  const topKeys = (source, name) => {
    if (!source) return [];
    const at = source.indexOf(`"${name}"`);
    if (at < 0) return [];
    const start = source.indexOf('{', at);
    let depth = 0, end = -1;
    for (let j = start; j < source.length; j++) {
      if (source[j] === '{') depth++;
      else if (source[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    const body = source.slice(start + 1, end);
    const parts = []; let d = 0, cur = '';
    for (const c of body) {
      if ('{[('.includes(c)) d++;
      else if ('}])'.includes(c)) d--;
      if (c === ',' && d === 0) { parts.push(cur); cur = ''; } else cur += c;
    }
    parts.push(cur);
    return parts.map((p) => p.split(':')[0].trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  };
  const keys = topKeys(src, 'fontSize');

  // 派生「实际用到的字号 token」：扫模板 + 生成器 + 产物（剥注释，排除 selfcheck/golden-gate 自身）
  const used = new Set();
  const collect = (text) => {
    for (const m of stripComments(text).matchAll(/(?:[a-z-]+:)?text-([a-z0-9]+)/g)) {
      if (TOKEN_SIZE_RE.test(`text-${m[1]}`)) used.add(m[1]);
    }
  };
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.eta')) collect(read(p));
    }
  };
  for (const d of ['mobile-template', 'desktop-template']) walk(join(SKILL_DIR, d));
  // 覆盖所有会注入类名的 JS（顶层 + utils + scripts，递归），排除 selfcheck 自身与 golden-gate
  // （其字符串样本/SIZE_MAP 字面量非真实用法；与场景 23 的豁免口径一致）
  const SKIP_JS = new Set([join(SKILL_DIR, 'scripts', 'selfcheck.js'), join(SKILL_DIR, 'utils', 'golden-gate.js')]);
  const walkJs = (dir, recursive) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (recursive) walkJs(p, true); continue; }
      if (e.name.endsWith('.js') && !SKIP_JS.has(p)) collect(read(p));
    }
  };
  for (const d of ['utils', 'scripts']) walkJs(join(SKILL_DIR, d), true);
  walkJs(SKILL_DIR, false);
  collect(html);
  // 产物 pages/*.html
  const prodPages = join(ws, 'prototype', 'pages');
  if (existsSync(prodPages)) {
    for (const e of readdirSync(prodPages)) if (e.endsWith('.html')) collect(read(join(prodPages, e)));
  }

  const missing = [...used].filter((k) => !keys.includes(k));
  check('实际用到的字号 token 均在内联 fontSize 中', missing.length === 0,
    `缺失 ${missing.join('/')}；实际键：${keys.join('/') || '(无)'}；用到：${[...used].join('/')}`);
  rmSync(ws, { recursive: true, force: true });
}

// ---- 场景 26：重冻门禁负例（证明 gateClasses 非假绿） ----
// WHY：场景 5/8/10/22 都是「闸门 + 注入破坏的负例」成对出现。freeze-golden 的核心
// gateClasses 若无负例，就无法证明它能拦下越权 class 变化（本轮已发生过一次真实漏检）。
{
  const arb12 = 'text-[' + '12px]';
  const base = `<div class="p-4 ${arb12} text-neutral-900">x</div>`;
  const okHtml = '<div class="p-4 text-xs text-neutral-900">x</div>';
  const badColor = '<div class="p-4 text-sm text-red-500">x</div>';
  const arbLiteral = 'text-[' + '14px]';   // 运行时拼接，避免被场景 23 的源码扫描命中
  const badSize = `<div class="p-4 ${arbLiteral} text-neutral-900">x</div>`;
  const badShape = `<div class="p-4 ${arb12} text-neutral-900"><span class="flex">y</span></div>`;

  check('门禁负例：合法字号映射通过', gateClasses(base, okHtml).length === 0,
    gateClasses(base, okHtml).join('; '));
  check('门禁负例：越权颜色类被拒', gateClasses(base, badColor).length > 0, '颜色类变化未被拦截');
  check('门禁负例：映射表外的任意字号被拒', gateClasses(base, badSize).length > 0, `映射表外的任意字号未被拦截：${arbLiteral}`);
  check('门禁负例：新增非字号元素被拒', gateClasses(base, badShape).length > 0, '结构变化未被拦截');
  check('门禁负例：产物残留任意字号可检出', (() => {
    const a = '<div class="text-sm">x</div>';
    return countArbitrarySizes(a) === 0 && countArbitrarySizes(badSize) === 1;
  })(), 'countArbitrarySizes 计数不符');

  // 结构性探针：class 值变化不应告警；非 class 区域变化必须告警
  check('结构探针：仅 class 值变化 → 无告警',
    structuralDiff('<div class="a">x</div>', '<div class="b">x</div>') === null, '误报非 class 差异');
  check('结构探针：<style> 新增 → 告警',
    structuralDiff('<head></head>', '<head><style>.a{}</style></head>') !== null, '漏报 <style> 差异');
  check('结构探针：告警含计数与区域', (() => {
    const d = structuralDiff('<head></head>', '<head><style>.a{}</style></head>');
    return d && d.count >= 1 && Array.isArray(d.regions) && d.regions.length >= 1;
  })(), '结构探针返回结构不完整');

  // 裸 class 门禁：覆盖 <script> 内字符串写死的类名（gateClasses 因剥 script 看不到）
  const rawOld = `<script>el.innerHTML='<i class="${arb12}"></i>';</script>`;
  const rawOk = `<script>el.innerHTML='<i class="text-xs"></i>';</script>`;
  const rawBad = `<script>el.innerHTML='<i class="text-red-500"></i>';</script>`;
  check('裸 class 门禁：script 内合法映射通过', gateRawClasses(rawOld, rawOk).length === 0,
    gateRawClasses(rawOld, rawOk).join('; '));
  check('裸 class 门禁：script 内越权类被拒', gateRawClasses(rawOld, rawBad).length > 0, '未拦截');
}

// ---- 场景 27：重冻决策时序（授权必须在写盘之前）+ 基线目录卫生 ----
// WHY：上轮真实缺陷是「先写盘、后判 --allow-structural」→ 授权可被「再跑一次」零成本绕过。
// 决策抽为纯函数后单测；并断言基线目录内无 .bak/.tmp 残留（备份已移出 skills 树，见 BAK_ROOT）。
{
  const d = (o) => decideFreeze({ allOk: true, sawStructural: false, write: false, allowStructural: false, ...o });
  check('决策：门禁失败 → 退出码 1', d({ allOk: false }).code === 1, '');
  check('决策：write+结构差异未授权 → 退出码 2', d({ write: true, sawStructural: true }).code === 2, '');
  check('决策：write+结构差异已授权 → 退出码 0', d({ write: true, sawStructural: true, allowStructural: true }).code === 0, '');
  check('决策：干跑+结构差异 → 0 且提示授权', (() => {
    const r = d({ sawStructural: true });
    return r.code === 0 && r.message.includes('--allow-structural');
  })(), '');

  // 本轮新增：语义类重构授权通道（--allow-class-refactor）
  // 注意 main 无条件置 sawClassRefactor（不因是否授权而变），故以下三条路径在生产中均可达。
  check('决策：class 重构未授权 → 硬拒退出码 1', d({ write: true, sawClassRefactor: true }).code === 1, '');
  check('决策：干跑+class 重构未授权 → 仍硬拒 1 且提示 --allow-class-refactor', (() => {
    const r = d({ sawClassRefactor: true });
    return r.code === 1 && r.message.includes('--allow-class-refactor');
  })(), '');
  check('决策：class 重构已授权 → 退出码 0', d({ write: true, sawClassRefactor: true, allowClassRefactor: true }).code === 0, '');

  const STRAY_RE = /\.(bak|tmp)/;   // 覆盖 .bak/.tmp 及 .tmp-<pid> 残留
  const stray = [];
  for (const fx of GOLDEN_FIXTURES) {
    const GOLD = goldenDirOf(fx);
    if (!existsSync(GOLD)) continue;
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (STRAY_RE.test(e.name)) stray.push(`${fx.name}/${join(dir, e.name).slice(GOLD.length + 1)}`);
        if (e.isDirectory()) walk(join(dir, e.name));
      }
    };
    walk(GOLD);
  }
  check('golden 基线目录内（递归）无 .bak/.tmp 残留（全 fixture）', stray.length === 0, `残留：${stray.join(', ')}`);

  // 文件集（页面集）变化门禁：missing（页面消失/改名）与 added（新增页面）必须被正确分类 —— 两者都硬拒
  // （新增页面不给授权开关：页集变化会改写全部重叠页的 text/attrs，授权等价于吞掉真回归）
  const c1 = classifyFileSet(['index.html', 'pages/home.html'], ['index.html', 'pages/home.html']);
  check('文件集分类：无变化时两集皆空', c1.missing.length === 0 && c1.added.length === 0, JSON.stringify(c1));
  const c2 = classifyFileSet(['index.html', 'pages/home.html'], ['index.html', 'pages/home.html', 'pages/login.html']);
  check('文件集分类：新增页面归入 added', c2.missing.length === 0 && c2.added.join() === 'pages/login.html', JSON.stringify(c2));
  const c3 = classifyFileSet(['index.html', 'pages/home.html'], ['index.html', 'pages/profile.html']);
  check('文件集分类：改名同时归入 missing 与 added',
    c3.missing.join() === 'pages/home.html' && c3.added.join() === 'pages/profile.html', JSON.stringify(c3));
}

// ---- 场景 28：语义排版契约（角色类按平台正确解析）+ 源码无任意值圆角 ----
// WHY：设计系统只给「刻度」不给「角色」时，同类元素跨页字号漂移（home 分组标题 14 vs detail 16、
// 价格 12/16/18/24）。本轮引入 role→token 契约（constants.TYPE_ROLES）并生成语义工具类。
// 断言：两端内联配置中每个角色类都产出、fontSize/weight 与契约一致 —— 防 role() 静默回退 base，
// 也防有人改 token 表却不改模板（或反之）。
{
  // 单一数值源：从 constants 的 fontSize 派生（不再硬编码 rem，避免与 DESIGN_TOKENS 漂移）
  const TOKEN_REM = Object.fromEntries(
    Object.entries(fontSize).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const CLS = (k) => '.' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  for (const platform of ['mobile', 'desktop']) {
    const ws = newWs(FULL_PRD);
    run(GEN, ws, ['--platform', platform, '--quiet']);
    const html = read(join(ws, 'prototype', platform === 'desktop' ? 'index.html' : 'pages/home.html'));
    const names = Object.keys(TYPE_ROLES[platform]);
    const r = resolveInlineUtilities(html, names.map(CLS));
    const bad = [];
    if (!r.ok) bad.push(r.reason || '解析失败');
    for (const name of names) {
      const spec = TYPE_ROLES[platform][name];
      const v = (r.values || {})[CLS(name)];
      if (!v) { bad.push(`${CLS(name)} 未产出`); continue; }
      const wantFs = TOKEN_REM[spec.token];
      if (!wantFs) bad.push(`${CLS(name)} 契约 token「${spec.token}」不在刻度表`);
      else if (v.fontSize !== wantFs) bad.push(`${CLS(name)}.fontSize=${JSON.stringify(v.fontSize)} ≠ ${wantFs}（token=${spec.token}）`);
      if (v.fontWeight !== spec.weight) bad.push(`${CLS(name)}.fontWeight=${JSON.stringify(v.fontWeight)} ≠ ${spec.weight}`);
    }
    check(`语义角色类按契约产出（${platform}）`, bad.length === 0, bad.join('; '));
    rmSync(ws, { recursive: true, force: true });
  }

  // 角色类 ↔ TYPE_ROLES 双向一致：防「新增 role() 类却忘登记 token」的静默回退 base，
  // 以及「登记了 token 却没生成类」的静默失效（两向都测不到时 golden 也看不见）
  const twSrc = read(join(SKILL_DIR, 'utils', 'tailwind-config.js'));
  const usedNames = [...new Set([...twSrc.matchAll(/\brole\(\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]))];
  const mob = Object.keys(TYPE_ROLES.mobile);
  const desk = Object.keys(TYPE_ROLES.desktop);
  const orphans = usedNames.filter((n) => !mob.includes(n) || !desk.includes(n));
  const missing = [...new Set([...mob, ...desk])].filter((n) => !usedNames.includes(n));
  check('角色类与 TYPE_ROLES 键双向一致（无孤儿/无遗漏）',
    usedNames.length > 0 && orphans.length === 0 && missing.length === 0,
    `插件用了但未登记：${orphans.join('/') || '(无)'}；登记了但未生成：${missing.join('/') || '(无)'}`);

  // 源码级：不得出现任意值圆角 rounded-[...]（与场景 23 的字号棘轮同口径；豁免 golden-gate.js）
  const EXEMPT = join(SKILL_DIR, 'utils', 'golden-gate.js');
  const offenders = [];
  const scan = (p) => {
    if (p === EXEMPT) return;
    for (const m of stripComments(read(p)).matchAll(/rounded-\[[^\]]+\]/g)) {
      offenders.push(`${p.slice(SKILL_DIR.length)}: ${m[0]}`);
    }
  };
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.eta') || e.name.endsWith('.js')) scan(p);
    }
  };
  walk(SKILL_DIR);
  check('源码任意值圆角为零（圆角须走 token）', offenders.length === 0,
    `任意值圆角 ${offenders.length} 处：\n${offenders.slice(0, 12).join('\n')}`);
}

// ---- 场景 29：验证码契约自洽（sendCode 字段 ↔ codeButton 槽位 ↔ 模板钩子） ----
// WHY：倒计时按钮的文案/秒数由词典驱动（模板只写 data-* 钩子），缺 codeButton 会在渲染期抛
// TypeError；两端模板必须同时具备倒计时钩子。登录态本身是**纯 CSS 切换**（radio + has-/group-has-，
// 见本场景下方的机制断言）。这些漂移 golden 三维都看不见（属性不在 attrs 维、<script> 被
// stripNoise 剔除），故用源码级棘轮兜住。
{
  const L = COPY_LEXICON.other;
  const bad = [];
  for (const block of ['login', 'register']) {
    const b = L[block];
    if (!b) { bad.push(`other.${block} 缺失`); continue; }
    const fields = (block === 'login' ? b.codeFields : b.fields) || [];
    const sendCodeFields = fields.filter((f) => f && f.sendCode);
    const cb = b.codeButton;
    if (sendCodeFields.length === 0) bad.push(`${block} 无 sendCode 字段（验证码流程缺失）`);
    if (!cb || !cb.idle || !cb.counting || !(Number(cb.seconds) > 0)) {
      bad.push(`${block}.codeButton 不完整：${JSON.stringify(cb)}`);
    }
    if (block === 'login') {
      const n = Array.isArray(b.tabs) ? b.tabs.length : 0;
      if (n !== 2) bad.push(`login.tabs 应为 2（密码/验证码），实际 ${n}`);
      // value 会进 radio 的 id 与面板绑定类名（`login-mode-<value>` / `group-has-[#login-mode-<value>:checked]`），
      // 必须是小写 kebab，否则产物里的类名/id 不可预期（产物断言会因「同源」一起错仍绿）
      for (const t of (Array.isArray(b.tabs) ? b.tabs : [])) {
        if (!t || !/^[a-z][a-z0-9-]*$/.test(t.value || '')) {
          bad.push(`login.tabs[].value 非法（须小写 kebab）：${JSON.stringify(t && t.value)}`);
        }
      }
      if (!Array.isArray(b.codeFields) || b.codeFields.length === 0) bad.push('login.codeFields 缺失');
    }
  }
  check('验证码契约：sendCode 字段 ↔ codeButton 槽位自洽（other）', bad.length === 0, bad.join('; '));

  const hooks = [];
  for (const platform of ALL_PLATFORMS) {
    const dir = join(SKILL_DIR, platform === 'desktop' ? 'desktop-template' : 'mobile-template', 'pages');
    for (const page of ['login', 'register']) {
      const p = join(dir, `${page}.eta`);
      if (!existsSync(p)) { hooks.push(`${platform}/${page}.eta 缺失`); continue; }
      const src = read(p);
      if (!src.includes('data-send-code')) hooks.push(`${platform}/${page}.eta 缺 data-send-code`);
      if (!src.includes('data-countdown=')) hooks.push(`${platform}/${page}.eta 缺 data-countdown`);
      if (!src.includes('data-counting=') || !src.includes('data-idle=')) hooks.push(`${platform}/${page}.eta 缺 data-counting/data-idle`);
      if (page === 'login') {
        // 登录态切换须为纯 CSS（无脚本可达）：radio + has-[:checked]（标签选中态）+ group-has-[#…]/login:（面板切换）
        if (!src.includes('role="radiogroup"') || !src.includes('name="login-mode"')) {
          hooks.push(`${platform}/login.eta 缺 radiogroup/radio 钩子`);
        }
        if (!src.includes('has-[:checked]:')) hooks.push(`${platform}/login.eta 缺 has-[:checked] 选中态`);
        if (!src.includes('group-has-[#login-mode-') || !src.includes(':checked]/login:')) {
          hooks.push(`${platform}/login.eta 缺 group-has-[#…:checked]/login: 面板切换`);
        }
        // 「has-[#id…] 必须带状态伪类」这条棘轮已提升为**全模板** lint（见场景 31），此处不重复
        if (src.includes('data-login-tab') || src.includes('data-login-panel')) {
          hooks.push(`${platform}/login.eta 出现脚本切换钩子（登录态须为纯 CSS，勿回退）`);
        }
      }
    }
  }
  check('验证码/登录态钩子在两端模板齐备', hooks.length === 0, hooks.join('; '));

  // 收敛：模板里的 `_mode`（= tabs[1].value）必须在**产物**里解析成具体类名（防 lexicon 改 value 后模板静默失配）
  const rendered = join(SKILL_DIR, 'fixtures', 'golden', 'account', 'mobile', 'pages', 'login.html');
  const bound = [];
  if (!existsSync(rendered)) bound.push('account/mobile 产物缺失（须先冻结 account 基线）');
  else {
    const html = read(rendered);
    const want = `group-has-[#login-mode-${L.login.tabs[1].value}:checked]/login:block`;
    if (!html.includes(want)) bound.push(`产物缺 ${want}`);
    if (!html.includes('name="login-mode"') || !html.includes('has-[:checked]:bg-white')) bound.push('产物缺 radio/has-[:checked]');
    if (/data-login-tab|aria-selected/.test(html)) bound.push('产物残留脚本切换钩子');
  }
  check('登录态纯 CSS 绑定在产物中已解析（tabs[1].value ↔ 类名）', bound.length === 0, bound.join('; '));
}

// ---- 场景 30：图标名可用性（词典/模板引用的 lucide 名必须在上游清单内） ----
// WHY：图标名写错在浏览器端**静默失败**（渲染成空方块）——本轮 `devices` 即此例（Material 图标名，
// 不在 lucide 集内）。`data-lucide` 不进 golden 三维（非 text/attrs/class），故用离线清单
// （utils/lucide-icons.js，`node scripts/update-lucide-icons.js` 刷新）兜住。
{
  const bad = new Map(); // 图标名 -> 首次出现位置
  const hit = (name, where) => {
    if (typeof name !== 'string' || !name) return;
    if (!LUCIDE_ICONS.has(name) && !bad.has(name)) bad.set(name, where);
  };

  // 1) 词典：所有 `icon` 键（含各产品类型与 desktop.* 子槽位）
  const walk = (v, path) => {
    if (Array.isArray(v)) { for (const el of v) walk(el, path); return; }
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      if (k === 'icon') hit(x, `词典 ${path || 'root'}`);
      else walk(x, path ? `${path}.${k}` : k);
    }
  };
  walk(COPY_LEXICON, '');

  // 2) 模板与脚本源码：字面量 data-lucide="…" + 三处「非 data-lucide 字面量」的图标名
  const files = [];
  const walkDir = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walkDir(p); continue; }
      if (/\.(eta|js)$/.test(e.name)) files.push(p);
    }
  };
  for (const d of ['mobile-template', 'desktop-template', 'utils', 'scripts']) walkDir(join(SKILL_DIR, d));
  for (const f of files) {
    const rel = f.replace(SKILL_DIR, '').replace(/^\//, '');
    // 先剥注释：注释里引用的示例串（含本文件自己的说明性注释）不该被当成真实引用；
    // `//` 的剥离需避开 `https://`，故要求前一字符不是 `:`
    const src = read(f)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    for (const m of src.matchAll(/data-lucide="([a-z0-9-]+)"/g)) hit(m[1], rel);
    // 2b) `data-lucide` 里的 Eta 回退字面量：`data-lucide="<%= _icons[x] || 'circle' %>"`
    for (const m of src.matchAll(/data-lucide="[^"]*\|\|\s*'([a-z0-9-]+)'/g)) hit(m[1], `${rel}（data-lucide 回退）`);
    // 2c) 动态拼接的图标名（`data-lucide="'+icon+'"`）来源可能既非 data-lucide 字面量、也非词典
    //     `icon` 键——review 指出的覆盖漏洞，实例如 desktop/layout.eta 的局部映射
    //     `const _icons = { home:'layout-dashboard', … }`、mobile/layout-shell.eta 的三元式
    //     `const icon=bat>50?'battery-full':…`。只取「变量名含 icon 的赋值语句」内的字符串字面量，
    //     避免误收同行的非图标串（如 'text-micro'）。
    for (const stmt of src.matchAll(/(?:const|let|var)\s+\w*icon\w*\s*=[\s\S]{0,600}?;/gi)) {
      for (const v of stmt[0].matchAll(/'([a-z][a-z0-9-]*)'/g)) hit(v[1], `${rel}（icon 赋值语句）`);
    }
  }

  // 3) 清单自身完整性：生成文件声明了条目数，二者不等说明清单被截断/误改（删一个未使用的名字
  //    不会有别处报错，只有这条能兜住）
  if (LUCIDE_ICONS.size !== LUCIDE_COUNT) {
    bad.set('(清单条目数不符)', `utils/lucide-icons.js 实际 ${LUCIDE_ICONS.size} 个，文件声明 ${LUCIDE_COUNT} 个`);
  }

  check(
    `图标名可用性（清单 lucide-static@${LUCIDE_VERSION} / ${LUCIDE_ICONS.size} 个；扫描 ${files.length} 个源码文件）`,
    bad.size === 0,
    [...bad].map(([n, w]) => `${n}（${w}）`).join('; '),
  );
}

// ---- 场景 31：全模板 `has-[…]` 变体必须带状态伪类（防「元素存在即匹配」的静默状态失效）----
// WHY：`group-has-[#login-mode-code]/login:block` 这类变体漏写 `:checked`，会退化成「祖先里
// 存在该 id 元素即匹配」→ 变体**无条件生效**、状态恒死，而页面**看起来完全正常**：模板静态断言
// 与 golden 三维都测不出（本轮真踩过，见 plan §11.2）。原 lint 只覆盖 login 模板（场景 29），
// 此场景提升为全模板：凡 `has-[…]` 的内容**只由 id/class 选择器构成**（不含任何状态伪类）即判为
// 漏写状态。`has-[:focus-visible]`、`has-[.x:checked]` 正常通过；`has-[img]` 这类结构化查询
// （不以 `#`/`.` 起头）也不误报。
//
// 白名单：规则是「默认拒绝」——结构化 `has-[#id]` 若确有其用（绑定的不是状态而是结构），
// 必须在 HAS_SELECTOR_ALLOWLIST 里**逐条登记并写明理由**；条目必须真实命中（防残留死条目），
// 且机制本身由下方单测证明（默认拒绝 / 登记后放行），不是「配了就等于放开」。
const HAS_SELECTOR_ALLOWLIST = [
  // { file: 'mobile-template/pages/foo.eta', inner: '#some-id', reason: '为什么这里绑结构而非状态' },
];

/** 纯函数：返回某源码里「缺状态伪类」的 `has-[…]` 位置（供 lint 与单测共用） */
function hasVariantOffenders(src, { file = '', allow = [] } = {}) {
  // 剥注释（HTML/Eta/JS 注释里可能有示例串）；Eta 表达式替换为占位符——
  // `has-[#login-mode-<%= _mode %>:checked]` 变成 `has-[#login-mode- :checked]` 仍可判读，
  // 而漏写状态的 `has-[#login-mode-<%= _mode %>]` 变成 `has-[#login-mode- ]` 会被判出。
  const clean = src
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/<%[\s\S]*?%>/g, ' ');
  const out = [];
  for (const m of clean.matchAll(/has-\[([^\]]*)\]/g)) {
    const inner = m[1].trim();
    if (!/^[#.][\w-]*$/.test(inner)) continue;                       // 结构化查询（img 等）不误报
    if (allow.some((a) => a.file === file && a.inner === inner)) continue;   // 显式登记放行
    const line = clean.slice(0, m.index).split('\n').length;
    out.push({ file, inner, line });
  }
  return out;
}

{
  const offenders = [];
  const hits = [];
  const scan = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') scan(p); continue; }
      if (!e.name.endsWith('.eta')) continue;
      const rel = p.replace(SKILL_DIR, '').replace(/^\//, '');
      for (const o of hasVariantOffenders(read(p), { file: rel, allow: HAS_SELECTOR_ALLOWLIST })) {
        offenders.push(`${rel}:${o.line} has-[${o.inner}]（只有选择器、缺状态伪类）`);
        hits.push(`${rel}|${o.inner}`);
      }
    }
  };
  for (const d of ['mobile-template', 'desktop-template']) scan(join(SKILL_DIR, d));
  check('全模板 has-[…] 变体均带状态伪类', offenders.length === 0, offenders.slice(0, 8).join('; '));

  // 白名单条目必须真实命中（否则是死条目，说明规则早已不适用，应删）
  const stale = HAS_SELECTOR_ALLOWLIST.filter((a) => !hits.includes(`${a.file}|${a.inner}`))
    .map((a) => `${a.file} has-[${a.inner}] 未命中（无此写法或已带状态伪类，请删除该条目）`);
  check('has-[…] 白名单无死条目（条目均真实命中）', stale.length === 0, stale.join('; '));

  // 机制单测：证明「默认拒绝 + 登记放行」都真的成立（不是配了就等于放开）
  const demo = '<div class="group"><span class="hidden group-has-[#panel]:block">x</span></div>';
  const demoFile = 'demo.eta';
  const before = hasVariantOffenders(demo, { file: demoFile });
  const after = hasVariantOffenders(demo, {
    file: demoFile,
    allow: [{ file: demoFile, inner: '#panel', reason: '单测：绑定结构而非状态' }],
  });
  check('has-[…] 白名单机制：默认拒绝 / 登记后放行',
    before.length === 1 && after.length === 0,
    `default=${JSON.stringify(before)} allowed=${JSON.stringify(after)}`);
}

// ---- 场景 32：micro 档只服务「微标签/图标尺寸」（信息性标签 ≥ xs 的方向性棘轮）----
// WHY：记录在 SKILL.md 的提质方向——`micro`(11px) 是给「眉标/徽标这类非正文微标签」的档位；
// 承载信息的交互标签（底部导航、时间戳、统计/信息值）应 ≥ `xs`(12px)。本场景把该方向固化成规则：
// 具体元素（按数据变量/文案槽位定位）一旦回落 `text-micro` 即报错，防提质成果被后续改动悄悄回退；
// 反向断言徽标仍为 micro，防「一提质就全域升档」的反向漂移。
{
  const bad = [];
  const rules = [
    ['mobile-template/pages/chat.eta', /peerState/, '移动端在线状态', 'meta'],
    ['mobile-template/pages/chat.eta', /_m\.time/, '移动端消息时间戳', 'meta'],
    ['desktop-template/pages/chat.eta', /_c\.time/, '桌面端会话时间戳', 'meta'],
    ['desktop-template/pages/chat.eta', /todayLabel/, '桌面端日期分隔', 'meta'],
    ['desktop-template/pages/chat.eta', /_m\.time/, '桌面端消息时间戳', 'meta'],
    ['mobile-template/pages/home.eta', /_q\[1\]/, '移动端快捷入口标签', 'text-xs'],
    ['mobile-template/pages/profile.eta', /_a\.(label|value)/, '移动端资产标签/值', 'text-xs'],
  ];
  for (const [f, re, what, want] of rules) {
    const lines = read(resolve(SKILL_DIR, f)).split('\n').filter((l) => re.test(l));
    if (lines.length === 0) { bad.push(`${what}：在 ${f} 定位不到（规则失效，请更新场景 32）`); continue; }
    for (const l of lines) {
      if (l.includes('text-micro')) bad.push(`${what} 回落 text-micro（应 ≥ xs）：${f} ${l.trim().slice(0, 88)}`);
      else if (!l.includes(want)) bad.push(`${what} 未用 ${want}：${f} ${l.trim().slice(0, 88)}`);
    }
  }
  // 移动端 tabbar 由生成器产出（标签为 500 字重，无对应角色类 → 用 xs token）
  const gen = read(resolve(SKILL_DIR, 'scripts/generate-prototype.js'));
  const tabbar = (gen.match(/const buildTabbar = [\s\S]*?\n  };/) || [''])[0];
  if (!tabbar) bad.push('未定位到 buildTabbar（规则失效，请更新场景 32）');
  else {
    if (tabbar.includes('text-micro')) bad.push('移动端 tabbar 标签回落 text-micro（应 ≥ xs）');
    if (!tabbar.includes('text-xs font-medium')) bad.push('移动端 tabbar 标签未用 text-xs font-medium');
  }
  // 反向：微标签/徽标必须保持 micro
  for (const [f, re, what] of [
    ['mobile-template/pages/home.eta', /hero\.badge/, 'hero 微标签'],
    ['desktop-template/pages/chat.eta', /_c\.badge/, '未读计数徽标'],
    ['desktop-template/pages/profile.eta', /comingSoon/, '「即将上线」微标签'],
  ]) {
    const lines = read(resolve(SKILL_DIR, f)).split('\n').filter((l) => re.test(l));
    if (lines.length === 0) { bad.push(`${what}：在 ${f} 定位不到`); continue; }
    for (const l of lines) if (!l.includes('text-micro')) bad.push(`${what} 应为 micro 档：${f} ${l.trim().slice(0, 88)}`);
  }
  check('micro 档只服务微标签/图标尺寸（信息性标签 ≥ xs）', bad.length === 0, bad.join('; '));
}

// ---- 场景 33：`--reinit` 页集重建 SOP（审计为强制前置 + 显式授权 + 先备份后入位）----
// WHY：`--reinit` 是唯一能穿过「文件集变化一律硬拒」的入口，必须证明四件事：
// ① 缺 `--only` / 与 `--init` 并用会被拒；② 未授权时**审计报告已产出但仍硬拒**（审计是前置而非装饰）；
// ③ 授权 + `--write` 后旧基线进 BAK_ROOT、审计留档落 BAK_ROOT（本场景注入 GOLDEN_BAK_DIR
//    把 BAK_ROOT 隔离到临时副本内）；④ 重建后的基线自洽（普通干跑零差异）。
// 全程在 skill 目录的**临时副本**里跑（脚本按自身位置解析基线路径；备份根已迁出 skills 树，
// 靠注入 GOLDEN_BAK_DIR 把备份/审计隔离到临时副本内，**绝不会碰真备份**）。
// 副产物：本场景同时是 `utils/is-main.js` 的回归——临时副本落在 `/var/folders/...`（macOS 下
// `/var` 是 `/private/var` 的软链），旧写法 `import.meta.url === pathToFileURL(argv[1]).href`
// 在此**恒为 false**，子进程会 exit 0 空输出（静默 no-op，本轮真踩过）。若下面 ① 拿不到审计输出，先查这条。
{
  const tmp = mkdtempSync(join(tmpdir(), 'pp-reinit-'));
  try {
    const pkg = join(tmp, 'pkg');
    cpSync(SKILL_DIR, pkg, { recursive: true });
    const freeze = join(pkg, 'scripts', 'freeze-golden.js');
    const bakDir = join(pkg, 'golden-bak');   // 备份根隔离到临时副本内（靠 GOLDEN_BAK_DIR 注入）
    const runFreeze = (args) => spawnSync(process.execPath, [freeze, ...args], {
      cwd: pkg, encoding: 'utf8', env: { ...process.env, GOLDEN_BAK_DIR: bakDir },
    });
    const a1 = runFreeze(['--reinit', '--only', 'saas']);
    check('--reinit 未授权：审计已产出且硬拒',
      a1.status === 1
      && /旧基线 \d+ 文件 \/ 新产物 \d+ 文件/.test(a1.stdout)
      && /小结：变化文件 \d+ 个/.test(a1.stdout)
      && /需先逐条核对审计报告/.test(a1.stdout + a1.stderr),
      `status=${a1.status} stdout=${(a1.stdout || '').slice(0, 200)}`);

    const a2 = runFreeze(['--reinit']);
    check('--reinit 缺 --only 被拒', a2.status === 1 && /必须用 --only/.test(a2.stderr), a2.stderr);

    const a3 = runFreeze(['--reinit', '--init', '--only', 'saas']);
    check('--reinit 与 --init 互斥被拒', a3.status === 1 && /互斥/.test(a3.stderr), a3.stderr);

    const a4 = runFreeze(['--reinit', '--only', 'saas', '--allow-pageset-change', '--write']);
    const bakEntries = existsSync(bakDir) ? readdirSync(bakDir) : [];
    check('--reinit 授权后重建：旧基线备份 + 审计留档 + 基线入位',
      a4.status === 0
      && bakEntries.some((n) => /^saas-desktop-\d+$/.test(n))
      && bakEntries.some((n) => /^pageset-audit-saas-desktop-\d+\.log$/.test(n))
      && existsSync(join(pkg, 'fixtures', 'golden', 'saas', 'desktop', 'index.html')),
      `status=${a4.status} bak=[${bakEntries.slice(0, 6)}]`);

    const a5 = runFreeze(['--only', 'saas']);
    check('--reinit 重建后的基线自洽（普通干跑零差异）', a5.status === 0,
      `status=${a5.status}\n${(a5.stdout || '').slice(-300)}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- 场景 34：状态消息可编程确定（WCAG 4.1.3：面板切换 / 倒计时文案变化必须有播报）----
// WHY：登录态切换是**纯 CSS**（radio + has-[:checked]），倒计时文案由脚本逐秒改写——两者都是
// 「不改变焦点、不改变上下文」的状态变化：屏幕阅读器默认**不播报**（review 记为 P2/P3 无障碍缺陷）。
// 修复口径：① 面板切换 → 旁侧 role="status" 区域，每个 tab 一个 span，靠**同一套**
// `group-has-[#login-mode-<value>:checked]` 机制决定谁进入无障碍树（切换→文本变化→播报；
// 初始加载不播报）；② 倒计时 → **不能**把 live region 放按钮上（按钮文案每秒都变 → 每秒播报），
// 改为只在开始/结束两次写入旁侧 role="status" 节点。本场景锁住这两条接线，以及反向红线：
// 按钮上出现 aria-live 即报错（等于逐秒播报）。
{
  const tpl = (f) => resolve(SKILL_DIR, f);
  const L2 = COPY_LEXICON.other;
  const bad = [];

  for (const [f, g, hasMode] of [
    ['mobile-template/pages/login.eta', '_lg', true],
    ['desktop-template/pages/login.eta', '_lg', true],
    ['mobile-template/pages/register.eta', '_rg', false],
    ['desktop-template/pages/register.eta', '_rg', false],
  ]) {
    const src = read(tpl(f));
    // ① 播报节点齐备
    const node = src.match(/<p role="status"[^>]*data-code-status[^>]*>/);
    if (!node) bad.push(`${f} 缺 role="status" 的 data-code-status 节点`);
    else if (!/aria-live="polite"/.test(node[0])) bad.push(`${f} 播报节点缺 aria-live="polite"`);
    // ② 按钮挂播报文案，且**不得**自带 live region（否则逐秒播报）
    if (!src.includes(`data-status-sent="<%= ${g}.codeButton.statusSent %>"`)) bad.push(`${f} 按钮缺 data-status-sent`);
    if (!src.includes(`data-status-ready="<%= ${g}.codeButton.statusReady %>"`)) bad.push(`${f} 按钮缺 data-status-ready`);
    const btn = src.match(/<button type="button" data-send-code[^>]*>/);
    if (btn && /aria-live/.test(btn[0])) bad.push(`${f} 播报区挂在按钮上（会逐秒播报）：${btn[0].slice(0, 80)}`);
    // ③ 脚本只在开始/结束两次写播报（status.textContent 只出现在 say 里各一次）
    if ((src.match(/status\.textContent/g) || []).length !== 1) bad.push(`${f} 播报写入点不是唯一一处（逐秒写入？）`);
    for (const k of ['data-status-sent', 'data-status-ready']) {
      if (!src.includes(`b.getAttribute('${k}')`)) bad.push(`${f} 脚本未在开始/结束时写入 ${k}`);
    }
    // ④ 登录页另有面板切换播报：每个 tab 一个 span，用与面板同一套 :checked 机制
    if (hasMode) {
      if (!src.includes('data-mode-status')) bad.push(`${f} 缺 data-mode-status 播报区域`);
      for (const t of L2.login.tabs) {
        // 必须带**收尾引号**：漏了它，类属性会把后续标记整个吞掉（Eta 仍能渲染、静态子串断言仍通过，
        // 但浏览器里 span 全部 display:none —— 本轮真踩过，只有浏览器断言抓得到）
        if (!src.includes(`class="hidden group-has-[#login-mode-<%= _t.value %>:checked]/login:inline">`)) {
          bad.push(`${f} 面板播报未与 :checked 机制对齐（或缺类属性收尾引号）`);
          break;
        }
      }
    }
  }

  // ⑤ 词典：播报文案齐备（按 tabs 的每个 value）
  for (const t of L2.login.tabs) {
    if (typeof L2.login.modeStatus?.[t.value] !== 'string' || !L2.login.modeStatus[t.value]) {
      bad.push(`词典 other.login.modeStatus 缺 ${t.value}`);
    }
  }
  for (const [what, cb] of [['login', L2.login.codeButton], ['register', L2.register.codeButton]]) {
    for (const k of ['statusSent', 'statusReady']) {
      if (typeof cb?.[k] !== 'string' || !cb[k]) bad.push(`词典 other.${what}.codeButton.${k} 缺失`);
    }
    if (!/\{\{s\}\}/.test(cb?.statusSent || '')) bad.push(`词典 other.${what}.codeButton.statusSent 缺 {{s}} 占位符`);
  }
  check('状态消息播报接线（面板切换 + 倒计时）齐备且无逐秒播报', bad.length === 0, bad.slice(0, 6).join('; '));

  // ⑥ 产物级：Eta 渲染后「面板播报用的 :checked 类名」必须解析成具体值（防模板/词典失配后静默失效）
  const rendered = join(SKILL_DIR, 'fixtures', 'golden', 'account', 'mobile', 'pages', 'login.html');
  const prod = [];
  if (!existsSync(rendered)) prod.push('account/mobile 产物缺失（须先冻结 account 基线）');
  else {
    const html = read(rendered);
    if (!html.includes('data-mode-status')) prod.push('产物缺 data-mode-status');
    if (!html.includes(`class="hidden group-has-[#login-mode-${L2.login.tabs[1].value}:checked]/login:inline">`)) {
      prod.push('产物缺面板播报的 :checked 类名（或类属性收尾引号丢失）');
    }
    // 播报区域自身必须是完好标签：class 只能是 sr-only（若被吞标记，class 会变成一长串）
    const region = html.match(/<p role="status"[^>]*data-mode-status[^>]*>/);
    if (!region || !/class="sr-only"/.test(region[0])) prod.push(`面板播报区域标签不完整：${region ? region[0].slice(0, 120) : 'MISSING'}`);
    if (!html.includes('data-code-status')) prod.push('产物缺 data-code-status');
    if (!html.includes('已切换到')) prod.push('产物缺面板切换播报文案');
  }
  check('状态消息播报在产物中已解析（面板 :checked 类名 ↔ 文案）', prod.length === 0, prod.join('; '));
}

// ---- 场景 35：过程反馈的状态播报（WCAG 4.1.3：导出/提交等过程必须可播报，且形态可靠）----
// WHY：过程反馈（点击后需要等待的动作）有三条口径——① 播报区域必须**常驻**：禁止把 `hidden` 挂在
// live region 自身上（隐藏期间的内容变化多数读屏器**不播报**；本轮真踩：发布成功提示原本就是这么写的）；
// ② 显式 `role="status"` + `aria-live="polite"` + `aria-atomic="true"`（不依赖隐式值）；
// ③ 文案一律走词典（`data-*` 透传），脚本不硬编码；棘轮同时挡住「类属性漏收尾引号吞标记」形态。
// 浏览器层（点击后是否真播报）由 `scripts/verify-status-announcements.js` 实测。
{
  const bad = [];
  const statusTags = [];
  for (const dir of ['mobile-template', 'desktop-template']) {
    for (const e of readdirSync(join(SKILL_DIR, dir, 'pages'))) {
      if (!e.endsWith('.eta')) continue;
      const rel = `${dir}/pages/${e}`;
      const src = read(join(SKILL_DIR, rel));
      for (const m of src.matchAll(/<p\b[^>]*role="status"[^>]*>/g)) {
        const tag = m[0];
        statusTags.push(`${rel}:${tag}`);
        if (!/aria-live="polite"/.test(tag)) bad.push(`${rel} 播报节点缺 aria-live="polite"：${tag.slice(0, 80)}`);
        if (!/aria-atomic="true"/.test(tag)) bad.push(`${rel} 播报节点缺 aria-atomic="true"：${tag.slice(0, 80)}`);
        if (/class="[^"]*\bhidden\b/.test(tag)) bad.push(`${rel} 把 hidden 挂在 live region 自身（隐藏期不播报）：${tag.slice(0, 80)}`);
        if (!/class="[^"]*"\s*[^>]*?>$/.test(tag)) bad.push(`${rel} 播报节点 class 未闭合（会吞掉后续标记）：${tag.slice(0, 80)}`);
      }
    }
  }
  check('播报区域形态统一（常驻 + 显式 aria + class 闭合）', bad.length === 0 && statusTags.length >= 6, bad.length ? bad.slice(0, 5).join('; ') : `节点数=${statusTags.length}`);

  // 过程反馈接线：导出按钮 ↔ 常驻状态区 ↔ 词典文案
  const wire = [];
  const osrc = read(resolve(SKILL_DIR, 'desktop-template/pages/orders.eta'));
  if (!/data-export\b/.test(osrc)) wire.push('orders.eta 缺 [data-export] 按钮');
  for (const k of ['data-pending', 'data-done']) if (!osrc.includes(k)) wire.push(`orders.eta 按钮缺 ${k}`);
  if (!/<p\b[^>]*data-export-status[^>]*><\/p>/.test(osrc)) wire.push('orders.eta 缺**常驻**空的 [data-export-status] 节点');
  for (const k of ["querySelector('[data-export-status]')", "getAttribute('data-pending')", "getAttribute('data-done')"]) {
    if (!osrc.includes(k)) wire.push(`orders.eta 脚本未用 ${k}`);
  }
  for (const [what, sx] of [['other.orders', COPY_LEXICON.other.orders.exportStatus], ['ecommerce.orders', COPY_LEXICON.ecommerce.orders.exportStatus]]) {
    for (const k of ['pending', 'done']) if (typeof sx?.[k] !== 'string' || !sx[k]) wire.push(`词典 ${what}.exportStatus.${k} 缺失`);
  }
  check('导出过程反馈接线齐备（按钮 ↔ 常驻状态区 ↔ 词典文案）', wire.length === 0, wire.slice(0, 5).join('; '));

  // 产物级：冻结基线里形态完好（常驻、引号闭合、文案已解析），且 publish 不再是「隐藏 live region 自身」
  const prod = [];
  const po = join(SKILL_DIR, 'fixtures/golden/ecommerce/desktop/pages/orders.html');
  const pp = join(SKILL_DIR, 'fixtures/golden/ecommerce/desktop/pages/publish.html');
  if (!existsSync(po)) prod.push('ecommerce/desktop orders.html 缺失（须先冻结 ecommerce 基线）');
  else {
    const html = read(po);
    if (!html.includes('<p role="status" aria-live="polite" aria-atomic="true" class="w-full text-xs text-neutral-500 min-h-[1rem]" data-export-status></p>')) {
      prod.push('orders.html 状态区形态不符（或 class 引号丢失）');
    }
    if (!html.includes('data-pending="正在导出，请稍候…"')) prod.push('orders.html 按钮缺词典文案');
  }
  if (!existsSync(pp)) prod.push('ecommerce/desktop publish.html 缺失');
  else {
    const html = read(pp);
    if (!/<p role="status"[^>]*class="text-sm font-medium text-emerald-600"><span data-status class="hidden">/.test(html)) {
      prod.push('publish.html 成功提示不是「常驻区域 + 内层隐藏节点」形态');
    }
    if (/<p[^>]*role="status"[^>]*class="[^"]*\bhidden\b/.test(html)) prod.push('publish.html 仍把 hidden 挂在 live region 自身');
  }
  check('过程反馈播报在产物中形态完好（常驻 + 引号闭合 + 文案解析）', prod.length === 0, prod.slice(0, 5).join('; '));
}

// ---- 浏览器 harness（`--browser` opt-in：需本机 Chrome；不在默认路径里，避免 selfcheck 依赖浏览器）----
// WHY：交互（`verify-login-state` / `verify-status-announcements`）、版式（`verify-layout`）、
// 渲染字号（`snapshot-typography`）四者都证明「浏览器里真的成立」——static 断言测不到（见 plan §11.2）。
// 但四者都需 Chrome，故做成显式开关：默认不跑并**明说跳过**（防「以为跑过了」），加 `--browser` 才跑，
// 且缺 Chrome 时各自明确跳过并返回 0。**harness 失败必须进退出码**（曾经只打印，等于跑了不算数）。
let browserFailed = 0;
let browserSkipped = 0;
if (process.argv.includes('--browser')) {
  for (const [name, file] of [
    ['登录态纯 CSS 交互回归', 'verify-login-state.js'],
    ['过程反馈状态播报回归', 'verify-status-announcements.js'],
    ['版式不变量回归', 'verify-layout.js'],
    ['排版字号实测 + 视觉留档', 'snapshot-typography.js'],
  ]) {
    const r = spawnSync(process.execPath, [join(SKILL_DIR, 'scripts', file)], { encoding: 'utf8' });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    // 两种「环境不可用」按跳过计（脚本自身已 exit 0 且打印了原因）：缺 Chrome / Tailwind CDN 不可达
    const skipReason = /未找到 Chrome/.test(out) ? '无 Chrome' : (/Tailwind CDN 未生效/.test(out) ? 'Tailwind CDN 未生效' : '');
    const skipped = !!skipReason;
    const tail = out.trim().split('\n').filter(Boolean).slice(skipped ? -2 : -1).join(' | ');
    console.log(`${r.status === 0 ? '✔' : '✘'} 浏览器 harness：${name}${skipped ? `（跳过：${skipReason}）` : ''}`);
    console.log(`    ${tail.slice(0, 200)}`);
    if (r.status !== 0) browserFailed++;
    if (skipped) browserSkipped++;
  }
  // 负例自测：证明版式闸门不是空断言（不生成产物，只造一个坏页面）
  const st = spawnSync(process.execPath, [join(SKILL_DIR, 'scripts', 'verify-layout.js'), '--selftest'], { encoding: 'utf8' });
  const stOut = `${st.stdout || ''}${st.stderr || ''}`;
  if (/未找到 Chrome/.test(stOut)) console.log('    （版式负例自测跳过：无 Chrome）');
  // 判据用脚本自报的结论串，而不是单纯 rc：无 Chrome 时它 exit 0 但**什么都没验**，
  // 只看 rc 会把「没跑」记成「通过」（本项目已知的假绿模式）。
  check('版式闸门负例自测（负例能红、绿例不误报）', st.status === 0 && !/闸门失效/.test(stOut),
    stOut.trim().split('\n').filter(Boolean).slice(-2).join(' | '));
  // WHY 要这条：此前 `browserFailed` 只用于打印、**不进退出码**——4 个 harness 全红也照样 exit 0，
  // 等于「跑了但不算数」。浏览器层是本 skill 唯一能验证「真渲染/真交互」的地方，必须能红。
  check('浏览器 harness 全部通过（--browser）', browserFailed === 0,
    `失败 ${browserFailed} 个${browserSkipped ? `；跳过 ${browserSkipped}/4` : ''}`);
} else {
  console.log('ℹ 未跑浏览器 harness（verify-login-state / verify-status-announcements / verify-layout / snapshot-typography）——加 --browser 运行（需本机 Chrome）');
}

// ---- 场景 36：logger 轮转纯逻辑（防回归：树内守卫判定 + 归档正则；零 IO）----
// 背景：轮转核心逻辑此前只在一次性沙箱验证过，selfcheck 无感知——改坏一行门禁也不会红。
{
  const SKILLS_ROOT = resolve(homedir(), '.config/opencode', 'skills');
  check('logger 守卫：skills 树自身 → 拦截', insideSkillsTree(SKILLS_ROOT) === true);
  check('logger 守卫：树内 skill 子目录 → 拦截', insideSkillsTree(join(SKILLS_ROOT, 'some-skill')) === true);
  check('logger 守卫：树内 "..foo" 目录名 → 拦截（原 fail-open 点）', insideSkillsTree(join(SKILLS_ROOT, '..foo')) === true);
  check('logger 守卫：resolve 归一后树内（skills/../skills/x）→ 拦截', insideSkillsTree(join(SKILLS_ROOT, '..', 'skills', 'x')) === true);
  check('logger 守卫：兄弟目录 skills-backup → 放行', insideSkillsTree(resolve(SKILLS_ROOT, '..', 'skills-backup')) === false);
  check('logger 守卫：父目录 ~/.config/opencode → 放行', insideSkillsTree(resolve(SKILLS_ROOT, '..')) === false);
  check('golden 备份根 BAK_ROOT 已移出 skills 树（否则写备份会触发全量 rescan）', insideSkillsTree(BAK_ROOT) === false, `BAK_ROOT=${BAK_ROOT}`);
  check('logger 归档正则：正常 ISO 归档 → 匹配', ARCHIVE_RE.test('prototype-generation.2026-10-16T10-26-40-756Z.log.gz') === true);
  check('logger 归档正则：独立归档 .log.1.gz → 不匹配（排除在池清理外）', ARCHIVE_RE.test('prototype-generation.log.1.gz') === false);
  check('logger 归档正则：当前日志 prototype-generation.log → 不匹配', ARCHIVE_RE.test('prototype-generation.log') === false);
}

// ---- 场景 37：文档-代码一致性（SKILL.md 点名的东西必须真实存在）----
// 背景：`interfaces.js` 自陈「仅文档作用、无运行时导出」，故 SKILL.md 曾点名 LLMClient/ImageProvider
// 而两者从未实现（G6）；场景 36 落地后正文也未同步。纯字符串扫描、零依赖。
// 注意：只扫「有确定契约的两类」——`interfaces.js`（…）括号内的接口名、`场景 NN` 号；
// 不扫自由散文（那会逼着文档写死措辞，反而制造新的漂移）。
{
  const skillMd = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const ifaceSrc = readFileSync(join(SKILL_DIR, 'interfaces.js'), 'utf8');
  const selfSrc = readFileSync(fileURLToPath(import.meta.url), 'utf8');

  const m = skillMd.match(/`interfaces\.js`（([^）]*)）/);
  const named = m ? m[1].split('/').map((s) => s.trim().replace(/`/g, '')).filter(Boolean) : [];
  const undefinedIface = named.filter((n) => !new RegExp(`@typedef\\s*\\{[^}]*\\}\\s*${n}\\b`).test(ifaceSrc));
  check(
    '文档一致性：SKILL.md 点名的接口都在 interfaces.js 有 @typedef',
    named.length > 0 && undefinedIface.length === 0,
    `点名=${named.join('/')}；缺定义=${undefinedIface.join(',') || '无'}`,
  );

  const refs = [...new Set([...skillMd.matchAll(/场景\s*(\d+)/g)].map((x) => Number(x[1])))];
  const defined = new Set([...selfSrc.matchAll(/场景\s*(\d+)[：:]/g)].map((x) => Number(x[1])));
  const missing = refs.filter((n) => !defined.has(n));
  check(
    '文档一致性：SKILL.md 引用的 selfcheck 场景号都真实存在',
    refs.length > 0 && missing.length === 0,
    `引用=${refs.join(',')}；未定义=${missing.join(',') || '无'}`,
  );

  // 场景块计数：SKILL.md 自述的「N 个场景块」必须等于本文件实际块数。
  // 该数字连续两批漂移（47→48→49）且无门禁 ⇒ 由自检自己兜住，新增/合并场景必须同步。
  const declaredBlocks = skillMd.match(/全链路回归（(\d+)\s*个场景块）/);
  const actualBlocks = (selfSrc.match(/^\/\/ ---- 场景/gm) || []).length;
  check(
    '文档一致性：SKILL.md 声明的场景块数 == selfcheck.js 实际块数',
    !!declaredBlocks && Number(declaredBlocks[1]) === actualBlocks,
    `声明=${declaredBlocks ? declaredBlocks[1] : '未声明'}；实际=${actualBlocks}`,
  );

  // 平台页集声明：SKILL.md「平台构建策略」写死的两端可用页必须与模板目录同源。
  // WHY：写错会让上层 agent 在选平台前给出错误建议（saas/tool 兜底 PRD 在移动端会掉 3 页）。
  // 匹配不到声明行 ⇒ 判红（不能退化成 `m && check(...)` 的空断言）。
  {
    const tplSet = (p) => new Set(readdirSync(join(SKILL_DIR, p, 'pages')).filter((f) => f.endsWith('.eta')).map((f) => f.slice(0, -4)));
    const mobileTpl = tplSet('mobile-template');
    const desktopTpl = tplSet('desktop-template');
    const declaredMobile = skillMd.match(/移动端可用页（(\d+)）：`([^`]+)`/);
    const listedMobile = declaredMobile ? declaredMobile[2].split('/').filter(Boolean) : [];
    check(
      '文档一致性：SKILL.md 声明的移动端可用页（数量+名单）== mobile-template/pages',
      !!declaredMobile && Number(declaredMobile[1]) === mobileTpl.size
        && listedMobile.length === mobileTpl.size && listedMobile.every((p) => mobileTpl.has(p)),
      declaredMobile
        ? `声明=${declaredMobile[1]} 名单=${listedMobile.join('/')}；实际=${mobileTpl.size} ${[...mobileTpl].sort().join('/')}`
        : '未匹配到「移动端可用页（N）：`…`」声明',
    );

    const declaredDesktopCount = skillMd.match(/桌面端可用页（(\d+)）/);
    const declaredOnly = skillMd.match(/桌面专属页（(\d+)）：`([^`]+)`/);
    const listedOnly = declaredOnly ? declaredOnly[2].split('/').filter(Boolean) : [];
    const actualOnly = [...desktopTpl].filter((p) => !mobileTpl.has(p)).sort();
    check(
      '文档一致性：SKILL.md 声明的桌面端页数 + 桌面专属页 == desktop-template 实际',
      !!declaredDesktopCount && Number(declaredDesktopCount[1]) === desktopTpl.size
        && !!declaredOnly && Number(declaredOnly[1]) === actualOnly.length
        && listedOnly.length === actualOnly.length && actualOnly.every((p) => listedOnly.includes(p)),
      `声明桌面=${declaredDesktopCount ? declaredDesktopCount[1] : '未声明'} 专属=${declaredOnly ? declaredOnly[2] : '未声明'}；实际桌面=${desktopTpl.size} 专属=${actualOnly.join('/')}`,
    );
  }
}

// ---- 场景 38：可选主题（F4-a）----
// WHY 单独立场景：主题是纯加法，三类错都**不会报错**，只会静默失效——
//   1) 引用了不存在的色板/字体栈（数据错，只有自检看得见）；
//   2) `themes/` 里内联色值（等于设计令牌有第二份事实来源，改 tokens 时必漂移）；
//   3) 三个消费点只接了一两处（配色换了、占位图/标题字体没换），产物看起来照样「正常」。
// 第 3 类必须**真调三个函数**去断言：只比较主题数据与预设数据，永远发现不了「漏传参」。
{
  // a) 注册表引用可解析 + 基准字体栈与 fontFamily 同源（后者防「两处各写一份字体串」）
  const brokenRefs = [];
  for (const [key, def] of Object.entries(THEMES)) {
    if (!resolveSwatch(def.primary)) brokenRefs.push(`${key}.primary=${def.primary}`);
    for (const [slot, sw] of Object.entries(def.accents || {})) if (!resolveSwatch(sw)) brokenRefs.push(`${key}.accents.${slot}=${sw}`);
    for (const [slot, sw] of Object.entries(def.gradients || {})) if (!resolveSwatch(sw)) brokenRefs.push(`${key}.gradients.${slot}=${sw}`);
    for (const [slot, fs] of Object.entries(def.fonts || {})) if (!fontStacks[fs]) brokenRefs.push(`${key}.fonts.${slot}=${fs}`);
  }
  const stackDrift = [];
  if (fontStacks.systemSans !== fontFamily.sans) stackDrift.push('systemSans≠fontFamily.sans');
  if (fontStacks.editorialSerif !== fontFamily.display) stackDrift.push('editorialSerif≠fontFamily.display');
  check(
    '主题注册表：色板/字体栈引用全部可解析，且基准栈与 fontFamily 同源',
    Object.keys(THEMES).length >= 1 && brokenRefs.length === 0 && stackDrift.length === 0,
    `坏引用=${brokenRefs.join(',') || '无'}；字体栈漂移=${stackDrift.join(',') || '无'}`,
  );

  // b) themes/ 零颜色字面量（best-effort：字符串拼接可绕过，兜底靠 a 的可解析断言）
  const themeDir = join(SKILL_DIR, 'themes');
  const themeFiles = readdirSync(themeDir).filter((n) => n.endsWith('.js'));
  const colorLiteral = [];
  for (const f of themeFiles) {
    const src = stripComments(read(join(themeDir, f)));
    for (const m of src.matchAll(/#[0-9a-fA-F]{3,8}\b|hsl\(|rgba?\(/g)) colorLiteral.push(`${f}: ${m[0]}`);
  }
  check('主题目录零颜色字面量（色值唯一来源仍是 constants.js）', themeFiles.length > 0 && colorLiteral.length === 0, colorLiteral.join(',') || '无命中');

  // c) 缺省向后兼容：不给主题时与旧签名逐值相同（默认路径不变的前提）
  const compatBad = PRODUCT_TYPES.filter((pt) => generateColorScheme(pt).primary[600] !== generateColorScheme(pt, null, { theme: null }).primary[600]);
  check('主题缺省向后兼容：generateColorScheme(t) 与 {theme:null} 结果一致', compatBad.length === 0, `不一致=${compatBad.join(',') || '无'}`);

  // d) 三个消费点**真接线**（任一漏传参 → 本场景必红）
  const probe = (() => { try { return getTheme('indigo'); } catch { return null; } })();
  const baseScheme = generateColorScheme('saas');
  const themeScheme = probe ? generateColorScheme('saas', null, { theme: probe }) : null;
  check('接线 1/3：配色方案随主题变化', !!probe && themeScheme.primary[600] !== baseScheme.primary[600] && themeScheme.themeKey === 'indigo',
    probe ? `默认=${baseScheme.primary[600]}；主题=${themeScheme.primary[600]}；themeKey=${themeScheme.themeKey}` : '主题 indigo 无法解析（见上一条）');

  const baseInline = generateInlineScript(generateTailwindConfig({ productType: 'saas' }, 'mobile'));
  const themeInline = probe ? generateInlineScript(generateTailwindConfig({ productType: 'saas' }, 'mobile', { theme: probe })) : '';
  const probeHsl = probe ? `hsl(${probe.primaryHsl.h},` : '';
  // 在沙箱里真执行插件：`addComponents` 两次定义同一选择器时后者覆盖，
  // 故主题版 `.page-title` 的 fontFamily 必须等于主题 display 栈；
  // 若实现改用闭包变量，沙箱里会拿到 undefined/抛错 → 这条能直接抓到（闭包不进 toString）。
  const themeRole = themeInline ? resolveInlineUtilities(themeInline, ['.page-title']) : { ok: false, values: {} };
  const baseRole = resolveInlineUtilities(baseInline, ['.page-title']);
  const themeFont = themeRole.ok ? themeRole.values['.page-title']?.fontFamily : undefined;
  const baseFont = baseRole.ok ? baseRole.values['.page-title']?.fontFamily : undefined;
  // 归一化再比：config 里的 fontFamily 是被切分/去引号后的数组（Tailwind 的既有形态），
  // 而 `theme.fontStacks.display` 是原始 CSS 串（含引号）。
  const normFont = (s) => String(s ?? '').replace(/["']/g, '').replace(/\s+/g, ' ').trim();
  check('接线 2/3：内联 Tailwind 配置随主题变化（主色 + 标题 display 字体）',
    !!probe && themeInline.includes(probeHsl) && !baseInline.includes(probeHsl) && normFont(themeFont) === normFont(probe.fontStacks.display) && !baseFont,
    `含主题色相=${themeInline.includes(probeHsl)}/默认=${baseInline.includes(probeHsl)}；标题字体=${JSON.stringify(themeFont)}；默认标题字体=${JSON.stringify(baseFont)}`);

  const basePh = generatePlaceholder(['t'], 400, 300, 'saas');
  const themePh = probe ? generatePlaceholder(['t'], 400, 300, 'saas', { theme: probe }) : '';
  check('接线 3/3：降级占位图底色随主题变化', !!probe && themePh !== basePh && decodeURIComponent(themePh).includes(probeHsl),
    `不同=${themePh !== basePh}；含主题色相=${decodeURIComponent(themePh).includes(probeHsl)}`);

  // 前三条只证明「函数认主题」，证明不了 `generate-prototype` 真把 theme 传给了三处。
  // 故再跑一次最小端到端：产物内联配置必须带主题色相、report 必须记下主题键。
  {
    const ws = newWs(MIN_PRD);
    const g = spawnSync(process.execPath, [GEN, '--platform', 'mobile', '--theme', 'indigo', '--page', 'home', '--quiet'], {
      env: { ...process.env, WORKSPACE: ws, PREFLIGHT: '0' }, encoding: 'utf8',
    });
    let report = null;
    try { report = JSON.parse(read(join(ws, 'prototype', 'generation-report.json'))); } catch { /* 读取失败按断言失败处理 */ }
    const html = read(join(ws, 'prototype', 'pages', 'home.html'));
    // 默认（ecommerce 预设）主色相：主题产物里不应再出现它
    const defHue = `${generateColorScheme('ecommerce').primary[500].split(',')[0]},`;
    // 占位图是**内联 data URI**（onerror 兜底），其 fill 用 URL 编码的 hsl ——
    // 这条与内联 config 的明文 hsl 不同源，故能单独证明 `generateImageMap` 也接到了 theme。
    const phMarker = `fill%3D%22hsl(${probe ? probe.primaryHsl.h : 0}%2C`;
    check('接线 4/4：CLI 端到端（--theme 产物：内联配置 + 占位图 + report.theme 全跟上）',
      g.status === 0 && !!report && report.theme === 'indigo' && !!probe && html.includes(probeHsl) && html.includes(phMarker) && !html.includes(defHue),
      `exit=${g.status}；report.theme=${report ? report.theme : 'null'}；含主题色相=${html.includes(probeHsl)}；占位图随主题=${html.includes(phMarker)}；残留默认色相=${html.includes(defHue)}${g.status === 0 ? '' : `；stderr=${String(g.stderr || '').slice(-160)}`}`);
    rmSync(ws, { recursive: true, force: true });
  }

  // e) 字体栈可辨性：四个栈两两不同（防复制粘贴同一栈，让「配对」名存实亡）
  const stackValues = Object.values(fontStacks);
  check('主题字体栈四个值两两不同', stackValues.length === 4 && new Set(stackValues).size === 4, `唯一值=${new Set(stackValues).size}/${stackValues.length}`);
}

// ---- 场景：节截断锚点（`###` 子标题不得截断整节）----
// 历史 bug：lookahead `(?=\n##|\n#|$)` 的 `\n#` 会命中 `###`，把用户流程/页面清单/核心功能
// 整节截成一行 ⇒ flows 恒空、页面顺序退化为固定表。修复后 `##`/`#` 仍截断（上界断言）。
{
  const flowPrd = `# 商城
## 用户流程
### 浏览下单
- 在首页页面，点击商品
- 在详情页面，点击购买
### 售后申请
- 在订单页面，点击申请
## 其它节
- 与流程无关的内容
`;
  const m = parsePRD(flowPrd);

  // A：单次捕获归并（当前实现语义）——name 取首个 ### 标题，steps 为两段合并
  const f0 = m.userFlows[0];
  check('节截断 A：含 ### 的用户流程能解析出 flow（归并成 1 个，name/steps 合并）',
    m.userFlows.length === 1 && !!f0 && f0.name === '浏览下单' && f0.steps.length === 3,
    `flows=${m.userFlows.length} name=${f0 && f0.name} steps=${f0 && f0.steps.length}`);

  // B：上界——必须止于下一个 `##`，不得把其它节内容吞进流程
  const leaked = (f0 ? f0.steps : []).some((s) => /无关/.test(s.description || ''));
  check('节截断 B：用户流程必须止于下一个 ## 节（不吞其它节内容）', !leaked && f0 && f0.steps.length === 3,
    `steps=${JSON.stringify(f0 ? f0.steps.map((s) => s.description) : null)}`);

  // C：同一模式在页面清单节（原 169-172）——### 子标题下的页面条目不得丢
  const pagePrd = `# 商城
## 页面清单
### 前台
- home：首页
- list：列表
### 后台
- dashboard：工作台
## 功能清单
- 与页面无关的条目
`;
  const pages = parsePRD(pagePrd).corePages;
  check('节截断 C：页面清单含 ### 子标题时页面集不丢',
    pages.length === 3 && ['home', 'list', 'dashboard'].every((p) => pages.includes(p)),
    JSON.stringify(pages));

  // D：修复必须对排序真实生效——频次高的页面要排到固定表序（home 优先）之前
  const sortPrd = `# 商城
## 核心功能
- [P0] 下单
## 用户流程
### 下单
- 在订单页面，点击确认
- 在订单页面，点击支付
- 在详情页面，点击购买
## 页面清单
- home：首页
- detail：详情
- orders：订单
`;
  const sm = parsePRD(sortPrd);
  const priority = getPagePriority(sm);
  check('节截断 D：getPagePriority 按流程频次排序（orders 领先 home，非固定表序）',
    priority[0] === 'orders' && priority[priority.length - 1] === 'home',
    JSON.stringify(priority));

  // E：无「核心功能/功能列表/features」节时不得中断解析（`match(...) || match(...)` 三者皆 null
  //    会 `for…of null` 抛错，被 parsePRD 的 catch 吞掉 ⇒ 后续步骤（非功能性需求）整段丢失）
  const noFeaturePrd = `# 商城
## 非功能性需求
- 性能：首屏 2 秒内
- 兼容：主流浏览器
## 页面清单
- home：首页
`;
  const nm = parsePRD(noFeaturePrd);
  check('节截断 E：缺核心功能节不得中断解析（非功能性需求仍被解析）',
    nm.features.length === 0 && nm.nonFunctional.length === 2 && nm.corePages.includes('home'),
    `features=${nm.features.length} nonFunctional=${nm.nonFunctional.length} pages=${JSON.stringify(nm.corePages)}`);
}

// ---- 场景：未闭合标签门禁（malformedTag）----
// 历史 bug：desktop-template/pages/form.eta 的 <textarea> 缺 '>'，渲染成
// `... aria-required="true"</textarea>`，浏览器把 `</textarea>` 当属性吞掉，
// 其后所有 DOM 变成 textarea 的文本，提交按钮消失。三维 golden 门禁不看这块，故单独立门。
{
  const page = (body) => `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>创建商品</title></head>
<body><main class="p-6">
<h1>创建商品</h1>
<p>填写商品的基本信息，包括名称、价格与说明，保存后即可在列表中看到这条记录。</p>
${body}
<p>价格必须大于零，库存必须为非负整数，提交之前请再次确认这些内容是否正确。</p>
</main></body></html>`;

  const probe = (html) => {
    const ws = newWs(MIN_PRD);
    mkdirSync(join(ws, 'prototype'), { recursive: true });
    writeFileSync(join(ws, 'prototype', 'form.html'), html);
    const v = verifyJson(ws);
    rmSync(ws, { recursive: true, force: true });
    return v;
  };

  // 负例：textarea 缺 '>' —— 必须红（malformedFail 计入 passed）
  const bad = probe(page('<label>商品说明<textarea id="desc" class="input" placeholder="请输入价格说明" aria-required="true"</textarea></label>'));
  check('未闭合标签门禁：负例（textarea 缺 >）必须红', bad.malformedFail === 1 && bad.passed === false, JSON.stringify(bad));

  // 正例 1：正常闭合不得误报
  const good = probe(page('<label>商品说明<textarea id="desc" class="input" placeholder="请输入价格说明"></textarea></label>'));
  check('未闭合标签门禁：正例（正常 textarea）必须绿', good.malformedFail === 0 && good.passed === true, JSON.stringify(good));

  // 正例 2：内联 script 里的 `<` 与 HTML 片段不得误报（证明先剔除 script 再判定）
  const scripted = page(`<label>商品说明<textarea id="desc" class="input"></textarea></label><script>const tpl = '<div class="x">'; if (1 < 2) { document.title = 'ok'; }</script>`);
  const sc = probe(scripted);
  check('未闭合标签门禁：正例（内联 script 含 < 与 HTML 片段）必须绿', sc.malformedFail === 0 && sc.passed === true, JSON.stringify(sc));
}

// ---- 场景 39：需求文档导入（F2-docs）----
// WHY 单独立场景：`--from=` 的失败全是「看起来成功」——
//   1) 页名静默降级：未登记词被 `filter(Boolean)` 丢掉、或整份退化成回退 4 页默认集；
//   2) 假设清单落盘了但下游读不回（`prdPath` 归一相等 + `prdSha1` 双条件任一不匹配即静默 `[]`）；
//   3) 别名误挂**默认**解析分支——golden 只认产物，改坏默认分支也不会红。
// 故 ①~④ 用纯函数钉规范值，⑤~⑦ 用 CLI 实跑钉落盘链路与退出码。
{
  const docFixture = join(SKILL_DIR, 'fixtures', 'docs', 'freeform.md');
  const WANT_DOC_PAGES = ['home', 'discover', 'list', 'detail', 'orders', 'publish']; // 规范值，禁止实跑回填
  const sameSet = (a, b) => a.length === b.length && b.every((p) => a.includes(p));

  const { meta: docMeta, assumptions } = parseDoc(read(docFixture));

  // ① 页集：业务词经别名收敛、未登记词不进页集；且全部落在双端交集 10 页内
  check('F2-docs ①：freeform 文档页集 = 规范值 6 页，且全部在 INTER_10 内',
    sameSet(docMeta.corePages, WANT_DOC_PAGES) && docMeta.corePages.every((p) => INTER_10.has(p)),
    `实得=${JSON.stringify(docMeta.corePages)}，期望=${JSON.stringify(WANT_DOC_PAGES)}`);

  // ②a 未登记页名只记假设、不改页集（「钱包 / 会员卡包」既不在页集也不该悄悄变成 profile）
  const pageAssumptions = assumptions.filter((a) => a.startsWith('[页面] '));
  check('F2-docs ②a：「钱包 / 会员卡包」进假设清单且不污染页集',
    pageAssumptions.some((a) => a.includes('钱包')) && pageAssumptions.some((a) => a.includes('会员卡包'))
      && !docMeta.corePages.includes('profile'),
    `页面类假设=${JSON.stringify(pageAssumptions)}；页集含 profile=${docMeta.corePages.includes('profile')}`);

  // ②b 反向陷阱：「## 功能」节里的词绝不参与页集推断（否则收藏夹→profile、「订单管理」→orders）
  check('F2-docs ②b：功能节词（订单管理/收藏夹）不进假设也不进页集',
    !assumptions.some((a) => a.includes('订单管理') || a.includes('收藏夹'))
      && !docMeta.corePages.includes('profile'),
    `假设命中=${JSON.stringify(assumptions.filter((a) => a.includes('订单管理') || a.includes('收藏夹')))}`);

  // ③ 产出的 PRD 必须是「规范 PRD」：六节标题逐字命中 validatePRD，errors 与 warnings 双零；
  //    且**回读**页集必须仍是规范 6 页 —— 只看 validatePRD 会放过「页面清单搬原文条目」这类回归：
  //    产出 PRD 仍合法，但下游 parsePRD 丢词后回退默认 4 页，而 e2e 用 `--page home,list` 照样全绿。
  {
    const ws = newWs('');
    const r = spawnSync(process.execPath, [PRD, `--from=${docFixture}`], { env: { ...process.env, WORKSPACE: ws }, encoding: 'utf8' });
    const generated = read(join(ws, 'docs', 'prd.md'));
    const v = generated ? validatePRD(generated) : { errors: ['未产出'], warnings: [] };
    const roundTrip = generated ? parsePRD(generated).corePages : [];
    // 可见性：被丢弃的页名必须以 `> [假设]` 出现在**页面清单节内**（否则用户打开 PRD
    // 只会看到页少了，不知道为什么）；同时它不能是 `- 条目`，否则又会被 parsePRD 收回页集。
    const visible = !!generated && generated.includes('> [假设] 「钱包」') && generated.includes('> [假设] 「会员卡包」');
    check('F2-docs ③：--from= 产出的 PRD 过 validatePRD（双零）、回读页集 = 规范 6 页、并标明被丢弃页',
      r.status === 0 && v.errors.length === 0 && v.warnings.length === 0 && sameSet(roundTrip, WANT_DOC_PAGES) && visible,
      `exit=${r.status}；errors=${JSON.stringify(v.errors)}；warnings=${JSON.stringify(v.warnings)}；回读=${JSON.stringify(roundTrip)}；标明丢弃页=${visible}${r.status === 0 ? '' : `；stderr=${String(r.stderr || '').slice(-160)}`}`);
    rmSync(ws, { recursive: true, force: true });
  }

  // ④ 回归钉：三条 golden fixture 的页集是**常量表**（防止默认分支被顺手改坏）
  {
    const CANON = [
      ['ecommerce', ['home', 'discover', 'list', 'detail', 'publish', 'chat', 'orders', 'profile']],
      ['saas', ['dashboard', 'orders', 'list', 'detail', 'form', 'settings', 'profile']],
      ['account', ['home', 'profile', 'login', 'register']],
    ];
    const bad = [];
    for (const f of GOLDEN_FIXTURES) {
      const want = (CANON.find(([n]) => n === f.name) || [null, []])[1];
      const got = parsePRD(read(prdPathOf(f))).corePages;
      if (!sameSet(got, want)) bad.push(`${f.name}: ${JSON.stringify(got)}`);
    }
    check('F2-docs ④：三条 fixture 的默认解析页集未漂移（8/7/4 规范值）', bad.length === 0, bad.join('；') || '无漂移');
  }

  // ④b 永久合成断言：别名只在 tolerant 分支生效；默认分支遇「购物车」必须仍（丢词后）只留 home
  {
    const synth = parsePRD('# 商城\n## 页面清单\n- 首页\n- 购物车\n').corePages;
    check('F2-docs ④b：默认解析分支不吃别名（home 单页，购物车不入集）',
      synth.length === 1 && synth[0] === 'home', JSON.stringify(synth));
  }

  // ⑤ round-trip 复位：`--from=` 之后改用原话重新生成，假设清单必须自动失效
  //    （assumptions 文件不是 `--from` 分支删的，只能靠 prdSha1 守卫判死；这条是那个守卫的唯一凭据）
  {
    const ws = newWs('');
    const a = spawnSync(process.execPath, [PRD, `--from=${docFixture}`], { env: { ...process.env, WORKSPACE: ws }, encoding: 'utf8' });
    const b = spawnSync(process.execPath, [PRD, '做个二手书交易小程序'], { env: { ...process.env, WORKSPACE: ws }, encoding: 'utf8' });
    spawnSync(process.execPath, [GEN, '--platform', 'mobile', '--page', 'home', '--quiet'], { env: { ...process.env, WORKSPACE: ws, PREFLIGHT: '0' }, encoding: 'utf8' });
    let report = null;
    try { report = JSON.parse(read(join(ws, 'prototype', 'generation-report.json'))); } catch { /* 无报告按断言失败 */ }
    check('F2-docs ⑤：原话重生成后假设清单失效（prdSource=prd、assumptions=[]）',
      a.status === 0 && b.status === 0 && !!report && report.prdSource === 'prd' && Array.isArray(report.assumptions) && report.assumptions.length === 0,
      `exit=${a.status}/${b.status}；prdSource=${report ? report.prdSource : 'null'}；assumptions=${report ? JSON.stringify(report.assumptions) : 'null'}`);
    rmSync(ws, { recursive: true, force: true });
  }

  // ⑥ CLI 端到端：文档 → PRD → 生成 → 闸门。`copyDomainSkipped===false` 必须显式断言，
  //    否则 report 缺 productType 时闸门会整体跳过文案域而仍然 passed（见 e2e 注释 b）。
  {
    const ws = newWs('');
    const p = spawnSync(process.execPath, [PRD, `--from=${docFixture}`], { env: { ...process.env, WORKSPACE: ws }, encoding: 'utf8' });
    const g = spawnSync(process.execPath, [GEN, '--platform', 'mobile', '--page', 'home,list', '--quiet'], { env: { ...process.env, WORKSPACE: ws, PREFLIGHT: '0' }, encoding: 'utf8' });
    const v = verifyJson(ws);
    let report = null;
    try { report = JSON.parse(read(join(ws, 'prototype', 'generation-report.json'))); } catch { /* 无报告按断言失败 */ }
    check('F2-docs ⑥：CLI 端到端（文档导入 → 生成 → 闸门 passed，report 三字段就位）',
      p.status === 0 && g.status === 0 && v.passed === true && v.copyFail === 0 && v.copyDomainSkipped === false
        && !!report && report.prdSource === 'doc' && Array.isArray(report.assumptions) && report.assumptions.length >= 2
        && Array.isArray(report.prdWarnings) && report.prdWarnings.length === 0,
      `exit=${p.status}/${g.status}；passed=${v.passed} copyFail=${v.copyFail} skipped=${v.copyDomainSkipped}；prdSource=${report ? report.prdSource : 'null'}；assumptions=${report ? report.assumptions.length : 'null'}；prdWarnings=${report ? JSON.stringify(report.prdWarnings) : 'null'}`);
    rmSync(ws, { recursive: true, force: true });
  }

  // ⑦ 退出码：三条误用必须硬失败（空格式会被当成需求原话 → 静默覆盖用户 PRD，最难排查）；
  //    另断言 `--dry-run` 只打印不落盘（否则「预览」也会改写用户的 docs/）
  {
    const ws = newWs('');
    const code = (...a) => spawnSync(process.execPath, [PRD, ...a], { env: { ...process.env, WORKSPACE: ws }, encoding: 'utf8' }).status;
    const codes = [code('--from', docFixture), code('--from='), code(`--from=${docFixture}`, '原话'), code(`--from=${docFixture}`)];
    // dry-run 单独用干净 ws：newWs('') 预置的 prd.md 是空串，若 dry-run 落盘就不会再是空
    const dryWs = newWs('');
    const dry = spawnSync(process.execPath, [PRD, `--from=${docFixture}`, '--dry-run'], { env: { ...process.env, WORKSPACE: dryWs }, encoding: 'utf8' });
    const dryClean = dry.status === 0 && read(join(dryWs, 'docs', 'prd.md')) === ''
      && !existsSync(join(dryWs, 'docs', 'prd-assumptions.json'));
    check('F2-docs ⑦：退出码 0/1/1/1（单用成功；空格式/空值/与原话同给均失败）+ --dry-run 不落盘',
      codes.join(',') === '1,1,1,0' && dryClean, `实得=${codes.join(',')}；dry-run 干净=${dryClean}`);
    rmSync(ws, { recursive: true, force: true });
    rmSync(dryWs, { recursive: true, force: true });
  }

  // ⑧ 含 `-`/`*` 的未登记页名不得经「假设可见化」回灌页集：
  //    假设文案会原样进 PRD，而 strict 解析的条目正则 `/[-*]\s*(.+)/g` **无行首锚**，
  //    「钱包 - 卡包」里的「- 」会让后半句（含「可用页名：home/…」）被当成页条目 → 幽灵 home。
  {
    const ws = newWs('');
    const doc = join(ws, 'req.md');
    writeFileSync(doc, '# 测试\n\n## 页面\n- 列表\n- 钱包 - 卡包\n');
    const r = spawnSync(process.execPath, [PRD, `--from=${doc}`], { env: { ...process.env, WORKSPACE: ws }, encoding: 'utf8' });
    const prd = read(join(ws, 'docs', 'prd.md'));
    const roundTrip = prd ? parsePRD(prd).corePages : [];
    check('F2-docs ⑧：含连字符的未登记页名不回流页集（净化后 round-trip 仍只有 list）',
      r.status === 0 && sameSet(roundTrip, ['list']) && !prd.includes(' - '),
      `exit=${r.status}；回读=${JSON.stringify(roundTrip)}；PRD 含 ' - '=${prd.includes(' - ')}`);
    rmSync(ws, { recursive: true, force: true });
  }
}

// ---- 场景 40：截图/设计稿导入（F2-shot）----
// WHY 单独立场景：本项**不发一行渲染代码**，全部价值都压在「design-spec.md 的五项能被下游吃到」：
//   平台 → mobile/desktop 模板选择；品牌色 → 配色主色；页集 → 落哪些页面；流程 → 排序与内容。
// 任何一项在 PRD→原型 的搬运中丢掉，产物依旧「生成成功、闸门全绿」，只有肉眼才看得出跑偏。
// 故 ② 用纯函数钉解析，③④ 用 CLI 实跑钉「品牌色真的进了内联配置」。
{
  const specFixture = join(SKILL_DIR, 'fixtures', 'design-spec.md');
  const WANT_SPEC_PAGES = ['home', 'list', 'detail', 'publish', 'profile']; // 规范值，禁止实跑回填

  // ① design-spec → PRD：六节齐全（无「原文未提供本节」兜底）+ validatePRD 双零 + 回读页集正确
  {
    const ws = newWs('');
    const r = spawnSync(process.execPath, [PRD, `--from=${specFixture}`], { env: { ...process.env, WORKSPACE: ws }, encoding: 'utf8' });
    const prd = read(join(ws, 'docs', 'prd.md'));
    const v = prd ? validatePRD(prd) : { errors: ['未产出'], warnings: [] };
    const back = prd ? parsePRD(prd).corePages : [];
    const sameSet = (a, b) => a.length === b.length && b.every((x) => a.includes(x));
    check('F2-shot ①：design-spec 六节齐全（无兜底）、PRD 双零、回读页集 = 5 页',
      r.status === 0 && !!prd && !prd.includes('原文未提供本节')
        && v.errors.length === 0 && v.warnings.length === 0 && sameSet(back, WANT_SPEC_PAGES),
      `exit=${r.status}；兜底节=${prd ? prd.includes('原文未提供本节') : 'n/a'}；errors=${JSON.stringify(v.errors)}；warnings=${JSON.stringify(v.warnings)}；回读=${JSON.stringify(back)}`);
    rmSync(ws, { recursive: true, force: true });
  }

  // ② 截图里真正能稳定提取的两项：平台与主色（其余靠页面/流程节）
  {
    const { meta } = parseDoc(read(specFixture));
    check('F2-shot ②：design-spec 的平台与品牌色被解析（mobile + #2f6fed）',
      meta.targetPlatform === 'mobile' && meta.brandColor === '#2f6fed' && meta.productType === 'tool',
      `platform=${meta.targetPlatform}；brandColor=${meta.brandColor}；productType=${meta.productType}`);
  }

  // ③ CLI 端到端：设计说明 → PRD → 生成 → 闸门（copyDomainSkipped 必须为 false，见 e2e 注释 b）
  // ④ 品牌色**真的**进了内联 Tailwind 配置：只断言 PRD 里有那行字是不够的，
  //    `parsePRD→parsePRD` 两次搬运任何一处漏读都会退化成 productType 预设色。
  {
    const ws = newWs('');
    const p = spawnSync(process.execPath, [PRD, `--from=${specFixture}`], { env: { ...process.env, WORKSPACE: ws }, encoding: 'utf8' });
    const g = spawnSync(process.execPath, [GEN, '--platform', 'mobile', '--quiet'], { env: { ...process.env, WORKSPACE: ws, PREFLIGHT: '0' }, encoding: 'utf8' });
    const v = verifyJson(ws);
    let report = null;
    try { report = JSON.parse(read(join(ws, 'prototype', 'generation-report.json'))); } catch { /* 无报告按断言失败 */ }
    const html = read(join(ws, 'prototype', 'pages', 'home.html'));
    check('F2-shot ③：CLI 端到端（design-spec → PRD → 原型，闸门 passed）',
      p.status === 0 && g.status === 0 && v.passed === true && v.copyFail === 0 && v.copyDomainSkipped === false
        && !!report && report.prdSource === 'doc' && report.assumptions.length === 0 && report.prdWarnings.length === 0,
      `exit=${p.status}/${g.status}；passed=${v.passed} copyFail=${v.copyFail} skipped=${v.copyDomainSkipped}；prdSource=${report ? report.prdSource : 'null'}；pages=${report ? JSON.stringify(report.pages) : 'null'}`);
    const hsl = resolvePrimaryHsl('tool', '#2f6fed');
    check('F2-shot ④：品牌色进内联配色（主色色相出现在产物中）',
      !!html && html.includes(`hsl(${hsl.h},`),
      `期望色相=${hsl.h}；产物含=${!!html && html.includes(`hsl(${hsl.h},`)}`);
    rmSync(ws, { recursive: true, force: true });
  }

  // ⑤ 注释里的行业词不参与类型判定：整理模板的用法块天然含行业词（示例），
  //    而 `detectProductType` 是全文关键词计数——不剥注释时一份效率工具文档会被静默判成电商，
  //    整套文案包与模板风格跟着跑偏，且**不会报错**（场景 40 ①②③ 都拦不住）。
  {
    const ws = newWs('');
    const docPath = join(ws, 'spec-with-comment.md');
    // 正文只写工具词；注释里塞满 ecommerce 词典词（不剥注释必判电商）。正文需 > 500 字才过 `validatePRD`。
    writeFileSync(docPath, [
      '<!-- 二手交易 购物车 商城 订单 卖家 买家 商品 -->',
      '# 测试工具',
      '',
      '## 产品概述',
      '- 产品类型关键词：效率工具与生产力应用，帮上班族随手记下待办与日程。',
      '- 目标：三秒内记下要做的事，一眼看清优先级。',
      '',
      '## 目标用户',
      '- 上班族：通勤路上用手机记待办，不想为此专门开电脑。',
      '- 自由职业者：同时推进多个项目，需要按项目分组查看进展。',
      '- 学生：按课程与作业列清单，需要截止日期提醒。',
      '- 主要痛点：记事分散在便签与聊天记录里，找不到上周的安排。',
      '',
      '## 核心功能',
      '- [P0] 待办录入：标题、备注、截止日期与优先级一次填完。',
      '- [P0] 清单浏览：按项目分组，支持勾选完成与筛选未完成。',
      '- [P1] 详情查看：单条待办的备注、优先级与历史变更。',
      '- [P1] 新建入口：底部导航中间的加号直达录入页。',
      '- [P2] 本周统计：完成数与连续打卡天数。',
      '',
      '## 用户流程',
      '- 在首页，勾选今日待办 → 状态更新',
      '- 在列表，切换项目 → 只看未完成',
      '- 在创建，填写标题与日期 → 生成待办',
      '- 在我的，查看本周完成数 → 决定明天排期',
      '',
      '## 页面',
      '- 首页',
      '- 列表',
      '',
      '## 非功能性需求',
      '- 性能：首屏在可接受时间内可交互，长列表滚动不卡顿。',
      '- 安全：待办内容仅本地展示，不做真实账号体系，输入统一转义。',
      '- 可访问性：勾选状态通过 aria 暴露，键盘可完成录入与状态切换。',
      '- 兼容性：移动端与平板均可使用，浅色模式下对比度达标。',
    ].join('\n'));
    const r = spawnSync(process.execPath, [PRD, `--from=${docPath}`], { env: { ...process.env, WORKSPACE: ws }, encoding: 'utf8' });
    const prd = read(join(ws, 'docs', 'prd.md')) || '';
    const type = prd ? parsePRD(prd).productType : null;
    check('F2-shot ⑤：HTML 注释里的行业词不参与类型判定（--from 读入即剥注释）',
      r.status === 0 && type === 'tool' && !prd.includes('二手交易'),
      `exit=${r.status}；type=${type}；PRD 含注释文本=${prd.includes('二手交易')}`);
    rmSync(ws, { recursive: true, force: true });
  }
}

// ---- 场景：电商桌面 form 仍保价保量（P1/P2 去电商化的反向保护）----
// WHY：非电商 form 去掉 price/delivery 后，唯一的「价格块仍在」的证明来自 ecommerce 路径；
// 但它没有 golden（ecommerce 页集用 publish），只能靠本断言兜住，否则下次重构会静默丢块。
{
  const EC_PRD = `# 二手书店
## 产品概述
面向书友的闲置书籍交易平台，支持卖家上传、买家下单与购物车结算。
## 核心功能
- [P0] 发布商品
## 页面清单
- home：首页
- list：书籍列表
- form：发布商品
`;
  const ws = newWs(EC_PRD);
  const g = run(GEN, ws, ['--platform', 'desktop', '--quiet']);
  const formPath = join(ws, 'prototype', 'pages', 'form.html');
  const exists = existsSync(formPath);
  const html = read(formPath);
  const hay = `${normalizeText(html)} ${normalizeAttrs(html)}`;
  const report = (() => { try { return JSON.parse(read(join(ws, 'prototype', 'generation-report.json'))); } catch { return null; } })();
  check('电商桌面 form 存在且类型识别正确（前置）',
    g.status === 0 && exists && report && report.productType === 'ecommerce',
    `exit=${g.status} exists=${exists} productType=${report && report.productType}`);
  check('电商桌面 form 仍含价格/发货槽位',
    exists && /价格与描述/.test(hay) && /发货设置/.test(hay) && hay.includes('¥'),
    exists ? `价格=${/价格与描述/.test(hay)} 发货=${/发货设置/.test(hay)} ¥=${hay.includes('¥')}` : 'form.html 缺失');
  check('电商桌面 form 保留 9 个图片槽',
    exists && (html.match(/type="file"/g) || []).length === 9,
    `slots=${(html.match(/type="file"/g) || []).length}`);
  rmSync(ws, { recursive: true, force: true });
}

// ---- 场景：产物确定性（同输入两次生成必须逐字节一致）----
// WHY：桌面列表行 ID 与移动外壳电量曾用 Math.random ⇒ 每轮产物不同，golden 重冻固定冒出
// 「3 个 TSK 编号差异」噪声，截图与 diff 也无法比对。此处锁死「无随机源」这条性质本身。
{
  const DET_PRD = `# 二手书店
## 核心功能
- [P0] 商品浏览
## 页面清单
- home：首页
- list：列表
- detail：详情
`;
  const treeOf = (ws) => {
    const out = new Map();
    const walk = (dir) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.name.endsWith('.html')) out.set(relative(ws, p).split(sep).join('/'), readFileSync(p, 'utf8'));
      }
    };
    walk(join(ws, 'prototype'));
    return out;
  };
  for (const platform of ['desktop', 'mobile']) {
    const a = newWs(DET_PRD); const b = newWs(DET_PRD);
    run(GEN, a, ['--platform', platform, '--quiet']);
    run(GEN, b, ['--platform', platform, '--quiet']);
    const ta = treeOf(a); const tb = treeOf(b);
    const keys = [...ta.keys()].sort();
    const diff = keys.filter((k) => ta.get(k) !== tb.get(k));
    check(`产物确定性：${platform} 同输入两次生成字节一致`,
      keys.length > 0 && keys.join() === [...tb.keys()].sort().join() && diff.length === 0,
      keys.length ? (diff.length ? `差异文件: ${diff.join(', ')}` : `${keys.length} 文件全等`) : '无产物');
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
}

// ---- 场景：行 ID 前缀自洽（归一化依赖这些前缀，漏配即 golden 假回归）----
{
  const PREFIXES = /^(SPU|TSK|ITM|ART|ID)$/;
  const bad = [...PRODUCT_TYPES].filter((t) => !PREFIXES.test(COPY_LEXICON[t].list.table.idPrefix));
  check('桌面列表行 ID 前缀全在归一化集合内（SPU/TSK/ITM/ART/ID）',
    bad.length === 0, bad.map((t) => `${t}:${COPY_LEXICON[t].list.table.idPrefix}`).join('；'));
}

// ---- 场景 41：一致性闸门（负例，证明非假绿）----
// WHY：`consistencyFail` 若只断言「当前产物通过」，模板再漂移一次也不会红（假绿风险）。
// 本场景先取基线，再**注入两处真实回归**，断言闸门确实置位：
//  a) header 回退 `px-5` → header/main 左右不等（gutter_delta 非 0）
//  b) 横滚行的 `-mx-page px-page` 改成 `-mx-4 px-8` → 负 margin 与内边距不配对
// 另断言 button 档仍为 advisory（B2 未做时不得因 5–6 种而判红）。
{
  const ws = newWs(FULL_PRD);
  run(GEN, ws, ['--platform', 'mobile', '--quiet']);
  const base = verifyJson(ws);
  check('一致性闸门基线：gutter/slot/负 margin 全绿',
    base.consistencyFail === 0 && base.passed === true &&
    !!base.consistency && base.consistency.gutterDeltaMax === 0 && base.consistency.negMarginMismatch === 0,
    JSON.stringify(base.consistency));
  check('控件渲染高度按 px 聚类（不是 class 写法），且 advisory 与档位数一致',
    !!base.consistency
      && base.consistency.buttonKinds > 0
      && (base.consistency.buttonKindsList || []).every((v) => /^\d+px$/.test(v))
      && base.consistency.buttonKindsAdvisory === (base.consistency.buttonKinds > 3),
    JSON.stringify(base.consistency && { kinds: base.consistency.buttonKindsList, advisory: base.consistency.buttonKindsAdvisory }));

  // (a) header 回退 px-5 → 跨元素对齐破裂
  const homePath = join(ws, 'prototype', 'pages', 'home.html');
  const home = read(homePath);
  const mutated = home.replace('<header class="sticky top-0 z-10 px-page ', '<header class="sticky top-0 z-10 px-5 ');
  writeFileSync(homePath, mutated);
  check('一致性闸门负例：注入点存在（header px-page 未被静默漏改）', mutated !== home, 'header px-page 未命中，负例无效');
  const a = verifyJson(ws);
  check('header 回退 px-5 → consistencyFail>=1 且 passed:false',
    a.consistencyFail >= 1 && a.passed === false && a.consistency.gutterDeltaMax > 0,
    JSON.stringify({ cf: a.consistencyFail, delta: a.consistency && a.consistency.gutterDeltaMax }));

  // (b) 负 margin 与内边距不配对（-mx-4 = 16px vs px-8 = 32px）
  const listPath = join(ws, 'prototype', 'pages', 'list.html');
  const list = read(listPath);
  const listMut = list.replace('-mx-page px-page pb-1', '-mx-4 px-8 pb-1');
  writeFileSync(listPath, listMut);
  writeFileSync(homePath, home);   // 复原 (a)，隔离 (b) 的判据
  check('一致性闸门负例：注入点存在（-mx-page px-page 未被静默漏改）', listMut !== list, '-mx-page px-page 未命中，负例无效');
  const b = verifyJson(ws);
  check('-mx 与 px 不等 → consistencyFail>=1 且 passed:false',
    b.consistencyFail >= 1 && b.passed === false && b.consistency.negMarginMismatch >= 1,
    JSON.stringify({ cf: b.consistencyFail, mismatch: b.consistency && b.consistency.negMarginMismatch }));

  // (c) 「统一但错误」：全站槽位一起回退 px-5（左右各自相等、唯一值=1）也必须红
  //     WHY：只比「槽位是否单值」时，模板整体漂移会全绿 —— 这是 B1 缺陷的整批形态。
  const dir = join(ws, 'prototype', 'pages');
  const pageFiles = readdirSync(dir).filter((f) => f.endsWith('.html'));
  let touched = 0;
  for (const f of pageFiles) {
    const p = join(dir, f);
    const src = read(p);
    const out = src.replace(/(class="[^"]*?)\bpx-page\b/g, '$1px-5');
    if (out !== src) { writeFileSync(p, out); touched++; }
  }
  check('一致性闸门负例：注入点存在（px-page 可批量命中）', touched === pageFiles.length, `命中 ${touched}/${pageFiles.length}`);
  const c = verifyJson(ws);
  check('全站槽位统一回退 px-5 → consistencyFail>=1 且 passed:false',
    c.consistencyFail >= 1 && c.passed === false && c.consistency.gutterDeltaMax === 0,
    JSON.stringify({ cf: c.consistencyFail, delta: c.consistency && c.consistency.gutterDeltaMax }));
  rmSync(ws, { recursive: true, force: true });
}

// ---- 汇总 ----
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? '✔' : '✘'} ${r.name}${r.ok ? '' : `  →  ${r.detail}`}`);
}
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);