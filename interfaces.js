/**
 * 核心接口约定（JSDoc 形式，仅文档作用，无运行时导出）
 *
 * @typedef {Object} PRDMeta
 * @property {string} productName
 * @property {'ecommerce'|'saas'|'tool'|'community'|'content'|'other'} productType
 * @property {string} [brandColor]
 * @property {'mobile'|'desktop'|'both'} targetPlatform
 * @property {string[]} corePages
 * @property {Object[]} userFlows
 * @property {Object[]} features
 * @property {Object[]} nonFunctional
 *
 * @typedef {Object} TemplateProvider
 * @property {'mobile'|'desktop'} name
 * @property {string} layoutPath
 * @property {Record<string,string>} componentPaths
 * @property {Record<string,string>} pagePaths
 *
 * @typedef {Object} TailwindConfig
 * @property {Object} theme
 *
 * @typedef {Object} GenerationResult 对应 prototype/generation-report.json 的实际字段
 * @property {boolean} success
 * @property {'mobile'|'desktop'} platform
 * @property {string[]} pages 实际落盘的页序（桌面端 home 即 index.html）；**只含本平台有模板的页，且 ≤10**
 * @property {string[]} skippedPages 因本平台无对应模板而跳过的页名（恒存在；无跳过时为 `[]`）。
 *   移动端只有 10 个页面模板（无 `form`/`dashboard`/`settings`）；旧版会静默用 home 模板顶替，
 *   现改为跳过并在此留痕，绝不渲染重复首页。
 * @property {string[]} truncatedPages 因 10 页上限被截断的页名（恒存在；无截断时为 `[]`）。
 *   排序键是「用户流程频次 → 固定页序」，不是页面清单顺序。
 * @property {string[]} unknownPages 页面清单里 `normalizePageName` 认不出、已被忽略的页名（恒存在）。
 *   `--prd` 严格路径的留痕出口；自由格式文档请走 `--from=`（其假设清单是另一套出口）。
 *   整节全未识别时 `parsePRD` 会回退默认页集（`pageListFallback`），生成器另有 warn。
 * @property {string} productType 判定出的产品类型；**缺失时 verify-prototype 会整体跳过文案域闸门**
 * @property {string|null} theme 本次使用的可选主题键（`--theme`）；未给时为 null（= 走 productType 预设，产物与旧版逐字节一致）
 * @property {'prd'|'doc'} prdSource PRD 来源：`doc` 表示由 `generate-prd.js --from=` 从需求文档导入（需 `prdPath` 与 `prdSha1` 双匹配）
 * @property {string[]} assumptions 文档导入时的假设清单（`[页面]`/`[章节]` 前缀）；原话路径为 `[]`
 * @property {string[]} prdWarnings `validatePRD()` 的结构告警（缺章节等），机器可读版
 * @property {'lexicon'|'override'} copySource
 * @property {string} copyType 实际生效的类型（未知类型回退 other）
 * @property {string[]} allowTerms
 * @property {number} files 落盘文件数（不是数组）
 * @property {number} totalSize
 * @property {number} imgCount
 * @property {number} duration
 * @property {string[]} warnings
 * @property {string} at
 * @property {Capabilities|null} capabilities 环境能力矩阵；`PREFLIGHT=0` 或探测被跳过时为 null
 *
 * @typedef {Object} Capabilities 环境能力矩阵（**记录项**，不参与任何 pass/fail 判定）
 * @property {boolean} chrome 本机是否找得到 Chrome（浏览器层 harness 的前提）
 * @property {boolean|null} tailwindCdn Play CDN 是否可达；false 时产物样式会全失效
 * @property {boolean|null} unsplash Unsplash 是否可达；false 时图片退 SVG 占位
 * @property {number} localAssets `<WORKSPACE>/assets/` 内图片数（本地资产优先策略是否生效）
 * @property {'unknown'|boolean} mcpImage 生图 MCP 能力：脚本探测不到，恒为 'unknown'，由调用方失败时回填
 * @property {string} checkedAt 探测时间（ISO）
 *
 * ── 文案域（P1 起）────────────────────────────────────────────────────
 *
 * @typedef {Object} CopyPackResult
 * @property {Record<string,any>} pack 文案包，形状由 COPY_LEXICON[copyType] 决定
 * @property {'lexicon'|'override'} copySource 是否有 override 参与
 * @property {string} copyType 实际生效的产品类型（未知类型回退 'other'）
 * @property {string[]} allowTerms 领域白名单词，参与文案域闸门放行
 * @property {string[]} warnings 合并期告警（标量写向子树等）
 *
 * @typedef {Object} CopyLexiconEntry 单个产品类型的词典
 * @property {Object} object 名词/量词（noun/nounPlural/unit）
 * @property {Object} search 全局搜索框（placeholder/ariaLabel）
 * @property {Object} a11y 无障碍地标与通用标签
 * @property {Record<string,string>} nav 侧边导航文案（home/list/detail/… 键取词）
 * @property {Object} ux 通用交互文案（prev/next/viewAll…）
 * @property {Object[]} tabbar 移动端底部导航
 * @property {Object} layout 桌面外壳（侧栏/顶栏）
 * @property {Object} home 页面级文案（其余页同理：discover/list/detail/publish/form/
 *   settings/orders/chat/profile/dashboard，均为**顶层直接子键**，无 pages 容器、无根级 title）
 *
 * 注：各页子结构见 utils/copy-lexicon.js 的 OTHER 声明，它是形状的唯一事实来源。
 * 桌面专属差异一律放在该页的 `desktop` 子对象下，**不要**与移动端共用同名槽位
 * （两者常有措辞/粒度差异，混用会打破 fixtures/golden 的三维回归）。
 *
 * @typedef {Object} ConformanceResult
 * @property {boolean} ok
 * @property {{type:string, missing:string[], extra:string[]}[]} problems
 * @property {string[]} base 规范路径表（COPY_SCHEMA 或 COPY_TYPED_SCHEMA）
 * @property {boolean} deepArrays 是否含数组元素键与叶子类型
 */

// 新平台扩展时实现 TemplateProvider 约定：
// - getPageList(prdMeta) → string[]
// - getGlobalContext(prdMeta, tailwindConfig) → Record<string, any>
// - getPageContext(pageName, prdMeta, globalContext) → Record<string, any>
export {};
