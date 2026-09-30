import { describe, expect, it } from "vitest"
import { sampleFunction } from "@/lib/math"
import { extendToDomainEdges } from "./edges"

const opts = { xMin: -10, xMax: 10, yMin: -7.5, yMax: 7.5, pixelWidth: 800, pixelHeight: 600 }
const spacing = 20 / 800
const safe = (g: (x: number) => number) => (x: number) => {
  const y = g(x)
  return Number.isFinite(y) ? y : NaN
}

describe("extendToDomainEdges (UX-18)", () => {
  it("runs ln(x) off the bottom of the view as x -> 0+", () => {
    const f = safe(Math.log)
    const segs = extendToDomainEdges(f, sampleFunction(f, opts), spacing)
    const first = segs[0][0]
    expect(first.x).toBeGreaterThan(0)
    expect(first.x).toBeLessThan(1e-12)
    expect(first.y).toBeLessThan(-27) // well below yMin = -7.5
  })

  it("gives sqrt(x) an accurate end at (0, ~0) rather than extending it", () => {
    const f = safe(Math.sqrt)
    const segs = extendToDomainEdges(f, sampleFunction(f, opts), spacing)
    const first = segs[0][0]
    expect(first.x).toBeGreaterThanOrEqual(0)
    expect(first.x).toBeLessThan(1e-12)
    expect(first.y).toBeLessThan(1e-5)
    expect(first.y).toBeGreaterThanOrEqual(0)
  })

  it("extends both ends of a bounded domain (sqrt(4 - x^2))", () => {
    const f = safe((x) => Math.sqrt(4 - x * x))
    const segs = extendToDomainEdges(f, sampleFunction(f, opts), spacing)
    expect(segs).toHaveLength(1)
    expect(segs[0][0].x).toBeCloseTo(-2, 9)
    expect(segs[0].at(-1)!.x).toBeCloseTo(2, 9)
  })

  it("leaves jumps and view edges alone", () => {
    const tan = safe(Math.tan)
    const sampled = sampleFunction(tan, opts)
    const out = extendToDomainEdges(tan, sampled, spacing)
    expect(out.map((s) => s.length)).toEqual(sampled.map((s) => s.length))
    const line = safe((x) => x)
    const ls = sampleFunction(line, opts)
    expect(extendToDomainEdges(line, ls, spacing)[0]).toBe(ls[0])
  })

  it("ignores a bad spacing", () => {
    const segs = [[{ x: 0, y: 0 }, { x: 1, y: 1 }]]
    expect(extendToDomainEdges(Math.log, segs, 0)).toBe(segs)
    expect(extendToDomainEdges(Math.log, segs, NaN)).toBe(segs)
  })
})
