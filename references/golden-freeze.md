# golden 重冻 SOP 与门禁边界

> 本文件由 SKILL.md 拆出（2026-10-27 F1 分层）。SKILL.md 只保留判据结论；要动基线时读本文件。本文件不再链向其它 references 文件（引用只一层深）。

## 三档授权语义（**判据，别为了跑绿而补 flag**）

| 差异类型 | flag | 未授权时 |
|---|---|---|
| 结构差异（内联设计系统 config / 插件源码等非 class 区域） | `--allow-structural` | 退出码 **2**（advisory） |
| 语义类重构（`SIZE_MAP` 解释不了的，如 `text-sm` → `.item-title`） | `--allow-class-refactor` | 退出码 **1**（硬拒，干跑也拒） |
| 页集增删 / 文本变更 | `--reinit --only <fixture>` + `--allow-pageset-change` | 退出码 **1**（硬拒） |

**授权前逐条判读审计报告：`[text]`/`[attrs]` 里出现非页集副作用的条目即为真回归，此时不要授权。**

## 完整 SOP

`scripts/freeze-golden.js`（`npm run freeze-golden`）重冻 golden 基线，覆盖 `utils/golden-fixtures.js` 的 `GOLDEN_FIXTURES` 表（fixture × 平台）：**带硬门禁**——`text`/`attrs` 两维必须与旧基线逐字零差异（**永远硬**），`classes`（含 `<script>` 内字符串写死的类名，由 `gateRawClasses` 覆盖）差异必须 100% 可由「任意字号 → token」映射表（`utils/golden-gate.js` 的 `SIZE_MAP`）解释，且新产物不得残留任意字号。SOP：**先干跑核对再 `--write`**；若探针报出非 class 区域差异（含内联设计系统 config/插件源码变化），`--write` 需加 `--allow-structural` 显式授权（advisory，未授权时退出码 2）；若为**有意的语义类重构**（如 `text-sm` → `.item-title`，无法被 `SIZE_MAP` 解释），需加 `--allow-class-refactor` 显式授权——**未授权时硬拒（退出码 1，干跑也拒）**；class 差异全量样本写入 `~/.local/share/opencode/backups/product-prototype-generation/class-refactor-<ts>.log` 供人工核对（防样本截断漏核）。`--write` 会把旧基线移到 `~/.local/share/opencode/backups/product-prototype-generation/<fixture>-<platform>-<ts>`（**按组**各保留最近 3 份）。`--only <fixture>[,<fixture>…]` 可把处理面收窄到指定 fixture（未登记的名字直接报错退出 1，不静默全跑；门禁强度不变）。**新增 fixture**：先登记进 `GOLDEN_FIXTURES`，再 `--init` 干跑（无旧基线可比，门禁退化为「文件集 == PRD 页面集」+「产物零任意字号」）→ `--write --init` 落盘；`--init` 只处理无基线的 fixture-平台，已有基线一律跳过（跳过时会提示改用 `--reinit`）。

**文件集（页面集）变化一律硬拒**（`missing`=页面消失/改名、`added`=新增页面；页集变化会改写全部重叠页面的 text/attrs，与真回归不可区分）；改页集请新建 fixture 走 `--init` 流程。**既有 fixture 确需增删页**时用 `--reinit --only <fixture>`（**必须**配 `--only`，禁止全量重建；与 `--init` 互斥）：它把 `auditPageset(旧基线, 新产物)` 接成**强制前置**（逐维增删条目 + 文件集变化，报告落 `.bak/pageset-audit-<fixture>-<platform>-<ts>.log`，按组保留最近 3 份），**未授权硬拒**；加 `--allow-pageset-change` 才继续，且仍要过「文件集 == PRD 页面集」+「产物零任意字号」，`--write` 时旧基线**先移入 `.bak` 再入位新基线**（不是「先删后建」，无保护空窗）。该路径由 `selfcheck` 场景 33 端到端锁定。

## 门禁边界（重要）

三维实现见 `utils/copy-golden.js`，其 `stripNoise` 会剔除 `<script>`/`<style>` 区，属性维只覆盖 `aria-label/alt/placeholder/title`——**故三维门禁不覆盖** `<script>`/`<style>`/其它属性（`href`/`style`/`data-*`）/空白/几何值。这些区域的改动不破 golden，是几何与插件参数化能零破坏的基础；但**重冻时它们可能被一并固化**，故 freeze 脚本提供「结构性差异探针」（报告差异行数/样本/涉及区域），须人工核对。

> 推论：改**配色/内联 Tailwind config** 属结构差异（需 `--allow-structural`），改**设计令牌但保持默认路径逐字节不变**（纯加法，如新增主题包）则干跑零差异、无需重冻。
