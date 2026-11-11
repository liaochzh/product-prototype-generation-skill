/**
 * 设备参数解析：把 CLI 参数（--device / --aspect / --device-width / --device-height /
 * --crease）解析为模板消费的 it.device 上下文。
 *
 * 三个覆盖参数**彼此独立**，各作用于不同维度（不是单一优先级链）：
 *   --device-width/height → 覆盖预设的逻辑尺寸
 *   --aspect              → 覆盖「由尺寸派生」的布局档位
 *   --crease              → 覆盖预设折痕
 * 无任何覆盖时取默认设备 iphone16。
 */
import { DEVICES, ASPECT_CLASSES, SYSTEM_BAR_RAIL_MIN, deviceFrame, resolvePanes, resolveSizeClass } from '../constants.js';

const DEFAULT_DEVICE = 'iphone16';
// 以下为「预设缺字段」时的兜底值，与 DEVICES.iphone16 对齐
const FALLBACK_BEZEL = 13;
const FALLBACK_CORNER_RADIUS = 55;
const FALLBACK_STATUS_BAR = 54;
const FALLBACK_TAB_BAR = 83;
const DEFAULT_CREASE_WIDTH = 22;

/**
 * 圆角字段。三种口径并存，各有明确消费方：
 *  - `cornerRadius`：单值（既有字段，其它消费点不用改）；
 *  - `cornerRadii`：逐角官方值，仅折叠机需要（Duo 外屏左侧 8pt / 右侧 59pt，官方按角给值）；
 *  - `frame*Css` / `screen*Css`：外壳直接插进 style 的现成字符串，避免模板里算四角。
 * 单值机型输出与旧实现**逐字节同形**（`55px` / `42px`），不触发 golden 抖动。
 */
function radiusFields(ref, bezel) {
  const single = ref.cornerRadius ?? FALLBACK_CORNER_RADIUS;
  const r = ref.cornerRadii;
  if (!r) {
    return {
      cornerRadius: single,
      cornerRadii: null,
      frameRadiusCss: `${single}px`,
      // 单值分支**不做负值钳制**：这是与旧模板 `${cornerRadius - bezel}px` 逐字节同形的契约，
      // 现有 16 台 radius ≥ bezel 故恒非负；新增单值机型若 radius < bezel 需先改契约再钳（逐角分支已钳）。
      screenRadiusCss: `${single - bezel}px`,
    };
  }
  const px = (n) => `${n}px`;
  // CSS border-radius 顺序：上左 / 上右 / 下右 / 下左
  const order = [r.topLeft, r.topRight, r.bottomRight, r.bottomLeft];
  // 缺角/拼错键会让 undefined 静默变成 `undefinedpx`/`NaNpx`，整条 border-radius 被浏览器判废
  // （四角变直角），版面坏了却没有报错 ⇒ 内部表 fail-fast（走到这里说明预设写了 cornerRadii）
  const badIdx = order.findIndex((n) => typeof n !== 'number' || !Number.isFinite(n));
  if (badIdx !== -1) {
    throw new Error(`DEVICES 的 cornerRadii 四角必须均为有限数字（第 ${badIdx + 1} 角非法）：${JSON.stringify(r)}`);
  }
  return {
    cornerRadius: single,
    cornerRadii: r,
    frameRadiusCss: order.map(px).join(' '),
    // 内层屏幕减掉 bezel；尖锐角（如 8pt）减 13 会为负 ⇒ 归零，否则 CSS 圆角非法
    screenRadiusCss: order.map((n) => px(Math.max(0, n - bezel))).join(' '),
  };
}

