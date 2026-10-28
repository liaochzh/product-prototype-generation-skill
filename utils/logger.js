/**
 * 统一日志工具 - consola 直用 + 文件追加（兼容 v3）
 */
import consola from 'consola';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { gzipSync } from 'zlib';
import { resolve } from 'path';
import { homedir, tmpdir } from 'os';
import { insideSkillsTree } from './skills-guard.js';

// ⚠️ 日志必须落在 skills/ 目录树之外。
// opencode 对 `~/.config/opencode/skills` 做目录级 watch：在该树内写文件会触发**全量 skill rescan**，
// 若与配置 reload 撞车，可导致会话侧 skill 注册表退化（2026-10-16 实际发生过一次）。
// 默认路径：~/.local/share/opencode/logs/product-prototype-generation（可用 PROTO_LOG_DIR 覆盖）。
const DEFAULT_LOG_DIR = resolve(homedir(), '.local/share/opencode/logs/product-prototype-generation');
const FALLBACK_LOG_DIR = resolve(tmpdir(), 'opencode-logs', 'product-prototype-generation');

// 树内判定已抽到 `utils/skills-guard.js`（唯一定义）；此处 re-export 保持既有 import 兼容。
export { insideSkillsTree };

// 守卫：PROTO_LOG_DIR 若被误配到 skills 树内（写日志会触发全量 skill rescan），回退默认路径
let PREFERRED_LOG_DIR = process.env.PROTO_LOG_DIR
  ? resolve(process.env.PROTO_LOG_DIR)
  : DEFAULT_LOG_DIR;
if (insideSkillsTree(PREFERRED_LOG_DIR)) {
  console.warn(`[logger] PROTO_LOG_DIR 指向 skills 树内（会触发全量 skill rescan），已回退默认路径：${DEFAULT_LOG_DIR}`);
  PREFERRED_LOG_DIR = DEFAULT_LOG_DIR;
}

let LOG_DIR = PREFERRED_LOG_DIR;
try {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
} catch {
  LOG_DIR = FALLBACK_LOG_DIR;
  try { if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true }); } catch {}
}
const LOG_FILE = resolve(LOG_DIR, 'prototype-generation.log');

// 轮转：超过 MAX_LOG_BYTES 即把当前日志 zlib 压缩为带时间戳的归档，只留最近 MAX_ARCHIVES 份。
// 时间戳用 ISO（[:.] 换成 -）⇒ 字典序 = 时间序，清理无需解析时间。
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MiB
const MAX_ARCHIVES = 4;                // 保留 4 代（≈2.5h/代 ⇒ ≈10h 历史窗口）
export const ARCHIVE_RE = /^prototype-generation\..+\.log\.gz$/; // 导出供 selfcheck 常驻防回归

// ⚠️ 轮转必须与 append 的失败域隔离：轮转失败绝不能导致日志停写。
let rotateWarned = false;
function rotateIfNeeded() {
  try {
    if (!existsSync(LOG_FILE)) return;
    if (statSync(LOG_FILE).size <= MAX_LOG_BYTES) return;

    // 1) 压缩转存：先写成功再删原文件（压缩/写盘失败绝不丢日志）
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    writeFileSync(resolve(LOG_DIR, `prototype-generation.${ts}.log.gz`), gzipSync(readFileSync(LOG_FILE)));
    unlinkSync(LOG_FILE);

    // 2) 归档池只保留最近 MAX_ARCHIVES 份
    const olds = readdirSync(LOG_DIR).filter((n) => ARCHIVE_RE.test(n)).sort();
    for (const n of olds.slice(0, Math.max(0, olds.length - MAX_ARCHIVES))) unlinkSync(resolve(LOG_DIR, n));
  } catch (e) {
    // 轮转失败（无写权限 / 磁盘满 / 文件被占用）：本轮跳过，下轮再试；日志照常追加。
    // 但「永久失败」会让 .log 无上限增长 → 限流告警一次，避免静默退化。
    if (!rotateWarned) {
      rotateWarned = true;
      console.warn(`[logger] 日志轮转失败（将持续重试，.log 会无限增长）：${e?.code || e}`);
    }
  }
}

function toFile(level, tag, args) {
  rotateIfNeeded(); // ← 独立于 append 的失败域
  try {
    const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${level} [${tag}] ${msg}\n`);
  } catch {}
}

function tagged(tag) {
  const wrap = (level) => (...args) => { toFile(level.toUpperCase(), tag, args); consola[level](`[${tag}]`, ...args); };
  return { trace: wrap('log'), debug: wrap('debug'), info: wrap('info'), warn: wrap('warn'), error: wrap('error'), success: wrap('success'), start: (m) => consola.start(`[${tag}] ${m}`), succeed: (m) => consola.success(m), fail: (m) => consola.fail(m) };
}

export const log = {
  main: tagged('MAIN'), prd: tagged('PRD'), prototype: tagged('PROTO'),
  template: tagged('TMPL'), unsplash: tagged('IMG'), parser: tagged('PARSE'),
  render: tagged('RENDER'), verify: tagged('VERIFY'), cli: tagged('CLI'),
};

let prog = null;
export function startProgress(message) { prog = true; consola.start(message); }
export function updateProgress(pct, message) { if (message) consola.log(`[${Math.round(pct)}%] ${message}`); }
export function succeedProgress(message) { consola.success(message); prog = null; }
export function failProgress(message) { consola.fail(message); prog = null; }
export function setLogLevel(level) { consola.level = { trace: 0, debug: 1, info: 3 }[level] ?? 3; }
export function setQuiet(q) { if (q) consola.level = 6; }
export function setVerbose(v) { if (v) consola.level = 1; }
export default consola;
