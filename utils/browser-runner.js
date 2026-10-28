/**
 * 浏览器 harness 公共设施：定位 Chrome / 跑「注入断言的页面」/ 取回 #test-result。
 * WHY：四个 harness（登录态交互、过程反馈播报、版式不变量、排版留档）各自重复过同样的 Chrome 定位与
 * `--dump-dom` 解析代码；集中一处后行为一致（同样的「无 Chrome 明确跳过」策略、maxBuffer、
 * 虚拟时间、profile 目录规则），不会各写各的漂移。
 * 注意：**不做静默跳过**——`findChrome()` 找不到时返回 null，由调用方打印「跳过」并 exit 0。
 */
import { existsSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { join } from 'node:path';

/** 定位 Chrome/Chromium；找不到返回 null（调用方负责「明确跳过」而不是静默 exit 0） */
export function findChrome() {
  // 显式禁用（`CHROME_SKIP=1`）：用于验证「无 Chrome 时明确跳过 + exit 0」这条路径——
  // 光设 `CHROME=/nonexistent` 不行，那会回落到下面默认路径继续找到 Chrome。
  if (process.env.CHROME_SKIP === '1') return null;
  for (const c of [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].filter(Boolean)) {
    if (existsSync(c)) return c;
  }
  for (const bin of ['google-chrome', 'chromium', 'chromium-browser']) {
    try { return execSync(`command -v ${bin}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* 试下一个 */ }
  }
  return null;
}

/** 还原 #test-result 里的 HTML 实体（harness 把断言拼成文本放进去） */
export function unescapeHtml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

/**
 * 跑页面内 harness：打开 `file://<file>#<hash>`，harness 应把行拼成
 * `<div id="test-result">PASS … || FAIL …</div>`。
 * @returns {{ok: boolean, lines: string[], error?: string}}
 */
export function runHarness({ chrome, file, hash, workdir, budget = 20000 }) {
  let dom = '';
  try {
    dom = execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      `--user-data-dir=${join(workdir, `prof-${String(hash).replace(/[^\w.-]/g, '_')}`)}`,
      `--virtual-time-budget=${budget}`, '--dump-dom', `file://${file}#${hash}`,
    ], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch (e) {
    return { ok: false, lines: [], error: `Chrome 执行失败 ${e.message}` };
  }
  const m = dom.match(/<div id="test-result">([\s\S]*?)<\/div>/);
  if (!m) return { ok: false, lines: [], error: '未取到 #test-result（harness 未执行）' };
  const lines = unescapeHtml(m[1]).split(' || ').map((x) => x.trim()).filter(Boolean);
  return { ok: true, lines };
}

/**
 * Playwright 驱动的断言执行器（F3）：断言写在 **Node 侧**、靠 `page.evaluate` 取真值，
 * 不再依赖「页面内拼字符串 + `--dump-dom` 回收」。
 *
 * WHY 换驱动：`--dump-dom` 是一次性快照——只能看到 DOM 与算好的样式，拿不到
 * 「真实网络/字体加载完成」「跨 iframe」「原生输入序列（type/press）」「hover/过渡结束」这些时机；
 * 且断言套在页面 `<script>` 里，等于把测试逻辑塞进被测物（漏引号那类错连测试一起吞掉）。
 *
 * 与 `runHarness` 的分工：`runHarness` 保留（`snapshot-typography.js` 仍用它），本函数只服务
 * 需要真交互的回归。**无 Chrome 的判定不在这里**——调用方先 `findChrome()`，找不到就
 * 打印「未找到 Chrome」并 exit 0（`selfcheck` 靠这句判跳过，见 `selfcheck.js` 的 harness 段）。
 *
 * @param {{chrome:string, file:string, hash?:string, workdir:string, timeoutMs?:number,
 *   steps:(page:import('playwright-core').Page, rec:(name:string, pass:any, detail?:any)=>void)=>Promise<void>}} args
 * @returns {Promise<{ok:boolean, results:Array<{name:string,pass:boolean,detail:string}>, error?:string}>}
 */
export async function runAssertions({ chrome, file, hash = '', workdir, steps, timeoutMs = 30000 }) {
  const { chromium } = await import('playwright-core');
  const results = [];
  const rec = (name, pass, detail = '') => results.push({ name, pass: Boolean(pass), detail: String(detail ?? '') });
  let browser = null;
  try {
    browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'], timeout: timeoutMs });
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);
    await page.goto(`file://${file}${hash ? `#${hash}` : ''}`, { waitUntil: 'load' });
    // 关掉过渡/动画：真实渲染下过渡会推进，等中途 `getComputedStyle` 读到的是插值，断言会抖。
    await page.addStyleTag({ content: '*{transition-duration:0s !important;animation-duration:0s !important}' });
    await steps(page, rec);
  } catch (e) {
    return { ok: false, results, error: `Playwright 执行失败：${e.message}` };
  } finally {
    if (browser) await browser.close().catch(() => { /* 关闭失败不影响断言结果 */ });
  }
  return { ok: results.length > 0 && results.every((r) => r.pass), results };
}