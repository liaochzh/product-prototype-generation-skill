/**
 * 链接完整性检查 - 扫描 HTML 中的 href / src，校验本地目标文件是否存在
 */
import { promises as fs } from 'fs';
import { resolve, dirname, relative } from 'path';
import { readFileSafe } from './fs-extra.js';

// 外部/锚点/协议链接，不做本地文件校验
const EXTERNAL = /^(https?:|mailto:|tel:|javascript:|data:|blob:|\/\/|#)/i;

/**
 * 提取 HTML 中的 href / src 原始值
 * 覆盖 <a href>、<iframe src>（移动端外壳首屏）等本地引用；
 * 图片/脚本的 http(s)、data: 资源由 EXTERNAL 过滤。
 */
export function extractHrefs(html) {
  const out = [];
  // 要求属性前为空白（排除 data-src=、this.src= 等非标签属性）
  const re = /(?:^|\s)(?:href|src)\s*=\s*["']([^"']*)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

/**
 * 收集死链
 * @param {string[]} files 绝对路径的 HTML 文件列表
 * @param {string} root 产物根目录（用于报告相对路径）
 * @returns {Promise<Array<{from:string, href:string}>>}
 */
export async function collectDeadLinks(files, root) {
  const dead = [];
  for (const f of files) {
    const html = await readFileSafe(f);
    for (const raw of extractHrefs(html)) {
      const href = raw.trim();
      if (!href || EXTERNAL.test(href)) continue;
      const clean = href.split('#')[0].split('?')[0];
      if (!clean) continue;
      const target = resolve(dirname(f), clean);
      let ok = false;
      try { await fs.access(target); ok = true; } catch { ok = false; }
      if (!ok) dead.push({ from: relative(root, f), href });
    }
  }
  return dead;
}