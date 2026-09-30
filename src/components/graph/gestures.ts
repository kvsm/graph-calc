/** Pure gesture maths for pointer/touch interactions (UX-SPEC §5.1). */
import { panByPixels, zoomAt, type Size, type Vec2, type Viewport } from "@/lib/viewport"

/** Touch press-and-hold duration that enters trace mode. */
export const HOLD_MS = 300
/** Movement (px) that turns a press into a drag. */
export const DRAG_SLOP_PX = 8
/** Double-tap window. */
export const DOUBLE_TAP_MS = 300
export const DOUBLE_TAP_DIST_PX = 30

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)
const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/**
 * Two-finger pinch/pan: the world point under the previous midpoint ends up
 * under the new midpoint, and the view scales by the change in finger distance.
 */
export function pinchViewport(
  vp: Viewport,
  size: Size,
  prev: readonly [Vec2, Vec2],
  next: readonly [Vec2, Vec2],
): Viewport {
  const m0 = mid(prev[0], prev[1])
  const m1 = mid(next[0], next[1])
  const d0 = dist(prev[0], prev[1])
  const d1 = dist(next[0], next[1])
  const panned = panByPixels(vp, size, m1.x - m0.x, m1.y - m0.y)
  if (!(d0 > 0) || !(d1 > 0)) return panned
  const factor = d1 / d0
  if (!Number.isFinite(factor) || factor === 1) return panned
  return zoomAt(panned, size, m1, factor)
}

export function exceedsSlop(start: Vec2, current: Vec2, slop = DRAG_SLOP_PX): boolean {
  return dist(start, current) > slop
}

export interface Tap {
  time: number
  x: number
  y: number
}

export function isDoubleTap(prev: Tap | null, tap: Tap): boolean {
  if (!prev) return false
  const dt = tap.time - prev.time
  return dt >= 0 && dt <= DOUBLE_TAP_MS && dist(prev, tap) <= DOUBLE_TAP_DIST_PX
}

/** Wheel delta in pixels: DOM_DELTA_LINE (1) is about 16px, DOM_DELTA_PAGE (2) is one page. */
export function wheelDeltaPixels(deltaY: number, deltaMode: number, pageHeight: number): number {
  if (!Number.isFinite(deltaY)) return 0
  if (deltaMode === 1) return deltaY * 16
  if (deltaMode === 2) return deltaY * Math.max(1, pageHeight)
  return deltaY
}
