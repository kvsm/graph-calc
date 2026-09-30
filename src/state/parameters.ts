// Pure slider rules (UX-SPEC §4).
import type { Parameter } from "./types"

export type ParameterPatch = Partial<Omit<Parameter, "name">>
export type Commit = { ok: true; patch: ParameterPatch } | { ok: false; error?: string }

export const MIN_MAX_ERROR = "Min must be less than max"

/** Decimal places implied by a step: 0.1 -> 1, 0.25 -> 2, 1 -> 0, 1e-7 -> 7. */
export function stepDecimals(step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) return 0
  const s = step.toString()
  const exp = /e-(\d+)$/.exec(s)
  if (exp) {
    const mantissaDecimals = (s.split("e")[0].split(".")[1] ?? "").length
    return Math.min(20, Number(exp[1]) + mantissaDecimals)
  }
  return Math.min(20, (s.split(".")[1] ?? "").length)
}

/** Display a value with the step's decimal places (step 0.1 -> "1.0"). */
export function formatParamValue(value: number, step: number): string {
  const s = value.toFixed(stepDecimals(step))
  return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s
}

/** Snap to the step grid anchored at min, clamped to [min, max], without float noise. */
export function snapToStep(value: number, p: Pick<Parameter, "min" | "max" | "step">): number {
  const k = Math.round((value - p.min) / p.step)
  const snapped = Math.min(p.max, Math.max(p.min, p.min + k * p.step))
  return Number(snapped.toFixed(Math.max(stepDecimals(p.step), stepDecimals(Math.abs(p.min) || 1))))
}

export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/−/g, "-")
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Typed value: values outside the bounds extend the bound to fit. */
export function commitValue(p: Parameter, text: string): Commit {
  const v = parseNumber(text)
  if (v === null) return { ok: false }
  const patch: ParameterPatch = { value: v }
  if (v < p.min) patch.min = v
  if (v > p.max) patch.max = v
  return { ok: true, patch }
}

export function commitMin(p: Parameter, text: string): Commit {
  const v = parseNumber(text)
  if (v === null) return { ok: false }
  if (!(v < p.max)) return { ok: false, error: MIN_MAX_ERROR }
  return { ok: true, patch: p.value < v ? { min: v, value: v } : { min: v } }
}

export function commitMax(p: Parameter, text: string): Commit {
  const v = parseNumber(text)
  if (v === null) return { ok: false }
  if (!(v > p.min)) return { ok: false, error: MIN_MAX_ERROR }
  return { ok: true, patch: p.value > v ? { max: v, value: v } : { max: v } }
}

export function commitStep(_p: Parameter, text: string): Commit {
  const v = parseNumber(text)
  if (v === null || !(v > 0)) return { ok: false }
  return { ok: true, patch: { step: v } }
}

export interface AnimationCursor {
  /** Unsnapped position, so sub-step progress per frame isn't lost. */
  pos: number
  dir: 1 | -1
}

/**
 * Advance a ping-pong sweep. `fraction` is the share of (max - min) to move
 * (dt / 4000 for smooth animation; a fixed chunk for reduced motion).
 */
export function advance(cursor: AnimationCursor, p: Parameter, fraction: number): AnimationCursor {
  const range = p.max - p.min
  let pos = cursor.pos + cursor.dir * range * fraction
  let dir = cursor.dir
  // Reflect off the ends (loop handles overshoot of more than one range).
  for (let i = 0; i < 4 && (pos > p.max || pos < p.min); i++) {
    if (pos > p.max) {
      pos = p.max - (pos - p.max)
      dir = -1
    } else if (pos < p.min) {
      pos = p.min + (p.min - pos)
      dir = 1
    }
  }
  return { pos: Math.min(p.max, Math.max(p.min, pos)), dir }
}
