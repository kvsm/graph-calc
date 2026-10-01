/** Canvas 2D rendering of grid, axes, curves and the trace marker. */
import type { Segment } from "@/lib/math"
import { toScreenX, toScreenY, type Size, type Viewport } from "@/lib/viewport"
import type { GraphColors } from "./colors"
import { clampScreenY, computeGridLayout, estimateTextWidth, type GridLayout } from "./layout"

/** Curve line widths (UX-SPEC §8.1). */
export const CURVE_WIDTH = 2.5
export const TRACED_CURVE_WIDTH = 3
/** Trace marker: 8px circle with a 2px ring in the background colour (§5.3). */
export const MARKER_RADIUS = 4
export const MARKER_RING = 2
/** Background-coloured stroke behind tick labels (N3). */
export const LABEL_HALO_WIDTH = 3

export const LABEL_FONT =
  '12px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

export interface CurveToDraw {
  color: string
  segments: Segment[]
  width: number
}

export interface DrawInput {
  size: Size
  dpr: number
  viewport: Viewport
  colors: GraphColors
  curves: CurveToDraw[]
  /** World-space trace marker, drawn if both coordinates are finite. */
  marker?: { x: number; y: number; color: string } | null
}

/** The subset of CanvasRenderingContext2D used here, so tests can pass a fake. */
export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | "setTransform"
  | "fillRect"
  | "clearRect"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "stroke"
  | "arc"
  | "fill"
  | "fillText"
  | "strokeText"
  | "save"
  | "restore"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineJoin"
  | "lineCap"
  | "font"
  | "textAlign"
  | "textBaseline"
  | "measureText"
>

/** Snap a 1px line to the pixel grid so it renders crisply. */
const crisp = (v: number) => Math.round(v) + 0.5

function lines(ctx: Ctx2D, xs: number[], ys: number[], size: Size) {
  ctx.beginPath()
  for (const x of xs) {
    const cx = crisp(x)
    ctx.moveTo(cx, 0)
    ctx.lineTo(cx, size.height)
  }
  for (const y of ys) {
    const cy = crisp(y)
    ctx.moveTo(0, cy)
    ctx.lineTo(size.width, cy)
  }
  ctx.stroke()
}

export function drawGraph(ctx: Ctx2D, input: DrawInput): GridLayout {
  const { size, dpr, viewport: vp, colors, curves, marker } = input
  const { width: w, height: h } = size
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = colors.bg
  ctx.fillRect(0, 0, w, h)

  ctx.font = LABEL_FONT
  const measure = (text: string) => {
    const tw = ctx.measureText?.(text)?.width
    return typeof tw === "number" && Number.isFinite(tw) ? tw : estimateTextWidth(text)
  }
  const layout = computeGridLayout(vp, size, measure)

  ctx.lineWidth = 1
  ctx.strokeStyle = colors.grid
  lines(ctx, layout.minorX, layout.minorY, size)
  ctx.strokeStyle = colors.gridMajor
  lines(ctx, layout.majorX, layout.majorY, size)

  ctx.strokeStyle = colors.axis
  lines(ctx, layout.yAxis === null ? [] : [layout.yAxis], layout.xAxis === null ? [] : [layout.xAxis], size)

  // Curves
  ctx.lineJoin = "round"
  ctx.lineCap = "round"
  for (const curve of curves) {
    ctx.strokeStyle = curve.color
    ctx.lineWidth = curve.width
    ctx.beginPath()
    for (const seg of curve.segments) {
      for (let i = 0; i < seg.length; i++) {
        const x = toScreenX(vp, size, seg[i].x)
        const y = clampScreenY(toScreenY(vp, size, seg[i].y), h)
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
  }

  // Tick labels, drawn after the curves with a background-coloured halo so curves
  // never obscure them (N3).
  ctx.font = LABEL_FONT
  ctx.fillStyle = colors.axis
  ctx.strokeStyle = colors.bg
  ctx.lineWidth = LABEL_HALO_WIDTH
  ctx.lineJoin = "round"
  for (const label of layout.labels) {
    ctx.textAlign = label.align
    ctx.textBaseline = label.baseline
    ctx.strokeText(label.text, label.x, label.y)
    ctx.fillText(label.text, label.x, label.y)
  }

  if (marker && Number.isFinite(marker.x) && Number.isFinite(marker.y)) {
    const mx = toScreenX(vp, size, marker.x)
    const my = toScreenY(vp, size, marker.y)
    if (mx >= -MARKER_RADIUS && mx <= w + MARKER_RADIUS && my >= -MARKER_RADIUS && my <= h + MARKER_RADIUS) {
      ctx.beginPath()
      ctx.arc(mx, my, MARKER_RADIUS + MARKER_RING, 0, Math.PI * 2)
      ctx.fillStyle = colors.bg
      ctx.fill()
      ctx.beginPath()
      ctx.arc(mx, my, MARKER_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = marker.color
      ctx.fill()
    }
  }
  return layout
}
