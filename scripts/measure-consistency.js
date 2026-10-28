#!/usr/bin/env node
/**
 * 一致性度量 CLI（只读，恒 exit 0）
 *
 * 用途：把「元素不对齐 / 控件不统一 / 跨页漂移 / 无转场」变成可核对的数字。
 * 计算逻辑在 `utils/consistency.js`（同一口径被 `verify-prototype.js` 的闸门复用）；
 * 本文件只负责 CLI 参数、打印与落盘。
 *
 * 用法：
 *   WORKSPACE=<ws> node scripts/measure-consistency.js [--out <json>] [--proto <dir>] [--quiet]
 *   node scripts/measure-consistency.js --workspace <ws> --out ~/docs/test/baseline.json
 *
 * 口径（与方案 §4A 一致）见 `utils/consistency.js` 顶部注释。
 * 设计约束：只读、无缓存、不写 prototype/；**不判红**（度量不是闸门，判红在 verify）。
 */
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { measureConsistency } from '../utils/consistency.js';

const args = process.argv.slice(2);
const getArg = (k, d) => {
  const i = args.findIndex((a) => a === k || a.startsWith(k + '='));
  if (i < 0) return d;
  const v = args[i];
  return v.includes('=') ? v.split('=').slice(1).join('=') : args[i + 1] ?? d;
};
const quiet = args.includes('--quiet');

const workspace = resolve(getArg('--workspace', process.env.WORKSPACE || process.cwd()));
const protoDir = resolve(getArg('--proto', join(workspace, 'prototype')));
const outPath = getArg('--out', '');

const { platform, pagePx, pages, summary } = await measureConsistency(protoDir);

if (!summary) {
  console.error(`✘ 未找到 HTML：${protoDir}（先跑 generate-prototype.js）`);
  process.exit(0);   // 度量脚本恒 exit 0；缺产物由调用方判定
}

const json = { generatedAt: new Date().toISOString(), protoDir, platform, pagePx, pages, summary };

if (outPath) {
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(resolve(outPath), JSON.stringify(json, null, 2) + '\n');
  if (!quiet) console.log(`✔ 已写 ${outPath}`);
}

if (!quiet) {
  const pad = (v) => (v == null ? '—' : String(v));
  console.log('\n页 | header(L/R) | main(L/R) | tabbar(L/R) | gutterΔ');
  console.log('---|---|---|---|---');
  for (const p of pages) {
    console.log(`${p.file} | ${pad(p.header?.left)}/${pad(p.header?.right)} | ${pad(p.main?.left)}/${pad(p.main?.right)} | ${pad(p.tabbar?.left)}/${pad(p.tabbar?.right)} | ${pad(p.gutterDelta)}`);
  }
  const s = summary;
  console.log(`\n文件 ${s.files}（外壳/重定向 ${s.shellOnly}；平台 ${platform}，page 刻度 ${pad(pagePx)}px）`);
  console.log(`gutter_delta 最大绝对差：${pad(s.gutterDelta.max)}px；取值 ${JSON.stringify(s.gutterDelta.values)}`);
  console.log(`slot_drift：header 左 ${JSON.stringify(s.slotDrift.headerLeft)} / 右 ${JSON.stringify(s.slotDrift.headerRight)}；main 左 ${JSON.stringify(s.slotDrift.mainLeft)}；tabbar 左 ${JSON.stringify(s.slotDrift.tabbarLeft)}`);
  console.log(`control kinds：button ${s.controlKinds.button.length} 种 ${JSON.stringify(s.controlKinds.button)}；input ${s.controlKinds.input.length} 种 ${JSON.stringify(s.controlKinds.input)}；容器 ${JSON.stringify(s.controlKinds.other)}`);
  console.log(`负 margin：不配对 ${s.negMargin.mismatch.length} 处，孤儿 ${s.negMargin.orphan.length} 处`);
  console.log(`转场/降级标记页数：${s.transitionPages}/${s.files}`);
  console.log(`未识别刻度：${s.unknownClasses.length} ${JSON.stringify(s.unknownClasses)}；任意值 ${s.arbitraryValues.length} ${JSON.stringify(s.arbitraryValues)}`);
}
