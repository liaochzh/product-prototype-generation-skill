/**
 * golden 回归 fixture 表（唯一定义，`freeze-golden.js` / `selfcheck.js` 共用）
 *
 * WHY 需要 >1 套：golden 三维回归按「fixture（PRD）× 平台」组织，而**单套 fixture
 * 覆盖不到全部模板** —— `settings` / `form` / `dashboard` 是桌面专属模板，且只有 saas
 * 语义成立（ecommerce 页面清单里没有这三页），此前它们只有 e2e 闸门（copyFail=0）保护，
 * 没有 golden 三维防线（文案/属性/class 布局指纹的逐字回归）。
 *
 *   - ecommerce：mobile 8 页 + desktop 7 页（商品域全集）
 *   - saas      ：desktop dashboard/orders/list/detail/form/settings/profile（补桌面专属）
 *   - account   ：mobile + desktop 的 home/profile/login（补 login 双端模板；type=other，
 *                 顺带覆盖「无领域词」的兜底词典路径）
 *
 * 页集**不在此处重复登记**：由 PRD 文件经 prd-parser 派生（单一来源，避免表与 PRD 漂移）。
 * 覆盖完备性由 selfcheck 断言：每端「各 fixture 页集并集」⊇ 该端 `pages/*.eta` 模板集
 * —— 将来新增模板却漏配 fixture，自检会直接红，防线不会悄悄缺口。
 *
 * WHY 新增页面要**新建 fixture** 而不是往既有 fixture 的页集里加：页集是布局的一部分
 * （桌面侧栏导航渲染进每个页面、移动端外壳列页清单），给既有 fixture 加页会改写**全部**
 * 重叠页面的 text/attrs，那两维门禁无法区分「新增页面导致」与「真回归」，任何形式的重冻
 * 授权都会把真回归一起吞掉。首建基线走 `--init`（无旧基线可比）则不触碰既有基线。
 */
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { insideSkillsTree } from './skills-guard.js';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const GOLDEN_FIXTURES = [
  { name: 'ecommerce', prd: 'ecommerce.md', platforms: ['mobile', 'desktop'] },
  { name: 'saas', prd: 'saas.md', platforms: ['desktop'] },
  { name: 'account', prd: 'account.md', platforms: ['mobile', 'desktop'] },
];

export const ALL_PLATFORMS = ['mobile', 'desktop'];

export const prdPathOf = (f) => join(SKILL_DIR, 'fixtures', 'prd', f.prd);
export const goldenDirOf = (f) => join(SKILL_DIR, 'fixtures', 'golden', f.name);

// golden 备份/审计落 **skills 树外**：树内写文件会触发 opencode 全量 skill rescan
// （见 utils/skills-guard.js），并避免污染基线/分发（selfcheck 会断言基线目录内无 .bak/.tmp 残留）。
// 默认与 logger 的日志目录同层：~/.local/share/opencode/backups/product-prototype-generation
// （可用 GOLDEN_BAK_DIR 覆盖 —— selfcheck 场景 33 即靠它把备份隔离到临时副本）。
const DEFAULT_BAK_ROOT = resolve(homedir(), '.local/share/opencode/backups/product-prototype-generation');
// 守卫：GOLDEN_BAK_DIR 若被误配到 skills 树内，回退默认路径（否则写备份会触发全量 skill rescan）
let bakRoot = process.env.GOLDEN_BAK_DIR ? resolve(process.env.GOLDEN_BAK_DIR) : DEFAULT_BAK_ROOT;
if (insideSkillsTree(bakRoot)) {
  console.warn(`[golden-fixtures] GOLDEN_BAK_DIR 指向 skills 树内（会触发全量 skill rescan），已回退默认路径：${DEFAULT_BAK_ROOT}`);
  bakRoot = DEFAULT_BAK_ROOT;
}
export const BAK_ROOT = bakRoot;
