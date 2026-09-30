import { describe, expect, it } from "vitest"
import { defaultViewport, spanX, spanY, type Viewport } from "@/lib/viewport"
import { clampScreenY, computeGridLayout, effectiveViewport, EDGE_PAD, LABEL_HEIGHT } from "./layout"

const size = { width: 800, height: 600 }

describe("computeGridLayout", () => {
  const vp = defaultViewport(size) // x in [-10, 10], y in [-7.5, 7.5]

  it("places both axes at the origin when visible", () => {
    const l = computeGridLayout(vp, size)
    expect(l.yAxis).toBeCloseTo(400)
    expect(l.xAxis).toBeCloseTo(300)
  })

  it("uses a 1/2/5 step with major lines ~80-120px apart", () => {
    const l = computeGridLayout(vp, size)
    expect(l.xTicks.step).toBe(2)
    const gaps = l.majorX.slice(1).map((x, i) => x - l.majorX[i])
    for (const g of gaps) expect(g).toBeCloseTo(80)
    expect(l.xTicks.minorStep).toBeCloseTo(0.4)
  })

  it("draws a single 0 label at the origin, not one per axis", () => {
    const l = computeGridLayout(vp, size)
    expect(l.labels.filter((t) => t.text === "0")).toHaveLength(1)
    expect(l.labels.map((t) => t.text)).toEqual(expect.arrayContaining(["-10", "-2", "2", "10", "-6", "6"]))
  })

  it("puts x labels below the axis and y labels left of it", () => {
    const l = computeGridLayout(vp, size)
    const x2 = l.labels.find((t) => t.text === "2" && t.align === "center")!
    expect(x2.y).toBeGreaterThan(300)
    expect(x2.baseline).toBe("top")
    const y2 = l.labels.find((t) => t.text === "2" && t.baseline === "middle")!
    expect(y2.x).toBeLessThan(400)
    expect(y2.align).toBe("right")
  })

  it("clamps x labels to the bottom edge when the x-axis is below the view", () => {
    const up: Viewport = { xMin: -10, xMax: 10, yMin: 100, yMax: 115 }
    const l = computeGridLayout(up, size)
    expect(l.xAxis).toBeNull()
    const xs = l.labels.filter((t) => t.align === "center")
    expect(xs.length).toBeGreaterThan(0)
    for (const t of xs) {
      expect(t.baseline).toBe("bottom")
      expect(t.y).toBe(size.height - EDGE_PAD)
    }
  })

  it("clamps x labels to the top edge when the x-axis is above the view", () => {
    const down: Viewport = { xMin: -10, xMax: 10, yMin: -115, yMax: -100 }
    const l = computeGridLayout(down, size)
    for (const t of l.labels.filter((t) => t.align === "center")) {
      expect(t.baseline).toBe("top")
      expect(t.y).toBe(EDGE_PAD)
    }
  })

  it("clamps y labels to the left edge when the y-axis is left of the view", () => {
    const right: Viewport = { xMin: 100, xMax: 120, yMin: -7.5, yMax: 7.5 }
    const l = computeGridLayout(right, size)
    expect(l.yAxis).toBeNull()
    for (const t of l.labels.filter((t) => t.baseline === "middle")) {
      expect(t.align).toBe("left")
      expect(t.x).toBeGreaterThanOrEqual(EDGE_PAD)
    }
    // Origin not visible: the x-axis "0" is not special-cased away; there is no 0 at x.
    expect(l.labels.some((t) => t.text === "100")).toBe(true)
  })

  it("clamps y labels to the right edge when the y-axis is right of the view", () => {
    const left: Viewport = { xMin: -120, xMax: -100, yMin: -7.5, yMax: 7.5 }
    const l = computeGridLayout(left, size)
    for (const t of l.labels.filter((t) => t.baseline === "middle")) {
      expect(t.align).toBe("right")
      expect(t.x).toBeLessThanOrEqual(size.width - EDGE_PAD)
    }
  })

  it("keeps labels inside the canvas vertically", () => {
    for (const yMin of [-1000, -8, -1, 0, 5, 1000]) {
      const l = computeGridLayout({ xMin: -10, xMax: 10, yMin, yMax: yMin + 15 }, size)
      for (const t of l.labels.filter((t) => t.align === "center")) {
        const top = t.baseline === "top" ? t.y : t.y - LABEL_HEIGHT
        expect(top).toBeGreaterThanOrEqual(0)
        expect(top + LABEL_HEIGHT).toBeLessThanOrEqual(size.height)
      }
    }
  })

  it("adapts labels from span 20 to 0.001 and 10000 with no float noise", () => {
    for (const span of [20, 0.001, 10000]) {
      const c = 0.3
      const l = computeGridLayout(
        { xMin: c - span / 2, xMax: c + span / 2, yMin: -span * 0.375, yMax: span * 0.375 },
        size,
      )
      expect(l.majorX.length).toBeGreaterThanOrEqual(5)
      expect(l.majorX.length).toBeLessThanOrEqual(12)
      for (const t of l.labels) expect(t.text).not.toMatch(/\d{8,}/)
    }
  })

  it("never labels -0", () => {
    const l = computeGridLayout({ xMin: -1e-9, xMax: 20, yMin: -7.5, yMax: 7.5 }, size)
    expect(l.labels.some((t) => t.text === "-0")).toBe(false)
  })
})

describe("effectiveViewport", () => {
  it("uses the default view for null", () => {
    expect(effectiveViewport(null, size)).toEqual(defaultViewport(size))
  })

  it("returns the same object when the aspect already matches", () => {
    const vp = defaultViewport(size)
    expect(effectiveViewport(vp, size)).toBe(vp)
  })

  it("corrects a mismatched aspect to 1:1 keeping the x-range", () => {
    const vp = { xMin: 0, xMax: 20, yMin: -1, yMax: 1 }
    const out = effectiveViewport(vp, size)
    expect(out.xMin).toBe(0)
    expect(out.xMax).toBe(20)
    expect(spanY(out) / spanX(out)).toBeCloseTo(size.height / size.width)
    expect((out.yMin + out.yMax) / 2).toBeCloseTo(0)
  })

  it("does not break before the canvas has a size", () => {
    const vp = { xMin: 0, xMax: 20, yMin: -1, yMax: 1 }
    expect(effectiveViewport(vp, { width: 0, height: 0 })).toBe(vp)
    const d = effectiveViewport(null, { width: 0, height: 0 })
    expect(Number.isFinite(d.yMax)).toBe(true)
  })
})

describe("clampScreenY", () => {
  it("passes normal values through and clamps huge ones", () => {
    expect(clampScreenY(123, 600)).toBe(123)
    expect(clampScreenY(1e300, 600)).toBe(600 + 7000)
    expect(clampScreenY(-1e300, 600)).toBe(-7000)
    expect(clampScreenY(-Infinity, 600)).toBe(-7000)
  })
})
