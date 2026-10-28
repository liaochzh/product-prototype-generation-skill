#!/usr/bin/env node
/**
 * PRD 生成入口：
 *   node scripts/generate-prd.js "我想做一个二手书交易APP" [--dry-run]
 *   node scripts/generate-prd.js --from=<需求文档.md> [--dry-run]
 * 策略：优先 LLM（占位接口自检），不可用则规则引擎兜底。零提问直出。
 *
 * `--from` 是 F2-docs 的入口：把**用户已有的需求文档**规范化为 PRD。
 * 只支持等号式（`--from=<path>`）——空格式会被 `posInput` 当成需求原话，
 * 从而静默生成一份通用 PRD 覆盖用户的 docs/prd.md，这是最难排查的一类错。
 * 文档里解析不出来的缺口一律写进 `docs/prd-assumptions.json`（机器可读），
 * **不猜页集**：命中 0 页直接失败，不回退默认 4 页。
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { rmSync } from 'fs';
import { readFileSafe, writeFileAtomic, ensureDir } from '../utils/fs-extra.js';
import { log, setVerbose, setQuiet } from '../utils/logger.js';
import { buildLLMPrompt, buildPRDFromTemplate, detectTypeByKeywords, getTemplate } from '../utils/prompt-engine.js';
import { sanitizePRD } from '../utils/sanitize.js';
import { parseDoc, stripHeadingNumber, PAGE_ASSUMPTION_PREFIX } from '../utils/prd-parser.js';

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
// `posInput` **不带走兜底串**：带兜底时「--from 与原话互斥」的判据恒真，
// 会让 --from 分支 100% exit 1（这是审查抓到的坑，别改回去）。
const posInput = args.find((a) => !a.startsWith('--'));
const rawInput = posInput || '通用产品原型';
const fromArg = args.find((a) => a.startsWith('--from='));
const fromPath = fromArg ? fromArg.slice('--from='.length).trim() : '';
const dryRun = args.includes('--dry-run');
if (args.includes('--verbose')) setVerbose(true);
if (args.includes('--quiet')) setQuiet(true);

const WORKSPACE = process.env.WORKSPACE || process.cwd();
const prdPath = resolve(WORKSPACE, 'docs/prd.md');
const assumptionsPath = resolve(WORKSPACE, 'docs/prd-assumptions.json');

function fail(msg) {
  console.error(`✘ ${msg}`);
  process.exit(1);
}

async function tryLLM(prompt) {
  // 预留 @opencode-ai/plugin 调用点；当前环境无稳定接口，直接抛不可用走兜底
  return { ok: false, reason: 'LLM 接口未配置，走规则引擎兜底' };
}

function fillTemplate(raw, type, body) {
  const t = getTemplate(type);
  return body
    .replaceAll('{{productName}}', raw.slice(0, 12))
    .replaceAll('{{rawInput}}', raw)
    .replaceAll('{{productType}}', t.label)
    .replaceAll('{{genMode}}', '规则引擎兜底')
    .replaceAll('{{createdAt}}', new Date().toISOString().slice(0, 10))
    .replaceAll('{{summary}}', raw)
    .replaceAll('{{users}}', t.users.map((u) => `- ${u}`).join('\n'))
    .replaceAll('{{features}}', t.features.map((f) => `- ${f}`).join('\n'))
    .replaceAll('{{flows}}', t.flows.map((f) => `### ${f.name}\n${f.steps.map((s, i) => `- 步骤${i + 1}：${s.description}`).join('\n')}`).join(''))
    .replaceAll('{{pages}}', t.pages.map((p) => `- ${p}`).join('\n'));
}

/* ────────────────────────── --from：需求文档 → PRD ────────────────────────── */

/**
 * 取「以 label 开头的第一个章节」的正文（到下一个同级或更高级标题为止）。
 * 标题先剥序号前缀（`## 3.1 页面清单` / `## 一、产品概述`，用 `stripHeadingNumber`
 * 统一口径），再按 **startsWith** 匹配 label——用 `includes` 时 `## 需求概述` /
 * `## 技术概述` 会被 `概述` 抢成「产品概述」正文，整段无关文本搬进 PRD 且
 * `validatePRD` 不报错（审查 P1）。
 */
