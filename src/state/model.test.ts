import { describe, expect, it } from "vitest"
import { PALETTE } from "@/lib/palette"
import { DEFAULT_PARAMETER, ensureTrailingRow, firstRunState, reducer, type AppState } from "./model"

const texts = (s: AppState) => s.expressions.map((e) => e.text)

describe("firstRunState", () => {
  it("has y = sin(x) in Blue plus one trailing empty row (UX-SPEC §6)", () => {
    const s = firstRunState("light")
    expect(texts(s)).toEqual(["y = sin(x)", ""])
    expect(s.expressions[0].colorIndex).toBe(0)
    expect(s.expressions.every((e) => e.visible)).toBe(true)
    expect(s.viewport).toBeNull()
    expect(s.themeExplicit).toBe(false)
  })
})

describe("reducer", () => {
  it("typing into the trailing row appends a new empty row", () => {
    let s = firstRunState("light")
    const trailing = s.expressions[1]
    s = reducer(s, { type: "setText", id: trailing.id, text: "x^2" })
    expect(texts(s)).toEqual(["y = sin(x)", "x^2", ""])
  })

  it("assigns colours round-robin by creation count", () => {
    let s = firstRunState("light")
    for (let i = 0; i < PALETTE.length + 2; i++) {
      const last = s.expressions.at(-1)!
      s = reducer(s, { type: "setText", id: last.id, text: `x + ${i}` })
    }
    expect(s.expressions.map((e) => e.colorIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3])
  })

  it("does not change state when text is unchanged", () => {
    const s = firstRunState("light")
    expect(reducer(s, { type: "setText", id: s.expressions[0].id, text: "y = sin(x)" })).toBe(s)
  })

  it("inserts an empty row after a given row with the provided id", () => {
    let s = firstRunState("light")
    s = reducer(s, { type: "insertAfter", afterId: s.expressions[0].id, newId: "new" })
    expect(s.expressions.map((e) => e.id)[1]).toBe("new")
    expect(texts(s)).toEqual(["y = sin(x)", "", ""])
  })

  it("deletes rows but never the last one, and keeps a trailing row", () => {
    let s = firstRunState("light")
    s = reducer(s, { type: "delete", id: s.expressions[0].id })
    expect(texts(s)).toEqual([""])
    const only = s.expressions[0]
    expect(reducer(s, { type: "delete", id: only.id })).toBe(s)
  })

  it("re-adds a trailing row if the empty last row is deleted", () => {
    let s = firstRunState("light")
    s = reducer(s, { type: "delete", id: s.expressions[1].id })
    expect(texts(s)).toEqual(["y = sin(x)", ""])
  })

  it("toggles visibility and normalises colour indices", () => {
    let s = firstRunState("light")
    const id = s.expressions[0].id
    s = reducer(s, { type: "setVisible", id, visible: false })
    expect(s.expressions[0].visible).toBe(false)
    s = reducer(s, { type: "setColor", id, colorIndex: 9 })
    expect(s.expressions[0].colorIndex).toBe(2)
    s = reducer(s, { type: "setColor", id, colorIndex: -1 })
    expect(s.expressions[0].colorIndex).toBe(6)
  })

  it("creates parameters from defaults when first patched", () => {
    let s = firstRunState("light")
    s = reducer(s, { type: "setParameter", name: "a", patch: { value: 3 } })
    expect(s.parameters.a).toEqual({ name: "a", ...DEFAULT_PARAMETER, value: 3 })
  })

  it("sets viewport, theme and panel state", () => {
    let s = firstRunState("light")
    s = reducer(s, { type: "setViewport", viewport: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 } })
    expect(s.viewport).toEqual({ xMin: 0, xMax: 1, yMin: 0, yMax: 1 })
    s = reducer(s, { type: "setTheme", theme: "dark", explicit: true })
    expect([s.theme, s.themeExplicit]).toEqual(["dark", true])
    s = reducer(s, { type: "setPanelCollapsed", collapsed: true })
    s = reducer(s, { type: "setSheetExpanded", expanded: true })
    expect([s.panelCollapsed, s.sheetExpanded]).toEqual([true, true])
  })
})

describe("ensureTrailingRow", () => {
  it("adds a row only when the last row is non-empty", () => {
    const s = firstRunState("light")
    expect(ensureTrailingRow(s)).toBe(s)
    const noTrailing = { ...s, expressions: s.expressions.slice(0, 1) }
    expect(texts(ensureTrailingRow(noTrailing))).toEqual(["y = sin(x)", ""])
  })
})
