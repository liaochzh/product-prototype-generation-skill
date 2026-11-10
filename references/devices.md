# 多设备适配（17 机型 / 档位 / 尺寸类 / 折痕 / 多帧预览）

> 本文件由 SKILL.md 拆出（2026-10-27 F1 分层）。SKILL.md 只保留结论与触发条件；需要动手改生成链路/模板/词典时读本文件。本文件不再链向其它 references 文件（引用只一层深）。

来源：SKILL.md「多设备适配」全节（原 106–116 行）。

## 多设备适配
设备为**单一事实来源**：`constants.js` 的 `DEVICES`（机型预设表）+ `ASPECT_CLASSES`（布局档位）+ `SIZE_CLASSES`（尺寸类，报告面口径）。外壳 `layout-shell.eta` 只消费 `it.device.*`，不写死任何机型尺寸。新增设备只需在 `DEVICES` 填一行。数值一律标注数据来源等级：【官方】厂商规格页 /【推导】官方物理分辨率÷scale /【媒体】第三方实测 /【估计】无官方数据。

- **三个覆盖参数彼此独立**（各作用于不同维度，非单一优先级链）：`--device-width/--device-height`（须为正数）覆盖预设的逻辑尺寸 → `--aspect phone|pane|wide` 覆盖**由尺寸派生**的档位 → `--crease` 覆盖预设折痕。都不给时用默认 `iphone16`。未知 `--device` 且未给自定义尺寸会**报错退出**（`--device` 走 `hasOwnProperty` 校验，杜绝 `toString` 之类原型链键静默生成 NaN 几何）。
- **自定义尺寸必须诚实标注**：给了 `--device-width/height` 时，外壳文案与 `generation-report.device.label` 会显示成「iPhone 16（自定义 800×600）」，不会谎报成预设机型。
- **档位以逻辑宽度为主判据**（非纯比例）：宽 `<600px` → `phone`（单栏+TabBar）；`≥600px` 且宽高比 `>1.30` → `wide`；其余 `pane`（双栏+Rail）。WHY：iPhone Duo 外屏(466×678) 与内屏(669×951) 比例仅差 0.016，却应分属单栏/双栏，比例分档必然误判。
- **栏数由折痕派生**：`panes = 竖折痕数 + 1`，且不低于档位下界（`pane`/`wide` ≥ 2）。横折（`axis:'h'`，如 Z Flip）是上下分区，**不计入栏数**。折痕宽度：Duo 内屏为【实测·二证 2026-11-10】40pt（= 两侧各 20；半折 90° 与 130° 两角一致，flat/折叠态为空），其余折叠为【估计】（厂商未公布），仅供「尽量规避交互元素落折痕」的提示。证据与复跑方式见下方「Duo 数据来源」。
- `--crease <axis>-<count>@<pos>[,<pos>][:<width>]`：覆盖折痕（位置可写 `0.5`/`50`/`50%`；`none` 表示无折痕）。例：`v-1@50:24`、`v-2@33,67:24`、`h-1@50:20`。
- **姿态 `--posture flat|half|closed`**（**仅折叠设备**，非折叠预设给该参数 exit 1；与 `--crease` **互斥**，同给 exit 1）：`flat` → 折痕收成 1px 分割线；`half` → 预设带宽（Duo 40pt）；`closed` → 无折痕带（`crease=null`），仅在报告标注。实现走「折算成 `--crease` 规格串」的既有通道，**不改模板**。这是**外壳预览参数**，不表示运行时能判定姿态：iOS 拿不到折叠信息，页面层也不得自绘折痕避让（系统已内建「半折时推开交互元素」）。另注意 Apple 语义：division 区仅在折叠时 active，**完全展开时宽度为 0**，故 `flat` 的 1px 是人眼友好的观感近似，不是设备事实。
- **尺寸类 `SIZE_CLASSES` / `resolveSizeClass(w,h)`**：四档 compact / medium / expanded / large（XL 并入 large），高度例外（矮于阈值的宽屏判 compact，即「宽 medium 而高 compact 不判双栏」）。**断点数值不在本文件复制**，唯一事实源是 `constants.js`；平台口径回指哲学层 §自适应布局。尺寸类进报告面（`report.device.sizeClass` / `report.frames[].sizeClass`），**同时是平板断点 `TABLET_SCREENS` 的派生源**（二期）；不改模板产物。
- 派生属性：`verticalSpace`（逻辑高 `<700px` → `tight`，用于竖向紧凑布局）；`frameWidth/Height = 逻辑尺寸 + 2×bezel`（原实现误把物理外框当逻辑分辨率，导致 iframe 视口为虚构的 404px）；`sizeClass`；`safeInsets`（折叠内外屏逐姿态安全区，外壳暂不消费）。四个折叠预设的安全区均为【实测·运行时 2026-11-10】（Duo 内外屏、竖持/横持；覆盖屏横持的侧栏随持握侧镜像）；Duo 内屏竖持**无侧栏**（上 82 / 下 34），与「内屏横持才有右侧 84 栏」是两组不同事实。
- **圆角两种口径**：`cornerRadius`（单值，绝大多数机型）与 `cornerRadii`（逐角，仅 Duo 外屏这种官方按角给值的机型）。外壳消费的是派生好的 `frameRadiusCss` / `screenRadiusCss`（后者已减 `bezel` 并归零负值），模板里不再做算术。单值机型的输出与旧实现逐字节相同。
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