function sectionBody(content, labels) {
  const lines = String(content || '').split('\n');
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (!m) continue;
    const title = stripHeadingNumber(m[2]);
    if (start === -1) {
      if (labels.some((l) => title.startsWith(l))) { start = i + 1; level = m[1].length; }
      continue;
    }
    if (m[1].length <= level) return lines.slice(start, i).join('\n').trim();
  }
  return start === -1 ? '' : lines.slice(start).join('\n').trim();
}

/**
 * 六节的顺序与标题是**契约**：必须逐字命中 `validatePRD` 的 requiredSections 正则，
 * 否则「机器补齐」会制造一堆假 warning（模板里那节叫「用户交互路径（User Flows）」，
 * `validatePRD` 只认 用户流程/交互流程/业务流程 —— 照抄模板标题就会恒告警）。
 */
const DOC_SECTIONS = [
  {
    title: '产品概述',
    labels: ['产品概述', '产品简介', '概述'],
    fallback: (t) => `- 产品类型：${t.label}\n- 目标：7 天可验证的最小可用原型，核心链路可点击走通。`,
  },
  { title: '目标用户', labels: ['目标用户', '用户画像', '目标人群'], fallback: (t) => t.users.map((u) => `- ${u}`).join('\n') },
  { title: '核心功能', labels: ['核心功能', '功能列表', '主要功能'], fallback: (t) => t.features.map((f) => `- ${f}`).join('\n') },
  {
    title: '用户流程',
    labels: ['用户流程', '交互流程', '业务流程', '用户交互路径'],
    fallback: (t) => t.flows.map((f) => `### ${f.name}\n${f.steps.map((s, i) => `- 步骤${i + 1}：${s.description}`).join('\n')}`).join('\n\n'),
  },
  // 页面清单的正文由 `meta.corePages` 直接生成（见 buildDocPRD），这里不配 labels
  { title: '页面清单', fallback: (_, meta) => meta.corePages.map((p) => `- ${p}`).join('\n') },
  {
    title: '非功能性需求',
    labels: ['非功能性需求', '非功能需求', '性能与安全'],
    fallback: () => '- 性能：首屏 < 2s，图片懒加载。\n- 安全：输入转义，敏感词过滤。\n- 可访问性：语义化标签、键盘可达、对比度达标。',
  },
];

/** 把文档的六节重整为规范 PRD（缺失节写 `> [假设]` + 模板兜底，保证下游可渲染）。 */
function buildDocPRD(doc, meta, assumptions = []) {
  const t = getTemplate(meta.productType || 'other');
  const parts = [`# ${String(meta.productName || '').trim()}`];
  for (const sec of DOC_SECTIONS) {
    // 页面清单必须写**规范化页名**：直接搬原文会让「购物车/结算/搜索页」在
    // 下游 parsePRD 里再丢一次（它只认既有页名）——round-trip 静默掉页，首测踩过。
    // 被丢弃的条目以 `> [假设]` 附在清单末尾（**不能**写成 `- 条目`：那会把业务词重新塞回页集），
    // 让用户打开 docs/prd.md 就看得见「钱包为什么不在」。
    const body = sec.title === '页面清单'
      ? [
        ...meta.corePages.map((p) => `- ${p}`),
        ...assumptions.filter((a) => a.startsWith(PAGE_ASSUMPTION_PREFIX)).map((a) => `> [假设] ${a.slice(PAGE_ASSUMPTION_PREFIX.length)}`),
      ].join('\n')
      : sectionBody(doc, sec.labels);
    const assumed = !body;
    parts.push(
      `## ${sec.title}\n${assumed ? `> [假设] 原文未提供本节，已按「${t.label}」通用模板补齐。\n${sec.fallback(t, meta)}` : body}`,
    );
  }
  return parts.join('\n\n');
}

const sha1 = (text) => createHash('sha1').update(text, 'utf8').digest('hex');

