# Duo 数据复核工具（2026-11-10）

一次性取证工具，不参与 skill 运行。两个可执行体：**探针 App**（取 App 视角几何）+ **姿态驱动 helper**（把模拟器摆到指定铰链角/朝向）。

## 结论摘要

| 事实 | 结果 |
|---|---|
| 外屏 466×678 / nativeBounds 1398×2034 / scale 3 | ✅ 实测命中（`raw-output.txt`） |
| 外屏安全区（竖持）上0/右84/下34/左0 | ✅ 实测（竖向系统栏 84×174 @x=382） |
| 外屏安全区（横持）下34 + 侧栏 84 | ✅ landscapeLeft → 左84；landscapeRight → 右84 |
| 内屏 669×951 | ✅ 三证：SDK `displays[1]` 2007×2853@3x + framebuffer 端口 + **App 内 `UIScreen.bounds`（展开/半折姿态）** |
| 内屏安全区 | ✅ 竖持 上82/右0/下34/左0（无侧栏）；横持 上0/右84/下34/左0 |
| 折痕 40pt | ✅ **二证**：半折 90° 与 130° 的 `divisionRegionKind.frame` 均 40×669、`margins` 左右各 20；flat 180° 与折叠态为空 |
| 内屏作为 `UIScreen` | ❌ 折叠态 `screens.count==1`；✅ 半折/展开后 =2 |
| Split View 半边栏位 | ❌ 未测（官方称栏到窗口左缘） |

逐条原始 JSON 见 `raw-output-posture-matrix.txt`（closed / 60° / 90° / 130° / flat 180° × 竖持/横持）与 `raw-output.txt`（早期折叠态基线）。

## 复现步骤

```bash
UDID=<Duo 模拟器 UDID>          # 本机历史值 C9811C9E-E9CD-4B49-A0B5-E2732019FC20
xcrun simctl boot $UDID

# 1) 官方首方数据（无需模拟器）
plutil -p "/Library/Developer/CoreSimulator/Profiles/DeviceTypes/iPhone Duo.simdevicetype/Contents/Resources/capabilities.plist" | sed -n '/"displays"/,/encrypted/p'
xcrun simctl io $UDID enumerate | grep -A4 "Display class: 0"
xcrun devicectl device info displays --device $UDID

# 2) 姿态驱动：把设备摆到半折 90°（CLI 没有 posture 命令，只能发 Device Hub 同款 HID 事件）
SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
xcrun -sdk iphonesimulator clang -arch arm64 -mios-simulator-version-min=17.0 -O2 -fobjc-arc \
  -o duo-pose duo-pose.m -framework IOKit -framework CoreFoundation -framework Foundation -framework CoreMotion
codesign -f -s - duo-pose
xcrun simctl spawn $UDID ./duo-pose hinge 90
xcrun simctl spawn $UDID ./duo-pose orient landscape-left     # 内屏「portrait」界面 = 发 landscape-left
sleep 4
xcrun devicectl device info displays --device $UDID | grep -E "^▿|active:"   # 确认哪个屏 active

# 3) 探针 App（需 scene 生命周期，iOS 27 SDK 强制）
mkdir -p DuoProbe.app && cp Info.plist DuoProbe.app/
xcrun --sdk iphonesimulator swiftc -sdk "$SDK" -target arm64-apple-ios27.2-simulator \
  -module-name DuoProbe main.swift -o DuoProbe.app/DuoProbe
codesign --force --sign - DuoProbe.app
xcrun simctl install $UDID DuoProbe.app
xcrun simctl launch --console-pty $UDID com.lcr.duoprobe | grep -o "PROBE .*"

# 4) 收尾
xcrun simctl uninstall $UDID com.lcr.duoprobe
xcrun simctl shutdown $UDID
```

## 姿态驱动协议（`duo-pose.m`）

`simctl` / `devicectl` 都没有 posture 命令，Device Hub 的姿态按钮又是自绘的（AX 树里取不到）。可行路径是复刻 Device Hub 发出的 **vendor-defined HID 事件**：

| 字段 | 值 |
|---|---|
| usagePage / usage | `0xFF61` / `0x5B` |
| payload | 二进制 `CFDictionary`：`provider` / `source` / `type` / `value` |
| 铰链 | `source=hinge-slider-control`、`type=range`、`value=0…180`（0 闭合 / 180 全展） |
| 朝向 | `source=orientation-picker-control`、`type=enum`、`value=portrait\|landscape-left\|landscape-right\|pud` |

发送方式：helper 编译成 iOS Simulator 可执行体，`xcrun simctl spawn <UDID> ./duo-pose …` 在模拟器内 `IOHIDEventSystemClientDispatchEvent`。

协议来源：MIT 项目 [artemnovichkov/hinge](https://github.com/artemnovichkov/hinge)（`hinge_helper.m`）。本目录的 `duo-pose.m` 只保留「发事件」最小实现，不含其 CoreMotion 回读；状态回读改用探针 + `devicectl`，避免依赖更多私有符号。

### 两个必须知道的行为

- **朝向名与界面朝向相反**：内屏上发 `landscape-left` 才得到 portrait 界面（`interfaceOrientation=1`）；发 `portrait` 不会让界面转竖。永远回读 `UIScreen.bounds` / `scene.interfaceOrientation` 再判断。
- **显示屏切换依赖铰链路径**：0°→90° 跳变会切到内屏；从 180° 直接回 60° 会留在/回到外屏（本次 60° 实测 `screens.count==1`、bounds 466×678）。要内屏数据就在内屏 active 的角度（90–130°）读，并先确认 `active`。

## 探针踩坑

- **必须有 scene 生命周期**：只实现 `AppDelegate.window` 会 `Application failed to launch: UIScene life cycle is required for apps built with this SDK`。
- **`UISceneDelegateClassName` 要带模块名**（`DuoProbe.SceneDelegate`），所以 `swiftc` 必须传 `-module-name`。
- **`--console-pty` 抓不到启动期崩溃前的 `print`**：用 `xcrun simctl spawn <dev> log show --last 3m --predicate 'processImagePath CONTAINS "DuoProbe"'` 看 `(UIKitCore)` 报错行。
- Swift overlay 与 ObjC 选择器不同名，取 reserved region 直接用运行时选择器 `perform(NSSelectorFromString("reservedRegionsOfKind:"), with:)`。
- Device Hub 的窗口 AX 树只暴露 Controls/工具栏（Home/Screenshot/Rotate Left…），**姿态按钮取不到**；本机进程也没有屏幕录制权限（`screencapture` 报 `could not create image`），所以像素点击方案不可用 —— 发 HID 事件是唯一可脚本化路径。