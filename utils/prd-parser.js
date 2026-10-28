/**
 * PRD 解析器 - 从 Markdown PRD 提取结构化元数据
 */

import { log } from './logger.js';
import { PRDParseError, PRDValidationError } from './errors.js';

/**
 * 节截断锚点：在下一个 `##`/`#` 标题处结束。
 * 旧写法 `(?=\n##|\n#|$)` 里的 `\n#` 会命中 `###` 子标题（`###` 后无空格），
 * 把整节截成一行 —— 用户流程/页面清单/核心功能都因此丢内容。
 * `#{1,2}` 后要求空白，故 `###` 不参与截断（它是节内子标题）。
 */
const SECTION_END = '(?=\\n#{1,2}\\s|$)';

/** 构造「以 label 开头的整节」正则，统一节截断口径（label 按正则片段解释）。 */
const sectionRe = (label, flags = 'i') => new RegExp(`${label}[\\s\\S]*?${SECTION_END}`, flags);

/**
 * 解析 PRD Markdown 内容
 */
export function parsePRD(content) {
  const meta = {
    productName: '',
    productType: 'other',
    brandColor: null,
    targetPlatform: 'both',
    corePages: [],
    // 页面清单里写了条目但**一个都没识别出来**（parsePRD 回退默认页集）时为 true：
    // 生成器据此 warn，避免「PRD 与产物页集无关」却静默通过。
    pageListFallback: false,
    userFlows: [],
    features: [],
    nonFunctional: [],
  };

  if (!content || !content.trim()) {
    meta.productName = '未命名产品';
    return meta;
  }

  try {
    // 1. 提取产品名称
    meta.productName = extractProductName(content) || '未命名产品';

    // 2. 识别产品类型
    meta.productType = detectProductType(content);

    // 3. 提取品牌色
    meta.brandColor = extractBrandColor(content);

    // 4. 确定目标平台
    meta.targetPlatform = detectTargetPlatform(content);

    // 5. 提取核心页面（sink 同时给出「未识别条目」，用于 PRD 严格路径的留痕）
    const pageClaims = { recognized: 0, unknown: [] };
    meta.corePages = extractCorePages(content, pageClaims);
    meta.pageListFallback = pageClaims.recognized === 0 && pageClaims.unknown.length > 0;

    // 6. 解析用户流程
    meta.userFlows = parseUserFlows(content);

    // 7. 解析功能特性
    meta.features = parseFeatures(content);

    // 8. 解析非功能性需求
    meta.nonFunctional = parseNonFunctional(content);

    log.parser.info(`Parsed PRD: ${meta.productName} (${meta.productType})`);
    return meta;
  } catch (error) {
    log.parser.warn('PRD 解析异常，使用默认值:', error.message);
    meta.productName = meta.productName || '未命名产品';
    return meta;
  }
}

/**
 * 提取产品名称
 */