/** `--from` 分支（三条硬失败都在这里，保持默认路径零感知）。 */
async function runFromDoc() {
  if (args.includes('--from')) fail('--from 只支持等号式：--from=<path>（例：--from=docs/req.md）');
  if (!fromPath) fail('--from= 缺少文件路径');

  // 路径基准 = 进程 cwd（与 `--prd` 同口径），不用 WORKSPACE——文档常在调用方仓库里。
  const abs = resolve(process.cwd(), fromPath);
  let doc = '';
  try {
    doc = await readFileSafe(abs);
  } catch (e) {
    fail(`读不到需求文档：${abs}（${e.message}）`);
  }
  // 先剥 HTML 注释再解析/搬运：整理模板（`templates/design-spec.md`）的用法说明就写在注释里，
  // 而 `detectProductType` 是**全文关键词计数**——注释里的示例词（如「二手/交易/购物车」）
  // 足以把一份工具型文档判成电商，整套文案包与模板风格随之跑偏，且不会有任何报错。
  doc = String(doc).replace(/<!--[\s\S]*?-->/g, '');
  if (!doc.trim()) fail(`需求文档为空：${abs}`);

  const { meta, assumptions } = parseDoc(doc);
  if (!meta.corePages.length) {
    fail('文档未解析出任何页面：请在 2–3 级标题（`## 页面` / `## 页面清单`）下逐条列出页面，或改用默认 PRD 流程');
  }

  let prd = sanitizePRD(buildDocPRD(doc, meta, assumptions));
  if (!String(meta.productName || '').trim()) fail('无法识别产品名称：请在文档首行写 `# <产品名>`');
  if (prd.length < 500) fail(`生成的 PRD 仅 ${prd.length} 字（< 500）：请补充产品概述/目标用户/核心功能等章节`);

  if (dryRun) { console.log(prd); process.exit(0); }

  await ensureDir(resolve(WORKSPACE, 'docs'));
  // 先删后写：这个文件是本脚本独占的「上一次导入」状态，残留会让下游把
  // 原话生成的 PRD 误标成 doc 来源。
  rmSync(assumptionsPath, { force: true });
  await writeFileAtomic(assumptionsPath, `${JSON.stringify({ prdPath, prdSha1: sha1(prd), assumptions }, null, 2)}\n`);
  await writeFileAtomic(prdPath, prd);

  const form = (await readFileSafe(resolve(__dirname, 'templates/confirmation-form.md'))).replaceAll('{{prdPath}}', prdPath);
  console.log(`\n${form}\n`);
  console.log(`📄 已从需求文档生成 PRD：${abs}`);
  // 逐条打印（不只条数）：用户看确认表单时就要知道「哪几页没进来」，否则只能事后翻 JSON
  if (assumptions.length) {
    console.log(`📌 假设 ${assumptions.length} 条（PRD 内已标 \`> [假设]\`，机器可读版 → ${assumptionsPath}）：`);
    assumptions.forEach((a) => console.log(`   · ${a}`));
  } else {
    console.log('📌 无假设：章节齐全、页面全部已登记');
  }
  log.prd.info(`PRD 已写入：${prdPath}（来源：${abs}）`);
  process.exit(0);
}

/* ────────────────────────────── 默认：原话 → PRD ────────────────────────────── */

async function runFromRawInput() {
  const type = detectTypeByKeywords(rawInput);
  log.prd.info(`需求：${rawInput} ｜识别类型：${type}`);
  const prompt = buildLLMPrompt(rawInput);
  const llm = await tryLLM(prompt);
  let prd;
  if (llm.ok) prd = llm.text;
  else {
    const tpl = await readFileSafe(resolve(__dirname, 'templates/prd-template.md'));
    const fallbackBody = buildPRDFromTemplate(rawInput, type);
    // 用规则正文直接作为 PRD（模板仅作结构参考，避免双重填充失真）
    prd = fallbackBody;
    log.prd.warn(llm.reason);
  }
  prd = sanitizePRD(prd);

  if (dryRun) { console.log(prd); process.exit(0); }
  await ensureDir(resolve(WORKSPACE, 'docs'));
  await writeFileAtomic(prdPath, prd);
  const form = (await readFileSafe(resolve(__dirname, 'templates/confirmation-form.md'))).replaceAll('{{prdPath}}', prdPath);
  console.log(`\n${form}\n`);
  log.prd.info(`PRD 已写入：${prdPath}`);
}

if (fromArg && posInput) fail('--from= 与「需求原话」不能同时给：想用文档就只给 --from=<path>');
if (fromArg || args.includes('--from')) await runFromDoc();
else await runFromRawInput();
