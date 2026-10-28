/**
 * Prompt 模板引擎 - LLM 不可用时的规则 fallback
 * 关键词匹配 + 预置行业模板
 */
import { log } from './logger.js';

const PRODUCT_TEMPLATES = {
  ecommerce: {
    type: 'ecommerce', label: '电商交易',
    users: ['买家（浏览/下单/评价）', '卖家（发布/发货/客服）'],
    features: ['[P0] 商品发布与管理', '[P0] 搜索与筛选', '[P0] 下单与支付', '[P1] 即时聊天', '[P1] 订单管理', '[P1] 评价体系', '[P2] 收藏与推荐'],
    pages: ['home', 'discover', 'list', 'detail', 'publish', 'chat', 'orders', 'profile'],
    flows: [{ name: '买家购买流程', actor: 'buyer', description: '浏览-下单-支付-收货-评价', steps: [{ page: 'home', action: '浏览推荐', description: '在首页浏览推荐商品' }, { page: 'detail', action: '查看详情', description: '进入商品详情页查看图文与评价' }, { page: 'chat', action: '咨询卖家', description: '与卖家沟通价格与细节' }, { page: 'orders', action: '下单支付', description: '确认订单并完成支付' }] }, { name: '卖家发布流程', actor: 'seller', description: '发布-管理-发货', steps: [{ page: 'publish', action: '发布商品', description: '填写标题价格上传图片' }, { page: 'orders', action: '处理订单', description: '确认订单并发货' }] }],
  },
  saas: {
    type: 'saas', label: 'SaaS 管理',
    users: ['管理员（配置/权限/审计）', '成员（协作/执行）'],
    features: ['[P0] 工作台总览', '[P0] 数据列表与筛选', '[P0] 详情与操作', '[P1] 新建/编辑表单', '[P1] 权限与设置', '[P2] 数据导出'],
    pages: ['dashboard', 'list', 'detail', 'form', 'settings'],
    flows: [{ name: '日常管理流程', actor: 'admin', description: '总览-筛选-处理', steps: [{ page: 'dashboard', action: '查看指标', description: '进入工作台查看核心指标' }, { page: 'list', action: '筛选数据', description: '在列表页筛选待处理项' }, { page: 'detail', action: '处理详情', description: '进入详情页执行操作' }] }],
  },
  tool: {
    type: 'tool', label: '效率工具',
    users: ['个人用户（创建/管理/导出）'],
    features: ['[P0] 快速创建', '[P0] 列表管理', '[P0] 详情预览', '[P1] 搜索与标签', '[P2] 设置与同步'],
    pages: ['home', 'list', 'detail', 'form', 'settings'],
    flows: [{ name: '高效使用流程', actor: 'user', description: '创建-管理-复用', steps: [{ page: 'home', action: '快速入口', description: '从首页快捷创建' }, { page: 'list', action: '管理内容', description: '在列表中检索与管理' }] }],
  },
  community: {
    type: 'community', label: '社区社交',
    users: ['内容消费者（浏览/互动）', '创作者（发布/经营）'],
    features: ['[P0] 信息流', '[P0] 发布器', '[P0] 详情与评论', '[P1] 关注与消息', '[P1] 个人主页', '[P2] 话题与搜索'],
    pages: ['home', 'discover', 'detail', 'publish', 'chat', 'profile'],
    flows: [{ name: '互动消费流程', actor: 'user', description: '刷流-互动-关注', steps: [{ page: 'home', action: '刷信息流', description: '浏览推荐内容' }, { page: 'detail', action: '点赞评论', description: '进入详情互动' }, { page: 'profile', action: '关注作者', description: '进入主页关注' }] }],
  },
  content: {
    type: 'content', label: '内容阅读',
    users: ['读者（阅读/订阅/收藏）', '作者（创作/发布）'],
    features: ['[P0] 首页推荐', '[P0] 文章详情', '[P0] 发布编辑', '[P1] 搜索与分类', '[P1] 订阅与收藏'],
    pages: ['home', 'discover', 'list', 'detail', 'publish', 'profile'],
    flows: [{ name: '阅读订阅流程', actor: 'user', description: '发现-阅读-订阅', steps: [{ page: 'discover', action: '发现内容', description: '按分类发现感兴趣内容' }, { page: 'detail', action: '深度阅读', description: '沉浸式阅读正文' }] }],
  },
  other: {
    type: 'other', label: '通用产品',
    users: ['普通用户（浏览/操作/管理）'],
    features: ['[P0] 首页总览', '[P0] 列表浏览', '[P0] 详情查看', '[P1] 新建编辑', '[P1] 个人中心'],
    pages: ['home', 'list', 'detail', 'form', 'profile'],
    flows: [{ name: '通用使用流程', actor: 'user', description: '总览-浏览-操作', steps: [{ page: 'home', action: '进入首页', description: '查看总览与快捷入口' }, { page: 'list', action: '浏览列表', description: '筛选查看目标项' }, { page: 'detail', action: '查看操作', description: '进入详情执行操作' }] }],
  },
};

