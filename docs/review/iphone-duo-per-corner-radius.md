# 审查报告：iPhone Duo 外屏逐角圆角（工作区未提交 diff）

- 审查对象：`constants.js`、`utils/device-profile.js`、`mobile-template/layout-shell.eta`、`scripts/selfcheck.js`（场景 42 的 (c4) 块）、`references/devices.md`、`references/selfcheck-gates.md` 的未提交改动
- 审查方式：review 子代理（只读），仅对这 6 个文件取 `git diff`，未做全仓扫描
- 结论：**通过（不阻断交付）**；1 条 P2（健壮性，已采纳） + 3 条 P3（2 条采纳/1 条记录不采纳）
- 落档：子代理无写权限，报告全文由主会话落盘（内容未改写）

## 已核实无问题的关键点

1. **方向未写反**：官方 `cornerRadiusUL/UR/LL/LR = 8/59/8/59` → `cornerRadii{TL:8,TR:59,BR:59,BL:8}`（`constants.js:544`）→ 按 CSS 顺序 TL/TR/BR/BL 拼出 `8px 59px 59px 8px`。单值分支 `frameRadiusCss=${single}px` / `screenRadiusCss=${single-bezel}px` 与旧模板两处插值**逐字节同形**（含无空格形态）。
2. **无键覆盖冲突**：`...radiusFields(ref, bezel)` 之后无显式 `cornerRadius` 键；后置 `...geom`（`deviceFrame`）只含 `frameWidth/Height/aspectClass/verticalSpace/panes`，不含 radius 键。`--device-width/height` 覆盖时沿用 `cornerRadii` 合理（半径是设备形态绝对量，bezel 无覆盖入口 ⇒ 不产生新负值）。
3. **消费点无遗漏**：全仓模板消费点仅 `layout-shell.eta:27-28`；多帧 `device-<key>.html` 与主帧共用 `resolveDevice` + shell ⇒ 不会「主帧逐角、副帧单值」；`gallery.html` 只消费尺寸；桌面模板零命中 ⇒ 桌面零字节变更成立；`report.device` 为白名单序列化，新字段不进 JSON、不搅 golden。
4. **(c4) 能红（非假绿）**：①「一刀切 59」（`duoRadii` 缺失）、`59/59/59/59`（`topLeft===8` 失败）、左右写反均红；②锁渲染串 `8px 59px 59px 8px` / `0px 46px 46px 0px`，`radiusFields` 忽略 `cornerRadii` 或映射顺序错均红；③regex 失配取到 `undefined` ⇒ 比较失败红（失配方向为误报红，非假绿）。②的两条 regex 首匹配均命中目标元素（`index.html` 是纯外壳，页面内容在独立 iframe 文件内，不竞争匹配）。
5. **文档口径一致**：`devices.md` 的「圆角两种口径」、Duo 数据来源表、`selfcheck-gates.md` 的 (c4) 描述与实现逐值一致；已无 cover「55」/「一刀切 59」残留（55 仅出现在内屏 `displays[1]` 四角的正确语境）。

## 问题清单与处置

| 级别 | 位置 | 问题 | 处置 |
|---|---|---|---|
| P2 | `utils/device-profile.js` `radiusFields` 逐角分支 | `cornerRadii` 部分字段缺失/键名拼错时产出 `undefinedpx`/`NaNpx`，整条 `border-radius` 被浏览器判废（四角变直角），**静默坏版面**；闸门①只钉 duo-cover，未来新逐角机型无渲染覆盖 | **已采纳**：逐角分支加 `order.findIndex(非有限数字)` 即 `throw`（内部表 fail-fast，零成本）。验证见下 |
| P3 | `device-profile.js` 单值分支 | 单值不钳负、逐角钳零的不对称由「逐字节同形」契约正当化，但未来 `radius < bezel` 的单值机型会输出非法 `-Npx` | **已采纳（注释）**：单值分支加注释说明这是与旧模板同形的契约，新增此类机型须先改契约再钳 |
| P3 | `selfcheck.js` (c4) ① | 未钉单值 `cornerRadius === 59`（外缘口径），误改不影响渲染但误导单值消费方 | **已采纳**：①追加合取条件 `DEVICES['iphone-duo-cover'].cornerRadius === 59`，标题同步 |
| P3 | `selfcheck.js` (c4) ② | 两条 regex 与模板字面强耦合（`;padding` 前邻、`bg-white overflow-hidden" style="` 精确串），模板改类序会误报红 | **不采纳**：失败方向是误报红（安全侧），而先锚 `data-device` 再取样式会把断言写复杂；等模板真改类序时再收 |

## 采纳 P2 后的补充验证（主会话执行）

```
node --input-type=module -e "…resolveDevice 探针…"
normal: 8px 59px 59px 8px | 0px 46px 46px 0px
throw ok: DEVICES 的 cornerRadii 四角必须均为有限数字（第 4 角非法）：{"topLeft":8,"topRight":59,"bottomRight":59}
throw ok(string): DEVICES 的 cornerRadii 四角必须均为有限数字（第 2 角非法）：{"topLeft":8,"topRight":"59",…}
restored: 8px 59px 59px 8px
```

`node …/scripts/selfcheck.js` → rc=0，**295/295 通过**，0 条 ✘。

## 追加实测（审查之后，未改变代码路径）

审查通过后补做了「姿态取证」，只改**数据与注释**，未改 `radiusFields` / 模板逻辑：

- `constants.js`：`iphone-duo-inner.crease` 去掉「仍单源」（半折 90°/130° 两角均 40pt、margins 20/20；flat/折叠态为空）；`iphone-duo-inner.safeInsets` 方位订正（竖持 上82/右0/下34/左0、横持 上0/右84/下34/左0）；`iphone-duo-cover.safeInsets` 补 `landscape`（左84/下34，镜像侧右84）。
- `references/devices.md`：复核表新增「折痕」「内屏安全区」「外屏横持」，并把「未能复核」收窄为「Split View 半边 + 外观派生量」。
- 取证工具与原始输出：`docs/test/duo-probe-20261110/`（gitignored）。
- 复查：`node …/scripts/selfcheck.js` 仍 **295/295**（safeInsets/crease 均不进渲染路径，golden 无变化）。