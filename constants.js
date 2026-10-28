/**
 * 设计系统常量 - 统一管理所有设计令牌
 * 单一事实来源，避免硬编码分散
 */

// 产品类型规范列表：所有以 productType 为键的表（brandColors / unsplashFallback /
// COPY_LEXICON / PRODUCT_KEYWORDS / PRODUCT_TEMPLATES）的键集必须覆盖本列表。
// selfcheck 场景 12 会断言一致性，防止新增类型时漏改某处导致静默降级。
// 注：`themePalette` / `fontStacks` 是**扁平命名表**（主题按名字引用），不按 productType，
// 不在场景 12 的断言面内。
export const PRODUCT_TYPES = ['ecommerce', 'saas', 'tool', 'community', 'content', 'other'];

export const DESIGN_TOKENS = {
  // 断点系统
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },

  // 圆角系统
  radius: {
    none: '0',
    sm: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
    '2xl': '1rem',
    '3xl': '1.5rem',
    '4xl': '2rem',
    full: '9999px',
  },

  // 阴影系统 - 多层柔和、低强度、带轻微色调，避免生硬黑边
  shadows: {
    xs: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
    sm: '0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.04)',
    md: '0 2px 4px -1px rgb(15 23 42 / 0.05), 0 4px 10px -2px rgb(15 23 42 / 0.05)',
    lg: '0 4px 8px -2px rgb(15 23 42 / 0.06), 0 12px 22px -6px rgb(15 23 42 / 0.08)',
    xl: '0 8px 16px -4px rgb(15 23 42 / 0.07), 0 22px 36px -10px rgb(15 23 42 / 0.10)',
    '2xl': '0 16px 32px -8px rgb(15 23 42 / 0.10), 0 36px 60px -16px rgb(15 23 42 / 0.13)',
    inner: 'inset 0 1px 2px 0 rgb(15 23 42 / 0.05)',
    // 移动端专用：卡片悬浮/按压阴影
    'card-hover': '0 10px 22px -8px rgb(15 23 42 / 0.12), 0 4px 8px -4px rgb(15 23 42 / 0.07)',
    // 模态框/抽屉阴影
    'modal': '0 30px 60px -12px rgb(15 23 42 / 0.22), 0 14px 24px -8px rgb(15 23 42 / 0.10)',
  },

  // 模糊系统
  blur: {
    none: '0',
    sm: '4px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    '2xl': '40px',
    '3xl': '64px',
  },

  // 字体系统
  fontFamily: {
    sans: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"SF Pro Text"',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(', '),
    mono: [
      'ui-monospace',
      'SFMono-Regular',
      '"SF Mono"',
      'Menlo',
      'Consolas',
      '"Liberation Mono"',
      'monospace',
    ].join(', '),
    // 展示字体 - 双角色排版中的标题角色（系统衬线栈，零外链）
    display: [
      '"Playfair Display"',
      'Georgia',
      '"Songti SC"',
      'Cambria',
      '"Times New Roman"',
      'serif',
    ].join(', '),
  },

  // 字号系统 - 大字号收紧字距，提升排版精致度
  fontSize: {
    // micro 低于 Tailwind 默认最小档 xs(12px)：眉标/徽标/图标尺寸这类**非正文微元素**的真实需要。
    // 命名为 micro 而非 text-2xs，避免与 Tailwind 内置阶梯混淆。
    // 禁止用 micro 承载信息性交互标签（底部导航标签、时间戳、统计值）——它们应 ≥ xs，
    // 规则与棘轮见 SKILL.md「排版角色」段与 selfcheck 场景 32。
    micro: ['0.6875rem', { lineHeight: '1.4' }],
    xs: ['0.75rem', { lineHeight: '1.5' }],
    sm: ['0.875rem', { lineHeight: '1.5' }],
    base: ['1rem', { lineHeight: '1.6' }],
    lg: ['1.125rem', { lineHeight: '1.55' }],
    xl: ['1.25rem', { lineHeight: '1.5', letterSpacing: '-0.01em' }],
    '2xl': ['1.5rem', { lineHeight: '1.35', letterSpacing: '-0.015em' }],
    '3xl': ['1.875rem', { lineHeight: '1.25', letterSpacing: '-0.02em' }],
    '4xl': ['2.25rem', { lineHeight: '1.15', letterSpacing: '-0.022em' }],
    '5xl': ['3rem', { lineHeight: '1.08', letterSpacing: '-0.024em' }],
    '6xl': ['3.75rem', { lineHeight: '1.02', letterSpacing: '-0.025em' }],
  },

  // 间距系统
  spacing: {
    0: '0',
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
    8: '2rem',
    10: '2.5rem',
    12: '3rem',
    16: '4rem',
    20: '5rem',
    24: '6rem',
  },

  // 布局令牌：单一 gutter 源。模板/生成器一律用 page 刻度（→ px-page/-mx-page/inset-x-page），
  // 不得再手写 px-4/px-5/px-6 —— 三个值并存正是「内容整体相对标题偏左」的根因。
  // 值必须是 rem 字符串：tailwind-config 直接注入 spacing，裸数字会变成 "16rem"。
  layout: {
    gutter: { mobile: '1rem', desktop: '2rem' },
    containerMax: { desktop: '80rem' },
  },

  // 设备尺寸规范已迁出为顶层 DEVICES 表（原 iphone 单机型常量定义即死、全仓零消费，
  // 外壳布局硬编码，导致预览宽度 404px 不对应任何真实设备）。见文件末尾「设备与布局档位」。

  // 产品类型 → 品牌色预设
  brandColors: {
    ecommerce: { h: 158, s: 64, l: 42, name: 'Emerald' },      // 交易/信任/绿色
    saas: { h: 221, s: 83, l: 53, name: 'Blue' },              // 专业/技术/蓝色
    tool: { h: 262, s: 83, l: 58, name: 'Violet' },            // 效率/智能/紫色
    community: { h: 330, s: 81, l: 60, name: 'Rose' },         // 社交/温暖/粉色
    content: { h: 35, s: 92, l: 50, name: 'Amber' },           // 内容/创作/橙色
    other: { h: 215, s: 28, l: 17, name: 'Slate' },            // 中性/通用/深灰
  },

  // 主题补充色板（扁平命名表，非 productType 键）：`themes/*` 只准引用色板名，
  // 色值一律留在这里。刻意**不复述** brandColors 的 6 色——主题解析时 brandColors 优先、
  // 本表兜底（`themes/index.js` 的 resolveSwatch），避免同一色号两处写、改一处漏一处。
  themePalette: {
    indigo: { h: 239, s: 84, l: 62, name: 'Indigo' },
    cyan: { h: 189, s: 94, l: 43, name: 'Cyan' },
    teal: { h: 173, s: 80, l: 40, name: 'Teal' },
    lime: { h: 84, s: 81, l: 44, name: 'Lime' },
    fuchsia: { h: 292, s: 84, l: 61, name: 'Fuchsia' },
    orange: { h: 25, s: 95, l: 53, name: 'Orange' },
    stone: { h: 25, s: 6, l: 45, name: 'Stone' },
    graphite: { h: 220, s: 9, l: 20, name: 'Graphite' },
  },

  // 主题字体栈（扁平命名表）：主题只准引用键名。**零外链**——全部是浏览器/系统已装字体，
  // 缺失时按栈顺序回退，故「字体配对」的实际观感依赖浏览机已装字体（themes.md 有声明）。
  // systemSans / editorialSerif 必须与 fontFamily.sans / display 逐字相同（selfcheck 场景 38 锁）。
  fontStacks: {
    systemSans: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"SF Pro Text"',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(', '),
    humanistSans: ['"Avenir Next"', 'Avenir', '"Segoe UI"', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'sans-serif'].join(', '),
    geometricSans: ['Futura', '"Avenir Next"', '"Century Gothic"', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'sans-serif'].join(', '),
    editorialSerif: [
      '"Playfair Display"',
      'Georgia',
      '"Songti SC"',
      'Cambria',
      '"Times New Roman"',
      'serif',
    ].join(', '),
  },

  // 语义色（基于品牌色生成变体）
  semanticColors: (brandHsl) => {
    const { h, s, l } = brandHsl;
    return {
      // 主色系
      primary: {
        50: `hsl(${h}, ${s}%, ${Math.min(95, l + 50)}%)`,
        100: `hsl(${h}, ${s}%, ${Math.min(90, l + 45)}%)`,
        200: `hsl(${h}, ${s}%, ${Math.min(80, l + 35)}%)`,
        300: `hsl(${h}, ${s}%, ${Math.min(70, l + 25)}%)`,
        400: `hsl(${h}, ${s}%, ${Math.min(60, l + 15)}%)`,
        500: `hsl(${h}, ${s}%, ${l}%)`,
        600: `hsl(${h}, ${Math.min(90, s + 10)}%, ${Math.max(35, l - 10)}%)`,
        700: `hsl(${h}, ${Math.min(90, s + 15)}%, ${Math.max(30, l - 15)}%)`,
        800: `hsl(${h}, ${Math.min(90, s + 20)}%, ${Math.max(25, l - 20)}%)`,
        900: `hsl(${h}, ${Math.min(90, s + 25)}%, ${Math.max(20, l - 25)}%)`,
        950: `hsl(${h}, ${Math.min(90, s + 30)}%, ${Math.max(15, l - 30)}%)`,
      },
      // 中性色 - 冷调蓝灰（微蓝偏移，避免纯灰的廉价感；Slate/Zinc 混合）
      neutral: {
        50: 'hsl(220, 20%, 98%)',
        100: 'hsl(220, 17%, 95%)',
        200: 'hsl(220, 14%, 90%)',
        300: 'hsl(220, 12%, 82%)',
        400: 'hsl(220, 10%, 64%)',
        500: 'hsl(220, 9%, 46%)',
        600: 'hsl(220, 10%, 34%)',
        700: 'hsl(220, 12%, 26%)',
        800: 'hsl(220, 14%, 16%)',
        900: 'hsl(220, 16%, 10%)',
        950: 'hsl(220, 20%, 5%)',
      },
      // 语义色
      success: { h: 142, s: 76, l: 36 },
      warning: { h: 38, s: 92, l: 50 },
      error: { h: 0, s: 84, l: 60 },
      info: { h: 199, s: 89, l: 48 },
    };
  },

  // Unsplash 备用图片池 - 预置稳定 ID
  unsplashFallback: {
    ecommerce: [
      'photo-1441984904996-e0b6ba687e04', // 极简商品摄影
      'photo-1556742049-0cfed4f6a45d',    // 电商包装
      'photo-1607082348824-0a96f2a4b9da', // 购物场景
      'photo-1472851294608-062f824d29cc', // 零售店铺
      'photo-1445205170230-053b83016050', // 时尚服饰
      'photo-1523381210434-271e8be1f52b', // 购物袋
    ],
    saas: [
      'photo-1551434678-e076c223a692',    // 现代办公
      'photo-1551288049-bebda4e38f71',    // 仪表盘
      'photo-1460925895917-afdab827c52f', // 团队协作
      'photo-1517245386807-bb43f82c33c4', // 开放办公区
      'photo-1497366216548-37526070297c', // 办公空间
      'photo-1521737711867-e3b97375f902', // 团队会议
    ],
    tool: [
      'photo-1581091226825-a6a2a5aee158', // 极简工作台
      'photo-1519389950473-47ba0277781c', // 生产力工具
      'photo-1551650975-87deedd944c3',    // 代码编辑器
      'photo-1498050108023-c5249f4df085', // 代码屏幕
      'photo-1487017159836-4e23ece2e4cf', // 桌面工具
      'photo-1467232004584-a241de8bcf5d', // 工作空间
    ],
    community: [
      'photo-1522071820081-009f0129c71c', // 多元人群
      'photo-1531427186611-ecfd6d936c79', // 社交连接
      'photo-1511632765486-a01980e01a18', // 社区活动
      'photo-1529156069898-49953e39b3ac', // 人群聚会
      'photo-1517457373958-b7bdd4587205', // 社群交流
      'photo-1543269865-cbf427effbad',    // 团队互动
    ],
    content: [
      'photo-1497633762265-9d179a990aa6', // 编辑排版
      'photo-1432821596592-e2c18b78144f', // 阅读空间
      'photo-1507003211169-0a1dd7228f2d', // 内容创作
      'photo-1481627834876-b7833e8f5570', // 书页阅读
      'photo-1512820790803-83ca734da794', // 书籍陈列
      'photo-1456513080510-7bf3a84b82f8', // 写作笔记
    ],
    default: [
      'photo-1618005182384-a83a8bd57fbe', // 抽象渐变
      'photo-1611224923853-80b023f02d71', // 极简设计
      'photo-1558655146-9f40138edfeb',    // 现代美学
      'photo-1519681393784-d120267933ba', // 抽象纹理
      'photo-1550859492-d5da9d8e45f3',    // 几何抽象
      'photo-1557682250-33bd709cbe85',    // 渐变背景
    ],
  },

  // 页面类型默认关键词映射
  pageKeywords: {
    home: ['hero', 'dashboard', 'landing'],
    discover: ['explore', 'browse', 'feed'],
    list: ['grid', 'catalog', 'collection'],
    detail: ['product', 'item', 'content'],
    publish: ['create', 'editor', 'upload'],
    chat: ['messaging', 'conversation', 'support'],
    orders: ['orders', 'transactions', 'history'],
    profile: ['profile', 'account', 'settings'],
    dashboard: ['analytics', 'metrics', 'overview'],
    settings: ['settings', 'preferences', 'configuration'],
    form: ['form', 'input', 'wizard'],
    login: ['login', 'auth', 'welcome'],
  },

  // 动画时长
  transition: {
    fast: '150ms',
    normal: '200ms',
    slow: '300ms',
    slower: '500ms',
  },

  // Z-index 层级
  zIndex: {
    dropdown: 100,
    sticky: 200,
    fixed: 300,
    modalBackdrop: 400,
    modal: 500,
    popover: 600,
    tooltip: 700,
    toast: 800,
  },
};

