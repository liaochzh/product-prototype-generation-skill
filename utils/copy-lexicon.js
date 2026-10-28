/**
 * 文案域词典（Copy Domain Lexicon）
 *
 * 单一数据来源：为 6 种 productType 提供原型模板所需的全部领域文案。
 * 每类的叶子键集必须完全一致（`other` 为规范载体），由 copy-domain.js 的
 * assertLexiconConformance 校验，防止新增类型时漏槽位导致模板渲染 undefined。
 *
 * 命名约定：槽位按「页面键」分组（与 PAGE_TITLES 一致）；同页的移动端卡片与
 * 桌面端表格分别为 cards / table 子组。**数组元素的形状（键集与叶子类型）由
 * `assertLexiconConformance` 的 `deepArrays` 深度校验**（口径 = `other` 的路径表；
 * 类型覆盖子槽位时形状须与 `other` 对齐，否则形状闸门直接红）。
 */

// ── 全类型共用的结构文案（与领域无关） ──
const UX = {
  prev: '上一页',
  next: '下一页',
  loadMore: '加载更多',
  viewAll: '查看全部',
  more: '更多',
  all: '全部',
};

const A11Y = {
  back: '返回',
  more: '更多',
  notify: '通知',
  filter: '筛选',
  search: '搜索',
  settings: '设置',
  tabbar: '底部导航',
  navMain: '页面导航',
  prev: '上一页',
  next: '下一页',
  uploadImage: '上传图片',
  gallery: '图片轮播',
  indicators: '轮播指示器',
  bottomBar: '底部操作栏',
};

// 导航标题基线（结构标题，多数类型共用）
const NAV_BASE = {
  home: '首页',
  discover: '发现',
  list: '列表',
  detail: '详情',
  publish: '发布',
  chat: '消息',
  orders: '订单',
  profile: '我的',
  dashboard: '工作台',
  settings: '设置',
  form: '表单',
  login: '登录',
  register: '注册',
};

