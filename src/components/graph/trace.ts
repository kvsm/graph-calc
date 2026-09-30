/** Pure trace helpers: hit-testing, keyboard stepping, curve cycling (UX-SPEC §5.1–5.3). */
import type { Segment } from "@/lib/math"
import { toScreenX, toScreenY, unitsPerPixel, type Size, type Vec2, type Viewport } from "@/lib/viewport"

/** Hover snaps to curves within this many screen px of the pointer. */
export const TRACE_HIT_RADIUS_PX = 24

export interface CurveSamples {
  id: string
  segments: Segment[]
}

export interface CurveHit {
  id: string
  /** World coordinates of the nearest point on the sampled polyline. */
  x: number
  y: number
  /** Screen distance from the query point, px. */
  distance: number
}

/**
 * Nearest point on any curve's sampled polyline to screen point `pt`, within
 * `maxDistance` px. Earlier curves win ties.
 */
export function nearestCurvePoint(
  curves: readonly CurveSamples[],
  vp: Viewport,
  size: Size,
  pt: Vec2,
  maxDistance = TRACE_HIT_RADIUS_PX,
): CurveHit | null {
  let best: CurveHit | null = null
  let bestD2 = maxDistance * maxDistance
  const sx = (x: number) => toScreenX(vp, size, x)
  const sy = (y: number) => toScreenY(vp, size, y)
  const consider = (id: string, d2: number, x: number, y: number) => {
    if (Number.isFinite(d2) && d2 <= bestD2 && (best === null || d2 < bestD2)) {
      bestD2 = d2
      best = { id, x, y, distance: Math.sqrt(d2) }
    }
  }
  for (const curve of curves) {
    for (const seg of curve.segments) {
      if (seg.length === 0) continue
      let ax = sx(seg[0].x)
      let ay = sy(seg[0].y)
      if (seg.length === 1) {
        consider(curve.id, (ax - pt.x) ** 2 + (ay - pt.y) ** 2, seg[0].x, seg[0].y)
        continue
      }
      for (let i = 1; i < seg.length; i++) {
        const bx = sx(seg[i].x)
        const by = sy(seg[i].y)
        const dx = bx - ax
        const dy = by - ay
        const len2 = dx * dx + dy * dy
        let t = len2 > 0 ? ((pt.x - ax) * dx + (pt.y - ay) * dy) / len2 : 0
        t = Math.min(1, Math.max(0, t))
        const d2 = (ax + t * dx - pt.x) ** 2 + (ay + t * dy - pt.y) ** 2
        const p0 = seg[i - 1]
        const p1 = seg[i]
        consider(curve.id, d2, p0.x + t * (p1.x - p0.x), p0.y + t * (p1.y - p0.y))
        ax = bx
        ay = by
      }
    }
  }
  return best
}

/** Evaluate safely: any throw or non-finite result becomes NaN. */
export function safeEval(f: (x: number) => number, x: number): number {
  try {
    const y = f(x)
    return Number.isFinite(y) ? y : NaN
  } catch {
    return NaN
  }
}

/**
 * Starting at x0, search outward in steps of `dx` for an x where f is finite,
 * up to `maxSteps` each way. Returns x0 if nothing is found.
 */
export function findDefinedX(f: (x: number) => number, x0: number, dx: number, maxSteps: number): number {
  const ok = (x: number) => !Number.isNaN(safeEval(f, x))
  if (ok(x0) || !(dx > 0)) return x0
  for (let i = 1; i <= maxSteps; i++) {
    if (ok(x0 + i * dx)) return x0 + i * dx
    if (ok(x0 - i * dx)) return x0 - i * dx
  }
  return x0
}

/** Move x by a number of screen pixels' worth of world units. */
export function stepTraceX(x: number, vp: Viewport, size: Size, pixels: number): number {
  return x + pixels * unitsPerPixel(vp, size).x
}

/** Next/previous id in `ids` (wrapping); the first id if `current` is not present. */
export function cycleId(ids: readonly string[], current: string | null, dir: 1 | -1): string | null {
  if (ids.length === 0) return null
  const i = current === null ? -1 : ids.indexOf(current)
  if (i < 0) return ids[0]
  return ids[(i + dir + ids.length) % ids.length]
}

/**
 * Pan the view (keeping scale) so that `pt` is inside it with a margin of
 * `marginFraction` of the span. Non-finite coordinates are ignored.
 * Returns `vp` itself when no pan is needed.
 */
export function keepInView(vp: Viewport, pt: Vec2, marginFraction = 0.05): Viewport {
  const mx = (vp.xMax - vp.xMin) * marginFraction
  const my = (vp.yMax - vp.yMin) * marginFraction
  let dx = 0
  let dy = 0
  if (Number.isFinite(pt.x)) {
    if (pt.x < vp.xMin + mx) dx = pt.x - (vp.xMin + mx)
    else if (pt.x > vp.xMax - mx) dx = pt.x - (vp.xMax - mx)
  }
  if (Number.isFinite(pt.y)) {
    if (pt.y < vp.yMin + my) dy = pt.y - (vp.yMin + my)
    else if (pt.y > vp.yMax - my) dy = pt.y - (vp.yMax - my)
  }
  if (dx === 0 && dy === 0) return vp
  return { xMin: vp.xMin + dx, xMax: vp.xMax + dx, yMin: vp.yMin + dy, yMax: vp.yMax + dy }
}

export interface TraceStart {
  x: number
  /** The viewport to show: `vp` itself, or `vp` panned vertically so the point is visible. */
  viewport: Viewport
}

/**
 * Where keyboard trace (T) starts on a curve (team-lead decision on UX-SPEC §5.2):
 * 1. the x nearest the viewport centre, searching outward a pixel at a time within
 *    the visible x-range, whose y is defined and on-screen;
 * 2. otherwise the defined x nearest the centre, with the view panned vertically
 *    to centre that point;
 * 3. otherwise (undefined across the whole visible range) null.
 */
export function findTraceStart(f: (x: number) => number, vp: Viewport, size: Size): TraceStart | null {
  const x0 = (vp.xMin + vp.xMax) / 2
  const dx = unitsPerPixel(vp, size).x
  const steps = Math.max(1, Math.ceil(size.width / 2))
  const candidates: number[] = [x0]
  for (let i = 1; i <= steps; i++) {
    const r = x0 + i * dx
    const l = x0 - i * dx
    if (r <= vp.xMax) candidates.push(r)
    if (l >= vp.xMin) candidates.push(l)
  }
  let firstDefined: { x: number; y: number } | null = null
  for (const x of candidates) {
    const y = safeEval(f, x)
    if (Number.isNaN(y)) continue
    if (y >= vp.yMin && y <= vp.yMax) return { x, viewport: vp }
    firstDefined ??= { x, y }
  }
  if (!firstDefined) return null
  const dy = firstDefined.y - (vp.yMin + vp.yMax) / 2
  return {
    x: firstDefined.x,
    viewport: { xMin: vp.xMin, xMax: vp.xMax, yMin: vp.yMin + dy, yMax: vp.yMax + dy },
  }
}
