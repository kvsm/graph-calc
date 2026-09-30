import { describe, expect, it } from 'vitest'
import { parseExpression } from './parseExpression'
import { sampleFunction, type SampleOptions, type Segment } from './sample'

const view: SampleOptions = { xMin: -10, xMax: 10, yMin: -10, yMax: 10, pixelWidth: 800, pixelHeight: 800 }

function fn(src: string): (x: number) => number {
  const r = parseExpression(src)
  if (!r.ok) throw new Error(r.error.message)
  return (x) => r.expression.evaluate(x)
}

function sample(src: string, opts: Partial<SampleOptions> = {}): Segment[] {
  return sampleFunction(fn(src), { ...view, ...opts })
}

const allPoints = (segs: Segment[]) => segs.flat()

function expectSortedAndFinite(segs: Segment[]) {
  for (const seg of segs) {
    expect(seg.length).toBeGreaterThanOrEqual(2)
    for (let i = 0; i < seg.length; i++) {
      expect(Number.isFinite(seg[i].x)).toBe(true)
      expect(Number.isFinite(seg[i].y)).toBe(true)
      if (i > 0) expect(seg[i].x).toBeGreaterThan(seg[i - 1].x)
    }
  }
}

/** No consecutive pair within a segment crosses x = c. */
function expectNoCrossing(segs: Segment[], c: number) {
  for (const seg of segs) {
    for (let i = 1; i < seg.length; i++) {
      const crosses = seg[i - 1].x < c && seg[i].x > c
      expect(crosses, `segment crosses x=${c} between ${seg[i - 1].x} and ${seg[i].x}`).toBe(false)
    }
  }
}