// 通用兜底（无领域歧义的安全词）
const OTHER = {
  object: { noun: '内容', nounPlural: '内容', unit: '条' },
  search: { placeholder: '搜索内容', ariaLabel: '搜索' },
  a11y: { ...A11Y },
  nav: { ...NAV_BASE, orders: '记录', publish: '新建' },
  ux: { ...UX },
  tabbar: [
    { target: 'home', icon: 'house', label: '首页' },
    { target: 'list', icon: 'list', label: '列表' },
    { target: 'publish', icon: 'circle-plus', label: '新建' },
    { target: 'chat', icon: 'message-circle', label: '消息' },
    { target: 'profile', icon: 'user-round', label: '我的' },
  ],
  // 桌面外壳（侧边栏 + 顶栏），与移动端外壳无共享槽位
  layout: {
    sidebarAriaLabel: '侧边栏',
    navAriaLabel: '主导航',
    searchPlaceholder: '搜索…',
    previewEyebrow: '原型预览',
    userName: '当前用户',
    userPlan: '专业版账户',
    createLabel: '新建',
  },
  home: {
    heading: '欢迎回来',
    searchBtn: '搜索',
    hero: { badge: '推荐', title: '开始你的第一件事', desc: '浏览最新内容与快捷入口。', ariaLabel: '推荐内容', imgAlt: '推荐' },
    quick: { title: '快捷入口', more: '全部', ariaLabel: '快捷入口', items: [
      { target: 'list', icon: 'layout-grid', label: '全部内容' },
      { target: 'publish', icon: 'plus-circle', label: '新建' },
      { target: 'orders', icon: 'receipt-text', label: '我的记录' },
      { target: 'profile', icon: 'user-round', label: '我的' },
    ] },
    recommend: { title: '为你推荐', more: '更多', ariaLabel: '为你推荐', imgAlt: '推荐', cardName: (i) => `精选内容 ${i + 1}`, cardMeta: '最近更新', cardSecondary: () => '查看详情' },
  },
  discover: {
    title: '发现',
    searchPlaceholder: '搜索内容',
    ariaLabel: '内容列表',
    cardImgAlt: '内容封面',
    heroImgAlt: '精选',
    heroBadge: '编辑精选',
    heroTitle: '本周值得关注',
    heroDesc: '精选优质内容，持续更新的发现流。',
    heroAriaLabel: '精选内容',
    cats: ['全部', '推荐', '最新', '热门'],
    sorts: ['综合排序', '最新更新', '最多浏览'],
    sortAriaLabel: '排序',
    cardBadge: '推荐',
    cardDesc: '值得一看的优质内容，点击查看详情。',
    loadMore: '加载更多',
    // 桌面与移动端粒度不同（桌面是内容流、移动端是书籍流），差异放子槽位
    desktop: { ariaLabel: '内容列表', cardImgAlt: '内容封面', cardName: (i) => `精选内容 ${i + 1}` },
    mobileCats: ['全部', '推荐', '最新', '热门'],
    cardName: (i) => `精选内容 ${i + 1}`,
    cardMeta: '最近更新',
    cardSecondary: (i) => `查看 ${12 + i * 7}`,
    pagination: { prev: '上一页', next: '下一页' },
  },
  list: {
    title: '内容列表',
    searchPlaceholder: '搜索内容',
    sortAriaLabel: '排序与筛选',
    ariaLabel: '内容卡片列表',
    loadMore: '加载更多…',
    sortChips: ['默认', '最新', '名称'],
    cards: { imgAlt: '内容图', name: (i) => `内容条目 ${i + 1}`, meta: '分类 · 状态 · 更新', price: () => '', strike: () => '' },
    table: {
      ariaLabel: '内容列表',
      searchPlaceholder: '搜索内容…',
      newLabel: '新建',
      newAriaLabel: '新建内容',
      totalLabel: '共 124 条',
      idPrefix: 'ID',
      categoryTone: 'neutral',
      filters: [ { ariaLabel: '状态筛选', options: ['全部状态', '进行中', '已完成', '已归档'] }, { ariaLabel: '分类筛选', options: ['全部分类', '分类一', '分类二'] } ],
      // 桌面 table 骨架为固定 7 列，语义位：0 名称(含图+ID) / 1 分类徽标 / 4 状态徽标 / 6 操作按钮
      cols: [ { label: '名称' }, { label: '分类' }, { label: '数量' }, { label: '备注' }, { label: '状态' }, { label: '更新时间' }, { label: '操作' } ],
      rows: [
        { cells: ['示例条目一', '分类一', '128', '示例备注', '进行中', '2 小时前'], badge: { text: '进行中', tone: 'emerald' } },
        { cells: ['示例条目二', '分类二', '64', '示例备注', '已完成', '昨天'], badge: { text: '已完成', tone: 'neutral' } },
        { cells: ['示例条目三', '分类一', '32', '示例备注', '已归档', '3 天前'], badge: { text: '已归档', tone: 'rose' } },
      ],
    },
  },
  detail: {
    title: '详情',
    heading: '内容标题示例',
    imageAlt: (i) => `内容图 ${i + 1}`,
    badge: '已发布',
    metaLines: ['分类', '更新于 2 天前'],
    price: { value: '', strike: '', tag: '' },
    descTitle: '内容描述',
    descText: '这里是内容的详细描述示例，用于展示排版与信息层级。',
    stats: [ { value: '1,234', label: '浏览' }, { value: '89', label: '收藏' }, { value: '23', label: '评论' } ],
    owner: { title: '创建者', name: '创建者', meta: '更新于 2 天前', cta: '联系', avatarAlt: '创建者头像' },
    related: { title: '相关推荐', imgAlt: '推荐', name: (i) => `推荐内容 ${i + 1}`, price: () => '' },
    actions: [ { icon: 'star', label: '收藏', tone: 'secondary', target: '' }, { icon: 'share-2', label: '分享', tone: 'outline', target: '' } ],
    desktop: { sub: '分类 · 来源 · 时间', heading: '内容标题示例', gallery: '内容大图', ownerAlt: '创建者头像', ownerMeta: '更新于 2 天前', ownerCta: '联系创建者', finalLabel: '当前状态', finalValue: '已发布', finalBadge: '推荐', relatedRows: [ { name: '相关条目一', value: '查看' }, { name: '相关条目二', value: '查看' } ], stats: [ { value: '1,234', label: '浏览' }, { value: '89', label: '收藏' }, { value: '23', label: '评论' } ], actions: [ { icon: 'star', label: '收藏', tone: 'outline', target: '' }, { icon: 'share-2', label: '分享', tone: 'outline', target: '' } ], guarantee: '平台保障 · 快速响应 · 售后无忧' },
    ariaLabel: { gallery: '图片轮播', indicators: '轮播指示器', bottomBar: '底部操作栏', main: '内容主图', thumb: '缩略图', purchase: '购买操作', related: '相关推荐' },
  },
  publish: {
    title: '新建',
    submit: '保存',
    imageBlock: { title: '内容图片', hint: '建议上传清晰图片', max: 3, slots: 3, ariaLabel: '图片上传', slotsAriaPrefix: '上传图片' },
    sections: [
      { title: '基本信息', ariaLabel: '基本信息', fields: [
        { id: 'pub-title', label: '标题', kind: 'text', placeholder: '请输入标题', required: true },
        { id: 'pub-cat', label: '分类', kind: 'select', options: [ { label: '分类一' }, { label: '分类二' } ] },
        { id: 'pub-desc', label: '描述', kind: 'textarea', placeholder: '请输入描述…' },
      ] },
    ],
    // 桌面端发布向导：三步式（选类型 / 填信息 / 确认发布）+ 右侧辅助卡
    desktop: {
      stepsAriaLabel: '发布步骤',
      steps: [
        { no: '1', title: '选择类型', panelTitle: '选择发布类型', regionAria: '步骤 1：选择类型', ariaLabel: '选择类型', kinds: [ { icon: 'file-text', label: '常规内容', sub: '文本与图片' }, { icon: 'link', label: '链接', sub: '外部链接' } ] },
        {
          no: '2', title: '填写信息', panelTitle: '填写信息', regionAria: '步骤 2：填写信息', ariaLabel: '填写信息',
          // required = 标签星号；ariaRequired = aria-required 属性（两者可独立）
          fields: [
            { id: 'pub-title', label: '标题', kind: 'text', placeholder: '请输入标题', required: true, ariaRequired: true, wide: true, unit: '', options: [] },
            { id: 'pub-cat', label: '分类', kind: 'select', placeholder: '', required: false, ariaRequired: false, wide: false, unit: '', options: [ { label: '分类一', selected: true, value: '' }, { label: '分类二', selected: false, value: '' } ] },
            { id: 'pub-desc', label: '描述', kind: 'textarea', placeholder: '请输入描述…', required: false, ariaRequired: false, wide: true, unit: '', options: [] },
          ],
          image: { label: '图片', slots: 3, slotsAriaPrefix: '上传图片' },
        },
        { no: '3', title: '确认发布', panelTitle: '确认发布', regionAria: '步骤 3：确认发布', ariaLabel: '确认发布', rows: [ { label: '类型', value: '常规内容' }, { label: '标题', value: '内容标题示例' } ], agree: '我已阅读并同意相关规范' },
      ],
      side: {
        tips: { title: '发布须知', ariaLabel: '发布须知', items: ['如实填写内容信息', '补充清晰图片', '发布后可随时编辑'] },
        boost: { title: '提升效果', ariaLabel: '提升效果', items: ['补充清晰图片', '信息描述完整', '便于检索与浏览'] },
        preview: { title: '发布预览', ariaLabel: '预览', imgAlt: '预览图', heading: '内容标题示例', price: '' },
      },
      nav: { prev: '← 上一步', next: '下一步 →', submit: '提交', status: '已提交（原型演示）' },
    },
  },
  form: {
    title: '表单',
    submit: '保存',
    // 字段来源：桌面与移动共用本数组；`wide` / `hint` / `options` 由桌面渲染器解释
    sections: [
      { title: '基本信息', ariaLabel: '基本信息', fields: [
        { id: 'form-name', label: '名称', kind: 'text', placeholder: '请输入名称', required: true, wide: true, hint: '', options: [] },
        { id: 'form-cat', label: '分类', kind: 'select', placeholder: '', required: false, wide: false, hint: '', options: [ { label: '请选择', selected: true, value: '' }, { label: '分类一', selected: false, value: '' } ] },
        { id: 'form-desc', label: '描述', kind: 'textarea', placeholder: '请输入描述…' },
      ] },
    ],
    // 桌面端表单的**可选区块**：imageBlock/price/delivery 均按数据存在性渲染。
    // 关闭语义用「非数组叶子空串」表达（title 为空 = 不渲染）；数组一律保留占位元素，
    // 因为词典形状闸门会校验数组元素键集（置空会让其它类型变 extra），详见 references/copy-domain.md。
    desktop: {
      imageBlock: { title: '内容图片', ariaLabel: '图片上传', hint: '建议上传清晰图片', slots: 0, slotsAriaPrefix: '上传图片' },
      price: {
        title: '', ariaLabel: '',
        unit: '¥', placeholder: '0.00', inputAriaLabel: '价格', suggest: '',
        desc: { id: 'form-price-desc', label: '价格说明', placeholder: '请输入价格说明…', required: false },
        free: { id: 'form-free', label: '', checked: false },
      },
      delivery: {
        title: '', ariaLabel: '',
        fields: [ { id: 'form-delivery', label: '交付方式', kind: 'select', placeholder: '', required: false, wide: false, hint: '', options: [ { label: '方式一', selected: true, value: '' }, { label: '方式二', selected: false, value: '' } ] } ],
        extra: { id: 'form-extra', label: '', checked: false },
      },
      // primary 的 label 留空 → 渲染期回退到 form.submit（各领域「创建任务 / 保存条目 / 保存」）
      actions: [ { id: 'form-draft', label: '存为草稿', tone: 'outline', target: '' }, { id: 'form-submit', label: '', tone: 'primary', target: '' } ],
    },
  },
  // 登录页：移动端单列卡片；桌面端「品牌说明 + 表单」双栏，全部差异走 desktop.* 子槽位。
  // 字段 kind 由本页模板解释（text / password），与 form/settings 的 text/textarea/select 各管各的。
  login: {
    title: '欢迎回来',
    subtitle: '登录后继续使用完整功能',
    ariaLabel: '登录',
    cardAriaLabel: '登录表单',
    tabsAriaLabel: '登录方式',
    // 两种登录态：`value` 即 radio 的 value/id 后缀（`login-mode-<value>`），模板据此做强绑定；
    // 切换走纯 CSS（radio + `has-[:checked]` / `group-has-[#…]/login:`），不依赖脚本。
    tabs: [
      { label: '密码登录', value: 'password' },
      { label: '验证码登录', value: 'code' },
    ],
    // a11y（WCAG 4.1.3 状态消息）：面板切换是纯 CSS，屏幕阅读器不会自动播报。
    // 模板据本表渲染 role="status" 区域，每个 value 一个 span，靠同一套
    // group-has-[#login-mode-<value>:checked] 机制决定「谁进入无障碍树」——
    // 切换 → 区域文本变化 → 播报；初始加载不播报（live region 只播报后续变化）。
    modeStatus: {
      password: '已切换到密码登录，请输入账号与密码',
      code: '已切换到验证码登录，请输入手机号并获取短信验证码',
    },
    fields: [
      { id: 'login-account', label: '账号', kind: 'text', placeholder: '手机号或邮箱', autocomplete: 'username', required: true },
      { id: 'login-password', label: '密码', kind: 'password', placeholder: '请输入密码', autocomplete: 'current-password', required: true },
    ],
    codeFields: [
      { id: 'login-phone', label: '手机号', kind: 'text', placeholder: '请输入手机号', autocomplete: 'tel', required: true },
      { id: 'login-code', label: '短信验证码', kind: 'text', placeholder: '请输入 6 位验证码', autocomplete: 'one-time-code', required: true, sendCode: true },
    ],
    // sendCode 字段右侧的「获取验证码」按钮配置（倒计时秒数由此驱动，模板写入 data-countdown）
    // statusSent/statusReady 是**播报**文案（`{{s}}` = 剩余秒数，由脚本替换）：按钮文案每秒都在变，
    // 把 live region 放按钮上会「每秒播报」——故只在开始/结束两次写入旁侧 role="status" 节点。
    codeButton: {
      idle: '获取验证码', counting: '重新获取', seconds: 60, ariaLabel: '获取短信验证码',
      statusSent: '验证码已发送，{{s}} 秒后可重新获取', statusReady: '可以重新获取验证码',
    },
    remember: { id: 'login-remember', label: '记住我', checked: true },
    forgot: { label: '忘记密码？', target: 'settings' },
    submit: '登录',
    toRegister: { label: '还没有账号？', action: '立即注册', target: 'register' },
    divider: '其他登录方式',
    socials: [
      { icon: 'message-circle', label: '微信', ariaLabel: '使用微信登录' },
      { icon: 'wallet', label: '支付宝', ariaLabel: '使用支付宝登录' },
    ],
    skip: { label: '暂不登录，先逛逛', target: 'home', fallback: 'discover' },
    legal: '登录即表示同意《服务条款》与《隐私政策》',
    desktop: {
      asideAriaLabel: '登录说明',
      asideEyebrow: '账号登录',
      asideTitle: '登录后跨设备继续',
      asideDesc: '账号与消息在多端保持一致，随时接着上次的地方继续。',
      highlights: [
        { icon: 'shield-check', text: '账号与数据加密存储' },
        { icon: 'refresh-cw', text: '多端进度实时同步' },
        { icon: 'life-buoy', text: '异常登录实时提醒' },
      ],
    },
  },
  register: {
    title: '创建账号',
    subtitle: '注册后浏览记录与订单可在多端同步',
    ariaLabel: '注册',
    cardAriaLabel: '注册表单',
    fields: [
      { id: 'reg-phone', label: '手机号', kind: 'text', placeholder: '请输入手机号', autocomplete: 'tel', required: true },
      { id: 'reg-code', label: '短信验证码', kind: 'text', placeholder: '请输入 6 位验证码', autocomplete: 'one-time-code', required: true, sendCode: true },
      { id: 'reg-password', label: '设置密码', kind: 'password', placeholder: '8-20 位，含字母与数字', autocomplete: 'new-password', required: true },
    ],
    codeButton: {
      idle: '获取验证码', counting: '重新获取', seconds: 60, ariaLabel: '获取短信验证码',
      statusSent: '验证码已发送，{{s}} 秒后可重新获取', statusReady: '可以重新获取验证码',
    },
    agree: {
      id: 'reg-agree', checked: false,
      prefix: '我已阅读并同意',
      links: [
        { text: '《用户协议》', href: '#' },
        { text: '《隐私政策》', href: '#' },
      ],
    },
    submit: '注册',
    toLogin: { label: '已有账号？', action: '去登录', target: 'login' },
    skip: { label: '暂不注册，先逛逛', target: 'home', fallback: 'discover' },
    desktop: {
      asideAriaLabel: '注册说明',
      asideEyebrow: '账号注册',
      asideTitle: '一次注册，多端通用',
      asideDesc: '手机号即可注册；登录后浏览记录、收藏与订单自动同步。',
      highlights: [
        { icon: 'user-plus', text: '手机号注册，无需邮箱' },
        { icon: 'refresh-cw', text: '浏览记录多端同步' },
        { icon: 'shield-check', text: '短信验证码保障安全' },
      ],
    },
  },
  settings: {
    title: '设置',
    // 桌面端按「账号 / 通知 / 安全 / 危险区」四段建模；移动端无独立设置页
    account: {
      ariaLabel: '账号设置', icon: 'user',
      avatarAlt: '头像', avatarBtn: '更换头像', avatarHint: '支持 JPG/PNG，不超过 2MB',
      fields: [
        { id: 'set-user', label: '用户名', kind: 'text', value: '当前用户', disabled: true, hint: '不可修改', placeholder: '' },
        { id: 'set-phone', label: '手机号', kind: 'text', value: '138****0000', disabled: true, hint: '', placeholder: '' },
        { id: 'set-mail', label: '邮箱', kind: 'text', value: 'user@example.com', disabled: false, hint: '', placeholder: '' },
        { id: 'set-intro', label: '简介', kind: 'textarea', value: '', disabled: false, hint: '', placeholder: '介绍你的特色与服务…' },
      ],
      submit: '保存设置',
    },
    notifs: { ariaLabel: '通知设置', icon: 'bell', rows: [ { label: '更新提醒', desc: '有更新时通知我', on: true }, { label: '消息通知', desc: '收到消息时通知', on: true } ] },
    security: {
      ariaLabel: '隐私与安全', icon: 'shield',
      // cta 与 badge 恒存在（'' 表示不渲染），避免同数组元素键集不一致
      rows: [
        { label: '登录密码', desc: '上次修改：2024-10-15', cta: '修改', badge: '' },
        { label: '支付密码', desc: '已设置', cta: '修改', badge: '' },
        { label: '实名认证', desc: '已完成', cta: '', badge: '已认证' },
        { label: '登录设备管理', desc: '当前 1 台设备在线', cta: '查看', badge: '' },
      ],
    },
    danger: { ariaLabel: '危险区', icon: 'triangle-alert', rows: [ { label: '注销账号', desc: '永久删除账号及所有数据，不可恢复', cta: '注销' } ] },
  },
  orders: {
    title: '我的记录',
    searchPlaceholder: '搜索记录',
    ariaLabel: { overview: '状态概览', list: '记录列表', search: '搜索记录' },
    exportLabel: '导出',
    // 「导出」是过程反馈：点击后状态写入 role="status" 区域（可见文案即 live region 内容 → 自动播报）
    exportStatus: { pending: '正在导出，请稍候…', done: '导出完成' },
    totalLabel: '共 124 条',
    rowActionLabel: '查看',
    overview: [ { label: '进行中', value: '3', icon: 'loader' }, { label: '待处理', value: '5', icon: 'clock' }, { label: '已完成', value: '2', icon: 'check-circle' }, { label: '已归档', value: '1', icon: 'archive' } ],
    tabs: [ { label: '全部', active: true }, { label: '进行中' }, { label: '已完成' }, { label: '已归档' } ],
    cards: { rows: [
      { idLabel: '编号', id: '20241201001', status: '进行中', statusColor: 'amber', name: '示例条目一', qtyLabel: '数量 ×', qty: '1', amount: '', actions: [ { label: '查看', tone: 'outline' } ] },
      { idLabel: '编号', id: '20241128003', status: '已完成', statusColor: 'emerald', name: '示例条目二', qtyLabel: '数量 ×', qty: '1', amount: '', actions: [ { label: '查看', tone: 'outline' } ] },
    ] },
    table: { cols: [ { label: '编号' }, { label: '名称' }, { label: '负责人' }, { label: '优先级' }, { label: '状态' }, { label: '更新时间' }, { label: '操作' } ], rows: [
      { cells: ['20241201001', '示例任务一', '张三', '高', '进行中', '2024-12-01 09:12'], badge: { text: '进行中', tone: 'amber' } },
      { cells: ['20241128003', '示例任务二', '李四', '中', '已完成', '2024-11-28 14:03'], badge: { text: '已完成', tone: 'emerald' } },
      { cells: ['20241127002', '示例任务三', '王五', '低', '已归档', '2024-11-27 10:00'], badge: { text: '已归档', tone: 'neutral' } },
    ] },
  },
  chat: {
    peerName: '联系人',
    peerState: '在线',
    peerRole: '对方',
    selfRole: '我',
    inputPlaceholder: '输入消息…',
    conversations: [ { name: '联系人', last: '你好', time: '09:15', badge: 0 } ],
    messages: [ { side: 'in', text: '你好，在吗？', time: '09:15' }, { side: 'out', text: '在的，有什么可以帮你？', time: '09:16' } ],
    ariaLabel: { log: '聊天记录', conversations: '会话列表', chatWindow: '聊天窗口', peerAvatar: '对方头像', send: '发送', attachments: '附件', images: '图片', voiceCall: '语音通话', videoCall: '视频通话', searchConversation: '搜索会话', inputMessage: '输入消息', addImage: '添加图片' },
    todayLabel: '今天',
  },
  profile: {
    title: '个人中心',
    name: '当前用户',
    metaLine: 'ID: 100000 · 普通会员',
    rating: '',
    avatarAlt: '头像',
    stats: [ { value: '12', label: '内容', target: '' }, { value: '8', label: '收藏', target: '' }, { value: '156', label: '关注', target: '' } ],
    assets: [ { icon: 'wallet', label: '账户', value: '—' }, { icon: 'ticket', label: '权益', value: '—' }, { icon: 'heart', label: '收藏', value: '24' }, { icon: 'folder', label: '草稿', value: '8' } ],
    menus: [ { target: 'orders', icon: 'receipt-text', title: '我的记录', sub: '查看全部记录' }, { target: 'list', icon: 'package-open', title: '我的内容', sub: '管理已发布内容' }, { target: 'chat', icon: 'message-square', title: '消息中心', sub: '沟通与通知' }, { target: 'favorite', icon: 'heart', title: '收藏夹', sub: '我收藏的内容' }, { target: 'settings', icon: 'settings', title: '账号设置', sub: '通用/通知/隐私' } ],
    sets: [ { target: 'settings', icon: 'settings', title: '设置', sub: '通用/通知/隐私' }, { target: 'help', icon: 'circle-help', title: '帮助与反馈', sub: '常见问题' }, { target: 'about', icon: 'info', title: '关于我们', sub: '版本 1.0.0' } ],
    recentOrders: { title: '最近记录', more: '全部', rows: [ { name: '示例条目一', value: '更新于 2 小时前', status: '进行中', tone: 'amber' }, { name: '示例条目二', value: '更新于昨天', status: '已完成', tone: 'emerald' } ] },
    recentTitle: '最近记录',
    favoritesTitle: '我的收藏',
    editLabel: '编辑资料',
    logout: '退出登录',
    ariaLabel: { info: '用户信息', assets: '资产快捷', menus: '功能菜单', sets: '设置与帮助', recentOrders: '最近记录', favorites: '我的收藏' },
    desktop: {
      ariaLabel: { info: '个人资料' },
      stats: [ { value: '128', label: '订单', target: '' }, { value: '8', label: '在售', target: '' }, { value: '156', label: '粉丝', target: '' }, { value: '24', label: '收藏', target: '' } ],
      menus: [ { target: 'orders', icon: 'receipt-text', title: '我的记录', sub: '查看全部记录' }, { target: 'list', icon: 'package-open', title: '我的内容', sub: '管理已发布内容' }, { target: 'chat', icon: 'message-square', title: '消息中心', sub: '沟通与通知' }, { target: 'favorite', icon: 'heart', title: '收藏夹', sub: '我收藏的内容' }, { target: 'settings', icon: 'settings', title: '账号设置', sub: '通用/通知/隐私' } ],
      comingSoon: '即将上线',
      favoritesAlt: '收藏',
    },
  },
  dashboard: {
    kpis: [ { label: '总数', value: '1,234', icon: 'layers', delta: '+12%', tone: 'up' }, { label: '活跃', value: '356', icon: 'activity', delta: '+5.4%', tone: 'up' }, { label: '本周新增', value: '128', icon: 'plus', delta: '-2.1%', tone: 'down' } ],
    kpisAriaLabel: '核心指标',
    deltaSuffix: '环比',
    // chartAriaLabel 是柱状图 aria-label 的**前缀**，完整值由 axis+bars 拼出，避免文案双写漂移
    trend: { title: '近 7 天趋势', range: '本周', sectionAriaLabel: '趋势', chartAriaLabel: '柱状图：', bars: [45, 52, 38, 61, 55, 72, 68], axis: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] },
    target: { title: '本月目标', value: '78%', remainText: '距离目标还差 22%，保持节奏即可达成。' },
    distribution: { title: '分类分布', range: '近 30 天', sectionAriaLabel: '分类分布', items: [ { label: '分类一', value: 35, color: '#3b82f6' }, { label: '分类二', value: 28, color: '#8b5cf6' } ] },
    activitiesTitle: '近期活动',
    // 桌面首页与工作台同源但粒度不同（首页 3 个概览指标、无 distribution/activities），单独成组
    home: {
      kpisAriaLabel: '数据概览',
      kpis: [ { label: '今日新增', value: '128', icon: 'user-plus', delta: '+12%', tone: 'up' }, { label: '活跃用户', value: '3,560', icon: 'users', delta: '+5.4%', tone: 'up' }, { label: '总金额', value: '¥12,480', icon: 'wallet', delta: '-2.1%', tone: 'down' } ],
      trend: { sectionAriaLabel: '趋势', title: '访问趋势', range: '近 7 天', bars: [42, 68, 55, 80, 63, 92, 74], axis: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] },
      target: { ariaLabel: '完成度', title: '本月目标', value: '78%', doneLabel: '已完成', remainText: '距离目标还差', remainValue: '', remainSuffix: '，保持节奏即可达成。' },
      tableAriaLabel: '数据表',
      tableRows: [ { cells: ['示例项目A', '', '2小时前'], badge: { text: '正常', tone: 'emerald' } }, { cells: ['示例项目B', '', '2小时前'], badge: { text: '正常', tone: 'emerald' } }, { cells: ['示例项目C', '', '2小时前'], badge: { text: '正常', tone: 'emerald' } } ],
      heroAriaLabel: '精选内容',
    },
    table: { title: '最新动态', ariaLabel: '数据表', cols: ['名称', '状态', '更新'], rows: [ { cells: ['示例项目A', '', '2小时前'], badge: { text: '正常', tone: 'emerald' } }, { cells: ['示例项目B', '', '5小时前'], badge: { text: '正常', tone: 'emerald' } } ] },
    hero: { eyebrow: '编辑精选', title: '高转化内容示例', imgAlt: '精选配图' },
    activities: [ { type: '新增', ref: '示例条目一', time: '2分钟前', dot: 'bg-emerald-500' }, { type: '更新', ref: '示例条目二', time: '5分钟前', dot: 'bg-sky-500' } ],
  },
};

