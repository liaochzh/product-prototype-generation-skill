# 文案域（copy domain）契约

> 本文件由 SKILL.md 拆出（2026-10-27 F1 分层）。SKILL.md 只保留结论与触发条件；需要动手改生成链路/模板/词典时读本文件。本文件不再链向其它 references 文件（引用只一层深）。

来源：SKILL.md「文案域」段（原 48–54 行）。

原型的**所有可见文案与 4 类交互属性（`placeholder`/`aria-label`/`title`/`alt`）必须来自文案包**，不得在 `.eta` 模板里硬编码领域词。

- 词典：`utils/copy-lexicon.js`，6 个产品类型（`ecommerce`/`saas`/`tool`/`community`/`content`/`other`）。`COPY_LEXICON.other` 是**规范载体**——新增槽位先加在 `other`，各类型只写差异。
- 逻辑层：`utils/copy-domain.js`——`buildCopyPack(meta, {override, logger})` 组装文案包；`assertCopyDomain(text, productType, allowTerms)` 做闸门。
- 模板取词：`<%= it.copy.<group>.<slot> %>`（eta `autoEscape:true`，**不要再包 `it.esc()`**）；`<%~ %>` 仅用于白名单（`head/signature/brandMark/pageContent/tabbar`）。
- 闸门：`scripts/verify-prototype.js` 扫全部产物，电商词泄漏到非电商产物（或反之）为 **fail**，计入 `passed`。确属合理用法时走 `override.allowTerms` 白名单。
- **桌面专属差异放 `<page>.desktop.*` 子槽位**，不要与移动端共用同名槽位——两者常有措辞/粒度差异，混用会打破 golden。
- **关闭一个可选区块 = 把非数组叶子改空，不要置空数组**：词典形状闸门（`assertLexiconConformance`）以 `other` 的路径表为基准，逐类型比对 `missing`/`extra`，数组还会校验**元素键集**。所以：
  - ✅ `price.title = ''`（渲染期 `if (title)` 判空 → 不渲染）、`imageBlock.slots = 0`（`if (slots > 0)`）、`actions[i].label = ''`（primary 回退 `form.submit`，非 primary 跳过）
  - ❌ `delivery.fields = []`（元素键集消失 → 其它类型变 `extra`，闸门红）、`title = null`（`leafType` 从 `string` 变 `null`，同样红）
  - 例外：`other` 与 `ecommerce` 同步删除某个**对象键**是允许的（如 `form.desktop.basic`），但必须**同批删除且模板不再引用**，否则未删侧变 `extra`、旧模板会 `undefined` 崩页。
