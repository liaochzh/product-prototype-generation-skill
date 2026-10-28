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
import { DEVICES, ASPECT_CLASSES, deviceFrame, resolvePanes } from '../constants.js';

const DEFAULT_DEVICE = 'iphone16';
// 以下为「预设缺字段」时的兜底值，与 DEVICES.iphone16 对齐
const FALLBACK_BEZEL = 13;
const FALLBACK_CORNER_RADIUS = 55;
const FALLBACK_STATUS_BAR = 54;
const FALLBACK_TAB_BAR = 83;
const DEFAULT_CREASE_WIDTH = 22;

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

  return {
    key,
    label,
    category: preset ? ref.category : 'custom',
    logicalWidth: w,
    logicalHeight: h,
    bezel,
    cornerRadius: ref.cornerRadius ?? FALLBACK_CORNER_RADIUS,
    cutout: ref.cutout ?? { type: 'none', size: 0 },
    statusBarHeight: ref.statusBarHeight ?? FALLBACK_STATUS_BAR,
    // 以下两项为 agent 参考元数据，当前外壳/页面模板不消费（避免被误当生效约束）
    navBarHeight: ref.navBarHeight ?? 0,
    layoutHint: ref.layoutHint ?? null,
    homeIndicator: ref.homeIndicator ?? null,
    tabBarHeight: ref.tabBarHeight ?? FALLBACK_TAB_BAR,
    crease,
    ...geom,
    panes,
    aspectClass,
    layoutConstraint: ASPECT_CLASSES[aspectClass].layout,
    navConstraint: ASPECT_CLASSES[aspectClass].nav,
  };
}