/**
 * 以 `OTHER` 为规范载体覆盖领域差异槽位：
 * - 对象深合并（只写差异键）
 * - 数组整体替换（元素形状由消费方约定）
 * - 函数按引用替换
 * 形状一致性由构造保证，assertLexiconConformance 再做一次运行时兜底。
 */
export function over(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const b = out[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b)) {
      out[k] = over(b, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ═══════════════ ecommerce（二手书电商，逐字复刻既有模板字面量） ═══════════════
let ECOMMERCE = over(OTHER, {
  object: { noun: '商品', nounPlural: '商品', unit: '件' },
  search: { placeholder: '搜索商品、内容、服务', ariaLabel: '搜索' },
  nav: { publish: '发布', orders: '订单', profile: '我的', detail: '详情', form: '发布商品' },
  tabbar: [
    { target: 'home', icon: 'house', label: '首页' },
    { target: 'discover', icon: 'compass', label: '发现' },
    { target: 'publish', icon: 'circle-plus', label: '发布' },
    { target: 'chat', icon: 'message-circle', label: '消息' },
    { target: 'profile', icon: 'user-round', label: '我的' },
  ],
  home: {
    heading: '为你精选',
    searchBtn: '搜索',
    hero: { badge: '编辑精选', title: '本周人气单品', desc: '精选好物，支持聊天咨询与一键下单', ariaLabel: '精选推荐', imgAlt: '精选' },
    quick: {
      title: '快捷服务',
      more: '全部',
      ariaLabel: '快捷服务',
      items: [
        { target: 'list', icon: 'layout-grid', label: '全部商品' },
        { target: 'publish', icon: 'plus-circle', label: '发布闲置' },
        { target: 'orders', icon: 'receipt-text', label: '我的订单' },
        { target: 'profile', icon: 'user-round', label: '个人中心' },
      ],
    },
    recommend: {
      title: '为你推荐',
      more: '更多',
      ariaLabel: '为你推荐',
      imgAlt: '推荐',
      cardName: () => '精选好物',
      cardMeta: '',
      cardSecondary: () => '¥ 199 起',
    },
  },
});

ECOMMERCE = over(ECOMMERCE, {
  discover: {
    title: '发现',
    searchPlaceholder: '搜索书籍、作者、ISBN',
    ariaLabel: '书籍列表',
    cardImgAlt: '书籍封面',
    heroImgAlt: '精选',
    heroBadge: '编辑精选',
    heroTitle: '本周值得关注',
    heroDesc: '精选优质内容与好物，持续更新的发现流。',
    heroAriaLabel: '精选内容',
    cats: ['全部', '精选', '文学', '经管', '技术', '生活'],
    sorts: ['综合排序', '最新发布', '最多浏览'],
    mobileCats: ['全部', '文学', '经管', '技术', '少儿', '艺术', '生活', '二手'],
    cardName: (i) => `精选好书 ${i + 1}`,
    cardBadge: '精选',
    cardDesc: '值得一看的优质内容，点击查看详情与更多推荐。',
    desktop: { ariaLabel: '内容列表', cardImgAlt: '内容封面', cardName: (i) => `精选内容 ${i + 1}` },
    cardMeta: '作者名 · 9成新',
    cardSecondary: (i) => `¥${(12 + i * 3).toFixed(1)}`,
  },
  list: {
    title: '全部商品',
    searchPlaceholder: '搜索商品',
    ariaLabel: '商品卡片列表',
    loadMore: '上拉加载更多…',
    sortChips: ['默认', '价格↑', '价格↓', '最新', '销量'],
    cards: {
      imgAlt: '商品图',
      name: (i) => `二手书商品 ${i + 1}`,
      meta: '9成新 · 无笔记 · 包邮',
      price: (i) => `¥${(15 + i * 2).toFixed(1)}`,
      strike: (i) => `¥${(45 + i * 5).toFixed(1)}`,
    },
    table: {
      ariaLabel: '商品列表',
      searchPlaceholder: '搜索商品、订单、用户…',
      newLabel: '新建',
      newAriaLabel: '新建商品',
      totalLabel: '共 124 条',
      idPrefix: 'SPU',
      categoryTone: 'sky',
      filters: [
        { ariaLabel: '状态筛选', options: ['全部状态', '在售', '已售罄', '违规下架'] },
        { ariaLabel: '分类筛选', options: ['全部分类', '经管励志', '文学小说', '计算机技术'] },
      ],
      cols: [ { label: '商品' }, { label: '分类' }, { label: '价格' }, { label: '库存' }, { label: '状态' }, { label: '浏览/收藏' }, { label: '操作' } ],
      rows: [
        { cells: ['深度工作', '经管励志', '¥28.00', '12', '在售', '1,234 / 56'], badge: { text: '在售', tone: 'emerald' } },
        { cells: ['清单革命', '经管励志', '¥35.00', '0', '已售罄', '890 / 32'], badge: { text: '已售罄', tone: 'neutral' } },
        { cells: ['原子习惯', '经管励志', '¥22.00', '8', '在售', '2,100 / 128'], badge: { text: '在售', tone: 'emerald' } },
        { cells: ['穷查理宝典', '经管励志', '¥48.00', '3', '在售', '560 / 18'], badge: { text: '在售', tone: 'emerald' } },
        { cells: ['原子习惯(副本)', '经管励志', '¥25.00', '1', '违规下架', '120 / 5'], badge: { text: '违规下架', tone: 'rose' } },
      ],
    },
  },
});

ECOMMERCE = over(ECOMMERCE, {
  detail: {
    title: '商品详情',
    heading: '二手书商品标题示例：深度工作',
    imageAlt: (i) => `商品图${i + 1}`,
    badge: '9成新',
    metaLines: ['无笔记划线', '包邮'],
    price: { value: '¥28.00', strike: '¥59.00', tag: '5.2折' },
    descTitle: '商品描述',
    descText: '本书为《深度工作》中文版，卡尔·纽波特著。全书无笔记无划线，封面微磨损，内页干净整洁。适合想要提升专注力、深度思考能力的读者。支持平台担保交易，七天无理由退换。',
    stats: [ { value: '128', label: '浏览' }, { value: '23', label: '想要' }, { value: '5', label: '评价' } ],
    owner: { title: '卖家信息', name: '书虫小站', meta: '信誉 4.9 · 156 笔交易 · 响应快', cta: '聊一聊', avatarAlt: '卖家头像' },
    related: { title: '同类推荐', imgAlt: '推荐', name: (i) => `推荐书籍 ${i + 1}`, price: (i) => `¥${(18 + i * 4).toFixed(1)}` },
    actions: [ { icon: 'message-circle', label: '聊一聊', tone: 'secondary', target: 'chat' }, { icon: 'shopping-cart', label: '加入购物车', tone: 'primary', target: '' }, { icon: 'zap', label: '立即购买', tone: 'primary', target: '' } ],
    ariaLabel: { main: '商品主图', thumb: '缩略图', purchase: '购买操作', related: '同类推荐' },
    desktop: { sub: '卡尔·纽波特 著 · 机械工业出版社 · 2016 年版', heading: '深度工作', gallery: '商品大图', ownerAlt: '卖家', ownerMeta: '信誉 4.9 · 156 笔交易 · 平均响应 3 分钟', ownerCta: '联系卖家', finalLabel: '到手价', finalValue: '¥28.00', finalBadge: '包邮', relatedRows: [ { name: '清单革命', value: '¥35.00' }, { name: '原子习惯', value: '¥22.00' }, { name: '穷查理宝典', value: '¥48.00' } ], stats: [ { value: '1,234', label: '浏览量' }, { value: '89', label: '收藏数' }, { value: '23', label: '咨询数' } ], actions: [ { icon: 'zap', label: '立即购买', tone: 'primary', target: '' }, { icon: 'shopping-cart', label: '加入购物车', tone: 'secondary', target: '' }, { icon: 'heart', label: '收藏', tone: 'outline', target: '' }, { icon: 'share-2', label: '分享', tone: 'outline', target: '' } ], guarantee: '平台担保 · 七天无理由 · 假一赔三' },
  },
  publish: {
    title: '发布闲置',
    submit: '发布商品',
    imageBlock: { title: '商品图片（最多 9 张）', hint: '建议上传清晰正面、背面、细节图，提高成交率', max: 9, slots: 3, ariaLabel: '上传图片' },
    sections: [
      { title: '基本信息', ariaLabel: '基本信息', fields: [
        { id: 'pub-title', label: '书名/标题', kind: 'text', placeholder: '例：深度工作', ariaLabel: '书名' },
        { id: 'pub-author', label: '作者', kind: 'text', placeholder: '卡尔·纽波特', ariaLabel: '作者' },
        { id: 'pub-cat', label: '分类', kind: 'select', half: true, ariaLabel: '分类', options: [ { label: '文学小说' }, { label: '经管励志', selected: true }, { label: '计算机技术' }, { label: '少儿绘本' } ] },
        { id: 'pub-cond', label: '成色', kind: 'select', half: true, ariaLabel: '成色', options: [ { label: '全新' }, { label: '9成新', selected: true }, { label: '8成新' }, { label: '7成新' }, { label: '有瑕疵' } ] },
        { id: 'pub-isbn', label: 'ISBN（选填）', kind: 'text', placeholder: '9787111591111', ariaLabel: 'ISBN' },
      ] },
      { title: '价格与描述', ariaLabel: '价格与描述', fields: [
        { id: 'pub-price', kind: 'number', placeholder: '28.00', ariaLabel: '售价', priceUnit: '¥' },
        { id: 'pub-desc', label: '商品描述', kind: 'textarea', placeholder: '描述书籍成色、是否有笔记、发货方式等…', ariaLabel: '描述' },
      ] },
      { title: '发货设置', ariaLabel: '发货设置', fields: [
        { id: 'pub-ship', kind: 'radio', name: 'ship', options: [ { label: '包邮（推荐，成交率更高）', selected: true }, { label: '买家承担运费' } ] },
        { id: 'pub-express', kind: 'select', half: true, ariaLabel: '快递', options: [ { label: '菜鸟驿站代收' }, { label: '顺丰' }, { label: '中通' }, { label: '圆通' } ] },
        { id: 'pub-addr', kind: 'select', half: true, ariaLabel: '发货地', options: [ { label: '北京市朝阳区' }, { label: '上海市浦东新区' }, { label: '广州市天河区' }, { label: '深圳市南山区' } ] },
      ] },
    ],
    desktop: {
      steps: [
        { no: '1', title: '选择类型', panelTitle: '选择发布类型', regionAria: '步骤 1：选择发布类型', ariaLabel: '选择类型', kinds: [ { icon: 'package', label: '闲置好物', sub: '二手实物' }, { icon: 'book-open', label: '书籍', sub: '图书教材' }, { icon: 'smartphone', label: '数码', sub: '手机电脑' }, { icon: 'sparkles', label: '服务', sub: '技能服务' } ] },
        {
          no: '2', title: '填写信息', panelTitle: '填写信息', regionAria: '步骤 2：填写信息', ariaLabel: '填写信息',
          fields: [
            { id: 'pub-title', label: '标题', kind: 'text', placeholder: '例：九成新图书《深度工作》', required: true, ariaRequired: true, wide: true, unit: '', options: [] },
            { id: 'pub-cat', label: '分类', kind: 'select', placeholder: '', required: false, ariaRequired: false, wide: false, unit: '', options: [ { label: '经管励志', selected: true, value: '' }, { label: '文学小说', selected: false, value: '' }, { label: '计算机技术', selected: false, value: '' } ] },
            { id: 'pub-cond', label: '成色', kind: 'select', placeholder: '', required: false, ariaRequired: false, wide: false, unit: '', options: [ { label: '全新', selected: false, value: '' }, { label: '9成新', selected: true, value: '' }, { label: '8成新', selected: false, value: '' }, { label: '7成新', selected: false, value: '' } ] },
            { id: 'pub-price', label: '价格', kind: 'number', placeholder: '28.00', required: false, ariaRequired: true, wide: false, unit: '¥', options: [] },
            { id: 'pub-desc', label: '描述', kind: 'textarea', placeholder: '描述成色、是否有笔记、发货方式等…', required: false, ariaRequired: false, wide: true, unit: '', options: [] },
          ],
          image: { label: '图片（最多 3 张）', slots: 3, slotsAriaPrefix: '上传图片' },
        },
        { no: '3', title: '确认发布', panelTitle: '确认发布', regionAria: '步骤 3：确认发布', ariaLabel: '确认发布', rows: [ { label: '发布类型', value: '闲置好物' }, { label: '标题', value: '九成新图书《深度工作》' }, { label: '分类', value: '经管励志' }, { label: '成色', value: '9成新' }, { label: '价格', value: '¥28.00' } ], agree: '我已阅读并同意《发布规范》与《交易条款》' },
      ],
      side: {
        tips: { items: ['如实描述成色与瑕疵，避免交易纠纷', '封面图用清晰正脸照，提升点击率', '定价参考同类在售，标注是否包邮', '发布后可在「发布管理」编辑或下架'] },
        boost: { title: '提升成交率', ariaLabel: '提升成交率', items: ['上传 3 张以上细节图', '描述中说明售后与发货', '选择包邮，成交率更高'] },
        preview: { ariaLabel: '预览', imgAlt: '预览', heading: '九成新图书《深度工作》', price: '¥28.00' },
      },
      nav: { submit: '发布' },
    },
  },
  dashboard: {
    kpis: [ { label: '总订单', value: '1,234', icon: 'receipt', delta: '+12%', tone: 'up' }, { label: '待发货', value: '56', icon: 'truck', delta: '+3', tone: 'up' }, { label: '本月GMV', value: '¥128,450', icon: 'chart-line', delta: '+18%', tone: 'up' }, { label: '好评率', value: '98.6%', icon: 'star', delta: '+0.2%', tone: 'up' } ],
    kpisAriaLabel: '核心指标',
    deltaSuffix: '环比',
    trend: { title: '近 7 天订单趋势', range: '本周', sectionAriaLabel: '订单趋势', chartAriaLabel: '柱状图：', bars: [45, 52, 38, 61, 55, 72, 68], axis: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] },
    distribution: { title: '商品分类分布', range: '近 30 天', sectionAriaLabel: '分类分布', items: [ { label: '经管励志', value: 35, color: '#3b82f6' }, { label: '文学小说', value: 28, color: '#8b5cf6' }, { label: '计算机技术', value: 22, color: '#10b981' }, { label: '少儿绘本', value: 15, color: '#f59e0b' } ] },
    activitiesTitle: '近期活动',
    home: {
      kpisAriaLabel: '数据概览',
      kpis: [ { label: '今日新增', value: '128', icon: 'user-plus', delta: '+12%', tone: 'up' }, { label: '活跃用户', value: '3,560', icon: 'users', delta: '+5.4%', tone: 'up' }, { label: '成交金额', value: '¥12,480', icon: 'wallet', delta: '-2.1%', tone: 'down' } ],
      trend: { sectionAriaLabel: '访问趋势', title: '访问趋势', range: '近 7 天', bars: [42, 68, 55, 80, 63, 92, 74], axis: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] },
      target: { ariaLabel: '完成度', title: '本月目标', value: '78%', doneLabel: '已完成', remainText: '距离月度目标还差', remainValue: '¥2,520', remainSuffix: '，保持节奏即可达成。' },
      tableAriaLabel: '数据表',
      tableRows: [ { cells: ['示例项目A', '', '2小时前'], badge: { text: '正常', tone: 'emerald' } }, { cells: ['示例项目B', '', '2小时前'], badge: { text: '正常', tone: 'emerald' } }, { cells: ['示例项目C', '', '2小时前'], badge: { text: '正常', tone: 'emerald' } } ],
      heroAriaLabel: '精选内容',
    },
    activities: [ { type: '新订单', ref: '20241201001', time: '2分钟前', dot: 'bg-emerald-500' }, { type: '买家咨询', ref: '深度工作', time: '5分钟前', dot: 'bg-sky-500' }, { type: '发货完成', ref: '20241128003', time: '1小时前', dot: 'bg-neutral-500' }, { type: '好评', ref: '原子习惯', time: '3小时前', dot: 'bg-amber-500' } ],
  },
  orders: {
    title: '我的订单',
    searchPlaceholder: '搜索订单号 / 商品',
    ariaLabel: { overview: '订单状态概览', list: '订单列表', search: '搜索订单' },
    exportLabel: '导出',
    // 「导出」是过程反馈：点击后状态写入 role="status" 区域（可见文案即 live region 内容 → 自动播报）
    exportStatus: { pending: '正在导出，请稍候…', done: '导出完成' },
    totalLabel: '共 124 条',
    rowActionLabel: '查看详情',
    overview: [ { label: '待付款', value: '3', icon: 'wallet' }, { label: '待发货', value: '5', icon: 'package' }, { label: '待收货', value: '2', icon: 'truck' }, { label: '售后中', value: '1', icon: 'rotate-ccw' } ],
    tabs: [ { label: '全部', active: true }, { label: '待付款' }, { label: '待发货' }, { label: '待收货' }, { label: '已完成' }, { label: '售后' } ],
    cards: { rows: [
      { idLabel: '订单号', id: '20241201001', status: '待发货', statusColor: 'amber', name: '深度工作', qtyLabel: '数量 ×', qty: '1', amount: '¥28.00', actions: [ { label: '提醒发货', tone: 'secondary' }, { label: '联系卖家', tone: 'outline' } ] },
      { idLabel: '订单号', id: '20241128003', status: '待收货', statusColor: 'sky', name: '清单革命', qtyLabel: '数量 ×', qty: '1', amount: '¥35.00', actions: [ { label: '查看物流', tone: 'secondary' }, { label: '确认收货', tone: 'primary' } ] },
      { idLabel: '订单号', id: '20241125007', status: '已完成', statusColor: 'emerald', name: '原子习惯', qtyLabel: '数量 ×', qty: '1', amount: '¥22.00', actions: [ { label: '再次购买', tone: 'secondary' }, { label: '写评价', tone: 'outline' } ] },
      { idLabel: '订单号', id: '20241120012', status: '售后中', statusColor: 'rose', name: '穷查理宝典', qtyLabel: '数量 ×', qty: '1', amount: '¥48.00', actions: [ { label: '查看详情', tone: 'secondary' }, { label: '联系客服', tone: 'outline' } ] },
    ] },
    table: {
      cols: [ { label: '订单号' }, { label: '商品' }, { label: '金额' }, { label: '状态' }, { label: '下单时间' }, { label: '操作' } ],
      rows: [
        { cells: ['20241201001', '深度工作', '¥28.00', '待发货', '2024-12-01 09:12'], badge: { text: '待发货', tone: 'amber' } },
        { cells: ['20241128003', '清单革命', '¥35.00', '待收货', '2024-11-28 14:03'], badge: { text: '待收货', tone: 'sky' } },
        { cells: ['20241125007', '原子习惯', '¥22.00', '已完成', '2024-11-25 20:41'], badge: { text: '已完成', tone: 'emerald' } },
        { cells: ['20241120012', '穷查理宝典', '¥48.00', '售后中', '2024-11-20 11:26'], badge: { text: '售后中', tone: 'rose' } },
      ],
    },
  },
  chat: {
    peerName: '书虫小站',
    peerState: '在线',
    inputPlaceholder: '输入消息…',
    conversations: [
      { name: '书虫小站', last: '你好，这本书还在吗？', time: '09:15', badge: 2 },
      { name: '旧书铺子', last: '已发货，单号 SF1234…', time: '昨天', badge: 0 },
      { name: '读者交流群', last: '行，那我拍了', time: '周一', badge: 0 },
    ],
    messages: [
      { side: 'in', text: '你好，这本书还在吗？', time: '09:15' },
      { side: 'out', text: '在的，9成新无笔记', time: '09:16' },
      { side: 'in', text: '能便宜点吗？', time: '09:17' },
      { side: 'out', text: '28 已经很低了，包邮', time: '09:18' },
      { side: 'in', text: '行，那我拍了', time: '09:19' },
    ],
  },
  profile: {
    title: '个人中心',
    name: '书虫小站',
    metaLine: 'ID: 888888 · 信誉',
    rating: '4.9',
    stats: [ { value: '12', label: '订单', target: 'orders' }, { value: '8', label: '在售', target: 'list' }, { value: '156', label: '粉丝', target: '' } ],
    assets: [ { icon: 'wallet', label: '钱包', value: '¥1,280' }, { icon: 'ticket', label: '优惠券', value: '3 张' }, { icon: 'heart', label: '收藏', value: '24' }, { icon: 'package-open', label: '在售', value: '8' } ],
    menus: [ { target: 'orders', icon: 'receipt', title: '我的订单', sub: '查看所有订单' }, { target: 'list', icon: 'package-open', title: '发布管理', sub: '管理在售/已售商品' }, { target: 'chat', icon: 'message-circle', title: '消息中心', sub: '买家卖家沟通' }, { target: 'favorite', icon: 'heart', title: '收藏夹', sub: '我收藏的好物' }, { target: 'wallet', icon: 'wallet', title: '我的钱包', sub: '余额/提现/账单' }, { target: 'coupon', icon: 'ticket', title: '优惠券', sub: '可用 3 张' } ],
    sets: [ { target: 'settings', icon: 'settings', title: '设置', sub: '通用/通知/隐私' }, { target: 'help', icon: 'circle-help', title: '帮助与反馈', sub: '常见问题/联系客服' }, { target: 'about', icon: 'info', title: '关于我们', sub: '版本 1.0.0' } ],
    logout: '退出登录',
    ariaLabel: { info: '用户信息', assets: '资产快捷', menus: '功能菜单', sets: '设置与帮助', recentOrders: '最近订单' },
    recentOrders: { title: '最近订单', more: '全部订单', rows: [ { name: '深度工作', value: '¥28.00', status: '待发货', tone: 'amber' }, { name: '原子习惯', value: '¥22.00', status: '已完成', tone: 'emerald' } ] },
    desktop: {
      ariaLabel: { info: '个人资料' },
      stats: [ { value: '128', label: '订单', target: '' }, { value: '8', label: '在售', target: '' }, { value: '156', label: '粉丝', target: '' }, { value: '24', label: '收藏', target: '' } ],
      menus: [ { target: 'orders', icon: 'receipt-text', title: '我的订单', sub: '查看所有订单' }, { target: 'list', icon: 'package-open', title: '发布管理', sub: '管理在售/已售' }, { target: 'chat', icon: 'message-square', title: '消息中心', sub: '买家卖家沟通' }, { target: 'favorite', icon: 'heart', title: '收藏夹', sub: '我收藏的好物' }, { target: 'wallet', icon: 'wallet', title: '我的钱包', sub: '余额/提现/账单' }, { target: 'settings', icon: 'settings', title: '账号设置', sub: '通用/通知/隐私' } ],
      comingSoon: '即将上线',
      favoritesAlt: '收藏',
    },
  },
  settings: {
    account: {
      fields: [
        { id: 'set-user', label: '用户名', kind: 'text', value: '书虫小站', disabled: true, hint: '用户名不可修改', placeholder: '' },
        { id: 'set-phone', label: '手机号', kind: 'text', value: '138****8888', disabled: true, hint: '', placeholder: '' },
        { id: 'set-mail', label: '邮箱', kind: 'text', value: 'seller@example.com', disabled: false, hint: '', placeholder: '' },
        { id: 'set-intro', label: '店铺简介', kind: 'textarea', value: '专注二手好物流转，所有书籍人工验货，承诺无笔记无水损，平台担保交易，七天无理由退换。', disabled: false, hint: '', placeholder: '介绍你的店铺特色、主营类目、服务承诺…' },
      ],
    },
    notifs: { rows: [
      { label: '新订单提醒', desc: '有新订单时立即通知', on: true },
      { label: '发货提醒', desc: '订单待发货超 24 小时提醒', on: true },
      { label: '聊天消息', desc: '买家发起咨询时通知', on: true },
      { label: '营销活动', desc: '平台大促、优惠券发放通知', on: false },
      { label: '经营周报', desc: '每周一早 8 点发送经营周报', on: true },
    ] },
    security: { rows: [
      { label: '登录密码', desc: '上次修改：2024-10-15', cta: '修改', badge: '' },
      { label: '支付密码', desc: '已设置', cta: '修改', badge: '' },
      { label: '实名认证', desc: '已完成 · 张*', cta: '', badge: '已认证' },
      { label: '登录设备管理', desc: '当前 2 台设备在线', cta: '查看', badge: '' },
    ] },
  },
  form: {
    title: '发布商品',
    submit: '发布商品',
    // 桌面/移动共用字段源（books 上架）；价格块与发货块留在 desktop.price / desktop.delivery
    sections: [
      { title: '基本信息', ariaLabel: '基本信息', fields: [
        { id: 'form-title', label: '书名/标题', kind: 'text', placeholder: '例：深度工作', required: true, wide: true, hint: '', options: [] },
        { id: 'form-author', label: '作者', kind: 'text', placeholder: '卡尔·纽波特', required: true, wide: false, hint: '', options: [] },
        { id: 'form-isbn', label: 'ISBN', kind: 'text', placeholder: '9787111591111', required: false, wide: false, hint: '', options: [] },
        { id: 'form-cat', label: '分类', kind: 'select', placeholder: '', required: true, wide: false, hint: '', options: [ { label: '请选择', selected: true, value: '' }, { label: '经管励志', selected: false, value: '' }, { label: '文学小说', selected: false, value: '' }, { label: '计算机技术', selected: false, value: '' }, { label: '少儿绘本', selected: false, value: '' }, { label: '社科人文', selected: false, value: '' } ] },
        { id: 'form-cond', label: '成色', kind: 'select', placeholder: '', required: true, wide: false, hint: '', options: [ { label: '请选择', selected: false, value: '' }, { label: '全新', selected: false, value: '' }, { label: '9成新', selected: true, value: '' }, { label: '8成新', selected: false, value: '' }, { label: '7成新', selected: false, value: '' }, { label: '有瑕疵', selected: false, value: '' } ] },
        { id: 'form-tag', label: '标签', kind: 'text', placeholder: '深度工作,专注力,效率', required: false, wide: false, hint: '用逗号分隔，最多 5 个', options: [] },
      ] },
    ],
    desktop: {
      imageBlock: { title: '商品图片（最多 9 张，封面为第一张）', ariaLabel: '图片上传', hint: '建议：清晰正面图、背面图、版权页、细节特写', slots: 9, slotsAriaPrefix: '上传图片' },
      price: {
        title: '价格与描述', ariaLabel: '价格与描述',
        unit: '¥', placeholder: '28.00', inputAriaLabel: '售价', suggest: '建议价：¥25-35',
        desc: { id: 'form-price-desc', label: '商品描述', placeholder: '详细描述书籍成色、是否有笔记划线、发货方式、售后承诺等…', required: true },
        free: { id: 'ship-free', label: '包邮（推荐，成交率提升 30%+）', checked: true },
      },
      delivery: {
        title: '发货设置', ariaLabel: '发货设置',
        fields: [
          { id: 'form-express', label: '首选快递', kind: 'select', placeholder: '', required: false, wide: false, hint: '', options: [ { label: '菜鸟驿站代收', selected: true, value: '' }, { label: '顺丰速运', selected: false, value: '' }, { label: '中通快递', selected: false, value: '' }, { label: '圆通速递', selected: false, value: '' }, { label: '韵达快递', selected: false, value: '' } ] },
          { id: 'form-city', label: '发货地址', kind: 'select', placeholder: '', required: false, wide: false, hint: '', options: [ { label: '北京市朝阳区', selected: true, value: '' }, { label: '上海市浦东新区', selected: false, value: '' }, { label: '广州市天河区', selected: false, value: '' }, { label: '深圳市南山区', selected: false, value: '' }, { label: '其他…', selected: false, value: '' } ] },
        ],
        extra: { id: 'insure', label: '加入运费险（买家退货更放心）', checked: false },
      },
      actions: [ { id: 'form-draft', label: '存为草稿', tone: 'outline', target: '' }, { id: 'form-submit', label: '发布商品', tone: 'primary', target: '' } ],
    },
  },
});

