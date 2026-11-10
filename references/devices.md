# 多设备适配（17 机型 / 档位 / 尺寸类 / 折痕 / 多帧预览）

> 本文件由 SKILL.md 拆出（2026-10-27 F1 分层）。SKILL.md 只保留结论与触发条件；需要动手改生成链路/模板/词典时读本文件。本文件不再链向其它 references 文件（引用只一层深）。

来源：SKILL.md「多设备适配」全节（原 106–116 行）。

## 多设备适配
设备为**单一事实来源**：`constants.js` 的 `DEVICES`（机型预设表）+ `ASPECT_CLASSES`（布局档位）+ `SIZE_CLASSES`（尺寸类，报告面口径）。外壳 `layout-shell.eta` 只消费 `it.device.*`，不写死任何机型尺寸。新增设备只需在 `DEVICES` 填一行。数值一律标注数据来源等级：【官方】厂商规格页 /【推导】官方物理分辨率÷scale /【媒体】第三方实测 /【估计】无官方数据。

- **三个覆盖参数彼此独立**（各作用于不同维度，非单一优先级链）：`--device-width/--device-height`（须为正数）覆盖预设的逻辑尺寸 → `--aspect phone|pane|wide` 覆盖**由尺寸派生**的档位 → `--crease` 覆盖预设折痕。都不给时用默认 `iphone16`。未知 `--device` 且未给自定义尺寸会**报错退出**（`--device` 走 `hasOwnProperty` 校验，杜绝 `toString` 之类原型链键静默生成 NaN 几何）。
- **自定义尺寸必须诚实标注**：给了 `--device-width/height` 时，外壳文案与 `generation-report.device.label` 会显示成「iPhone 16（自定义 800×600）」，不会谎报成预设机型。
- **档位以逻辑宽度为主判据**（非纯比例）：宽 `<600px` → `phone`（单栏+TabBar）；`≥600px` 且宽高比 `>1.30` → `wide`；其余 `pane`（双栏+Rail）。WHY：iPhone Duo 外屏(466×678) 与内屏(669×951) 比例仅差 0.016，却应分属单栏/双栏，比例分档必然误判。
- **栏数由折痕派生**：`panes = 竖折痕数 + 1`，且不低于档位下界（`pane`/`wide` ≥ 2）。横折（`axis:'h'`，如 Z Flip）是上下分区，**不计入栏数**。折痕宽度：Duo 内屏为【实测·模拟器 2026-11-04】40pt（=20+20 保留区带），其余折叠为【估计】（厂商未公布），仅供「尽量规避交互元素落折痕」的提示。
- `--crease <axis>-<count>@<pos>[,<pos>][:<width>]`：覆盖折痕（位置可写 `0.5`/`50`/`50%`；`none` 表示无折痕）。例：`v-1@50:24`、`v-2@33,67:24`、`h-1@50:20`。
- **姿态 `--posture flat|half|closed`**（**仅折叠设备**，非折叠预设给该参数 exit 1；与 `--crease` **互斥**，同给 exit 1）：`flat` → 折痕收成 1px 分割线；`half` → 预设带宽（Duo 40pt）；`closed` → 无折痕带（`crease=null`），仅在报告标注。实现走「折算成 `--crease` 规格串」的既有通道，**不改模板**。这是**外壳预览参数**，不表示运行时能判定姿态：iOS 拿不到折叠信息，页面层也不得自绘折痕避让（系统已内建「半折时推开交互元素」）。另注意 Apple 语义：division 区仅在折叠时 active，**完全展开时宽度为 0**，故 `flat` 的 1px 是人眼友好的观感近似，不是设备事实。
- **尺寸类 `SIZE_CLASSES` / `resolveSizeClass(w,h)`**：四档 compact / medium / expanded / large（XL 并入 large），高度例外（矮于阈值的宽屏判 compact，即「宽 medium 而高 compact 不判双栏」）。**断点数值不在本文件复制**，唯一事实源是 `constants.js`；平台口径回指哲学层 §自适应布局。尺寸类**只进报告面**（`report.device.sizeClass` / `report.frames[].sizeClass`），不改模板产物；与布局档位是两套口径（`ipad-pro-13` 尺寸类属 expanded，但竖屏档位仍是 `pane` 双栏）。
- 派生属性：`verticalSpace`（逻辑高 `<700px` → `tight`，用于竖向紧凑布局）；`frameWidth/Height = 逻辑尺寸 + 2×bezel`（原实现误把物理外框当逻辑分辨率，导致 iframe 视口为虚构的 404px）；`sizeClass`；`safeInsets`（折叠内外屏逐姿态安全区，外壳暂不消费）。
- **外壳契约（供闸门校验）**：`section[data-device][data-aspect][data-panes][data-vertical-space]` 必须与 `generation-report.json` 的 `device` 字段一致，`layoutFail`/`creaseFail` 非 0 即 `passed:false`。`report.device.sizeClass` 须属四档枚举、`report.device.posture` 须属三档枚举（或 null）。