function extractProductName(content) {
  // 尝试多种模式
  const patterns = [
    /^#\s+(.+)$/m,                    // # 产品名称
    /产品名称[：:]\s*(.+)/i,           // 产品名称：xxx
    /项目名称[：:]\s*(.+)/i,           // 项目名称：xxx
    /Product Name[：:]\s*(.+)/i,       // Product Name: xxx
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      return match[1].trim().replace(/[#*`]/g, '');
    }
  }

  // 从第一个标题推断
  const firstHeading = content.match(/^#{1,3}\s+(.+)$/m);
  if (firstHeading) {
    return firstHeading[1].trim();
  }

  return null;
}

/**
 * 检测产品类型
 */
function detectProductType(content) {
  const lowerContent = content.toLowerCase();

  const typeKeywords = {
    ecommerce: ['电商', '商城', '购物', '交易', '买卖', '二手', '闲置', '卖家', '买家', '订单', '购物车', '支付', 'sku', 'spu'],
    saas: ['saas', '管理系统', '后台', '企业', 'b2b', '协作', '团队', '权限', '组织', '仪表盘', '报表', '数据分析'],
    tool: ['工具', '效率', '生产力', '开发', '编辑器', '转换', '压缩', '计算', '自动化', '脚本', 'cli'],
    community: ['社区', '社交', '论坛', '直播', '交友', '动态', '关注', '粉丝', '私信', '圈子', '话题', '广场'],
    content: ['内容', '阅读', '写作', '博客', '资讯', '文章', '发布', '编辑', '排版', '订阅', '专栏', '新闻'],
  };

  const scores = {};
  for (const [type, keywords] of Object.entries(typeKeywords)) {
    scores[type] = keywords.reduce((score, kw) => {
      const regex = new RegExp(kw, 'gi');
      const matches = lowerContent.match(regex);
      return score + (matches ? matches.length : 0);
    }, 0);
  }

  // 返回得分最高的类型
  const maxType = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b);
  return maxType[1] > 0 ? maxType[0] : 'other';
}

/**
 * 提取品牌色
 */
function extractBrandColor(content) {
  const patterns = [
    /品牌色[：:]\s*(#[0-9a-fA-F]{6}|hsl\([^)]+\)|rgb\([^)]+\))/i,
    /主色[：:]\s*(#[0-9a-fA-F]{6}|hsl\([^)]+\)|rgb\([^)]+\))/i,
    /brand.color[：:]\s*(#[0-9a-fA-F]{6}|hsl\([^)]+\)|rgb\([^)]+\))/i,
    /primary.color[：:]\s*(#[0-9a-fA-F]{6}|hsl\([^)]+\)|rgb\([^)]+\))/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * 检测目标平台
 */
function detectTargetPlatform(content) {
  const lowerContent = content.toLowerCase();

  const mobileKeywords = ['移动端', 'app', '手机', 'iphone', 'android', '小程序', 'uniapp', 'flutter', 'react native'];
  const desktopKeywords = ['pc端', 'web端', '桌面端', '管理后台', 'dashboard', '大屏', '浏览器'];

  let mobileScore = 0, desktopScore = 0;

  for (const kw of mobileKeywords) {
    if (lowerContent.includes(kw)) mobileScore++;
  }
  for (const kw of desktopKeywords) {
    if (lowerContent.includes(kw)) desktopScore++;
  }

  if (mobileScore > desktopScore) return 'mobile';
  if (desktopScore > mobileScore) return 'desktop';
  return 'both';
}

/**
 * 提取核心页面。
 * @param {string} content PRD 正文
 * @param {{recognized:number, unknown:string[]}|null} [sink] 可选观测口：统计页面清单里
 *   「被识别」与「未被识别」的条目。**判定输入与不传 sink 时逐字一致**（整行交给
 *   `normalizePageName`，冒号后的描述也参与判定——与历史行为保持一致，勿改）。
 *   `unknown` 存展示名（冒号前），供 `extractUnknownPageNames` 留痕。
 */
function extractCorePages(content, sink = null) {
  const pages = new Set();

  // 从页面清单/页面列表提取
  const pageListPatterns = [
    sectionRe('页面清单'),
    sectionRe('页面列表'),
    sectionRe('核心页面'),
    sectionRe('page.list'),
  ];

  for (const pattern of pageListPatterns) {
    const match = content.match(pattern);
    if (match) {
      const listContent = match[0];
      // 提取列表项
      const items = listContent.match(/[-*]\s*(.+)/g) || [];
      for (const item of items) {
        const line = item.replace(/[-*]\s*/, '');
        const pageName = normalizePageName(line);
        if (pageName) {
          pages.add(pageName);
          if (sink) sink.recognized++;
        } else if (sink) {
          const label = line.replace(/[：:].*$/, '').trim() || line.trim();
          if (label) sink.unknown.push(label);
        }
      }
    }
  }

  // 从用户流程提取
  const flowPages = extractPagesFromFlows(content);
  flowPages.forEach(p => pages.add(p));

  // 标准页面映射
  const standardPages = {
    '首页': 'home', 'home': 'home', '主页': 'home',
    '发现': 'discover', 'discover': 'discover', '广场': 'discover',
    '列表': 'list', 'list': 'list', '商品列表': 'list', '内容列表': 'list',
    '详情': 'detail', 'detail': 'detail', '商品详情': 'detail', '文章详情': 'detail',
    '发布': 'publish', 'publish': 'publish', '创建': 'publish', '新增': 'publish',
    '聊天': 'chat', 'chat': 'chat', '消息': 'chat', '会话': 'chat', '客服': 'chat',
    '订单': 'orders', 'orders': 'orders', '我的订单': 'orders', '交易记录': 'orders',
    '个人中心': 'profile', 'profile': 'profile', '我的': 'profile', '设置': 'settings',
    '仪表盘': 'dashboard', 'dashboard': 'dashboard', '概览': 'dashboard',
    '登录': 'login', 'login': 'login', '注册': 'register', '注册登录': 'login',
  };

  // 如果没提取到页面，使用默认集合
  if (pages.size === 0) {
    return ['home', 'list', 'detail', 'profile'];
  }

  // 标准化并返回
  return Array.from(pages).map(p => standardPages[p] || p).filter(Boolean);
}

/**
 * 从用户流程提取页面
 */
function extractPagesFromFlows(content) {
  const pages = new Set();
  const flowSection = content.match(sectionRe('用户流程')) ||
                      content.match(sectionRe('user.flow'));

  if (flowSection) {
    const stepPattern = /步骤|step|页面|page/gi;
    const lines = flowSection[0].split('\n');
    for (const line of lines) {
      if (stepPattern.test(line)) {
        const pageMatch = line.match(/(?:页面|page|跳转到|进入)\s*[：:]\s*(.+)/i);
        if (pageMatch) {
          pages.add(normalizePageName(pageMatch[1]));
        }
      }
    }
  }
  return Array.from(pages);
}

/**
 * 标准化页面名称：优先取行首英文 token（如 "home：核心页面" → "home"），过滤中文描述残留
 */
export const KNOWN_PAGES = new Set(['home', 'discover', 'list', 'detail', 'publish', 'chat', 'orders', 'profile', 'dashboard', 'settings', 'form', 'login', 'register']);

/**
 * 页面清单里「无法归一化」的页名（展示名取冒号前）。
 *
 * WHY 需要：`--prd` 严格路径只收 `normalizePageName()` 认识的页名，其余被静默丢弃——
 * 产物少页而 rc=0、无 warn、无报告痕迹。`--from=` 文档路径有 tolerant + 假设清单兜底，
 * 本函数只补 PRD 路径。判定与 `extractCorePages` **共用同一循环**（同一 sectionRe、
 * 同一入参），避免「判为未登记但实际进了页集」这类共模漂移。
 */
export function extractUnknownPageNames(content) {
  const sink = { recognized: 0, unknown: [] };
  extractCorePages(content, sink);
  return [...new Set(sink.unknown)];
}
function normalizePageName(name) {
  const s = String(name || '').trim().toLowerCase();
  // 行首英文 token
  const head = s.match(/^([a-z]+)/);
  if (head && KNOWN_PAGES.has(head[1])) return head[1];
  // 行内首个已知页面词
  for (const p of KNOWN_PAGES) {
    if (s.includes(p)) return p;
  }
  // 中文名映射
  const zhMap = { '首页': 'home', '主页': 'home', '发现': 'discover', '广场': 'discover', '列表': 'list', '详情': 'detail', '发布': 'publish', '创建': 'publish', '新增': 'publish', '聊天': 'chat', '消息': 'chat', '会话': 'chat', '订单': 'orders', '个人中心': 'profile', '我的': 'profile', '仪表盘': 'dashboard', '概览': 'dashboard', '设置': 'settings', '表单': 'form', '登录': 'login', '注册': 'register' };
  for (const [zh, en] of Object.entries(zhMap)) {
    if (s.includes(zh)) return en;
  }
  return '';
}

/* ───────────────────────────────────────────────────────────────────────────
 * F2-docs：需求文档（自由格式 Markdown）导入
 *
 * WHY 需要与 parsePRD 分开的路径：parsePRD 面向「已按模板写好的 PRD」，页集只认
 * 「页面清单 / 页面列表 / 核心页面」这几个精确标题；用户自己的需求文档通常写成
 * 「## 页面」「## 3. 页面清单与跳转关系」，且会用「购物车 / 结算」这类业务词。
 * 直接喂给 parsePRD 的后果是**静默降级**：
 *   - 命中 0 页 → 回退 4 页默认集（产物与文档无关）；
 *   - 未登记页名 → normalizePageName 返回 '' 被 filter 掉（页面凭空消失）。
 *     PRD 严格路径现已留痕：`report.unknownPages` + warn（`extractUnknownPageNames`，
 *     与 `extractCorePages` 共用同一扫描循环）；整节全未识别时另有 `pageListFallback` warn。
 *
 * 故 tolerant 路径做三件事，且**只在 tolerant 分支生效**（默认解析逐字不变）：
 *   1) 标题放宽（序号前缀、后缀、英文 page list）；
 *   2) 业务词经 PAGE_ALIASES 收敛到既有页名；
 *   3) 入集统一过 INTER_10 闸门，未过闸门**只记假设、不进页集**。
 *      3 是硬约束：mobile 只有 10 个页模板，dashboard/settings/form 是桌面专属；
 *      生成器会按平台模板过滤这类页（跳过 + `report.skippedPages` 留痕），**不再回退 home 副本**。
 * ─────────────────────────────────────────────────────────────────────────── */

/** 双端模板交集 10 页：`corePages` 的唯一准入闸门（mobile 缺 dashboard/settings/form）。 */
export const INTER_10 = new Set(['home', 'discover', 'list', 'detail', 'publish', 'chat', 'orders', 'profile', 'login', 'register']);

/**
 * 假设条目的类别前缀（`[页面] …`）。`generate-prd` 据此把页集假设单独挑出来，
 * 以 `> [假设]` 附到 PRD 页面清单末尾——两侧各写一份字面量就会「改一处忘一处」而静默不展示。
 */
export const PAGE_ASSUMPTION_PREFIX = '[页面] ';

/** 业务词 → 既有页名。**只做收敛、不新增页**；落点必须在 INTER_10 内（场景 39 断言）。 */
export const PAGE_ALIASES = {
  '购物车': 'orders', '购物袋': 'orders', '结算': 'orders', '收银台': 'orders',
  '收藏': 'profile', '收藏夹': 'profile', '心愿单': 'profile',
  '搜索': 'discover', '搜索页': 'discover',
  '分类': 'list', '分类页': 'list',
  '收货地址': 'profile', '地址': 'profile',
  '消息中心': 'chat', '通知': 'chat',
};

/** 页面类小节标题（宽松：容忍「## 5. 页面清单与跳转关系」「## 一、页面」「## Page list」这类写法）。
 * 两条锚的取舍：
 *  - 序号前缀交给 `stripHeadingNumber`（吃 `3.1` / `一、` / `第二章`，整段前缀，不是只吃阿拉伯数字）；
 *  - 末尾**不能加 `\b`**：JS 里中文属「非单词字符」，`页面\b` 在字符串结尾不成立，
 *    会把「## 页面」整节漏掉（首测踩到）；
 *  - 右锚**只挂裸「页面」分支**：只写 `页面` 会让「## 页面标题规范」「## 页面跳转关系」
 *    也成页面节，其正文里的 `- 详情页禁止使用弹窗` 会被 `normalizePageName` 认成 detail
 *    **静默入页集**——正是本通道要消灭的静默增页。复合词（页面清单/页面列表/核心页面）
 *    本身无歧义，不锚（否则「## 核心页面清单」「## 页面清单及跳转」会被误拒）。 */
const DOC_PAGE_HEADING_RE = /^(页面清单|页面列表|核心页面|页面(?=$|[\s与、，（(：:])|page[ .]?list)/i;

/** 剥标题序号前缀：`1.` / `3.1` / `一、` / `第二章`（中英文文档两种写法都常见）。 */
export function stripHeadingNumber(title) {
  return String(title || '')
    .replace(/^(?:\d+(?:\.\d+)*[.、]?|[一二三四五六七八九十]+[、.]|第[一二三四五六七八九十\d]+[章节][.、]?)\s*/, '')
    .trim();
}

/** 按标题切块，取出「页面类小节」（层级 2–3）的正文行；围栏代码块内的 # 不算标题。 */
function docPageBlocks(content) {
  const lines = String(content || '').split('\n');
  const blocks = [];
  let cur = null;
  let fenced = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const h = fenced ? null : line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      const level = h[1].length;
      // 同级或更高级标题结束当前块；H1 只负责关块、自己不成块
      // （若 H1 也开块，后续所有 H2 都会被视为它的内容，页面小节永远开不出来——首测踩过）。
      if (cur && level <= cur.level) { blocks.push(cur); cur = null; }
      if (!cur && level >= 2) cur = { level, heading: h[2].trim(), lines: [] };
      else if (cur) cur.lines.push(line);
      continue;
    }
    if (cur) cur.lines.push(line);
  }
  if (cur) blocks.push(cur);
  return blocks.filter((b) => b.level >= 2 && b.level <= 3 && DOC_PAGE_HEADING_RE.test(stripHeadingNumber(b.heading)));
}

/** 业务词匹配：整条命中优先，其次最长词包含（「购物车页」也能收敛）。 */
function matchAlias(text) {
  const s = String(text || '').trim();
  if (PAGE_ALIASES[s]) return PAGE_ALIASES[s];
  let best = '';
  for (const key of Object.keys(PAGE_ALIASES)) {
    if (s.includes(key) && key.length > best.length) best = key;
  }
  return best ? PAGE_ALIASES[best] : '';
}

/**
 * 页集解析（detailed）。`tolerant=false` 时**完全等价**于原 `extractCorePages`
 * （原函数体与 `''` 产生路径、`size===0` 回退语义都不动——golden 只认产物，
 * 「顺手重构」把默认路径改了也不会红）。
 * @returns {{pages: string[], unknown: string[]}}
 */
export function extractCorePagesDetailed(content, { tolerant = false } = {}) {
  if (!tolerant) return { pages: extractCorePages(content), unknown: [] };

  const pages = new Set();
  const unknown = [];
  for (const block of docPageBlocks(content)) {
    for (const line of block.lines) {
      const m = line.match(/^\s*[-*]\s+(.+)$/);
      if (!m) continue;
      // 只取条目名（`home：首页` → `home`）；页面小节里的每条列表项都是一条「页面主张」，
      // 未命中一律记假设——宁缺毋滥，比静默丢页可查。
      const raw = m[1].replace(/[：:].*$/, '').trim();
      if (!raw) continue;
      // 假设文案会**原样进 PRD**（`> [假设] …`），而 strict `extractCorePages` 的条目正则
      // `/[-*]\s*(.+)/g` 没有行首锚：raw 里一旦出现「 - 」「* 」这类片段，下游重读 PRD 时
      // 会把后半句当页条目（后半句含「可用页名：home/…」⇒ 幽灵页 home），击穿「页集只减不增」。
      // 故展示/落盘一律用净化后的 `shown`。
      const shown = raw.replace(/[-*]/g, '·');
      const mapped = normalizePageName(raw) || matchAlias(raw);
      if (mapped && INTER_10.has(mapped)) { pages.add(mapped); continue; }
      if (mapped) unknown.push(`${PAGE_ASSUMPTION_PREFIX}「${shown}」为桌面专属模板，不在双端交集白名单（${mapped}）内，本次不导入`);
      else unknown.push(`${PAGE_ASSUMPTION_PREFIX}「${shown}」未登记，已忽略（可用页名：${[...INTER_10].join('/')}）`);
    }
  }
  return { pages: [...pages], unknown };
}

/**
 * 需求文档 → `{meta, assumptions}`。`meta` 形状与 `parsePRD` 完全一致（模板零改动消费），
 * 仅 `corePages` 换成 tolerant 结果——**可能为空**，由 CLI 硬失败，不回退默认 4 页
 * （回退会产出与文档无关的页集，比报错更难查）。
 */
export function parseDoc(content) {
  const meta = parsePRD(content);
  const { pages, unknown } = extractCorePagesDetailed(content, { tolerant: true });
  meta.corePages = pages;
  const assumptions = [...unknown];
  for (const w of validatePRD(content).warnings) {
    // 文档用「## 页面」而模板契约叫「页面清单」：只要 tolerant 真取到了页，就不该再报缺节
    if (w.includes('页面清单') && pages.length) continue;
    if (w.startsWith('缺少章节:')) assumptions.push(`[章节] ${w.slice('缺少章节:'.length).trim()}（已按模板补齐）`);
    else if (w.includes('内容过短')) assumptions.push('[章节] 原文不足 500 字（已按模板补齐）');
  }
  return { meta, assumptions };
}

/**
 * 解析用户流程
 */
function parseUserFlows(content) {
  const flows = [];
  const flowSections = content.match(sectionRe('用户流程', 'gi')) || [];

  for (const section of flowSections) {
    const flow = { name: '', description: '', steps: [], actor: 'user' };

    // 提取流程名称
    const nameMatch = section.match(/流程名称[：:]\s*(.+)/i) || section.match(/###\s+(.+)/);
    if (nameMatch) flow.name = nameMatch[1].trim();

    // 提取角色
    const actorMatch = section.match(/角色[：:]\s*(买家|卖家|用户|管理员|游客|buyer|seller|user|admin|guest)/i);
    if (actorMatch) flow.actor = actorMatch[1].toLowerCase();

    // 提取步骤
    const stepLines = section.match(/[-*]\s*(.+)/g) || [];
    for (const line of stepLines) {
      const step = parseFlowStep(line);
      if (step) flow.steps.push(step);
    }

    if (flow.name && flow.steps.length > 0) {
      flows.push(flow);
    }
  }

  return flows;
}

/**
 * 解析流程步骤
 */
function parseFlowStep(line) {
  const clean = line.replace(/[-*]\s*/, '').trim();
  const patterns = [
    /在\s*(.+?)\s*(?:页面|页)\s*[，,]\s*(.+)/,
    /(.+?)\s*[：:]\s*(.+)/,
    /步骤\s*\d+[：:]\s*(.+)/,
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match) {
      return {
        page: normalizePageName(match[1]),
        action: match[2]?.trim() || '',
        description: clean,
      };
    }
  }

  return { page: '', action: '', description: clean };
}

/**
 * 解析功能特性
 */
function parseFeatures(content) {
  const features = [];
  const featureSections = content.match(sectionRe('核心功能', 'gi')) ||
                          content.match(sectionRe('功能列表', 'gi')) ||
                          content.match(sectionRe('features', 'gi')) || [];

  for (const section of featureSections) {
    const items = section.match(/[-*]\s*(.+)/g) || [];
    for (const item of items) {
      const clean = item.replace(/[-*]\s*/, '').trim();
      const priorityMatch = clean.match(/\[(P[0-2])\]/i);
      const priority = priorityMatch ? priorityMatch[1].toUpperCase() : 'P1';
      const name = clean.replace(/\[P[0-2]\]/i, '').trim();

      if (name) {
        features.push({
          id: `feat_${features.length + 1}`,
          name,
          description: name,
          priority,
          pages: [],
        });
      }
    }
  }

  return features;
}

/**
 * 解析非功能性需求
 */
function parseNonFunctional(content) {
  const nonFunc = [];
  const sections = content.match(sectionRe('非功能性需求', 'gi')) ||
                   content.match(sectionRe('性能要求', 'gi')) ||
                   content.match(sectionRe('non.functional', 'gi')) || [];

  const categories = ['performance', 'security', 'usability', 'accessibility', 'compatibility'];

  for (const section of sections) {
    const items = section.match(/[-*]\s*(.+)/g) || [];
    for (const item of items) {
      const clean = item.replace(/[-*]\s*/, '').trim();
      let category = 'performance';
      for (const cat of categories) {
        if (clean.toLowerCase().includes(cat)) {
          category = cat;
          break;
        }
      }
      nonFunc.push({ category, description: clean, metric: '' });
    }
  }

  return nonFunc;
}

/**
 * 验证 PRD 完整性
 */
export function validatePRD(content) {
  const errors = [];
  const warnings = [];

  // 必需章节检查
  const requiredSections = [
    { pattern: /^#\s+.+/m, name: '产品标题' },
    { pattern: /产品概述|产品简介|概述/i, name: '产品概述' },
    { pattern: /目标用户|用户画像|目标人群/i, name: '目标用户' },
    { pattern: /核心功能|功能列表|主要功能/i, name: '核心功能' },
    { pattern: /用户流程|交互流程|业务流程/i, name: '用户流程' },
    { pattern: /页面清单|页面列表|核心页面/i, name: '页面清单' },
  ];

  for (const { pattern, name } of requiredSections) {
    if (!pattern.test(content)) {
      warnings.push(`缺少章节: ${name}`);
    }
  }

  // 内容长度检查
  if (content.length < 500) {
    warnings.push('PRD 内容过短，可能不完整');
  }

  // 产品名称检查
  if (!extractProductName(content)) {
    errors.push('无法识别产品名称');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 从 PRD 生成页面优先级排序
 */
export function getPagePriority(prdMeta) {
  const { corePages, userFlows } = prdMeta;

  // 统计页面在流程中出现的频次
  const pageFrequency = {};
  for (const flow of userFlows) {
    for (const step of flow.steps) {
      if (step.page) {
        pageFrequency[step.page] = (pageFrequency[step.page] || 0) + 1;
      }
    }
  }

  // 排序：首页优先，然后按频次，最后按核心页面顺序
  const priorityOrder = ['home', 'discover', 'list', 'detail', 'publish', 'chat', 'orders', 'profile', 'dashboard', 'settings', 'form', 'login', 'register'];

  return corePages.sort((a, b) => {
    const freqA = pageFrequency[a] || 0;
    const freqB = pageFrequency[b] || 0;
    if (freqB !== freqA) return freqB - freqA;

    const idxA = priorityOrder.indexOf(a);
    const idxB = priorityOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return 0;
  });
}

export default {
  parsePRD,
  validatePRD,
  getPagePriority,
  extractProductName,
  detectProductType,
  detectTargetPlatform,
  extractCorePages,
  extractCorePagesDetailed,
  extractUnknownPageNames,
  KNOWN_PAGES,
  parseDoc,
  stripHeadingNumber,
  INTER_10,
  PAGE_ALIASES,
  PAGE_ASSUMPTION_PREFIX,
  parseUserFlows,
  parseFeatures,
  parseNonFunctional,
};