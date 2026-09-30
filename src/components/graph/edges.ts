/**
 * Extend sampled segments to the exact edge of the function's domain (UX-18).
 *
 * The sampler stops a segment at the last sample it found defined, so a curve
 * that diverges at a domain edge (e.g. ln(x) as x -> 0+) appears to end at a
 * finite y instead of running off the canvas. For each segment end that borders
 * a gap, bisect towards the gap to find the last defined x (to double precision)
 * and append that point. Curves that end at a finite value (sqrt(x) at 0) just
 * gain an accurate end point; diverging ones run off-screen (drawing clamps y).
 */
import type { Point, Segment } from "@/lib/math"
import { safeEval } from "./trace"

/** Bisection iterations: enough to reach double precision. */
const ITERATIONS = 80
/** Only the first N segments are refined, to bound the cost on pathological curves. */
const MAX_SEGMENTS = 200

/**
 * Look outward from `inside` (direction `dir`) for an undefined x, doubling the
 * distance from `d0` up to `maxDistance`; then bisect back to the last defined x.
 */
function edgePoint(
  f: (x: number) => number,
  inside: Point,
  dir: 1 | -1,
  d0: number,
  maxDistance: number,
): Point | null {
  let towards: number | null = null
  for (let d = Math.max(d0, maxDistance * 1e-9); d <= maxDistance * 2; d *= 2) {
    const x = inside.x + dir * d
    if (Number.isNaN(safeEval(f, x))) {
      towards = x
      break
    }
  }
  if (towards === null) return null // not a domain edge (a jump, or the end of the view)
  let lo = inside.x
  let hi = towards
  let ylo = inside.y
  for (let i = 0; i < ITERATIONS; i++) {
    const mid = lo + (hi - lo) / 2
    if (mid === lo || mid === hi) break
    const y = safeEval(f, mid)
    if (Number.isNaN(y)) hi = mid
    else {
      lo = mid
      ylo = y
    }
  }
  return lo === inside.x ? null : { x: lo, y: ylo }
}

/**
 * `sampleSpacing` is the sampler's initial x spacing (view span / pixel width): a
 * domain edge next to a segment end is always within about one spacing of it.
 */
export function extendToDomainEdges(
  f: (x: number) => number,
  segments: Segment[],
  sampleSpacing: number,
): Segment[] {
  if (!(sampleSpacing > 0) || !Number.isFinite(sampleSpacing)) return segments
  return segments.map((seg, i) => {
    if (i >= MAX_SEGMENTS || seg.length < 2) return seg
    const first = seg[0]
    const last = seg[seg.length - 1]
    const d0 = Math.min(Math.abs(seg[1].x - first.x), Math.abs(last.x - seg[seg.length - 2].x)) || sampleSpacing
    const start = edgePoint(f, first, -1, d0, sampleSpacing)
    const end = edgePoint(f, last, 1, d0, sampleSpacing)
    if (!start && !end) return seg
    return [...(start ? [start] : []), ...seg, ...(end ? [end] : [])]
  })
}
