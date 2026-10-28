# 多设备适配（13 机型 / 档位 / 折痕）

> 本文件由 SKILL.md 拆出（2026-10-27 F1 分层）。SKILL.md 只保留结论与触发条件；需要动手改生成链路/模板/词典时读本文件。本文件不再链向其它 references 文件（引用只一层深）。

来源：SKILL.md「多设备适配」全节（原 106–116 行）。

## 多设备适配
设备为**单一事实来源**：`constants.js` 的 `DEVICES`（机型预设表）+ `ASPECT_CLASSES`（布局档位）。外壳 `layout-shell.eta` 只消费 `it.device.*`，不写死任何机型尺寸。新增设备只需在 `DEVICES` 填一行。数值一律标注数据来源等级：【官方】厂商规格页 /【推导】官方物理分辨率÷scale /【媒体】第三方实测 /【估计】无官方数据。

- **三个覆盖参数彼此独立**（各作用于不同维度，非单一优先级链）：`--device-width/--device-height`（须为正数）覆盖预设的逻辑尺寸 → `--aspect phone|pane|wide` 覆盖**由尺寸派生**的档位 → `--crease` 覆盖预设折痕。都不给时用默认 `iphone16`。未知 `--device` 且未给自定义尺寸会**报错退出**（`--device` 走 `hasOwnProperty` 校验，杜绝 `toString` 之类原型链键静默生成 NaN 几何）。
- **自定义尺寸必须诚实标注**：给了 `--device-width/height` 时，外壳文案与 `generation-report.device.label` 会显示成「iPhone 16（自定义 626×890）」，不会谎报成预设机型。
- **档位以逻辑宽度为主判据**（非纯比例）：宽 `<600px` → `phone`（单栏+TabBar）；`≥600px` 且宽高比 `>1.30` → `wide`；其余 `pane`（双栏+Rail）。WHY：iPhone Duo 外屏(466×678) 与内屏(626×890) 比例仅差 0.016，却应分属单栏/双栏，比例分档必然误判。
- **栏数由折痕派生**：`panes = 竖折痕数 + 1`，且不低于档位下界（`pane`/`wide` ≥ 2）。横折（`axis:'h'`，如 Z Flip）是上下分区，**不计入栏数**。折痕宽度均为【估计】（厂商未公布），仅供「尽量规避交互元素落折痕」的提示。
- `--crease <axis>-<count>@<pos>[,<pos>][:<width>]`：覆盖折痕（位置可写 `0.5`/`50`/`50%`；`none` 表示无折痕）。例：`v-1@50:24`、`v-2@33,67:24`、`h-1@50:20`。
- 派生属性：`verticalSpace`（逻辑高 `<700px` → `tight`，用于竖向紧凑布局）；`frameWidth/Height = 逻辑尺寸 + 2×bezel`（原实现误把物理外框当逻辑分辨率，导致 iframe 视口为虚构的 404px）。
- **外壳契约（供闸门校验）**：`section[data-device][data-aspect][data-panes][data-vertical-space]` 必须与 `generation-report.json` 的 `device` 字段一致，`layoutFail`/`creaseFail` 非 0 即 `passed:false`。
- 内置 13 款：`iphone16`(默认) / `iphone16-pro-max` / `android-bar` / `iphone-duo-cover` / `iphone-duo-inner` / `zfold7-cover` / `zfold7-inner` / `zflip7-cover` / `zflip7-inner` / `matext-1screen` / `matext-2screen` / `matext-3screen` / `purax`。
