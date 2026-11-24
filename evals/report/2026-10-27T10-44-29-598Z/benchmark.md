# eval 基准 · 2026-10-27T10:44:29.598Z

- 用例：**2/3** 全通过；断言：**23/24**（pass_rate 95.8%）
- 产物总大小均值：702.3 KB；生成耗时均值：239 ms

| 用例 | 平台 | 断言 | 页数 | 大小(KB) | 耗时(ms) |
|---|---|---|---|---|---|
| ecommerce-mobile-全页集 | mobile | 8/8 | 8 | 311.5 | 250 |
| account-desktop-登录注册 | desktop | 7/8 | 3 | 137.6 | 211 |
| saas-desktop-仪表盘 | desktop | 8/8 | 7 | 253.2 | 255 |

## 失败明细

- `account-desktop-登录注册` · 页集落盘完整（report.pages 均有对应 HTML） → 缺 home

> 客观断言集：只覆盖确定性可验项。视觉质量属人工评审，不在此表；模型级 with/without 对照属 F5b（需模型通道）。