// 导出常用快捷方式
// 主题色板：`brandColors` 的键是 productType（ecommerce/saas/…），而主题要按**颜色名**引用。
// 这里建一张别名表，值**直接引用** brandColors（不复制色值），再并入主题专属补充色板
// （themePalette）。即：颜色名 → hsl 的唯一事实来源仍是本文件。
export const THEME_PALETTE = {
  emerald: DESIGN_TOKENS.brandColors.ecommerce,
  blue: DESIGN_TOKENS.brandColors.saas,
  violet: DESIGN_TOKENS.brandColors.tool,
  rose: DESIGN_TOKENS.brandColors.community,
  amber: DESIGN_TOKENS.brandColors.content,
  slate: DESIGN_TOKENS.brandColors.other,
  ...DESIGN_TOKENS.themePalette,
};

export const { breakpoints, radius, shadows, blur, fontFamily, fontSize, spacing, layout, brandColors, themePalette, fontStacks, semanticColors, unsplashFallback, pageKeywords, transition, zIndex } = DESIGN_TOKENS;

/* ═══════════════════════════════════════════════════════════════════════════
 * 语义排版角色（role → fontSize token）
 *
 * WHY：只给「刻度」不给「角色」时，模板各写各的字号 —— 同类元素（分组标题 /
 * 卡片标题 / 价格 / 统计）跨页尺寸漂移，页面显得「忽大忽小、不和谐」。
 * 此表把「角色」收敛为唯一映射，由 tailwind-config.js 解析为语义工具类
 * （.page-title / .section-title / .item-title / .price / …），模板只准引用、
 * 不准再写裸 text-* 表达这些角色。
 *
 * 值必须是 DESIGN_TOKENS.fontSize 的合法键（由 selfcheck 校验）。
 * 桌面端信息密度高，分组标题/统计各升一档（lg/xl），其余与移动端一致。
 *
 * label：字段标签 / 指标小标题这类「14px 中等字重」的行内标签。此前各模板各写
 * `text-sm font-medium`，颜色各自跟 `text-neutral-*`，属同一角色却无统一出处。
 * 角色类不设 color（同其它角色），故颜色仍由模板显式给出。
 * ═══════════════════════════════════════════════════════════════════════════ */

