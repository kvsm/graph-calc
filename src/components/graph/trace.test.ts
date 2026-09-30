import { describe, expect, it } from "vitest"
import { defaultViewport, toScreenX, toScreenY } from "@/lib/viewport"
import {
  cycleId,
  findDefinedX,
  keepInView,
  nearestCurvePoint,
  safeEval,
  stepTraceX,
  TRACE_HIT_RADIUS_PX,
  type CurveSamples,
} from "./trace"

const size = { width: 800, height: 600 }
const vp = defaultViewport(size) // 40 px per unit
const line = (id: string, y: number): CurveSamples => ({
  id,
  segments: [
    [
      { x: -10, y },
      { x: 10, y },
    ],
  ],
})

describe("nearestCurvePoint", () => {
  it("projects onto the polyline between samples", () => {
    const hit = nearestCurvePoint([line("a", 0)], vp, size, { x: 440, y: 290 })
    expect(hit).not.toBeNull()
    expect(hit!.id).toBe("a")
    expect(hit!.x).toBeCloseTo(1)
    expect(hit!.y).toBeCloseTo(0)
    expect(hit!.distance).toBeCloseTo(10)
  })

  it("returns null beyond the 24px radius", () => {
    expect(TRACE_HIT_RADIUS_PX).toBe(24)
    expect(nearestCurvePoint([line("a", 0)], vp, size, { x: 400, y: 300 - 25 })).toBeNull()
    expect(nearestCurvePoint([line("a", 0)], vp, size, { x: 400, y: 300 - 24 })).not.toBeNull()
  })

  it("picks the closest of several curves", () => {
    const curves = [line("a", 0), line("b", 1)] // b is at screen y 260
    const hit = nearestCurvePoint(curves, vp, size, { x: 400, y: 265 })
    expect(hit!.id).toBe("b")
    expect(hit!.y).toBeCloseTo(1)
  })

  it("handles single-point segments and empty input", () => {
    const dot: CurveSamples = { id: "d", segments: [[{ x: 0, y: 0 }], []] }
    expect(nearestCurvePoint([dot], vp, size, { x: 403, y: 304 })!.distance).toBeCloseTo(5)
    expect(nearestCurvePoint([], vp, size, { x: 0, y: 0 })).toBeNull()
  })

  it("ignores segments with non-finite screen coordinates", () => {
    const bad: CurveSamples = {
      id: "x",
      segments: [
        [
          { x: 0, y: NaN },
          { x: 1, y: NaN },
        ],
      ],
    }
    expect(nearestCurvePoint([bad], vp, size, { x: 400, y: 300 })).toBeNull()
  })

  it("works with steep curves (nearest on screen, not in x)", () => {
    const steep: CurveSamples = {
      id: "s",
      segments: [
        [
          { x: 0, y: -100 },
          { x: 0.001, y: 100 },
        ],
      ],
    }
    const hit = nearestCurvePoint([steep], vp, size, { x: 410, y: toScreenY(vp, size, 2) })
    expect(hit).not.toBeNull()
    expect(hit!.distance).toBeLessThan(11)
    expect(toScreenX(vp, size, hit!.x)).toBeCloseTo(400, 0)
  })
})

describe("safeEval / findDefinedX", () => {
  it("turns throws and non-finite values into NaN", () => {
    expect(safeEval(() => 1 / 0, 0)).toBeNaN()
    expect(
      safeEval(() => {
        throw new Error("x")
      }, 0),
    ).toBeNaN()
    expect(safeEval((x) => x * 2, 3)).toBe(6)
  })

  it("returns x0 when defined there", () => {
    expect(findDefinedX(Math.sqrt, 4, 0.1, 10)).toBe(4)
  })

  it("searches outward for a defined value", () => {
    expect(findDefinedX((x) => Math.sqrt(x), -0.25, 0.1, 10)).toBeCloseTo(0.05)
    expect(findDefinedX((x) => (x === 0 ? NaN : 1 / x), 0, 0.5, 5)).toBe(0.5)
  })

  it("gives up and returns x0", () => {
    expect(findDefinedX(() => NaN, 2, 1, 5)).toBe(2)
    expect(findDefinedX(() => NaN, 2, 0, 5)).toBe(2)
  })
})

describe("stepTraceX", () => {
  it("moves by pixels worth of x", () => {
    expect(stepTraceX(0, vp, size, 1)).toBeCloseTo(0.025)
    expect(stepTraceX(0, vp, size, -10)).toBeCloseTo(-0.25)
  })
})

describe("cycleId", () => {
  it("wraps in both directions", () => {
    expect(cycleId(["a", "b", "c"], "c", 1)).toBe("a")
    expect(cycleId(["a", "b", "c"], "a", -1)).toBe("c")
    expect(cycleId(["a", "b", "c"], "a", 1)).toBe("b")
  })
  it("falls back to the first id", () => {
    expect(cycleId(["a", "b"], "zzz", 1)).toBe("a")
    expect(cycleId(["a", "b"], null, -1)).toBe("a")
    expect(cycleId([], "a", 1)).toBeNull()
  })
})

describe("keepInView", () => {
  it("returns the same viewport when the point is comfortably inside", () => {
    expect(keepInView(vp, { x: 0, y: 0 })).toBe(vp)
  })
  it("pans horizontally and vertically, keeping the scale", () => {
    const next = keepInView(vp, { x: 20, y: -30 })
    expect(next.xMax - next.xMin).toBeCloseTo(20)
    expect(next.xMax).toBeCloseTo(20 + 1)
    expect(next.yMin).toBeCloseTo(-30 - 0.75)
  })
  it("ignores non-finite y (undefined trace point)", () => {
    const next = keepInView(vp, { x: -20, y: NaN })
    expect(next.yMin).toBe(vp.yMin)
    expect(next.xMin).toBeCloseTo(-21)
  })
})
