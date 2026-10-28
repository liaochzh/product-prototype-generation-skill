# {{productName}}产品需求文档

> 输入：「{{rawInput}}」｜类型：{{productType}}｜生成方式：{{genMode}}｜时间：{{createdAt}}

## 1. 产品概述与一句话定位
- {{summary}}

## 2. 目标用户
{{users}}

## 3. 核心功能列表（优先级）
{{features}}

## 4. 用户交互路径（User Flows）
{{flows}}

## 5. 页面清单与跳转关系
{{pages}}
- 跳转：home → list → detail → orders/profile；publish ↔ home；chat ↔ detail/orders；dashboard ↔ list/detail。

## 6. 非功能性需求
- 性能：首屏 < 2s，图片懒加载，CDN 可达。
- 安全：输入转义，敏感词过滤，不存储真实隐私数据。
- 可用性：全中文、无 Lorem Ipsum、按钮有点击反馈。
- 可访问性：语义化标签、键盘可达、对比度达标。
- 兼容性：Chrome/Safari/Edge 最新版，移动端 390px / PC 端 1280px。
