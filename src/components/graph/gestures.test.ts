import { describe, expect, it } from "vitest"
import { defaultViewport, screenToWorld, spanX } from "@/lib/viewport"
import { exceedsSlop, isDoubleTap, pinchViewport, wheelDeltaPixels } from "./gestures"

const size = { width: 800, height: 600 }
const vp = defaultViewport(size)

describe("pinchViewport", () => {
  it("keeps the world point under the midpoint fixed while spreading fingers", () => {
    const prev = [
      { x: 300, y: 300 },
      { x: 500, y: 300 },
    ] as const
    const next = [
      { x: 200, y: 300 },
      { x: 600, y: 300 },
    ] as const
    const out = pinchViewport(vp, size, prev, next)
    expect(spanX(out)).toBeCloseTo(10)
    const before = screenToWorld(vp, size, { x: 400, y: 300 })
    const after = screenToWorld(out, size, { x: 400, y: 300 })
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it("pans with the midpoint when distance is unchanged", () => {
    const prev = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ] as const
    const next = [
      { x: 140, y: 100 },
      { x: 240, y: 100 },
    ] as const
    const out = pinchViewport(vp, size, prev, next)
    expect(spanX(out)).toBeCloseTo(20)
    expect(out.xMin).toBeCloseTo(vp.xMin - 1) // 40px = 1 unit
  })

  it("moves the grabbed point to the new midpoint when panning and zooming together", () => {
    const prev = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
    ] as const
    const next = [
      { x: 400, y: 400 },
      { x: 500, y: 400 },
    ] as const
    const grabbed = screenToWorld(vp, size, { x: 200, y: 100 })
    const out = pinchViewport(vp, size, prev, next)
    const now = screenToWorld(out, size, { x: 450, y: 400 })
    expect(now.x).toBeCloseTo(grabbed.x)
    expect(now.y).toBeCloseTo(grabbed.y)
    expect(spanX(out)).toBeCloseTo(40)
  })

  it("does not produce NaN when fingers coincide", () => {
    const p = { x: 100, y: 100 }
    const out = pinchViewport(vp, size, [p, p], [p, { x: 150, y: 100 }])
    expect(Object.values(out).every(Number.isFinite)).toBe(true)
  })
})

describe("exceedsSlop", () => {
  it("uses an 8px threshold", () => {
    expect(exceedsSlop({ x: 0, y: 0 }, { x: 8, y: 0 })).toBe(false)
    expect(exceedsSlop({ x: 0, y: 0 }, { x: 6, y: 6 })).toBe(true)
  })
})

describe("isDoubleTap", () => {
  it("detects two nearby taps within 300ms", () => {
    expect(isDoubleTap({ time: 0, x: 0, y: 0 }, { time: 250, x: 10, y: 10 })).toBe(true)
  })
  it("rejects slow, distant or first taps", () => {
    expect(isDoubleTap(null, { time: 0, x: 0, y: 0 })).toBe(false)
    expect(isDoubleTap({ time: 0, x: 0, y: 0 }, { time: 400, x: 0, y: 0 })).toBe(false)
    expect(isDoubleTap({ time: 0, x: 0, y: 0 }, { time: 100, x: 50, y: 0 })).toBe(false)
  })
})

describe("wheelDeltaPixels", () => {
  it("normalises delta modes", () => {
    expect(wheelDeltaPixels(10, 0, 600)).toBe(10)
    expect(wheelDeltaPixels(3, 1, 600)).toBe(48)
    expect(wheelDeltaPixels(1, 2, 600)).toBe(600)
    expect(wheelDeltaPixels(NaN, 0, 600)).toBe(0)
  })
})
