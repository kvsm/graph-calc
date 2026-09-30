/** Pure layout for grid lines, axes and tick labels (UX-SPEC §5.4). */
import {
  defaultViewport,
  fitAspect,
  generateTicks,
  toScreenX,
  toScreenY,
  toWorldY,
  type AxisTicks,
  type Size,
  type Vec2,
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
/** Labels whose box would come within this distance of the canvas edge are skipped (UX-09). */
export const EDGE_CLIP = 2

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Rough 12px system-font text width, used when no canvas is available to measure. */
export const estimateTextWidth = (text: string) => text.length * 7

export function computeGridLayout(
  vp: Viewport,
  size: Size,
  measure: (text: string) => number = estimateTextWidth,
): GridLayout {
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
  const fitsX = (x: number, width: number, align: LabelAlign) => {
    const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x
    return left >= EDGE_CLIP && left + width <= w - EDGE_CLIP
  }
  const fitsY = (y: number) => y - LABEL_HEIGHT / 2 >= EDGE_CLIP && y + LABEL_HEIGHT / 2 <= h - EDGE_CLIP

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
    const x = sx(t.value)
    // Skip labels that would be clipped by the canvas edge (UX-09).
    if (!fitsX(x, measure(t.label), "center")) continue
    labels.push({ text: t.label, x, y: xLabelY, align: "center", baseline: xBaseline })
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
    if (!fitsY(y) || !fitsX(yLabelX, measure(t.label), yAlign)) continue
    labels.push({ text: t.label, x: yLabelX, y, align: yAlign, baseline: "middle" })
  }

  // One origin label, below-left of the origin, clear of both axis lines (UX-10).
  if (originVisible) {
    const left = ay >= Y_LABEL_FLIP_PX
    labels.push({
      text: "0",
      x: left ? ay - LABEL_GAP : ay + LABEL_GAP,
      y: xLabelY,
      align: left ? "right" : "left",
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
export function effectiveViewport(viewport: Viewport | null, size: Size, insetBottom = 0): Viewport {
  const valid = size.width > 0 && size.height > 0
  if (!viewport) return valid ? defaultViewportInset(size, insetBottom) : defaultViewport({ width: 1, height: 1 })
  if (!valid) return viewport
  const want = (viewport.xMax - viewport.xMin) * (size.height / size.width)
  const have = viewport.yMax - viewport.yMin
  return Math.abs(have - want) <= Math.abs(want) * 1e-6 ? viewport : fitAspect(viewport, size)
}

// ---- Bottom inset (the phone sheet covers the bottom of the canvas, UX-04) -------

/** The uncovered part of the canvas: full width, height minus the inset (at least 1px). */
export function usableSize(size: Size, insetBottom = 0): Size {
  const inset = Number.isFinite(insetBottom) ? Math.max(0, insetBottom) : 0
  return { width: size.width, height: Math.max(1, size.height - inset) }
}

/** The world rectangle shown in the uncovered area (the viewport minus the covered strip). */
export function visibleRect(vp: Viewport, size: Size, insetBottom = 0): Viewport {
  const usable = usableSize(size, insetBottom)
  if (!(size.height > 0) || usable.height >= size.height) return vp
  return { ...vp, yMin: toWorldY(vp, size, usable.height) }
}

/** Apply the translation that took `before` to `after` onto `vp` (same object if none). */
export function shiftBy(vp: Viewport, before: Viewport, after: Viewport): Viewport {
  if (after === before) return vp
  const dx = after.xMin - before.xMin
  const dy = after.yMax - before.yMax
  if (dx === 0 && dy === 0) return vp
  return { xMin: vp.xMin + dx, xMax: vp.xMax + dx, yMin: vp.yMin + dy, yMax: vp.yMax + dy }
}

/**
 * Default/reset view (UX-SPEC §5.1) framed in the uncovered area: x ∈ [-10, 10] at 1:1,
 * origin centred in the uncovered area. The canvas below the inset continues the same scale.
 */
export function defaultViewportInset(size: Size, insetBottom = 0): Viewport {
  const usable = usableSize(size, insetBottom)
  const d = defaultViewport(usable)
  const covered = size.height - usable.height
  if (!(covered > 0) || !(size.width > 0)) return d
  return { ...d, yMin: d.yMin - covered * ((d.xMax - d.xMin) / size.width) }
}

/**
 * Keep screen y within a safe band so points near asymptotes (y ~ 1e300) never
 * produce Infinity/NaN or lose precision in the canvas path.
 */
export function clampScreenY(y: number, height: number): number {
  const limit = Math.max(1, height) * 10 + 1000
  return clamp(y, -limit, height + limit)
}

/** Estimated size of the empty-state pill ("Add an expression to see it graphed.", text-sm). */
export const EMPTY_HINT_SIZE: Size = { width: 300, height: 30 }

/**
 * Centre point (px) for the empty-state pill (UX-01): in the uncovered area, in the
 * larger region above/below the x-axis (clear of its labels) and, where it fits,
 * beside the y-axis (clear of its labels), so it never sits on an axis line.
 */
export function emptyHintPosition(vp: Viewport, size: Size, insetBottom = 0, hint: Size = EMPTY_HINT_SIZE): Vec2 {
  const usable = usableSize(size, insetBottom)
  const w = usable.width
  const h = usable.height
  const ax = toScreenY(vp, size, 0)
  const ay = toScreenX(vp, size, 0)
  const margin = 8
  // Vertical: regions above the axis and below its label row.
  let y = h / 3
  if (ax >= 0 && ax <= h) {
    const aboveBottom = ax - margin
    const belowTop = ax + LABEL_GAP + LABEL_HEIGHT + margin
    const above = aboveBottom
    const below = h - belowTop
    y = above >= below ? aboveBottom / 2 : belowTop + below / 2
  }
  y = clamp(y, hint.height / 2 + margin, Math.max(hint.height / 2 + margin, h - hint.height / 2 - margin))
  // Horizontal: beside the y-axis and its labels (about 40px to its left) where there is room.
  let x = w / 2
  if (ay >= 0 && ay <= w) {
    const leftSpace = ay - 40 - margin
    const rightSpace = w - (ay + margin)
    if (Math.max(leftSpace, rightSpace) >= hint.width + 2 * margin) {
      x = leftSpace >= rightSpace ? leftSpace / 2 : ay + margin + rightSpace / 2
    }
  }
  return { x, y }
}
