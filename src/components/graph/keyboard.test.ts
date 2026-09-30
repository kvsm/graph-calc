import { describe, expect, it } from "vitest"
import { graphKeyAction, SHORTCUTS } from "./keyboard"

describe("graphKeyAction (not tracing)", () => {
  it("pans 10% with arrows and 50% with Shift", () => {
    expect(graphKeyAction({ key: "ArrowLeft" }, false)).toEqual({ type: "pan", fx: -0.1, fy: 0, direction: "left" })
    expect(graphKeyAction({ key: "ArrowRight" }, false)).toMatchObject({ fx: 0.1 })
    expect(graphKeyAction({ key: "ArrowUp" }, false)).toMatchObject({ fy: 0.1, direction: "up" })
    expect(graphKeyAction({ key: "ArrowDown", shiftKey: true }, false)).toMatchObject({ fy: -0.5 })
  })

  it("zooms with + = - _ and resets with 0", () => {
    expect(graphKeyAction({ key: "+" }, false)).toEqual({ type: "zoom", factor: 2 })
    expect(graphKeyAction({ key: "=" }, false)).toEqual({ type: "zoom", factor: 2 })
    expect(graphKeyAction({ key: "-" }, false)).toEqual({ type: "zoom", factor: 0.5 })
    expect(graphKeyAction({ key: "_", shiftKey: true }, false)).toEqual({ type: "zoom", factor: 0.5 })
    expect(graphKeyAction({ key: "0" }, false)).toEqual({ type: "reset" })
  })

  it("toggles trace with t/T and opens help with ?", () => {
    expect(graphKeyAction({ key: "t" }, false)).toEqual({ type: "toggleTrace" })
    expect(graphKeyAction({ key: "T", shiftKey: true }, false)).toEqual({ type: "toggleTrace" })
    expect(graphKeyAction({ key: "?", shiftKey: true }, false)).toEqual({ type: "help" })
  })

  it("ignores Tab, Escape, brackets and modified keys", () => {
    expect(graphKeyAction({ key: "Tab" }, false)).toBeNull()
    expect(graphKeyAction({ key: "Escape" }, false)).toBeNull()
    expect(graphKeyAction({ key: "]" }, false)).toBeNull()
    expect(graphKeyAction({ key: "+", ctrlKey: true }, false)).toBeNull()
    expect(graphKeyAction({ key: "0", metaKey: true }, false)).toBeNull()
    expect(graphKeyAction({ key: "ArrowLeft", altKey: true }, false)).toBeNull()
  })
})

describe("graphKeyAction (tracing)", () => {
  it("steps the trace point by grid steps with left/right (Shift: major steps)", () => {
    expect(graphKeyAction({ key: "ArrowLeft" }, true)).toEqual({ type: "traceStep", dir: -1, major: false })
    expect(graphKeyAction({ key: "ArrowRight", shiftKey: true }, true)).toEqual({ type: "traceStep", dir: 1, major: true })
  })

  it("switches curves with ] [ and up/down", () => {
    expect(graphKeyAction({ key: "]" }, true)).toEqual({ type: "traceCurve", dir: 1 })
    expect(graphKeyAction({ key: "ArrowUp" }, true)).toEqual({ type: "traceCurve", dir: 1 })
    expect(graphKeyAction({ key: "[" }, true)).toEqual({ type: "traceCurve", dir: -1 })
    expect(graphKeyAction({ key: "ArrowDown" }, true)).toEqual({ type: "traceCurve", dir: -1 })
  })

  it("exits with Escape or T, still zooms, and does not trap Tab", () => {
    expect(graphKeyAction({ key: "Escape" }, true)).toEqual({ type: "exitTrace" })
    expect(graphKeyAction({ key: "t" }, true)).toEqual({ type: "toggleTrace" })
    expect(graphKeyAction({ key: "+" }, true)).toEqual({ type: "zoom", factor: 2 })
    expect(graphKeyAction({ key: "Tab" }, true)).toBeNull()
  })
})

describe("SHORTCUTS", () => {
  it("lists every §5.2 key", () => {
    const keys = SHORTCUTS.flatMap((s) => s.keys)
    for (const k of ["←", "+", "−", "0", "T", "]", "[", "Escape", "Tab", "?"]) expect(keys).toContain(k)
  })

  it("never mentions pixels (UX-25)", () => {
    for (const s of SHORTCUTS) expect(s.action).not.toMatch(/\bpx\b|pixel/i)
    expect(SHORTCUTS.some((s) => s.action.includes("Shift: bigger steps"))).toBe(true)
  })
})
