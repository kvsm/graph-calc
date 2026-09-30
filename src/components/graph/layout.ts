/** Pure layout for grid lines, axes and tick labels (UX-SPEC §5.4). */
import {
  defaultViewport,
  fitAspect,
  generateTicks,
  toScreenX,
  toScreenY,
  type AxisTicks,
  type Size,
  type Viewport,
} from "@/lib/viewport"

export type LabelAlign = "left" | "right" | "center"
export type LabelBaseline = "top" | "bottom" | "middle"

export interface TickLabel {
  text: string
  x: number
  y: number
  align: LabelAlign
  baseline: LabelBaseline
}

export interface GridLayout {
  xTicks: AxisTicks
  yTicks: AxisTicks
  /** Screen x of minor/major vertical lines. */
  minorX: number[]
  majorX: number[]
  /** Screen y of minor/major horizontal lines. */
  minorY: number[]
  majorY: number[]
  /** Screen y of the x-axis (y = 0), or null when off-screen. */
  xAxis: number | null
  /** Screen x of the y-axis (x = 0), or null when off-screen. */
  yAxis: number | null
  labels: TickLabel[]
}

/** Gap between an axis and its labels, in px. */
export const LABEL_GAP = 4
/** Approximate label line height for 12px text. */
export const LABEL_HEIGHT = 14
/** Distance kept between labels and the canvas edge. */
export const EDGE_PAD = 4
/** Below this distance from the left edge, y labels move to the right of the axis. */
const Y_LABEL_FLIP_PX = 36

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function computeGridLayout(vp: Viewport, size: Size): GridLayout {
  const { width: w, height: h } = size
  const xTicks = generateTicks(vp.xMin, vp.xMax, w)
  const yTicks = generateTicks(vp.yMin, vp.yMax, h)
  const sx = (x: number) => toScreenX(vp, size, x)
  const sy = (y: number) => toScreenY(vp, size, y)

  const ax = sy(0)
  const ay = sx(0)
  const xAxis = ax >= 0 && ax <= h ? ax : null
  const yAxis = ay >= 0 && ay <= w ? ay : null
  const originVisible = xAxis !== null && yAxis !== null

  const labels: TickLabel[] = []

  // X labels sit just below the x-axis, clamped to the top/bottom edge when it is off-screen.
  let xLabelY: number
  let xBaseline: LabelBaseline
  if (ax + LABEL_GAP + LABEL_HEIGHT + EDGE_PAD > h) {
    // Axis near or below the bottom: put labels above it, clamped to the bottom edge.
    xLabelY = clamp(ax - LABEL_GAP, LABEL_HEIGHT + EDGE_PAD, h - EDGE_PAD)
    xBaseline = "bottom"
  } else {
    xLabelY = clamp(ax + LABEL_GAP, EDGE_PAD, h - EDGE_PAD - LABEL_HEIGHT)
    xBaseline = "top"
  }
  for (const t of xTicks.major) {
    if (originVisible && t.value === 0) continue
    labels.push({ text: t.label, x: sx(t.value), y: xLabelY, align: "center", baseline: xBaseline })
  }

  // Y labels sit left of the y-axis; right of it near the left edge; clamped when off-screen.
  let yLabelX: number
  let yAlign: LabelAlign
  if (ay < Y_LABEL_FLIP_PX) {
    yLabelX = Math.max(ay + LABEL_GAP + 2, EDGE_PAD)
    yAlign = "left"
  } else {
    yLabelX = Math.min(ay - LABEL_GAP - 2, w - EDGE_PAD)
    yAlign = "right"
  }
  for (const t of yTicks.major) {
    if (originVisible && t.value === 0) continue
    const y = sy(t.value)
    // Keep clear of the row of x labels.
    const bandTop = xBaseline === "top" ? xLabelY : xLabelY - LABEL_HEIGHT
    if (y > bandTop - LABEL_HEIGHT / 2 && y < bandTop + LABEL_HEIGHT * 1.5) continue
    labels.push({ text: t.label, x: yLabelX, y, align: yAlign, baseline: "middle" })
  }

  if (originVisible) {
    labels.push({
      text: "0",
      x: yLabelX,
      y: xLabelY,
      align: yAlign,
      baseline: xBaseline,
    })
  }

  return {
    xTicks,
    yTicks,
    minorX: xTicks.minor.map(sx),
    majorX: xTicks.major.map((t) => sx(t.value)),
    minorY: yTicks.minor.map(sy),
    majorY: yTicks.major.map((t) => sy(t.value)),
    xAxis,
    yAxis,
    labels,
  }
}

/**
 * The viewport actually drawn: `null` means the default view for this size, and
 * a viewport whose aspect doesn't match the canvas (e.g. restored from storage
 * at another window size) is corrected to 1:1, keeping its x-range and centre.
 */
export function effectiveViewport(viewport: Viewport | null, size: Size): Viewport {
  const valid = size.width > 0 && size.height > 0
  if (!viewport) return defaultViewport(valid ? size : { width: 1, height: 1 })
  if (!valid) return viewport
  const want = (viewport.xMax - viewport.xMin) * (size.height / size.width)
  const have = viewport.yMax - viewport.yMin
  return Math.abs(have - want) <= Math.abs(want) * 1e-6 ? viewport : fitAspect(viewport, size)
}

/**
 * Keep screen y within a safe band so points near asymptotes (y ~ 1e300) never
 * produce Infinity/NaN or lose precision in the canvas path.
 */
export function clampScreenY(y: number, height: number): number {
  const limit = Math.max(1, height) * 10 + 1000
  return clamp(y, -limit, height + limit)
}
