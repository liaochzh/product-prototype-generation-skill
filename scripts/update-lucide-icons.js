#!/usr/bin/env node
/**
 * 刷新 lucide 图标名清单（生成 `utils/lucide-icons.js`）
 *
 * WHY：原型经 `unpkg.com/lucide@latest` 在**浏览器端**渲染图标；图标名写错**不会报错**，只会渲染成
 * 空方块（本轮 `devices` 即此例——那是 Material 图标名，不在 lucide 集内）。图标名又不进 golden
 * 三维（`data-lucide` 既非 text/attrs，也不是 class），故必须靠离线清单兜住，见 `selfcheck` 场景 30。
 *
 * 用法：`node scripts/update-lucide-icons.js`
 * 何时用：`selfcheck` 报「图标名不存在」，但你在浏览器里确认该图标能正常渲染（即上游新增、清单落后）。
 * 注意：本脚本需要网络；生成物是**数据文件**，不要手改。
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = join(HERE, '..', 'utils', 'lucide-icons.js');
const META_URL = 'https://unpkg.com/lucide-static@latest/icons/?meta';
const WRAP = 100;

const res = await fetch(META_URL, { redirect: 'follow' });
if (!res.ok) {
  console.error(`✘ 拉取图标清单失败：HTTP ${res.status}`);
  process.exit(1);
}
const meta = await res.json();
if (!meta || !Array.isArray(meta.files) || !meta.version) {
  console.error('✘ 返回结构异常（期望 { version, files[] }）');
  process.exit(1);
}

const names = meta.files
  .filter((f) => typeof f.path === 'string' && f.path.endsWith('.svg'))
  .map((f) => f.path.replace('/icons/', '').replace(/\.svg$/, ''))
  .sort();
if (names.length < 1000) {
  console.error(`✘ 图标数异常偏少（${names.length}），疑似上游接口变更，已中止以免覆盖有效清单`);
  process.exit(1);
}

// 定宽打包 → 生成结果可复现（新图标只多一行，便于 diff 审阅）
const lines = [];
let cur = '';
for (const n of names) {
  if (cur && cur.length + 1 + n.length > WRAP) {
    lines.push(cur);
    cur = '';
  }
  cur = cur ? `${cur} ${n}` : n;
}
if (cur) lines.push(cur);
// 除末行外每行补尾随空格，保证多行字符串拼接后仍是空格分隔（与 loader 的 split(' ') 对齐）
const body = lines.map((l, i) => `  '${i < lines.length - 1 ? `${l} ` : l}'`).join(' +\n');
if (lines.join(' ').split(' ').length !== names.length) {
  console.error('✘ 内部断言失败：打包后的名字数与清单不等，已中止');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const out = `/**
 * lucide 图标名清单（离线校验数据 · **生成文件，勿手改**）
 *
 * 生成：\`node scripts/update-lucide-icons.js\`
 * 来源：\`unpkg.com/lucide-static@<version>/icons/*.svg\` 的文件名
 *       （与原型运行时 \`unpkg.com/lucide@latest\` 的 UMD 包同源同版本序列）
 * 快照：lucide-static@${meta.version}（${today} 抓取，共 ${names.length} 个）
 * 消费：\`scripts/selfcheck.js\` 场景 30（校验词典/模板引用的图标名可用）
 *
 * WHY：图标名写错在浏览器端**静默失败**（渲染成空方块），且 \`data-lucide\` 不进 golden 三维
 * （非 text / attrs / class），必须靠本清单离线兜住；selfcheck 不联网，故清单固化进仓。
 */
const NAMES =
${body};

export const LUCIDE_ICONS = new Set(NAMES.split(' '));
export const LUCIDE_VERSION = '${meta.version}';
export const LUCIDE_COUNT = ${names.length};
`;

writeFileSync(TARGET, out, 'utf8');
console.log(`✔ 已写入 utils/lucide-icons.js：${names.length} 个图标（lucide-static@${meta.version}）`);