> **形态容器声明**：平板帧演示的是「同一 App 在大屏上的可用空间与外壳几何」。**页面级重排二期已落地**（`tbl`=600 / `tbl-lg`=840 / `tbl-xl`=1200，只注入 mobile；详见 `adaptive-layout.md` §6）。平板二进制的派生量（`bezel` / `cornerRadius` / `tabBarHeight`）为【估计·同档复用】。

### Duo 数据来源与复核（2026-11-10）

**已复核（官方 SDK + 运行时，多源互证）**：

| 事实 | 值 | 证据 |
|---|---|---|
| 内屏渲染分辨率 | 2007×2853 @3x（460 dpi） | `iPhone Duo.simdevicetype` 的 `capabilities.plist` `displays[1]`；`simctl io <dev> enumerate` 主 framebuffer 端口同为 2007×2853；`devicectl device info displays` 的 `LCD-1` 同值 |
| 内屏逻辑尺寸 | **669×951** | 上者 ÷3；App 内实测（展开/半折姿态）`UIScreen.bounds=669×951`（portrait interface）、`nativeScale=3`；折叠态 `UIScreen.screens.count==1`、展开后 =2 |
| 内屏圆角 / 原生朝向 | 四角均 55 / `nativeOrientation=270` | `displays[1]`（原生横置，与 `layoutHint: two-pane` 一致） |
| 外屏渲染分辨率 | 1398×2034 @3x（460 dpi）⇒ **466×678** | `displays[0]`；App 内实测 `UIScreen.bounds=466×678`、`nativeBounds=1398×2034`、`nativeScale=3` |
| 外屏圆角 | **逐角**：左（折痕侧）两角 **8**、右（外缘）两角 **59**（官方 `cornerRadiusUL/UR/LL/LR` = 8/59/8/59；framebufferMask PDF 实测一致） | `displays[0]` + 设备 `capabilities.plist`（`DeviceCornerRadius=59`）⇒ `constants.js` 用 `cornerRadii` 按角渲染（模板 `frameRadiusCss`/`screenRadiusCss`），**不再一刀切** |
| 折痕带宽 | **40pt**（= 两侧各 20） | 半折 90° 与 130° **两角一致**：`reservedRegionsOfKind:divisionRegionKind` 的 `frame` = 40×669（竖折时）且 `margins.left/right` = 20/20；flat 180° 与折叠态均为空 ⇒ 与 Apple 语义吻合 |
| 外屏安全区 | 竖持：上0 / 右**84** / 下34 / 左0；横持：下34 + 侧栏 84（landscapeLeft→左84，landscapeRight→右84） | 运行时 `window.safeAreaInsets`；竖持活动遮挡区实测 84×174 @x=382（竖向系统栏）+ 37×37 @(399.7,29.3)（灵动岛开孔）⇒ 印证 E3「系统栏竖排到尾侧、避让 84」 |
| 内屏安全区 | 竖持（669×951）：上**82** / 右0 / 下**34** / 左0；横持（951×669）：上0 / 右**84** / 下**34** / 左0 | 运行时 `window.safeAreaInsets`；**订正**上一版把 34 记到 right、84 记到 landscape.left 的方位错误（竖持无侧栏、34 是底部 home indicator） |

**未能复核（仍单源/未测，标注保留）**：

- **内屏 Split View 半边**的栏位（官方文档称栏到窗口左缘，可能出现 `left 84`）：需把 App 拖到内屏一侧，本次未测，**不得由上面的表外推**。
- **bezel 13 / `statusBarHeight` 54 / `homeIndicator` 134×5 / `tabBarHeight` 83 / `cutout` 126×37**：属外观派生量，SDK 设备配置不提供（profile 只有 `HasThinBezel:true` 与 `DeviceSupportsDynamicIsland:true`），维持模拟器观感取值。

**复核方式（可重跑）**：

1. 尺寸/圆角/朝向：`plutil -p "<Xcode>/…/iPhone Duo.simdevicetype/Contents/Resources/capabilities.plist"` 取 `displays` 全表；`xcrun simctl io <UDID> enumerate` 取 framebuffer；`xcrun devicectl device info displays --device <UDID>` 取运行时几何。
2. **姿态**：`simctl` / `devicectl` **都没有** posture/fold 命令；Device Hub 的姿态按钮又是自绘的（AX 取不到）。可脚本化的可行路径是复刻 Device Hub 的 vendor-defined HID 事件：usagePage `0xFF61` / usage `0x5B`，payload `provider/source/type/value`（`hinge-slider-control` + `range` + 角度；`orientation-picker-control` + `enum` + 朝向），由 helper 在模拟器内 `IOHIDEventSystemClientDispatchEvent` 发出、用 `xcrun simctl spawn <UDID> <helper>` 执行。本仓留档的最小实现：`docs/test/duo-probe-20261110/duo-pose.m`（协议来自 MIT 项目 `artemnovichkov/hinge`）。
3. App 内取值需带 scene 生命周期的最小 UIKit 探针（`UIScreen.bounds`/`nativeBounds`/`nativeScale`/`safeAreaInsets`/`UIView.reservedRegionsOfKind:`），源码见同一目录。
4. 实测矩阵原始输出：`docs/test/duo-probe-20261110/raw-output-posture-matrix.txt`（closed / 60° / 90° / 130° / flat 180° × 竖持/横持）。

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