describe('sampleFunction', () => {
  it('samples a smooth function as one segment spanning the range', () => {
    const segs = sample('x^2')
    expect(segs).toHaveLength(1)
    expectSortedAndFinite(segs)
    expect(segs[0][0]).toEqual({ x: -10, y: 100 })
    expect(segs[0].at(-1)).toEqual({ x: 10, y: 100 })
  })

  it('uses at least one sample per pixel', () => {
    const pts = allPoints(sample('x', { pixelWidth: 400 }))
    expect(pts.length).toBeGreaterThanOrEqual(401)
  })

  it('points lie on the curve', () => {
    const f = fn('sin(x)')
    for (const p of allPoints(sample('sin(x)'))) expect(p.y).toBeCloseTo(f(p.x), 12)
  })

  it('refines where curvature is high', () => {
    const coarse = allPoints(sample('x', { pixelWidth: 100 })).length
    const curvy = allPoints(sample('sin(10x)', { pixelWidth: 100 })).length
    expect(curvy).toBeGreaterThan(coarse)
  })

  it('splits tan(x) at every asymptote', () => {
    const segs = sample('tan(x)', { xMin: -5, xMax: 5 })
    // Asymptotes at ±π/2 and ±3π/2 inside [-5, 5] → 5 branches.
    expect(segs).toHaveLength(5)
    expectSortedAndFinite(segs)
    for (const c of [-1.5, -0.5, 0.5, 1.5].map((k) => k * Math.PI)) expectNoCrossing(segs, c)
    // Branches reach off-screen near each asymptote (no truncated curves).
    for (let i = 0; i < segs.length - 1; i++) {
      expect(segs[i].at(-1)!.y).toBeGreaterThan(view.yMax)
      expect(segs[i + 1][0].y).toBeLessThan(view.yMin)
    }
  })

  it('splits 1/x at x = 0 whether or not a sample lands on 0', () => {
    for (const xMin of [-10, -10.37]) {
      const segs = sample('1/x', { xMin })
      expect(segs).toHaveLength(2)
      expectNoCrossing(segs, 0)
      expect(segs[0].every((p) => p.x < 0)).toBe(true)
      expect(segs[1].every((p) => p.x > 0)).toBe(true)
    }
  })

  it('never draws a visible line across the pole of 1/x^2', () => {
    const segs = sample('1/x^2', { xMin: -10.37 })
    for (const seg of segs) {
      for (let i = 1; i < seg.length; i++) {
        const [a, b] = [seg[i - 1], seg[i]]
        if (a.x < 0 && b.x > 0) {
          // Any connection across the pole must be entirely above the viewport.
          expect(Math.min(a.y, b.y)).toBeGreaterThan(view.yMax)
        }
      }
    }
  })

  it('finds the domain edge of sqrt(x) precisely', () => {
    const segs = sample('sqrt(x)')
    expect(segs).toHaveLength(1)
    const first = segs[0][0]
    expect(first.x).toBeGreaterThanOrEqual(0)
    expect(first.x).toBeLessThan(20 / 800 / 2 ** 9)
    expect(segs[0].at(-1)!.x).toBe(10)
  })

  it('finds both domain edges of sqrt(1 - x^2)', () => {
    const segs = sample('sqrt(1 - x^2)')
    expect(segs).toHaveLength(1)
    expect(segs[0][0].x).toBeCloseTo(-1, 3)
    expect(segs[0].at(-1)!.x).toBeCloseTo(1, 3)
  })

  it('splits ln(x) and log(x) domains', () => {
    for (const src of ['ln(x)', 'log(x)', 'ln(-x)']) {
      expect(sample(src)).toHaveLength(1)
    }
    expect(sample('ln(abs(x))')).toHaveLength(2)
  })

  it('splits step functions at each jump without vertical lines', () => {
    const segs = sample('floor(x)', { xMin: -3.5, xMax: 3.5 })
    // Jumps at -3..3 → 8 flat pieces.
    expect(segs).toHaveLength(8)
    for (const seg of segs) {
      const ys = new Set(seg.map((p) => p.y))
      expect(ys.size).toBe(1)
    }
  })

  it('returns no segments when the function is undefined everywhere', () => {
    expect(sample('sqrt(-1 - x^2)')).toEqual([])
    expect(sample('ln(-abs(x) - 1)')).toEqual([])
  })

  it('finds small islands of definition inside gaps', () => {
    // Defined only on [-0.05, 0.05]: narrower than one initial interval at this width.
    const segs = sample('sqrt(0.0025 - x^2)', { pixelWidth: 100 })
    expect(segs.length).toBeGreaterThanOrEqual(1)
  })

  it('handles evaluators that throw', () => {
    const segs = sampleFunction((x) => {
      if (x > 0) throw new Error('boom')
      return x
    }, view)
    expect(segs).toHaveLength(1)
    expect(segs[0].every((p) => p.x <= 0)).toBe(true)
  })

  it('respects the evaluation budget on pathological curves', () => {
    let calls = 0
    const f = fn('sin(1/x)')
    sampleFunction(
      (x) => {
        calls++
        return f(x)
      },
      { ...view, xMin: -1, xMax: 1, pixelWidth: 500, maxEvaluations: 5000 },
    )
    // Budget plus at most one in-flight evaluation per initial sample.
    expect(calls).toBeLessThanOrEqual(5000 + 501)
  })

  it('returns [] for degenerate options', () => {
    const f = (x: number) => x
    expect(sampleFunction(f, { ...view, xMin: 1, xMax: 1 })).toEqual([])
    expect(sampleFunction(f, { ...view, xMin: 2, xMax: 1 })).toEqual([])
    expect(sampleFunction(f, { ...view, yMin: 1, yMax: 1 })).toEqual([])
    expect(sampleFunction(f, { ...view, pixelWidth: 0 })).toEqual([])
    expect(sampleFunction(f, { ...view, xMin: NaN })).toEqual([])
  })

  it('is fast enough for interactive use', () => {
    const exprs = ['sin(x)', 'tan(x)', '1/x', 'sqrt(x)', 'x^3 - 2x', 'ln(x)', 'floor(x)', 'abs(x)', 'exp(x)', 'cos(3x)'].map(fn)
    const t0 = performance.now()
    for (const f of exprs) sampleFunction(f, { ...view, pixelWidth: 1200, pixelHeight: 800 })
    // Generous bound for slow CI machines; typical is a few ms.
    expect(performance.now() - t0).toBeLessThan(250)
  })
})