// ═══════════════ saas（团队协作 / 任务管理，页面集 dashboard/list/detail/form/settings） ═══════════════
const SAAS = over(OTHER, {
  object: { noun: '任务', nounPlural: '任务', unit: '个' },
  search: { placeholder: '搜索任务、成员、文档' },
  nav: { list: '任务', detail: '任务详情', publish: '新建任务', orders: '任务', profile: '账户', dashboard: '工作台', settings: '工作台设置', form: '新建任务' },
  tabbar: [
    { target: 'dashboard', icon: 'layout-dashboard', label: '工作台' },
    { target: 'list', icon: 'square-check-big', label: '任务' },
    { target: 'publish', icon: 'circle-plus', label: '新建' },
    { target: 'chat', icon: 'message-circle', label: '协作' },
    { target: 'profile', icon: 'user-round', label: '账户' },
  ],
  home: { heading: '工作台', hero: { badge: '推荐工作流', title: '本周重点任务', desc: '集中查看待办、进度与团队动态。', ariaLabel: '推荐任务', imgAlt: '推荐' } },
  list: { title: '任务列表', searchPlaceholder: '搜索任务', ariaLabel: '任务卡片列表', sortChips: ['默认', '优先级', '截止日期', '最近更新'], cards: { imgAlt: '任务封面', name: (i) => `任务项 ${i + 1}`, meta: '负责人 · 进行中 · 截止本周', price: () => '', strike: () => '' }, table: { ariaLabel: '任务列表', searchPlaceholder: '搜索任务、成员…', newLabel: '新建', newAriaLabel: '新建任务', totalLabel: '共 124 个任务', idPrefix: 'TSK', filters: [ { ariaLabel: '状态筛选', options: ['全部状态', '进行中', '待评审', '已完成'] }, { ariaLabel: '负责人筛选', options: ['全部成员', '我负责的', '我参与的'] } ], cols: [ { label: '任务' }, { label: '负责人' }, { label: '优先级' }, { label: '进度' }, { label: '状态' }, { label: '截止日期' }, { label: '操作' } ], rows: [
    { cells: ['需求评审', '张三', '高', '80%', '进行中', '本周五'], badge: { text: '进行中', tone: 'emerald' } },
    { cells: ['接口联调', '李四', '中', '100%', '已完成', '已结束'], badge: { text: '已完成', tone: 'neutral' } },
    { cells: ['数据看板', '王五', '高', '40%', '待评审', '下周一'], badge: { text: '待评审', tone: 'rose' } },
  ] } },
  detail: { title: '任务详情', heading: '任务标题示例：重构任务列表', badge: '进行中', metaLines: ['负责人：张三', '截止本周五'], price: { value: '', strike: '', tag: '' }, descTitle: '任务描述', descText: '这里是任务的背景、验收标准与关联资料，用于展示排版权重与信息层级。', stats: [ { value: '12', label: '评论' }, { value: '3', label: '子任务' }, { value: '2', label: '附件' } ], owner: { title: '负责人', name: '张三', meta: '产品 · 本周可用', cta: '发起协作', avatarAlt: '负责人头像' }, related: { title: '关联任务', imgAlt: '推荐', name: (i) => `关联任务 ${i + 1}`, price: () => '' }, actions: [ { icon: 'user-plus', label: '指派', tone: 'secondary', target: '' }, { icon: 'check', label: '标记完成', tone: 'primary', target: '' } ], desktop: { sub: '产品组 · 高中优先级 · 迭代 12', ownerMeta: '产品 · 本周可用', ownerCta: '发起协作', finalLabel: '当前进度', finalValue: '80%', finalBadge: '进行中', relatedRows: [ { name: '接口联调', value: '已完成' }, { name: '数据看板', value: '待评审' } ] } },
  form: { title: '新建任务', submit: '创建任务', sections: [
    { title: '任务信息', ariaLabel: '任务信息', fields: [
      { id: 'form-title', label: '任务标题', kind: 'text', placeholder: '例：重构任务列表', ariaLabel: '任务标题', required: true },
      { id: 'form-owner', label: '负责人', kind: 'text', placeholder: '张三', ariaLabel: '负责人' },
      { id: 'form-cat', label: '所属项目', kind: 'select', ariaLabel: '所属项目', options: [ { label: '核心产品' }, { label: '增长实验' }, { label: '基础设施' } ] },
      { id: 'form-pri', label: '优先级', kind: 'select', ariaLabel: '优先级', options: [ { label: '高' }, { label: '中', selected: true }, { label: '低' } ] },
      { id: 'form-due', label: '截止日期', kind: 'text', placeholder: '2026-10-31', ariaLabel: '截止日期' },
    ] },
    { title: '任务描述', ariaLabel: '任务描述', fields: [ { id: 'form-desc', label: '描述', kind: 'textarea', placeholder: '补充背景、验收标准与关联资料…', ariaLabel: '描述' } ] },
  ] },
  settings: { title: '工作台设置', account: { fields: [ { id: 'set-user', label: '显示名', kind: 'text', value: '当前成员', disabled: true, hint: '由管理员分配', placeholder: '' }, { id: 'set-phone', label: '工号', kind: 'text', value: 'EMP-0000', disabled: true, hint: '', placeholder: '' }, { id: 'set-mail', label: '工作邮箱', kind: 'text', value: 'member@example.com', disabled: false, hint: '', placeholder: '' }, { id: 'set-intro', label: '团队简介', kind: 'textarea', value: '', disabled: false, hint: '', placeholder: '介绍你的团队与协作方式…' } ] }, notifs: { ariaLabel: '通知设置', rows: [ { label: '任务提醒', desc: '有任务指派给我时通知', on: true }, { label: '评论提醒', desc: '有人回复时通知', on: true } ] }, security: { ariaLabel: '安全与访问', rows: [ { label: '登录密码', desc: '上次修改：2024-10-15', cta: '修改', badge: '' }, { label: '单点登录（SSO）', desc: '已绑定企业目录', cta: '管理', badge: '' }, { label: '两步验证', desc: '未开启', cta: '开启', badge: '' }, { label: '登录设备管理', desc: '当前 1 台设备在线', cta: '查看', badge: '' } ] } },
  dashboard: { kpis: [ { label: '进行中任务', value: '128', icon: 'layout-list', delta: '+12%', tone: 'up' }, { label: '本周完成', value: '56', icon: 'check-circle', delta: '+3', tone: 'up' }, { label: '逾期任务', value: '8', icon: 'alarm-clock', delta: '-2', tone: 'down' } ], trend: { title: '近 7 天完成趋势', range: '本周', sectionAriaLabel: '趋势', chartAriaLabel: '柱状图：', bars: [45, 52, 38, 61, 55, 72, 68], axis: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] }, target: { title: '本月目标', value: '78%', remainText: '距离月度目标还差 22%，保持节奏即可达成。' }, distribution: { title: '任务分布', range: '近 30 天', sectionAriaLabel: '分类分布', items: [ { label: '进行中', value: 35, color: '#3b82f6' }, { label: '已完成', value: 48, color: '#10b981' } ] }, table: { title: '最新任务', ariaLabel: '任务动态', cols: ['任务', '状态', '更新'], rows: [ { cells: ['需求评审', '', '2小时前'], badge: { text: '进行中', tone: 'emerald' } }, { cells: ['接口联调', '', '5小时前'], badge: { text: '已完成', tone: 'neutral' } } ] }, hero: { eyebrow: '推荐工作流', title: '高转化内容示例', imgAlt: '精选配图' }, activities: [ { type: '新建任务', ref: '需求评审', time: '2分钟前', dot: 'bg-emerald-500' }, { type: '完成任务', ref: '接口联调', time: '5分钟前', dot: 'bg-sky-500' } ], home: { kpis: [ { label: '今日新增', value: '12', icon: 'user-plus', delta: '+12%', tone: 'up' }, { label: '进行中', value: '128', icon: 'users', delta: '+5.4%', tone: 'up' }, { label: '逾期任务', value: '8', icon: 'alarm-clock', delta: '-2.1%', tone: 'down' } ], trend: { sectionAriaLabel: '任务趋势', title: '任务趋势', range: '近 7 天', bars: [42, 68, 55, 80, 63, 92, 74], axis: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] }, target: { ariaLabel: '进度', title: '迭代进度', value: '78%', doneLabel: '已完成', remainText: '距离迭代目标还差', remainValue: '12 个任务', remainSuffix: '，保持节奏即可达成。' }, tableRows: [ { cells: ['需求评审', '', '2小时前'], badge: { text: '进行中', dot: 'bg-emerald-500' } }, { cells: ['接口联调', '', '2小时前'], badge: { text: '已完成', dot: 'bg-neutral-500' } }, { cells: ['数据看板', '', '2小时前'], badge: { text: '待评审', dot: 'bg-amber-500' } } ], heroAriaLabel: '推荐任务' } },

});

