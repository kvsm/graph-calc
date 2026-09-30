import { describe, expect, it } from "vitest"
import {
  MIN_MAX_ERROR,
  advance,
  commitMax,
  commitMin,
  commitStep,
  commitValue,
  formatParamValue,
  parseNumber,
  snapToStep,
  stepDecimals,
} from "./parameters"
import type { Parameter } from "./types"

const p: Parameter = { name: "a", value: 1, min: -10, max: 10, step: 0.1 }

describe("formatting", () => {
  it.each([
    [0.1, 1],
    [0.25, 2],
    [1, 0],
    [5, 0],
    [0.001, 3],
    [1e-7, 7],
    [2.5e-7, 8],
  ])("stepDecimals(%d) = %d", (step, d) => {
    expect(stepDecimals(step)).toBe(d)
  })

  it("uses the step's decimals for display", () => {
    expect(formatParamValue(1, 0.1)).toBe("1.0")
    expect(formatParamValue(3.14159, 0.01)).toBe("3.14")
    expect(formatParamValue(-0.01, 0.1)).toBe("0.0")
    expect(formatParamValue(2, 1)).toBe("2")
  })

  it("parses numbers strictly", () => {
    expect(parseNumber(" -2.5 ")).toBe(-2.5)
    expect(parseNumber("−3")).toBe(-3)
    expect(parseNumber("1e3")).toBe(1000)
    expect(parseNumber("")).toBeNull()
    expect(parseNumber("-")).toBeNull()
    expect(parseNumber("abc")).toBeNull()
    expect(parseNumber("1,5")).toBeNull()
  })
})

describe("commit rules (UX-SPEC §4)", () => {
  it("typed values outside the bounds extend the bound", () => {
    expect(commitValue(p, "20")).toEqual({ ok: true, patch: { value: 20, max: 20 } })
    expect(commitValue(p, "-15")).toEqual({ ok: true, patch: { value: -15, min: -15 } })
    expect(commitValue(p, "3")).toEqual({ ok: true, patch: { value: 3 } })
    expect(commitValue(p, "x")).toEqual({ ok: false })
  })

  it("rejects min >= max with the spec message", () => {
    expect(commitMin(p, "10")).toEqual({ ok: false, error: MIN_MAX_ERROR })
    expect(commitMin(p, "11")).toEqual({ ok: false, error: MIN_MAX_ERROR })
    expect(commitMax(p, "-10")).toEqual({ ok: false, error: MIN_MAX_ERROR })
    expect(MIN_MAX_ERROR).toBe("Min must be less than max")
  })

  it("clamps the value into new bounds", () => {
    expect(commitMin(p, "2")).toEqual({ ok: true, patch: { min: 2, value: 2 } })
    expect(commitMax(p, "0")).toEqual({ ok: true, patch: { max: 0, value: 0 } })
    expect(commitMin(p, "-5")).toEqual({ ok: true, patch: { min: -5 } })
  })

  it("requires step > 0", () => {
    expect(commitStep(p, "0.5")).toEqual({ ok: true, patch: { step: 0.5 } })
    expect(commitStep(p, "0")).toEqual({ ok: false })
    expect(commitStep(p, "-1")).toEqual({ ok: false })
  })
})

describe("snapToStep", () => {
  it("snaps to the step grid without float noise and clamps", () => {
    expect(snapToStep(0.3000000004, p)).toBe(0.3)
    expect(snapToStep(0.26, p)).toBe(0.3)
    expect(snapToStep(99, p)).toBe(10)
    expect(snapToStep(-99, p)).toBe(-10)
    expect(snapToStep(0.7, { min: 0.25, max: 5, step: 0.5 })).toBe(0.75)
  })
})

describe("advance (ping-pong)", () => {
  it("moves by a fraction of the range and bounces off the ends", () => {
    let c = advance({ pos: 0, dir: 1 }, p, 0.25)
    expect(c).toEqual({ pos: 5, dir: 1 })
    c = advance(c, p, 0.5)
    expect(c).toEqual({ pos: 5, dir: -1 })
    c = advance({ pos: -9, dir: -1 }, p, 0.1)
    expect(c).toEqual({ pos: -9, dir: 1 })
  })

  it("never leaves [min, max] even with huge steps", () => {
    for (const f of [0.9, 1.7, 3.3]) {
      const c = advance({ pos: 0, dir: 1 }, p, f)
      expect(c.pos).toBeGreaterThanOrEqual(-10)
      expect(c.pos).toBeLessThanOrEqual(10)
    }
  })

  it("a 4s sweep covers min→max", () => {
    let c = { pos: -10, dir: 1 as const } as { pos: number; dir: 1 | -1 }
    for (let t = 0; t < 4000; t += 16) c = advance(c, p, 16 / 4000)
    expect(c.pos).toBeGreaterThan(9.5)
  })
})
