/**
 * skills 树边界守卫（唯一定义，`utils/logger.js` / `utils/golden-fixtures.js` 共用）
 *
 * WHY 需要它：opencode 对 `~/.config/opencode/skills` 做目录级 watch，在该树内写文件会触发
 * **全量 skill rescan**，若与配置 reload 撞车可导致会话侧 skill 注册表退化（2026-10-16 实际发生过一次）。
 * 故所有「运行时写点」（日志、golden 备份/审计）都必须落在树外，且各写点入口按本函数校验。
 *
 * 抽成独立小模块（而非直接从 `logger.js` 借用）是为了不把 consola 依赖链拉进
 * `golden-fixtures.js` 这类纯常量/表模块。
 */
import { homedir } from 'os';
import { resolve, relative, isAbsolute, sep } from 'path';

export const SKILLS_TREE = resolve(homedir(), '.config/opencode/skills');

// 树内判定（导出供 selfcheck 常驻防回归）。
// 已知限制：不解析末级软链（realpath）——刻意造软链指向树内可绕过，场景牵强，暂不处理。
export function insideSkillsTree(p) {
  const rel = relative(SKILLS_TREE, resolve(p));
  if (rel === '') return true;                   // 树自身
  if (rel === '..') return false;                // 父目录
  if (rel.startsWith('..' + sep)) return false;  // 树外的兄弟/更深路径
  return !isAbsolute(rel);                       // 其余相对路径 = 树内（含 "..foo" 这类目录名）
}