// ═══════════════ tool（个人效率工具，页面集 home/list/detail/form/settings） ═══════════════
const TOOL = over(OTHER, {
  object: { noun: '条目', nounPlural: '条目', unit: '条' },
  search: { placeholder: '搜索条目、标签' },
  nav: { list: '清单', detail: '条目详情', publish: '新建条目', orders: '历史', profile: '我的', form: '新建条目' },
  tabbar: [
    { target: 'home', icon: 'house', label: '首页' },
    { target: 'list', icon: 'list-checks', label: '清单' },
    { target: 'publish', icon: 'circle-plus', label: '新建' },
    { target: 'orders', icon: 'history', label: '历史' },
    { target: 'profile', icon: 'user-round', label: '我的' },
  ],
  home: { heading: '今天', hero: { badge: '每日推荐', title: '今天要完成的条目', desc: '清晰的清单，帮你专注当下。', ariaLabel: '今日推荐', imgAlt: '推荐' }, quick: { title: '快捷入口', more: '全部', ariaLabel: '快捷入口', items: [ { target: 'list', icon: 'layout-grid', label: '全部条目' }, { target: 'publish', icon: 'plus-circle', label: '新建条目' }, { target: 'orders', icon: 'history', label: '历史记录' }, { target: 'profile', icon: 'user-round', label: '我的' } ] } },
  list: { title: '清单', searchPlaceholder: '搜索条目', ariaLabel: '条目列表', sortChips: ['默认', '优先级', '截止日期', '标签'], cards: { imgAlt: '条目图标', name: (i) => `条目 ${i + 1}`, meta: '标签 · 优先级 · 状态', price: () => '', strike: () => '' }, table: { ariaLabel: '条目列表', searchPlaceholder: '搜索条目…', newLabel: '新建', newAriaLabel: '新建条目', totalLabel: '共 124 条', idPrefix: 'ITM', filters: [ { ariaLabel: '状态筛选', options: ['全部状态', '待办', '已完成', '已归档'] }, { ariaLabel: '标签筛选', options: ['全部标签', '工作', '生活', '学习'] } ], cols: [ { label: '条目' }, { label: '标签' }, { label: '优先级' }, { label: '截止' }, { label: '状态' }, { label: '创建时间' }, { label: '操作' } ], rows: [
    { cells: ['整理本周计划', '工作', '高', '今天', '待办', '2 小时前'], badge: { text: '待办', tone: 'emerald' } },
    { cells: ['阅读一章', '学习', '中', '本周', '已完成', '昨天'], badge: { text: '已完成', tone: 'neutral' } },
    { cells: ['归档旧笔记', '工作', '低', '—', '已归档', '3 天前'], badge: { text: '已归档', tone: 'rose' } },
  ] } },
  detail: { title: '条目详情', heading: '整理本周计划', badge: '待办', metaLines: ['标签：工作', '截止：今天'], price: { value: '', strike: '', tag: '' }, descTitle: '备注', descText: '这里是条目的备注与子步骤，用于展示排版权重与信息层级。', stats: [ { value: '5', label: '子步骤' }, { value: '2', label: '提醒' }, { value: '3', label: '附件' } ], owner: { title: '创建者', name: '我自己', meta: '创建于 2 小时前', cta: '添加协作', avatarAlt: '创建者头像' }, related: { title: '相关条目', imgAlt: '推荐', name: (i) => `相关条目 ${i + 1}`, price: () => '' }, actions: [ { icon: 'bell', label: '设置提醒', tone: 'secondary', target: '' }, { icon: 'check', label: '标记完成', tone: 'primary', target: '' } ], desktop: { sub: '工作 · 高优先级 · 今天截止', ownerMeta: '创建于 2 小时前', ownerCta: '添加协作', finalLabel: '当前状态', finalValue: '待办', finalBadge: '高优先级', relatedRows: [ { name: '阅读一章', value: '已完成' }, { name: '归档旧笔记', value: '已归档' } ] } },
  form: { title: '新建条目', submit: '保存条目', sections: [
    { title: '条目信息', ariaLabel: '条目信息', fields: [
      { id: 'form-title', label: '标题', kind: 'text', placeholder: '例：整理本周计划', ariaLabel: '标题', required: true },
      { id: 'form-tag', label: '标签', kind: 'select', ariaLabel: '标签', options: [ { label: '工作' }, { label: '生活' }, { label: '学习' } ] },
      { id: 'form-pri', label: '优先级', kind: 'select', ariaLabel: '优先级', options: [ { label: '高' }, { label: '中', selected: true }, { label: '低' } ] },
      { id: 'form-due', label: '截止日期', kind: 'text', placeholder: '2026-10-31', ariaLabel: '截止日期' },
    ] },
    { title: '备注', ariaLabel: '备注', fields: [ { id: 'form-desc', label: '备注', kind: 'textarea', placeholder: '补充细节、子步骤…', ariaLabel: '备注' } ] },
  ] },
  settings: { title: '设置', account: { fields: [ { id: 'set-user', label: '昵称', kind: 'text', value: '当前用户', disabled: true, hint: '不可修改', placeholder: '' }, { id: 'set-phone', label: '手机号', kind: 'text', value: '138****0000', disabled: true, hint: '', placeholder: '' }, { id: 'set-mail', label: '邮箱', kind: 'text', value: 'user@example.com', disabled: false, hint: '', placeholder: '' }, { id: 'set-intro', label: '个人简介', kind: 'textarea', value: '', disabled: false, hint: '', placeholder: '介绍你的使用习惯…' } ] }, notifs: { ariaLabel: '通知设置', rows: [ { label: '每日提醒', desc: '每天提醒待办', on: true }, { label: '完成提醒', desc: '完成条目时提示', on: false } ] }, security: { ariaLabel: '安全与访问', rows: [ { label: '登录密码', desc: '上次修改：2024-10-15', cta: '修改', badge: '' }, { label: '支付密码', desc: '已设置', cta: '修改', badge: '' }, { label: '实名认证', desc: '已完成', cta: '', badge: '已认证' }, { label: '登录设备管理', desc: '当前 1 台设备在线', cta: '查看', badge: '' } ] } },
});