export function detectTypeByKeywords(input) {
  const m = [
    ['ecommerce', ['商城', '电商', '购物', '二手', '闲置', '交易', '买卖', '卖货', '店铺']],
    ['saas', ['管理', '后台', 'SaaS', '企业', '协作', 'OA', 'CRM', 'ERP', '仪表']],
    ['tool', ['工具', '效率', '记', '待办', '日程', '转换', '计算', '生成器']],
    ['community', ['社区', '社交', '论坛', '交友', '圈子', '动态', '直播', '粉丝']],
    ['content', ['阅读', '博客', '资讯', '文章', '内容', '小说', '专栏', '订阅']],
  ];
  for (const [t, kws] of m) if (kws.some((k) => input.includes(k))) return t;
  return 'other';
}

export function getTemplate(type) {
  return PRODUCT_TEMPLATES[type] || PRODUCT_TEMPLATES.other;
}

export function buildPRDFromTemplate(rawInput, type) {
  const t = getTemplate(type);
  const title = rawInput.slice(0, 30);
  return `# ${title}产品需求文档\n\n> 由规则引擎自动生成（LLM 不可用时的兜底）。请按确认表单选择平台进入原型阶段。\n\n## 1. 产品概述\n- 一句话：${rawInput}\n- 产品类型：${t.label}\n- 目标：7 天可验证的最小可用原型，核心链路可点击走通。\n\n## 2. 目标用户\n${t.users.map((u) => `- ${u}`).join('\n')}\n\n## 3. 核心功能（优先级）\n${t.features.map((f) => `- ${f}`).join('\n')}\n\n## 4. 用户交互路径（User Flows）\n${t.flows.map((f) => `### ${f.name}（${f.actor}）\n${f.description}\n${f.steps.map((s, i) => `- 步骤${i + 1}：在${s.page}页${s.action}——${s.description}`).join('\n')}`).join('\n\n')}\n\n## 5. 页面清单与跳转关系\n${t.pages.map((p) => `- ${p}：核心页面，支持返回与跳转`).join('\n')}\n- 跳转：home → list → detail → orders/profile；publish ↔ home；chat ↔ detail/orders。\n\n## 6. 非功能性需求\n- 性能：首屏 < 2s，图片懒加载，CDN 可达。\n- 安全：输入转义，敏感词过滤，不存储真实隐私数据。\n- 可用性：全中文、无 Lorem Ipsum、按钮有反馈。\n- 可访问性：语义化标签、键盘可达、对比度达标。\n- 兼容性：Chrome/Safari/Edge 最新版，移动端 390px / PC 端 1280px。\n`;
}

export function buildLLMPrompt(rawInput) {
  return `你是资深产品经理。用户需求：「${rawInput}」。\n零提问，直接脑补合理细节，输出完整中文 PRD Markdown，必须包含：\n1 产品概述与一句话定位；2 目标用户（2-3类画像）；3 核心功能列表带[P0/P1/P2]；4 完整用户交互路径（含买/卖或主备角色，步骤到页面级）；5 页面清单与跳转关系；6 非功能性需求（性能/安全/可用性/可访问性/兼容性，给可验收指标）。\n约束：简体中文、无 Lorem Ipsum、页面名用英文小写（home/list/detail/publish/chat/orders/profile/dashboard/settings/form/login其一），篇幅800-2000字。只输出 Markdown 正文。`;
}

export default { detectTypeByKeywords, getTemplate, buildPRDFromTemplate, buildLLMPrompt };
