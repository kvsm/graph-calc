import { describe, expect, it } from "vitest"
import { defaultViewport, spanX, spanY, type Viewport } from "@/lib/viewport"
import {
  clampScreenY,
  computeGridLayout,
  defaultViewportInset,
  EDGE_CLIP,
  EDGE_PAD,
  effectiveViewport,
  EMPTY_HINT_SIZE,
  emptyHintPosition,
  LABEL_HEIGHT,
  shiftBy,
  usableSize,
  visibleRect,
} from "./layout"

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
    expect(l.labels.map((t) => t.text)).toEqual(expect.arrayContaining(["-8", "-2", "2", "8", "-6", "6"]))
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
    expect(l.labels.some((t) => t.text === "102")).toBe(true)
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

describe("edge clipping of tick labels (UX-09)", () => {
  const measure = (t: string) => t.length * 7

  it("skips labels whose box would cross the canvas edge", () => {
    const l = computeGridLayout(defaultViewport(size), size, measure)
    // -10 and 10 sit exactly on the left/right edges.
    expect(l.labels.some((t) => t.text === "-10")).toBe(false)
    expect(l.labels.some((t) => t.text === "10")).toBe(false)
    for (const t of l.labels) {
      const w = measure(t.text)
      const left = t.align === "center" ? t.x - w / 2 : t.align === "right" ? t.x - w : t.x
      expect(left).toBeGreaterThanOrEqual(EDGE_CLIP)
      expect(left + w).toBeLessThanOrEqual(size.width - EDGE_CLIP)
      if (t.baseline === "middle") {
        expect(t.y - LABEL_HEIGHT / 2).toBeGreaterThanOrEqual(EDGE_CLIP)
        expect(t.y + LABEL_HEIGHT / 2).toBeLessThanOrEqual(size.height - EDGE_CLIP)
      }
    }
  })

  it("keeps long labels inside at span 10000 and near the top edge", () => {
    const l = computeGridLayout({ xMin: -5000, xMax: 5000, yMin: -3750, yMax: 3750 }, size, measure)
    expect(l.labels.some((t) => t.text === "-5000")).toBe(false)
    expect(l.labels.some((t) => t.text === "-4000")).toBe(true)
    const top = computeGridLayout({ xMin: -10, xMax: 10, yMin: -7.5, yMax: 6 }, size, measure)
    expect(top.labels.some((t) => t.text === "6" && t.baseline === "middle")).toBe(false)
  })

  it("uses the supplied measure function", () => {
    const wide = computeGridLayout(defaultViewport(size), size, () => 900)
    expect(wide.labels.filter((t) => t.text !== "0")).toHaveLength(0)
  })
})

describe("origin label (UX-10)", () => {
  it("is a single 0 below-left of the origin, clear of both axes", () => {
    const l = computeGridLayout(defaultViewport(size), size)
    const zeros = l.labels.filter((t) => t.text === "0")
    expect(zeros).toHaveLength(1)
    const [z] = zeros
    expect(z.align).toBe("right")
    expect(z.baseline).toBe("top")
    expect(z.x).toBeCloseTo(l.yAxis! - 4)
    expect(z.y).toBeCloseTo(l.xAxis! + 4)
  })

  it("moves right of the y-axis when the axis is near the left edge", () => {
    const vp = { xMin: -0.2, xMax: 19.8, yMin: -7.5, yMax: 7.5 }
    const l = computeGridLayout(vp, size)
    const z = l.labels.find((t) => t.text === "0")!
    expect(z.align).toBe("left")
    expect(z.x).toBeGreaterThan(l.yAxis!)
  })
})

describe("bottom inset (UX-04)", () => {
  const phone = { width: 375, height: 700 }

  it("usableSize subtracts the inset, never below 1px", () => {
    expect(usableSize(phone, 300)).toEqual({ width: 375, height: 400 })
    expect(usableSize(phone, 0)).toEqual(phone)
    expect(usableSize(phone, 5000).height).toBe(1)
    expect(usableSize(phone, NaN)).toEqual(phone)
    expect(usableSize(phone, -10)).toEqual(phone)
  })

  it("defaultViewportInset frames x in [-10, 10] at 1:1 with the origin centred in the uncovered area", () => {
    const vp = defaultViewportInset(phone, 300)
    expect(vp.xMin).toBe(-10)
    expect(vp.xMax).toBe(10)
    const upp = 20 / 375
    expect(vp.yMax).toBeCloseTo(200 * upp)
    expect(vp.yMin).toBeCloseTo(-500 * upp)
    // 1:1 over the full canvas.
    expect(spanY(vp) / spanX(vp)).toBeCloseTo(700 / 375)
    expect(defaultViewportInset(phone, 0)).toEqual(defaultViewport(phone))
  })

  it("effectiveViewport(null) uses the inset default", () => {
    expect(effectiveViewport(null, phone, 300)).toEqual(defaultViewportInset(phone, 300))
  })

  it("visibleRect drops the covered strip, and shiftBy applies its translation to the viewport", () => {
    const vp = defaultViewportInset(phone, 300)
    const rect = visibleRect(vp, phone, 300)
    expect(rect.yMax).toBe(vp.yMax)
    expect(rect.yMin).toBeCloseTo(-200 * (20 / 375))
    expect(visibleRect(vp, phone, 0)).toBe(vp)
    const moved = { ...rect, xMin: rect.xMin + 1, xMax: rect.xMax + 1, yMin: rect.yMin - 2, yMax: rect.yMax - 2 }
    const out = shiftBy(vp, rect, moved)
    expect(out.xMin).toBeCloseTo(vp.xMin + 1)
    expect(out.yMin).toBeCloseTo(vp.yMin - 2)
    expect(shiftBy(vp, rect, rect)).toBe(vp)
  })
})

describe("emptyHintPosition (UX-01)", () => {
  const box = (p: { x: number; y: number }) => ({
    left: p.x - EMPTY_HINT_SIZE.width / 2,
    right: p.x + EMPTY_HINT_SIZE.width / 2,
    top: p.y - EMPTY_HINT_SIZE.height / 2,
    bottom: p.y + EMPTY_HINT_SIZE.height / 2,
  })

  it("avoids both axes on a desktop-size default view", () => {
    const s = { width: 1056, height: 800 }
    const l = computeGridLayout(defaultViewport(s), s)
    const b = box(emptyHintPosition(defaultViewport(s), s))
    expect(b.bottom).toBeLessThan(l.xAxis!)
    expect(b.left > l.yAxis! || b.right < l.yAxis! - 40).toBe(true)
    expect(b.left).toBeGreaterThanOrEqual(0)
    expect(b.right).toBeLessThanOrEqual(s.width)
  })

  it("stays above the x-axis and inside the uncovered area on a phone with a sheet", () => {
    const s = { width: 375, height: 700 }
    const vp = defaultViewportInset(s, 300)
    const p = emptyHintPosition(vp, s, 300)
    const b = box(p)
    const l = computeGridLayout(vp, s)
    expect(b.bottom).toBeLessThan(l.xAxis!)
    expect(b.top).toBeGreaterThanOrEqual(0)
    expect(b.bottom).toBeLessThanOrEqual(400)
  })

  it("goes below the axis when that region is larger", () => {
    const s = { width: 800, height: 600 }
    const vp = { xMin: -10, xMax: 10, yMin: -13, yMax: 2 } // x-axis 80px from the top
    const l = computeGridLayout(vp, s)
    const b = box(emptyHintPosition(vp, s))
    expect(b.top).toBeGreaterThan(l.xAxis! + LABEL_HEIGHT)
  })
})