### 内置 17 款

**直板（4）**：`iphone16`(默认) / `iphone16-pro-max` / `iphone18-pro` / `android-bar`
注：iPhone 18 Pro Max（6.9″，逻辑 440×956）尺寸与 `iphone16-pro-max` 完全相同，故不单列键，选型时直接用 `iphone16-pro-max`。

**折叠（10）**：`iphone-duo-cover` / `iphone-duo-inner` / `zfold7-cover` / `zfold7-inner` / `zflip7-cover` / `zflip7-inner` / `matext-1screen` / `matext-2screen` / `matext-3screen` / `purax`

**平板（3）**：

| key | 逻辑尺寸 | 来源 | 档位 / 栏数 | 尺寸类 |
|---|---|---|---|---|
| `ipad-air-11` | 820×1180 | 【官方】11″ 1640×2360 @2x 264ppi | `pane` / 2 | medium |
| `ipad-pro-13` | 1032×1376 | 【官方】13″ 2064×2752 @2x 264ppi | `pane` / 2 | expanded |
| `android-tablet` | 800×1280 | 【媒体】10″ 级 2560×1600 @2x ≈ sw800dp | `pane` / 2 | medium |

> **形态容器声明**：平板帧演示的是「同一 App 在大屏上的可用空间与外壳几何」，**不代表页面已按断点重排**（页面级响应式属二期，须改 `mobile-template/*.eta` 并重冻 golden）。平板二进制的派生量（`bezel` / `cornerRadius` / `tabBarHeight`）为【估计·同档复用】。

### 多帧预览 `--frame-set`

- 语法 `--frame-set k1,k2[,k3[,k4]]`，最多 4 帧；帧可带姿态 `iphone-duo-inner:half`（帧级优先，缺省继承全局 `--posture`）。
- 产物：`index.html` 恒为 `--device` 主帧；每帧额外产出根级 `device-<key>.html`（与 `index.html` 同深度，相对链接不变）；另产出 `gallery.html` 并排预览。
- `gallery.html` 里的 iframe 尺寸 = `frameWidth/Height + SHELL_STAGE_PAD`（48 = 外壳 `body p-6` 的 24×2）。只给帧外框会被裁掉一圈 bezel 与半个状态栏；verify 按报告逐帧精确断言该值。
- **帧名按设备键固定**：同一设备写两次（如 `iphone-duo-inner:flat,iphone-duo-inner:half`）会去重并 warn——要对比同设备多姿态请分两次生成。
- **陈旧帧自动清理**：任何平台上，`prototype/` 里不在本轮 `frames[]` 的 `device-<已登记键>.html` 与 `gallery.html` 都会被删（换帧集、切平台都不残留）；用户自己的其它 HTML 不动，删除失败会 warn。
- **缺省一个文件都不追加**（golden 文件集不变）。`gallery.html` 与 `device-*.html` **不进** `freeze-golden.js` 的 `expectedFileset`。
- `--aspect` / `--device-width/height` 只作用于主帧（它们描述「这台设备」，套到别的设备会产出错误几何）。
- 桌面端不支持（`--platform desktop` 下 exit 1）；未知键、帧数超限、姿态非法均 exit 1。
- 局限：多帧预览**不演示状态连续性**，也不模拟真实多窗口 / 姿态事件 / 键盘几何。