// ═══════════════ community（社区，页面集 home/discover/detail/publish/chat/profile） ═══════════════
const COMMUNITY = over(OTHER, {
  object: { noun: '动态', nounPlural: '动态', unit: '条' },
  search: { placeholder: '搜索动态、话题、用户' },
  nav: { list: '话题', detail: '动态详情', publish: '发布动态', orders: '消息', profile: '我的', chat: '私信' },
  tabbar: [
    { target: 'home', icon: 'house', label: '首页' },
    { target: 'discover', icon: 'compass', label: '发现' },
    { target: 'publish', icon: 'circle-plus', label: '发布' },
    { target: 'chat', icon: 'message-circle', label: '私信' },
    { target: 'profile', icon: 'user-round', label: '我的' },
  ],
  home: { heading: '社区动态', hero: { badge: '热门话题', title: '本周热议话题', desc: '看看大家都在讨论什么。', ariaLabel: '热门话题', imgAlt: '话题配图' }, quick: { title: '快捷入口', more: '全部', ariaLabel: '快捷入口', items: [ { target: 'discover', icon: 'layout-grid', label: '发现话题' }, { target: 'publish', icon: 'plus-circle', label: '发布动态' }, { target: 'chat', icon: 'receipt-text', label: '我的私信' }, { target: 'profile', icon: 'user-round', label: '个人主页' } ] }, recommend: { title: '推荐动态', more: '更多', ariaLabel: '推荐动态', imgAlt: '动态配图', cardName: (i) => `用户${i + 1} 的动态`, cardMeta: '', cardSecondary: () => '点赞 128' } },
  discover: { title: '发现', searchPlaceholder: '搜索话题、用户', ariaLabel: '话题列表', cardImgAlt: '话题封面', heroImgAlt: '热门', cardName: (i) => `话题 ${i + 1}`, cardMeta: '1.2 万讨论', cardSecondary: (i) => `热度 ${12 + i * 3}` },
  detail: { title: '动态详情', heading: '这是一条动态的标题', badge: '热门', metaLines: ['发布于 2 小时前', '话题 #新人报到'], price: { value: '', strike: '', tag: '' }, descTitle: '正文', descText: '这里是动态的正文内容，用于展示排版权重与信息层级。', stats: [ { value: '128', label: '点赞' }, { value: '23', label: '评论' }, { value: '5', label: '收藏' } ], owner: { title: '发布者', name: '用户小A', meta: '关注 156 · 粉丝 89', cta: '私信', avatarAlt: '发布者头像' }, related: { title: '相关动态', imgAlt: '推荐', name: (i) => `相关动态 ${i + 1}`, price: () => '' }, actions: [ { icon: 'heart', label: '点赞', tone: 'secondary', target: '' }, { icon: 'message-circle', label: '评论', tone: 'primary', target: '' } ], desktop: { sub: '发布于 2 小时前 · 话题 #新人报到', ownerMeta: '关注 156 · 粉丝 89', ownerCta: '私信', finalLabel: '当前状态', finalValue: '已发布', finalBadge: '热门', relatedRows: [ { name: '相关动态一', value: '查看' }, { name: '相关动态二', value: '查看' } ] } },
  publish: { title: '发布动态', submit: '发布', imageBlock: { title: '配图（最多 9 张）', hint: '上传清晰图片，让动态更吸引人', max: 9, slots: 3, ariaLabel: '上传图片' }, sections: [
    { title: '动态内容', ariaLabel: '动态内容', fields: [
      { id: 'pub-desc', label: '正文', kind: 'textarea', placeholder: '分享你的想法…', ariaLabel: '正文' },
      { id: 'pub-topic', label: '话题', kind: 'text', placeholder: '#新人报到', ariaLabel: '话题' },
    ] },
  ] },
  chat: { peerName: '用户小A', peerState: '在线', conversations: [ { name: '用户小A', last: '你好呀', time: '09:15', badge: 2 }, { name: '用户小B', last: '谢谢关注', time: '昨天', badge: 0 }, { name: '话题群聊', last: '欢迎加入', time: '周一', badge: 0 } ], messages: [ { side: 'in', text: '你好呀', time: '09:15' }, { side: 'out', text: '你好，很高兴认识你', time: '09:16' } ] },
  profile: { title: '个人主页', name: '用户小A', metaLine: 'ID: 100001 · Lv.5', stats: [ { value: '12', label: '动态', target: '' }, { value: '89', label: '粉丝', target: '' }, { value: '156', label: '关注', target: '' } ], assets: [ { icon: 'heart', label: '获赞', value: '1,280' }, { icon: 'message-circle', label: '评论', value: '320' }, { icon: 'star', label: '收藏', value: '24' }, { icon: 'users', label: '关注', value: '156' } ], menus: [ { target: 'publish', icon: 'square-pen', title: '我的动态', sub: '查看与管理' }, { target: 'chat', icon: 'message-square', title: '私信中心', sub: '沟通与通知' }, { target: 'favorite', icon: 'heart', title: '我的收藏', sub: '收藏的动态' }, { target: 'settings', icon: 'settings', title: '账号设置', sub: '通用/通知/隐私' } ], logout: '退出登录' },
});

