import { describe, expect, it } from "vitest"
import { defaultViewport } from "@/lib/viewport"
import { FALLBACK_COLORS, readGraphColors, resolveGraphColors } from "./colors"
import { CURVE_WIDTH, drawGraph, MARKER_RADIUS, TRACED_CURVE_WIDTH, type Ctx2D } from "./draw"
import { tooltipPosition } from "./tooltip"

describe("tooltipPosition", () => {
  const tip = { width: 100, height: 40 }
  const bounds = { width: 800, height: 600 }
  it("sits 12px up-right of the point", () => {
    expect(tooltipPosition({ x: 200, y: 200 }, tip, bounds)).toEqual({ left: 212, top: 148 })
  })
  it("flips left near the right edge and below near the top", () => {
    expect(tooltipPosition({ x: 750, y: 20 }, tip, bounds)).toEqual({ left: 638, top: 32 })
  })
  it("stays inside tiny bounds", () => {
    const pos = tooltipPosition({ x: 5, y: 5 }, tip, { width: 90, height: 30 })
    expect(pos.left).toBeGreaterThanOrEqual(0)
    expect(pos.top).toBeGreaterThanOrEqual(0)
  })
})

describe("graph colours", () => {
  it("uses CSS variables when present and falls back per theme", () => {
    const style = { getPropertyValue: (n: string) => (n === "--graph-bg" ? " #123456 " : "") }
    expect(resolveGraphColors(style, "dark")).toEqual({ ...FALLBACK_COLORS.dark, bg: "#123456" })
    expect(resolveGraphColors(null, "light")).toEqual(FALLBACK_COLORS.light)
  })
  it("matches UX-SPEC §8.2 fallbacks", () => {
    expect(FALLBACK_COLORS.light).toEqual({ bg: "#FFFFFF", grid: "#F0F0F0", gridMajor: "#E5E5E5", axis: "#525252" })
    expect(FALLBACK_COLORS.dark).toEqual({ bg: "#0A0A0A", grid: "#1A1A1A", gridMajor: "#262626", axis: "#A3A3A3" })
  })
  it("reads from an element without throwing", () => {
    const el = document.createElement("div")
    el.style.setProperty("--graph-axis", "red")
    document.body.appendChild(el)
    expect(readGraphColors(el, "light").axis).toBe("red")
    expect(readGraphColors(null, "dark")).toEqual(FALLBACK_COLORS.dark)
    el.remove()
  })
})

/** A recording fake of the 2D context. */
function fakeCtx() {
  const calls: { name: string; args: unknown[]; state: Record<string, unknown> }[] = []
  const state: Record<string, unknown> = {}
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      return (...args: unknown[]) => {
        calls.push({ name: prop, args, state: { ...target } })
      }
    },
    set(target, prop: string, value) {
      target[prop] = value
      return true
    },
  }) as unknown as Ctx2D
  return { ctx, calls }
}

describe("drawGraph", () => {
  const size = { width: 800, height: 600 }
  const vp = defaultViewport(size)
  const colors = FALLBACK_COLORS.light

  it("scales for the device pixel ratio and fills the background", () => {
    const { ctx, calls } = fakeCtx()
    drawGraph(ctx, { size, dpr: 2, viewport: vp, colors, curves: [] })
    expect(calls[0]).toMatchObject({ name: "setTransform", args: [2, 0, 0, 2, 0, 0] })
    expect(calls[1]).toMatchObject({ name: "fillRect", args: [0, 0, 800, 600] })
    expect(calls[1].state.fillStyle).toBe("#FFFFFF")
  })

  it("strokes curves with their colour and width, and breaks paths between segments", () => {
    const { ctx, calls } = fakeCtx()
    drawGraph(ctx, {
      size,
      dpr: 1,
      viewport: vp,
      colors,
      curves: [
        {
          color: "#0072B2",
          width: TRACED_CURVE_WIDTH,
          segments: [
            [
              { x: -1, y: 1e300 },
              { x: 0, y: 0 },
            ],
            [
              { x: 1, y: 0 },
              { x: 2, y: 1 },
            ],
          ],
        },
      ],
    })
    const strokes = calls.filter((c) => c.name === "stroke" && c.state.strokeStyle === "#0072B2")
    expect(strokes).toHaveLength(1)
    expect(strokes[0].state.lineWidth).toBe(3)
    const moves = calls.filter((c) => c.name === "moveTo" && c.state.strokeStyle === "#0072B2")
    expect(moves).toHaveLength(2)
    // Huge y is clamped to a finite screen coordinate.
    expect(moves[0].args.every((a) => Number.isFinite(a as number))).toBe(true)
    expect(CURVE_WIDTH).toBe(2.5)
  })

  it("draws tick labels and the trace marker", () => {
    const { ctx, calls } = fakeCtx()
    drawGraph(ctx, { size, dpr: 1, viewport: vp, colors, curves: [], marker: { x: 1, y: 1, color: "#D55E00" } })
    const texts = calls.filter((c) => c.name === "fillText").map((c) => c.args[0])
    expect(texts).toContain("0")
    expect(texts).toContain("2")
    const arcs = calls.filter((c) => c.name === "arc")
    expect(arcs).toHaveLength(2)
    expect(arcs[0].args[0]).toBeCloseTo(440)
    expect(arcs[0].args[1]).toBeCloseTo(260)
    expect(arcs[0].args[2]).toBe(MARKER_RADIUS + 2)
    expect(arcs[1].args[2]).toBe(MARKER_RADIUS)
  })

  it("skips the marker when undefined or off-screen", () => {
    const { ctx, calls } = fakeCtx()
    drawGraph(ctx, { size, dpr: 1, viewport: vp, colors, curves: [], marker: { x: 1, y: NaN, color: "#000" } })
    drawGraph(ctx, { size, dpr: 1, viewport: vp, colors, curves: [], marker: { x: 100, y: 0, color: "#000" } })
    expect(calls.some((c) => c.name === "arc")).toBe(false)
  })
})
