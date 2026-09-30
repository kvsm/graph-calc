/**
 * Adaptive sampling of y = f(x) into polyline segments suitable for drawing.
 *
 * The x-range is first sampled uniformly (about one sample per pixel), then each
 * interval is recursively bisected where the curve bends by more than half a
 * pixel, where it enters or leaves its domain, or where it may be discontinuous.
 * Segments are split at gaps (NaN), domain edges and jumps/asymptotes so the
 * renderer never draws vertical connecting lines across a discontinuity.
 */

export interface Point {
  x: number
  y: number
}

/** A connected run of points to be drawn as one polyline. */
export type Segment = Point[]

export interface SampleOptions {
  xMin: number
  xMax: number
  /** Visible y-range, used to decide how finely to refine. */
  yMin: number
  yMax: number
  /** Width of the plot area in (CSS) pixels. */
  pixelWidth: number
  /** Height of the plot area in pixels. Defaults to pixelWidth. */
  pixelHeight?: number
  /** Initial uniform samples per pixel. Default 1. */
  samplesPerPixel?: number
  /** Maximum bisection depth per initial interval. Default 10. */
  maxDepth?: number
  /** Hard cap on function evaluations (keeps pathological curves fast). Default 16 per initial sample. */
  maxEvaluations?: number
}

export function sampleFunction(f: (x: number) => number, options: SampleOptions): Segment[] {
  const { xMin, xMax, yMin, yMax, pixelWidth } = options
  const pixelHeight = options.pixelHeight ?? pixelWidth
  if (
    !(xMax > xMin) ||
    !(yMax > yMin) ||
    !(pixelWidth > 0) ||
    !(pixelHeight > 0) ||
    !Number.isFinite(xMax - xMin) ||
    !Number.isFinite(yMax - yMin)
  ) {
    return []
  }

  const n = Math.max(1, Math.ceil(pixelWidth * (options.samplesPerPixel ?? 1)))
  const maxDepth = options.maxDepth ?? 10
  const maxEvaluations = options.maxEvaluations ?? n * 16
  const dx = (xMax - xMin) / n
  const yRange = yMax - yMin
  const yPixel = yRange / pixelHeight
  /** Max allowed deviation of the midpoint from the chord before we refine. */
  const tolerance = yPixel * 0.5
  /** At the finest level, a jump bigger than this is treated as a discontinuity. */
  const leafJump = yPixel * 2

  let evaluations = 0
  const evalAt = (x: number): number => {
    evaluations++
    let y: number
    try {
      y = f(x)
    } catch {
      return NaN
    }
    return Number.isFinite(y) ? y : NaN
  }

  const segments: Segment[] = []
  let current: Segment = []
  const flush = () => {
    if (current.length >= 2) segments.push(current)
    current = []
  }
  const push = (x: number, y: number) => {
    current.push({ x, y })
  }

  const bothOffSameSide = (a: number, b: number, c: number) =>
    (a > yMax && b > yMax && c > yMax) || (a < yMin && b < yMin && c < yMin)

  /**
   * Process the interval (a, b]. Invariant: if fa is finite, the last point of
   * `current` is (a, fa). On return, the same holds for (b, fb).
   */
  const refine = (a: number, fa: number, b: number, fb: number, depth: number): void => {
    const aGap = Number.isNaN(fa)
    const bGap = Number.isNaN(fb)
    const canRefine = depth < maxDepth && evaluations < maxEvaluations

    if (aGap && bGap) {
      // Probe once for a small island of defined values inside a gap.
      if (depth === 0 && evaluations < maxEvaluations) {
        const m = (a + b) / 2
        const fm = evalAt(m)
        if (!Number.isNaN(fm)) {
          refine(a, fa, m, fm, depth + 1)
          refine(m, fm, b, fb, depth + 1)
        }
      }
      return
    }

    if (aGap || bGap) {
      // Entering or leaving the domain: bisect to locate the edge precisely.
      if (canRefine) {
        const m = (a + b) / 2
        const fm = evalAt(m)
        refine(a, fa, m, fm, depth + 1)
        refine(m, fm, b, fb, depth + 1)
        return
      }
      flush()
      if (aGap) push(b, fb)
      return
    }

    const m = (a + b) / 2
    if (canRefine) {
      const fm = evalAt(m)
      if (Number.isNaN(fm)) {
        refine(a, fa, m, fm, depth + 1)
        refine(m, fm, b, fb, depth + 1)
        return
      }
      if (!bothOffSameSide(fa, fb, fm) && Math.abs(fm - (fa + fb) / 2) > tolerance) {
        refine(a, fa, m, fm, depth + 1)
        refine(m, fm, b, fb, depth + 1)
        return
      }
      push(m, fm)
      push(b, fb)
      return
    }

    // Finest level (or out of budget): decide whether to connect or break.
    let isBreak: boolean
    if (depth >= maxDepth) {
      // Still bending sharply at the finest scale: a jump, or a pole where both
      // sides head the same way (e.g. 1/x^2), shows up as a large jump or bulge.
      const fm = evaluations < maxEvaluations ? evalAt(m) : (fa + fb) / 2
      isBreak =
        Number.isNaN(fm) ||
        (Math.abs(fb - fa) > leafJump && !bothOffSameSide(fa, fb, fm)) ||
        (Math.abs(fm - (fa + fb) / 2) > yRange && !bothOffSameSide(fa, fb, fm))
    } else {
      // Out of budget: only break on jumps spanning most of the screen.
      isBreak = Math.abs(fb - fa) > yRange
    }
    if (isBreak) flush()
    push(b, fb)
  }

  let a = xMin
  let fa = evalAt(a)
  if (!Number.isNaN(fa)) push(a, fa)
  for (let i = 1; i <= n; i++) {
    const b = i === n ? xMax : xMin + i * dx
    const fb = evalAt(b)
    refine(a, fa, b, fb, 0)
    a = b
    fa = fb
  }
  flush()
  return segments
}
