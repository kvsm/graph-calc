import { describe, expect, it } from "vitest"
import { graphAriaLabel, LABEL_MAX_LISTED, traceAnnouncement, truncate, viewAnnouncement } from "./label"

const vp = { xMin: -10, xMax: 10, yMin: -6.2, yMax: 6.2 }

describe("graphAriaLabel", () => {
  it("matches the UX-SPEC §9 example", () => {
    expect(graphAriaLabel(["y = sin(x)", "y = x^2"], vp)).toBe(
      "Graph of 2 expressions: y = sin(x), y = x^2. x from -10 to 10, y from -6.2 to 6.2.",
    )
  })

  it("uses the singular for one expression", () => {
    expect(graphAriaLabel(["y = x"], vp)).toMatch(/^Graph of 1 expression: y = x\./)
  })

  it("describes an empty graph", () => {
    expect(graphAriaLabel([], vp)).toBe("Graph with no expressions. x from -10 to 10, y from -6.2 to 6.2.")
  })

  it("caps the list and formats ranges to 4 significant figures", () => {
    const labels = Array.from({ length: LABEL_MAX_LISTED + 2 }, (_, i) => `y = ${i}`)
    const text = graphAriaLabel(labels, { xMin: -3.14159, xMax: 1e7, yMin: -0.00001234, yMax: 2.5 })
    expect(text).toContain("and 2 more")
    expect(text).toContain("x from -3.142 to 1e7, y from -1.234e-5 to 2.5.")
  })
})

describe("truncate", () => {
  it("limits to 24 characters including the ellipsis", () => {
    const long = "y = sin(x) + cos(x) + tan(x)"
    const t = truncate(long)
    expect(Array.from(t)).toHaveLength(24)
    expect(t.endsWith("…")).toBe(true)
    expect(truncate("y = sin(x)")).toBe("y = sin(x)")
    expect(truncate("x".repeat(24))).toBe("x".repeat(24))
  })
})

describe("traceAnnouncement", () => {
  it("matches the §9 format", () => {
    expect(traceAnnouncement("y = sin(x)", Math.PI / 2, 1)).toBe("y = sin(x): x 1.571, y 1.")
  })
  it("prefixes the curve index on switch and says undefined for gaps", () => {
    expect(traceAnnouncement("y = 1/x", 0, NaN, { index: 1, count: 3 })).toBe(
      "Curve 2 of 3. y = 1/x: x 0, y undefined.",
    )
  })
  it("never says -0", () => {
    expect(traceAnnouncement("y = x", -0, -0)).toBe("y = x: x 0, y 0.")
  })
})

describe("viewAnnouncement", () => {
  it("covers zoom, reset and pan", () => {
    expect(viewAnnouncement("zoomIn", { xMin: -5, xMax: 5, yMin: -3, yMax: 3 })).toBe("Zoomed in. x from -5 to 5.")
    expect(viewAnnouncement("zoomOut", { xMin: -20, xMax: 20, yMin: -3, yMax: 3 })).toBe(
      "Zoomed out. x from -20 to 20.",
    )
    expect(viewAnnouncement("reset", vp)).toBe("View reset.")
    expect(viewAnnouncement("left", vp)).toBe("Moved left. x from -10 to 10, y from -6.2 to 6.2.")
  })
})