/**
 * 系统栏形态派生（外壳与页面模板的唯一消费入口）。
 *
 * 竖排系统栏（iPhone Duo 外屏竖持）把「状态栏 + 竖排灵动岛 + tab bar + toolbar」堆在
 * 侧边一条窄列里；外壳只画栏顶的系统 chrome，TabBar 归页面（保 TABBAR_HIDDEN / aria-current）。
 *
 * 输入只用**已实测**的事实：`safeInsets`（逐姿态安全区）+ `systemChrome`（栏内几何）；
 * 竖排分支缺 `systemChrome` 时 fail-fast（不猜几何，否则模板会输出非法 CSS 且静默失效）。
 * 本轮只支持 `edge:'right'`：左栏达标（横持 landscapeLeft 的镜像形态）时降级为横排并
 * 回传 `degradedLeftRail`，由调用方告警——宁可退回旧观感，也不画出「chrome 在左、避让在右」。
 *
 * @returns {{orientation:'vertical'|'horizontal', edge:'right'|'top', thickness:number,
 *            chromeHeight:number, islandTop:number|null, bottomInset:number,
 *            island:{width:number,height:number,radius:number}|null, degradedLeftRail:boolean}}
 */
export function resolveSystemBar({ safeInsets, systemChrome, statusBarHeight, cutout } = {}) {
  const insets = safeInsets?.portrait ?? null;
  const right = insets?.right ?? 0;
  const left = insets?.left ?? 0;
  const horizontal = (degradedLeftRail = false) => ({
    orientation: 'horizontal', edge: 'top', thickness: statusBarHeight,
    chromeHeight: statusBarHeight, islandTop: null,
    bottomInset: insets?.bottom ?? 0, island: null, degradedLeftRail,
  });

  if (!insets) return horizontal();
  if (right >= SYSTEM_BAR_RAIL_MIN) {
    // 竖排几何只认实测值，不做「缺字段就猜」的兜底（与 cornerRadii 同款 fail-fast）：
    // 缺 systemChrome 时若回退横排带高，模板会输出非法 CSS（height:px）而静默失效。
    if (!systemChrome || !Number.isFinite(systemChrome.height) || !Number.isFinite(systemChrome.islandTop)) {
      throw new Error(`设备带竖排系统栏（safeInsets.portrait.right=${right}）但 DEVICES 缺 systemChrome 实测几何（栏高 / 岛顶 y）：请先在 constants.js 补齐`);
    }
    // 竖排灵动岛按**实测洞径** 37×37 画：把横排 cutout（126×37）旋转 90° 得 37×126 是【估计】，
    // 且与实测栏高 174 无法共容（29 顶距 + 126 = 155，只剩 19px 放状态簇）——竖排里状态簇是
    // 「时间 / 岛 / 信号+电量」沿栏依次排开的一条竖线，岛取 37 高才让 29+37+108=174 自洽。
    // 【实测】2026-11-10 reservedRegionsOfKind:occlusion = 84×174（栏）+ 37×37 @y=29.3（岛洞）。
    const islandSize = systemChrome.islandSize ?? null;
    const island = cutout && cutout.type === 'dynamicIsland' && Number.isFinite(islandSize)
      ? { width: islandSize, height: islandSize, radius: Math.min(cutout.radius, Math.round(islandSize / 2)) }
      : null;
    return {
      orientation: 'vertical', edge: 'right', thickness: right,
      chromeHeight: systemChrome.height,
      islandTop: systemChrome.islandTop,
      bottomInset: insets.bottom ?? 0,
      island,
      degradedLeftRail: false,
    };
  }
  if (left >= SYSTEM_BAR_RAIL_MIN) return horizontal(true);
  return horizontal();
}

/**
 * 解析 --crease 覆盖值。格式：<axis>-<count>@<pos>[,<pos>][:<width>]
 * 位置可写 0.5 / 50 / 50%（三者等价），钳制到 (0,1)；仅竖折 v 产生左右多栏。
 *   例：v-1@50:24 ／ v-2@33,67:24 ／ h-1@50:20 ／ none
 */
export function parseCrease(spec) {
  if (!spec || spec === 'none') return null;
  const m = /^([vh])-(\d+)@([\d.,%]+)(?::(\d+))?$/.exec(String(spec).trim());
  if (!m) throw new Error(`--crease 格式错误：${spec}（示例 v-1@50:24 或 v-2@33,67:24）`);
  const [, axis, count, posStr, widthStr] = m;
  const raw = posStr.replace(/%/g, '').split(',').map(Number);
  if (raw.some((p) => !Number.isFinite(p))) throw new Error(`--crease 位置非法：${posStr}`);
  // 50 / 0.5 归一；再钳制到 (0,1)，避免 150% 把折痕画到框外却仍按多栏判定
  const positions = raw.map((p) => Math.min(Math.max(p > 1 ? p / 100 : p, 0), 1));
  if (positions.length !== Number(count)) {
    throw new Error(`--crease 数量不符：声明 ${count} 条，实给 ${positions.length} 个位置`);
  }
  const width = widthStr !== undefined ? Number(widthStr) : DEFAULT_CREASE_WIDTH;
  if (!Number.isFinite(width) || width < 0) throw new Error(`--crease 宽度非法：${widthStr}`);
  return { axis, positions, width };
}

