/**
 * Pure viewport maths: the visible world rectangle and transforms between
 * world (graph) coordinates and screen (CSS pixel) coordinates.
 *
 * Screen coordinates have their origin at the top-left of the plot area with
 * y pointing down; world coordinates have y pointing up.
 */

export interface Viewport {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export interface Size {
  /** Plot width in CSS pixels. */
  width: number
  /** Plot height in CSS pixels. */
  height: number
}

export interface Vec2 {
  x: number
  y: number
}

/** Visible x-span limits (UX-SPEC §5.1). */
export const MIN_SPAN = 1e-6
export const MAX_SPAN = 1e6

/** Half-width of the default view: x ∈ [-10, 10]. */
export const DEFAULT_HALF_WIDTH = 10

/** Reset view: x ∈ [-10, 10], y scaled for a 1:1 aspect ratio, centred on the origin. */
export function defaultViewport(size: Size): Viewport {
  const half = DEFAULT_HALF_WIDTH
  const halfY = size.width > 0 && size.height > 0 ? (half * size.height) / size.width : half
  return { xMin: -half, xMax: half, yMin: -halfY, yMax: halfY }
}

export const spanX = (vp: Viewport) => vp.xMax - vp.xMin
export const spanY = (vp: Viewport) => vp.yMax - vp.yMin
export const center = (vp: Viewport): Vec2 => ({
  x: (vp.xMin + vp.xMax) / 2,
  y: (vp.yMin + vp.yMax) / 2,
})

// ---- Transforms -------------------------------------------------------------

export const toScreenX = (vp: Viewport, size: Size, x: number) =>
  ((x - vp.xMin) / spanX(vp)) * size.width
export const toScreenY = (vp: Viewport, size: Size, y: number) =>
  ((vp.yMax - y) / spanY(vp)) * size.height
export const toWorldX = (vp: Viewport, size: Size, px: number) =>
  vp.xMin + (px / size.width) * spanX(vp)
export const toWorldY = (vp: Viewport, size: Size, py: number) =>
  vp.yMax - (py / size.height) * spanY(vp)

export function worldToScreen(vp: Viewport, size: Size, p: Vec2): Vec2 {
  return { x: toScreenX(vp, size, p.x), y: toScreenY(vp, size, p.y) }
}

export function screenToWorld(vp: Viewport, size: Size, p: Vec2): Vec2 {
  return { x: toWorldX(vp, size, p.x), y: toWorldY(vp, size, p.y) }
}

/** World units per screen pixel along each axis. */
export function unitsPerPixel(vp: Viewport, size: Size): Vec2 {
  return { x: spanX(vp) / size.width, y: spanY(vp) / size.height }
}

// ---- Pan --------------------------------------------------------------------

/**
 * Pan by a screen-space drag delta: dragging right/down by (dx, dy) pixels
 * moves the content right/down, i.e. the view moves left/up.
 */
export function panByPixels(vp: Viewport, size: Size, dx: number, dy: number): Viewport {
  const wx = (dx / size.width) * spanX(vp)
  const wy = (dy / size.height) * spanY(vp)
  return { xMin: vp.xMin - wx, xMax: vp.xMax - wx, yMin: vp.yMin + wy, yMax: vp.yMax + wy }
}

/**
 * Move the view by a fraction of the visible span, e.g. (0.1, 0) moves the view
 * 10% to the right (arrow keys). Positive fy moves the view up.
 */
export function panByFraction(vp: Viewport, fx: number, fy: number): Viewport {
  const wx = fx * spanX(vp)
  const wy = fy * spanY(vp)
  return { xMin: vp.xMin + wx, xMax: vp.xMax + wx, yMin: vp.yMin + wy, yMax: vp.yMax + wy }
}

/** Move the view by a world-space offset. */
export function panWorld(vp: Viewport, dx: number, dy: number): Viewport {
  return { xMin: vp.xMin + dx, xMax: vp.xMax + dx, yMin: vp.yMin + dy, yMax: vp.yMax + dy }
}

/** Centre the view on a world point, keeping the scale. */
export function centerOn(vp: Viewport, p: Vec2): Viewport {
  const c = center(vp)
  return panWorld(vp, p.x - c.x, p.y - c.y)
}

// ---- Zoom -------------------------------------------------------------------

/** True if zooming by `factor` (>1 = in) would keep the x-span within limits. */
export function canZoom(vp: Viewport, factor: number): boolean {
  if (!(factor > 0) || !Number.isFinite(factor) || factor === 1) return false
  const span = spanX(vp)
  return factor > 1 ? span > MIN_SPAN * (1 + 1e-9) : span < MAX_SPAN * (1 - 1e-9)
}

/**
 * Zoom by `factor` about a world point that stays fixed on screen.
 * factor > 1 zooms in. The x-span is clamped to [MIN_SPAN, MAX_SPAN]; both axes
 * scale together so the aspect ratio is preserved. Returns `vp` unchanged
 * (same object) if already at the limit.
 */
export function zoomAtWorld(vp: Viewport, anchor: Vec2, factor: number): Viewport {
  if (!canZoom(vp, factor)) return vp
  const sx = spanX(vp)
  const clampedSpan = Math.min(MAX_SPAN, Math.max(MIN_SPAN, sx / factor))
  const k = clampedSpan / sx
  return {
    xMin: anchor.x + (vp.xMin - anchor.x) * k,
    xMax: anchor.x + (vp.xMax - anchor.x) * k,
    yMin: anchor.y + (vp.yMin - anchor.y) * k,
    yMax: anchor.y + (vp.yMax - anchor.y) * k,
  }
}

/** Zoom about a screen point (e.g. the cursor or pinch midpoint). */
export function zoomAt(vp: Viewport, size: Size, screenPoint: Vec2, factor: number): Viewport {
  return zoomAtWorld(vp, screenToWorld(vp, size, screenPoint), factor)
}

/** Zoom about the centre of the view (toolbar buttons, +/- keys). */
export function zoomCenter(vp: Viewport, factor: number): Viewport {
  return zoomAtWorld(vp, center(vp), factor)
}

/** Wheel zoom factor from UX-SPEC §5.1: 1.0015^(-deltaY), clamped to [0.5, 2]. */
export function wheelZoomFactor(deltaY: number): number {
  const f = Math.pow(1.0015, -deltaY)
  return Math.min(2, Math.max(0.5, f))
}

// ---- Resize / aspect --------------------------------------------------------

/**
 * Adapt to a new plot size keeping the centre and the units-per-pixel scale,
 * so resizing the window reveals or hides content instead of stretching it.
 */
export function resizeViewport(vp: Viewport, oldSize: Size, newSize: Size): Viewport {
  if (!(oldSize.width > 0 && oldSize.height > 0 && newSize.width > 0 && newSize.height > 0)) {
    return vp
  }
  const upp = unitsPerPixel(vp, oldSize)
  const c = center(vp)
  const hx = (upp.x * newSize.width) / 2
  const hy = (upp.y * newSize.height) / 2
  return { xMin: c.x - hx, xMax: c.x + hx, yMin: c.y - hy, yMax: c.y + hy }
}

/** Keep the x-range and centre, and set the y-span for a 1:1 aspect ratio. */
export function fitAspect(vp: Viewport, size: Size): Viewport {
  if (!(size.width > 0 && size.height > 0)) return vp
  const cy = center(vp).y
  const hy = (spanX(vp) * size.height) / size.width / 2
  return { xMin: vp.xMin, xMax: vp.xMax, yMin: cy - hy, yMax: cy + hy }
}

/** True if the viewport has finite, positive spans (safe to use after loading from storage). */
export function isValidViewport(vp: unknown): vp is Viewport {
  if (typeof vp !== 'object' || vp === null) return false
  const { xMin, xMax, yMin, yMax } = vp as Record<string, unknown>
  const nums = [xMin, xMax, yMin, yMax]
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return false
  const sx = (xMax as number) - (xMin as number)
  const sy = (yMax as number) - (yMin as number)
  return sx > 0 && sy > 0 && Number.isFinite(sx) && Number.isFinite(sy)
}
