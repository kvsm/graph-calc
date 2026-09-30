import { afterEach, describe, expect, it, vi } from "vitest"
import { firstRunState, reducer } from "./model"
import { STORAGE_KEY, deserialize, loadState, saveState, serialize } from "./persistence"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("persistence", () => {
  it("round-trips state", () => {
    let s = firstRunState("light")
    s = reducer(s, { type: "setParameter", name: "a", patch: { value: 2.5, min: -5 } })
    s = reducer(s, { type: "setViewport", viewport: { xMin: -1, xMax: 1, yMin: -2, yMax: 2 } })
    s = reducer(s, { type: "setTheme", theme: "dark", explicit: true })
    s = reducer(s, { type: "setPanelCollapsed", collapsed: true })
    s = reducer(s, { type: "setVisible", id: s.expressions[0].id, visible: false })
    expect(deserialize(serialize(s), "light")).toEqual(s)
  })

  it("stores the theme only when chosen explicitly", () => {
    const s = firstRunState("dark")
    const restored = deserialize(serialize(s), "light")!
    expect(restored.theme).toBe("light")
    expect(restored.themeExplicit).toBe(false)
  })

  it.each([
    ["missing", null],
    ["not JSON", "{oops"],
    ["wrong version", JSON.stringify({ version: 2, expressions: [] })],
    ["not an object", "42"],
    ["expressions not an array", JSON.stringify({ version: 1, expressions: "x" })],
    ["all items invalid", JSON.stringify({ version: 1, expressions: [{ id: 1 }, null] })],
  ])("returns null for %s", (_label, raw) => {
    expect(deserialize(raw, "light")).toBeNull()
  })

  it("drops invalid items, parameters and viewports but keeps the rest", () => {
    const raw = JSON.stringify({
      version: 1,
      expressions: [
        { id: "a", text: "x", colorIndex: 1, visible: true },
        { id: "a", text: "dupe", colorIndex: 1, visible: true },
        { id: "b", text: 5, colorIndex: 1, visible: true },
        { id: "c", text: "x^2", colorIndex: 12, visible: false },
      ],
      parameters: {
        a: { value: 1, min: -10, max: 10, step: 0.1 },
        b: { value: 1, min: 5, max: 1, step: 0.1 },
        c: { value: "1", min: 0, max: 1, step: 0.1 },
        d: { value: 50, min: 0, max: 10, step: 1 },
      },
      viewport: { xMin: 1, xMax: 0, yMin: 0, yMax: 1 },
      theme: "purple",
      panelCollapsed: "yes",
    })
    const s = deserialize(raw, "dark")!
    expect(s.expressions.map((e) => e.text)).toEqual(["x", "x^2", ""])
    expect(s.expressions[1].colorIndex).toBe(5)
    expect(Object.keys(s.parameters)).toEqual(["a", "d"])
    expect(s.parameters.d.value).toBe(10)
    expect(s.viewport).toBeNull()
    expect(s.theme).toBe("dark")
    expect(s.panelCollapsed).toBe(false)
  })

  it("keeps a deliberately emptied list (only the trailing row)", () => {
    const raw = JSON.stringify({ version: 1, expressions: [] })
    expect(deserialize(raw, "light")!.expressions.map((e) => e.text)).toEqual([""])
  })

  it("loads first-run state from empty or corrupt storage", () => {
    expect(loadState("light").expressions.map((e) => e.text)).toEqual(["y = sin(x)", ""])
    window.localStorage.setItem(STORAGE_KEY, "garbage")
    expect(loadState("light").expressions.map((e) => e.text)).toEqual(["y = sin(x)", ""])
  })

  it("survives blocked storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded")
    })
    const s = loadState("light")
    expect(s.expressions[0].text).toBe("y = sin(x)")
    expect(() => saveState(s)).not.toThrow()
  })

  it("saves and loads through localStorage", () => {
    let s = firstRunState("light")
    s = reducer(s, { type: "setText", id: s.expressions[0].id, text: "x^3" })
    saveState(s)
    expect(loadState("light").expressions[0].text).toBe("x^3")
  })
})