// ═══════════════ content（内容/媒体，页面集 home/discover/list/detail/publish/profile） ═══════════════
const CONTENT = over(OTHER, {
  object: { noun: '文章', nounPlural: '文章', unit: '篇' },
  search: { placeholder: '搜索文章、作者、专栏' },
  nav: { list: '专栏', detail: '文章详情', publish: '写文章', orders: '订阅', profile: '我的', chat: '消息' },
  tabbar: [
    { target: 'home', icon: 'house', label: '首页' },
    { target: 'discover', icon: 'compass', label: '发现' },
    { target: 'publish', icon: 'circle-plus', label: '写文章' },
    { target: 'orders', icon: 'bookmark', label: '订阅' },
    { target: 'profile', icon: 'user-round', label: '我的' },
  ],
  home: { heading: '今日推荐', hero: { badge: '编辑精选', title: '本周精选文章', desc: '深度内容，值得慢慢读。', ariaLabel: '精选文章', imgAlt: '文章配图' }, quick: { title: '快捷入口', more: '全部', ariaLabel: '快捷入口', items: [ { target: 'list', icon: 'layout-grid', label: '全部专栏' }, { target: 'publish', icon: 'plus-circle', label: '写文章' }, { target: 'orders', icon: 'bookmark', label: '我的订阅' }, { target: 'profile', icon: 'user-round', label: '个人中心' } ] }, recommend: { title: '为你推荐', more: '更多', ariaLabel: '为你推荐', imgAlt: '文章配图', cardName: (i) => `精选文章 ${i + 1}`, cardMeta: '', cardSecondary: () => '阅读 1.2 万' } },
  discover: { title: '发现', searchPlaceholder: '搜索文章、作者', ariaLabel: '文章列表', cardImgAlt: '文章封面', heroImgAlt: '精选', cardName: (i) => `精选文章 ${i + 1}`, cardMeta: '作者 · 8 分钟阅读', cardSecondary: (i) => `阅读 ${(12 + i * 3)} 千` },
  list: { title: '专栏', searchPlaceholder: '搜索文章', ariaLabel: '文章卡片列表', sortChips: ['默认', '最新', '最热', '最多收藏'], cards: { imgAlt: '文章封面', name: (i) => `文章标题 ${i + 1}`, meta: '作者 · 8 分钟阅读', price: () => '', strike: () => '' }, table: { ariaLabel: '文章列表', searchPlaceholder: '搜索文章、作者…', newLabel: '写文章', newAriaLabel: '新建文章', totalLabel: '共 124 篇', idPrefix: 'ART', filters: [ { ariaLabel: '状态筛选', options: ['全部状态', '已发布', '草稿', '已下线'] }, { ariaLabel: '专栏筛选', options: ['全部专栏', '技术', '产品', '生活'] } ], cols: [ { label: '文章' }, { label: '专栏' }, { label: '作者' }, { label: '阅读量' }, { label: '状态' }, { label: '发布时间' }, { label: '操作' } ], rows: [
    { cells: ['如何写好一篇技术文章', '技术', '张三', '1.2 万', '已发布', '2 小时前'], badge: { text: '已发布', tone: 'emerald' } },
    { cells: ['产品设计的一点思考', '产品', '李四', '—', '草稿', '昨天'], badge: { text: '草稿', tone: 'neutral' } },
    { cells: ['我的 2026 年终总结', '生活', '王五', '560', '已下线', '3 天前'], badge: { text: '已下线', tone: 'rose' } },
  ] } },
  detail: { title: '文章详情', heading: '如何写好一篇技术文章', badge: '精选', metaLines: ['作者：张三', '8 分钟阅读'], price: { value: '', strike: '', tag: '' }, descTitle: '正文', descText: '这里是文章的正文内容，用于展示排版权重、段落间距与信息层级。', stats: [ { value: '1.2万', label: '阅读' }, { value: '320', label: '收藏' }, { value: '45', label: '评论' } ], owner: { title: '作者', name: '张三', meta: '技术专栏 · 12 篇文章', cta: '关注', avatarAlt: '作者头像' }, related: { title: '相关阅读', imgAlt: '推荐', name: (i) => `推荐文章 ${i + 1}`, price: () => '' }, actions: [ { icon: 'bookmark', label: '收藏', tone: 'secondary', target: '' }, { icon: 'thumbs-up', label: '点赞', tone: 'primary', target: '' } ], desktop: { sub: '张三 · 技术专栏 · 8 分钟阅读', ownerMeta: '技术专栏 · 12 篇文章', ownerCta: '关注作者', finalLabel: '当前状态', finalValue: '已发布', finalBadge: '精选', relatedRows: [ { name: '产品设计的一点思考', value: '阅读' }, { name: '我的 2026 年终总结', value: '阅读' } ] } },
  publish: { title: '写文章', submit: '发布文章', imageBlock: { title: '封面图（最多 1 张）', hint: '封面图会展示在列表与分享卡片中', max: 1, slots: 1, ariaLabel: '上传封面' }, sections: [
    { title: '文章信息', ariaLabel: '文章信息', fields: [
      { id: 'pub-title', label: '标题', kind: 'text', placeholder: '例：如何写好一篇技术文章', ariaLabel: '标题', required: true },
      { id: 'pub-cat', label: '专栏', kind: 'select', ariaLabel: '专栏', options: [ { label: '技术' }, { label: '产品' }, { label: '生活' } ] },
      { id: 'pub-desc', label: '正文', kind: 'textarea', placeholder: '开始写作…', ariaLabel: '正文' },
    ] },
  ] },
});

export const COPY_LEXICON = { ecommerce: ECOMMERCE, saas: SAAS, tool: TOOL, community: COMMUNITY, content: CONTENT, other: OTHER };