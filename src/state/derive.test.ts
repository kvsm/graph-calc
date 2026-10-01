import { describe, expect, it } from "vitest"
import { currentError, derivePlots, deriveStatuses, nextCompiled, paramValues, parseCached, sliderOwners } from "./derive"
import type { ExpressionItem } from "./types"

const item = (id: string, text: string, extra: Partial<ExpressionItem> = {}): ExpressionItem => ({
  id,
  text,
  colorIndex: 0,
  visible: true,
  ...extra,
})

describe("parseCached / currentError", () => {
  it("returns the identical result for identical text", () => {
    expect(parseCached("x^2")).toBe(parseCached("x^2"))
  })

  it("reports errors but not for empty text", () => {
    expect(currentError("")).toBeNull()
    expect(currentError("   ")).toBeNull()
    expect(currentError("x^2")).toBeNull()
    expect(currentError("sin(")?.message).toBe('Missing closing bracket ")".')
  })
})

describe("nextCompiled", () => {
  it("compiles valid text, keeps the last valid compile while invalid, clears when empty", () => {
    let map = nextCompiled({}, [item("a", "x^2")])
    const first = map.a
    expect(first?.evaluate(3)).toBe(9)
    map = nextCompiled(map, [item("a", "x^2 +")])
    expect(map.a).toBe(first)
    map = nextCompiled(map, [item("a", "")])
    expect(map.a).toBeNull()
  })

  it("returns the previous map when nothing changed", () => {
    const items = [item("a", "x"), item("b", "")]
    const map = nextCompiled({}, items)
    expect(nextCompiled(map, items)).toBe(map)
    expect(nextCompiled(map, [items[0]])).not.toBe(map)
  })
})

describe("statuses and plots", () => {
  it("derives status and plot items (only compiled rows plot)", () => {
    const items = [item("a", " y = 2x ", { colorIndex: 3, visible: false }), item("b", "foo(x)"), item("c", "")]
    const compiled = nextCompiled({}, items)
    const statuses = deriveStatuses(items, compiled)
    expect(statuses.a.error).toBeNull()
    expect(statuses.b.error?.code).toBe("unknown-function")
    expect(statuses.c).toEqual({ compiled: null, error: null })
    const plots = derivePlots(items, compiled)
    expect(plots).toHaveLength(1)
    expect(plots[0]).toMatchObject({ id: "a", label: "y = 2x", colorIndex: 3, visible: false })
  })
})

describe("sliderOwners / paramValues", () => {
  it("puts each slider under the first expression that uses it, alphabetically", () => {
    const items = [item("a", "b x + a"), item("b", "a sin(x) + c"), item("c", "x")]
    const owners = sliderOwners(items, nextCompiled({}, items))
    expect(owners).toEqual({ a: ["a", "b"], b: ["c"] })
    expect(paramValues(owners, { b: { name: "b", value: 4, min: -10, max: 10, step: 0.1 } })).toEqual({
      a: 1,
      b: 4,
      c: 1,
    })
  })
})