/** 角色 → { token, weight }；token 为 fontSize 键 */
export const TYPE_ROLES = {
  mobile: {
    pageTitle:    { token: '2xl',  weight: '700' },
    navTitle:     { token: 'lg',   weight: '600' },
    heroTitle:    { token: 'xl',   weight: '700' },
    sectionTitle: { token: 'base', weight: '600' },
    itemTitle:    { token: 'base', weight: '600' },
    price:        { token: 'lg',   weight: '700' },
    priceHero:    { token: '2xl',  weight: '700' },
    statValue:    { token: 'lg',   weight: '700' },
    statHero:     { token: '2xl',  weight: '700' },
    label:        { token: 'sm',   weight: '500' },
    meta:         { token: 'xs',   weight: '400' },
  },
  desktop: {
    pageTitle:    { token: '2xl',  weight: '700' },
    navTitle:     { token: 'lg',   weight: '600' },
    heroTitle:    { token: '2xl',  weight: '700' },
    sectionTitle: { token: 'lg',   weight: '600' },
    itemTitle:    { token: 'base', weight: '600' },
    price:        { token: 'lg',   weight: '700' },
    priceHero:    { token: '3xl',  weight: '700' },
    statValue:    { token: 'xl',   weight: '700' },
    statHero:     { token: '3xl',  weight: '700' },
    label:        { token: 'sm',   weight: '500' },
    meta:         { token: 'xs',   weight: '400' },
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 设备与布局档位
 *
 * 三层正交模型：aspectClass（档位，决定布局骨架） × crease（折痕，决定栏数）
 *               × cutout（挖孔，决定顶部安全区）
 *
 * 档位以「逻辑宽度」为主判据：<600px 单栏，≥600px 按宽高比分 pane/wide。
 * WHY 不用纯比例：iPhone Duo 外屏（466×678，0.687）与内屏（626×890，0.703）
 * 比例仅差 0.016，却应分属单栏/双栏 —— 比例分档必然误判。
 * ═══════════════════════════════════════════════════════════════════════════ */

/** 布局档位：phone 单栏 / pane 双栏+ / wide 横向双栏+ */
export const ASPECT_CLASSES = {
  phone: { layout: 'single',      nav: 'tabbar', minPanes: 1 },
  pane:  { layout: 'dual',        nav: 'rail',   minPanes: 2 },
  wide:  { layout: 'dual|triple', nav: 'rail',   minPanes: 2 },
};

const PHONE_MAX_WIDTH = 600;   // 逻辑宽 < 600 → 单栏
const WIDE_MIN_RATIO = 1.30;   // ≥600 且宽高比 > 1.30 → wide

/** 由逻辑分辨率判定档位 */
export function resolveAspectClass(w, h) {
  if (w < PHONE_MAX_WIDTH) return 'phone';
  return w / h > WIDE_MIN_RATIO ? 'wide' : 'pane';
}

const TIGHT_HEIGHT = 700;   // 逻辑高低于此值 → verticalSpace='tight'（竖向紧凑布局）

/**
 * 设备预设表。数据等级标注：
 *   【官方】厂商规格页 ｜【推导】官方物理分辨率 ÷ scale ｜【媒体】第三方实测 ｜【估计】无官方数据
 * 新增设备：填 logicalWidth/logicalHeight 即可，其余字段有兜底。
 */
export const DEVICES = {
  // ── 直板（phone 档 = ecommerce golden 基线）──
  iphone16: {
    label: 'iPhone 16', category: 'bar',
    logicalWidth: 393, logicalHeight: 852,          // 【官方】6.1" 2556×1179 @3x 460ppi
    bezel: 13, cornerRadius: 58,
    cutout: { type: 'dynamicIsland', width: 126, height: 37, radius: 20 },
    statusBarHeight: 54, homeIndicator: { width: 134, height: 5, bottom: 10 },
    tabBarHeight: 83, crease: null,
  },
  'iphone16-pro-max': {
    label: 'iPhone 16 Pro Max', category: 'bar',
    logicalWidth: 440, logicalHeight: 956,          // 【官方】6.9" 1320×2868 @3x 460ppi
    bezel: 13, cornerRadius: 58,
    cutout: { type: 'dynamicIsland', width: 126, height: 37, radius: 20 },
    statusBarHeight: 54, homeIndicator: { width: 134, height: 5, bottom: 10 },
    tabBarHeight: 83, crease: null,
  },
  'android-bar': {
    label: 'Android 直板（通用）', category: 'bar',
    logicalWidth: 360, logicalHeight: 800,          //【媒体】2026 最主流 CSS 视口
    bezel: 10, cornerRadius: 40,
    cutout: { type: 'punchHole', size: 12 },
    statusBarHeight: 32, navBarHeight: 24,
    tabBarHeight: 80, crease: null,
  },

  // ── 苹果折叠 iPhone Duo（2026-09-09 正式发布）──
  'iphone-duo-cover': {
    label: 'iPhone Duo 外屏', category: 'fold-cover',
    logicalWidth: 466, logicalHeight: 678,          //【推导】1398×2034 ÷3；官方 5.4" 460ppi
    bezel: 13, cornerRadius: 55,
    cutout: { type: 'dynamicIsland', width: 126, height: 37, radius: 20 },  // 官方：内外屏均有灵动岛
    statusBarHeight: 54, homeIndicator: { width: 134, height: 5, bottom: 10 },
    tabBarHeight: 83, crease: null,
  },
  'iphone-duo-inner': {
    label: 'iPhone Duo 内屏', category: 'fold-inner',
    logicalWidth: 626, logicalHeight: 890,          //【推导】1878×2670 ÷3；官方 7.6" 430ppi
    bezel: 13, cornerRadius: 55,
    cutout: { type: 'dynamicIsland', width: 126, height: 37, radius: 20 },
    statusBarHeight: 54, homeIndicator: { width: 134, height: 5, bottom: 10 },
    tabBarHeight: 83,
    //【估计】官方未公布折痕宽度；媒体称"视觉上几乎消除"，保守取 22px，实测后可调
    crease: { axis: 'v', positions: [0.5], width: 22 },
    layoutHint: 'two-pane',
  },

  // ── 三星折叠 ──
  'zfold7-cover': {
    label: 'Z Fold 7 外屏', category: 'fold-cover',
    logicalWidth: 384, logicalHeight: 832,          //【推导】2520×1080；官方 6.5" 21:9
    bezel: 10, cornerRadius: 40,
    cutout: { type: 'punchHole', size: 12 },
    statusBarHeight: 32, navBarHeight: 24, crease: null,
  },
  'zfold7-inner': {
    label: 'Z Fold 7 内屏', category: 'fold-inner',
    logicalWidth: 884, logicalHeight: 846,          //【媒体】8.2" 近 1:1
    bezel: 10, cornerRadius: 32,
    cutout: { type: 'underDisplay', size: 0 },      // 官方：屏下摄像头，无开孔
    statusBarHeight: 32,
    crease: { axis: 'v', positions: [0.5], width: 24 },   //【估计】
    layoutHint: 'two-pane',
  },
  'zflip7-cover': {
    label: 'Z Flip 7 外屏', category: 'flip-cover',
    logicalWidth: 420, logicalHeight: 420,          //【媒体】4.1" 近 1:1
    bezel: 10, cornerRadius: 40,
    cutout: { type: 'none', size: 0 },
    statusBarHeight: 24, crease: null,
    layoutHint: 'compact-widget',
  },
  'zflip7-inner': {
    label: 'Z Flip 7 内屏', category: 'flip-inner',
    logicalWidth: 412, logicalHeight: 900,          //【媒体】6.9"
    bezel: 10, cornerRadius: 40,
    cutout: { type: 'punchHole', size: 12 },
    statusBarHeight: 32, navBarHeight: 24,
    crease: { axis: 'h', positions: [0.5], width: 20 },   //【估计】横折 → Flex Mode
    layoutHint: 'flex-mode',
  },

  // ── 华为三折叠 Mate XT 非凡大师 ──
  'matext-1screen': {
    label: 'Mate XT 单屏态', category: 'tri-fold',
    logicalWidth: 480, logicalHeight: 1008,         //【推导】2232×1008；官方 6.4"
    bezel: 10, cornerRadius: 40,
    cutout: { type: 'punchHole', size: 12 },
    statusBarHeight: 32, crease: null,
  },
  'matext-2screen': {
    label: 'Mate XT 双屏态', category: 'tri-fold',
    logicalWidth: 900, logicalHeight: 1008,         //【推导】2232×2048；官方 7.9"
    bezel: 10, cornerRadius: 40,
    cutout: { type: 'punchHole', size: 12 },
    statusBarHeight: 32,
    crease: { axis: 'v', positions: [0.5], width: 24 },   //【估计】
    layoutHint: 'two-pane',
  },
  'matext-3screen': {
    label: 'Mate XT 三屏态', category: 'tri-fold',
    logicalWidth: 1008, logicalHeight: 1438,        //【推导】2232×3184；官方 10.2"
    bezel: 10, cornerRadius: 40,
    cutout: { type: 'punchHole', size: 12 },
    statusBarHeight: 32,
    crease: { axis: 'v', positions: [0.333, 0.667], width: 24 },  //【估计】双折痕
    layoutHint: 'triple-pane',
  },

  // ── 华为阔折 Pura X ──
  purax: {
    label: '华为 Pura X 展开', category: 'wide-fold',
    logicalWidth: 800, logicalHeight: 600,          //【媒体】6.3" 横向展开
    bezel: 10, cornerRadius: 32,
    cutout: { type: 'punchHole', size: 12 },
    statusBarHeight: 32,
    crease: { axis: 'v', positions: [0.5], width: 20 },   //【估计】
    layoutHint: 'landscape-first',
  },
};

/**
 * 栏数解析：竖折产生左右多栏（折痕数+1）；横折是上下分区，不计入栏数；
 * 同时不得低于档位下界（pane/wide 至少 2 栏）。
 * 抽成独立函数：deviceFrame 与 resolveDevice 的 aspectOverride 路径都需同一套规则，
 * 避免两处各写一遍后悄悄漂移。
 */
export function resolvePanes(aspectClass, crease) {
  const creasePanes = (crease && crease.axis === 'v') ? crease.positions.length + 1 : 1;
  return Math.max(ASPECT_CLASSES[aspectClass].minPanes, creasePanes);
}

/**
 * 派生设备几何：外框 = 逻辑尺寸 + 2×bezel（原实现把外框当逻辑分辨率，
 * iframe 撑满后得到 404px 的虚构宽度）。
 */
export function deviceFrame(d) {
  const aspectClass = resolveAspectClass(d.logicalWidth, d.logicalHeight);
  const bezel = d.bezel ?? 13;
  return {
    frameWidth: d.logicalWidth + 2 * bezel,
    frameHeight: d.logicalHeight + 2 * bezel,
    aspectClass,
    verticalSpace: d.logicalHeight < TIGHT_HEIGHT ? 'tight' : 'normal',
    panes: resolvePanes(aspectClass, d.crease),
  };
}