/**
 * @param {{deviceKey?:string, aspectOverride?:string, customW?:number|null, customH?:number|null, creaseOverride?:string}} o
 * @returns {object|null} it.device 上下文；未知设备且无自定义尺寸时返回 null
 */
export function resolveDevice({ deviceKey, aspectOverride, customW, customH, creaseOverride } = {}) {
  const key = deviceKey || DEFAULT_DEVICE;
  // hasOwnProperty 而非真值判断：否则 `--device toString` 会取到原型链函数并静默生成 NaN 几何
  const preset = Object.prototype.hasOwnProperty.call(DEVICES, key) ? DEVICES[key] : null;
  if (!preset && !customW) return null;

  // 无预设但给了自定义尺寸：以默认设备为形状兜底（圆角/挖孔等沿用，不假装是预设机型）
  const ref = preset ?? { ...DEVICES[DEFAULT_DEVICE] };
  const w = customW ?? ref.logicalWidth;
  const h = customH ?? ref.logicalHeight;
  const bezel = ref.bezel ?? FALLBACK_BEZEL;
  const sizeOverridden = customW != null || customH != null;

  const crease = creaseOverride !== undefined && creaseOverride !== ''
    ? parseCrease(creaseOverride)
    : (ref.crease ?? null);

  const merged = { ...ref, logicalWidth: w, logicalHeight: h, bezel, crease };
  const geom = deviceFrame(merged);
  const aspectClass = ASPECT_CLASSES[aspectOverride] ? aspectOverride : geom.aspectClass;
  // aspectOverride 可能改变档位 → 栏数按最终档位下界重算
  const panes = resolvePanes(aspectClass, crease);

  // 预设机型被尺寸覆盖时必须显式标注，否则外壳会谎报成「iPhone 16」预览
  let label = preset ? preset.label : '自定义设备';
  if (preset && sizeOverridden) label = `${preset.label}（自定义 ${w}×${h}）`;

  // 尺寸被覆盖时不得沿用预设机型的逐姿态安全区（否则与 label 的「诚实标注」口径不一）
  const safeInsets = sizeOverridden ? null : (ref.safeInsets ?? null);
  const statusBarHeight = ref.statusBarHeight ?? FALLBACK_STATUS_BAR;
  // 系统栏形态：外壳画 chrome、页面画 TabBar 都读这一个字段（唯一派生点）
  const systemBar = resolveSystemBar({
    safeInsets, systemChrome: ref.systemChrome, statusBarHeight,
    cutout: ref.cutout ?? { type: 'none', size: 0 },
  });

  return {
    key,
    label,
    category: preset ? ref.category : 'custom',
    logicalWidth: w,
    logicalHeight: h,
    bezel,
    ...radiusFields(ref, bezel),
    cutout: ref.cutout ?? { type: 'none', size: 0 },
    statusBarHeight,
    // 以下两项为 agent 参考元数据，当前外壳/页面模板不消费（避免被误当生效约束）
    navBarHeight: ref.navBarHeight ?? 0,
    layoutHint: ref.layoutHint ?? null,
    homeIndicator: ref.homeIndicator ?? null,
    tabBarHeight: ref.tabBarHeight ?? FALLBACK_TAB_BAR,
    crease,
    // 尺寸类仅作报告面/文档口径，模板不消费（ASPECT_CLASSES 仍决定骨架）
    sizeClass: resolveSizeClass(w, h),
    safeInsets,
    systemBar,
    ...geom,
    panes,
    aspectClass,
    layoutConstraint: ASPECT_CLASSES[aspectClass].layout,
    navConstraint: ASPECT_CLASSES[aspectClass].nav,
  };
}