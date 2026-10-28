/**
 * 环境能力预检：把「哪些外部依赖其实不可用」从日志里的一句话，变成
 * `generation-report.json` 的 `capabilities` 字段。
 *
 * WHY：Chrome 缺失 / 生图 MCP 不可用 / Tailwind CDN 不可达 / 无本地图，四处降级各自为政——
 * 事后排查只能翻日志，而且「样式全失效」这种情况连日志都没有（Play CDN 不可达时浏览器只是
 * 静默不套用类名）。集中一次探测后，报告里能直接看出产物是在什么环境下生成的。
 *
 * 诚实性原则（别把"检测不到"伪装成"可用"）：
 * - `mcpImage` 属 agent 运行时能力，脚本层无法探测 ⇒ 固定 `'unknown'`，由调用方在生图失败时回填。
 * - 无全局 `fetch`（老 Node）或探测超时 ⇒ 返回 `null`（未知），不等于 `false`（不可用）。
 *
 * 本模块只**记录**，不参与任何 pass/fail 判定；消费方的告警一律是 advisory。
 */
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { findChrome } from './browser-runner.js';

const CDN_URL = 'https://cdn.tailwindcss.com/';
const IMG_URL = 'https://images.unsplash.com/';
const IMG_EXT_RE = /\.(webp|png|jpe?g|svg|avif)$/i;

/**
 * 探测一个 URL 是否可达。**任何** HTTP 响应都算可达（我们关心的是网络通不通，不是状态码）。
 * 超时 **不算不可达**——超时只能证明"慢"，返回 null（未知），否则每次生成都可能随机报
 * `tailwindCdn=false` 这只假狼（实测冷启动 841ms，800ms 超时会误判）。
 * @returns {Promise<boolean|null>} true=可达 / false=明确失败 / null=超时或无法判定
 */
async function reachable(url, timeoutMs) {
  if (typeof fetch !== 'function') return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    await fetch(url, { method: 'HEAD', signal: ctl.signal, redirect: 'follow' });
    return true;
  } catch (e) {
    return e?.name === 'AbortError' || e?.name === 'TimeoutError' ? null : false;
  } finally {
    clearTimeout(timer);
  }
}

/** 统计 `<workspace>/assets/` 里的图片数（本地资产优先策略是否真的有效） */
function countLocalAssets(workspace) {
  const dir = resolve(workspace, 'assets');
  if (!existsSync(dir)) return 0;
  try {
    return readdirSync(dir).filter((f) => IMG_EXT_RE.test(f)).length;
  } catch {
    return 0;
  }
}

/**
 * @param {{workspace?: string, timeoutMs?: number}} opts
 * @returns {Promise<{chrome:boolean, tailwindCdn:boolean|null, unsplash:boolean|null,
 *   localAssets:number, mcpImage:'unknown', checkedAt:string}>}
 */
export async function detectCapabilities({ workspace = process.cwd(), timeoutMs = 2000 } = {}) {
  const [tailwindCdn, unsplash] = await Promise.all([reachable(CDN_URL, timeoutMs), reachable(IMG_URL, timeoutMs)]);
  return {
    chrome: Boolean(findChrome()),
    tailwindCdn,
    unsplash,
    localAssets: countLocalAssets(workspace),
    mcpImage: 'unknown',
    checkedAt: new Date().toISOString(),
  };
}

/** 把能力矩阵翻成人话告警（advisory；调用方自行决定打 warn 还是忽略） */
export function capabilityWarnings(caps) {
  const out = [];
  if (caps.tailwindCdn === false) out.push('Tailwind Play CDN 不可达：产物样式将全失效（类名保留但无 CSS）');
  if (caps.unsplash === false) out.push('Unsplash 不可达：未命中本地资产的图片会退到 SVG 占位');
  if (caps.chrome === false) out.push('未找到 Chrome：浏览器层 harness（登录态/播报/排版）将明确跳过');
  if (caps.localAssets === 0) out.push('assets/ 内无图片：全部走 Unsplash 或占位图，视觉质量会明显下降');
  return out;
}

export default { detectCapabilities, capabilityWarnings };
