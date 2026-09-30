/** "Nice" tick generation: steps of 1, 2 or 5 × 10^n. */
import { formatTickLabel } from './format'

export interface NiceStep {
  /** The step value, e.g. 0.2. */
  step: number
  /** Mantissa: 1, 2 or 5. */
  mantissa: 1 | 2 | 5
  /** Power of ten: step = mantissa × 10^exponent. */
  exponent: number
}

export interface Tick {
  value: number
  label: string
}

export interface AxisTicks {
  step: number
  /** Minor gridline step: 1/5 of the major step (UX-SPEC §5.4). */
  minorStep: number
  major: Tick[]
  /** Minor gridline positions (excluding those that coincide with major ticks). */
  minor: number[]
}

/** Preferred pixel spacing between major ticks (UX-SPEC §5.4: ~80–120px). */
export const TARGET_TICK_SPACING_PX = 100

/** Safety cap so a bad call can never allocate millions of ticks. */
const MAX_TICKS = 1000

const MANTISSAS = [1, 2, 5] as const

/** Build step = mantissa × 10^exponent with minimal float error. */
function makeStep(mantissa: number, exponent: number): number {
  return exponent >= 0 ? mantissa * 10 ** exponent : mantissa / 10 ** -exponent
}

/**
 * The nice step (1/2/5 × 10^n) closest, in log space, to `rawStep`.
 */
export function niceStep(rawStep: number): NiceStep {
  if (!(rawStep > 0) || !Number.isFinite(rawStep)) return { step: 1, mantissa: 1, exponent: 0 }
  const exp = Math.floor(Math.log10(rawStep))
  let best: NiceStep = { step: 1, mantissa: 1, exponent: 0 }
  let bestErr = Infinity
  for (const e of [exp - 1, exp, exp + 1]) {
    for (const m of MANTISSAS) {
      const step = makeStep(m, e)
      const err = Math.abs(Math.log(step / rawStep))
      if (err < bestErr) {
        bestErr = err
        best = { step, mantissa: m, exponent: e }
      }
    }
  }
  return best
}

/** Nice step for an axis of `span` world units drawn over `pixels` screen pixels. */
export function tickStepForPixels(span: number, pixels: number, targetSpacingPx = TARGET_TICK_SPACING_PX): NiceStep {
  return niceStep((span / Math.max(1, pixels)) * targetSpacingPx)
}

/**
 * All multiples of step = mantissa × 10^exponent within [min, max].
 * Values are computed as k × mantissa scaled by an exact power of ten, which
 * avoids accumulated error (e.g. 3 × 0.1 gives 0.3, not 0.30000000000000004).
 */
export function tickValues(
  min: number,
  max: number,
  nice: { mantissa: number; exponent: number },
): number[] {
  return multiples(min, max, nice.mantissa, nice.exponent).map(([, v]) => v)
}

/** [k, value] pairs for k × mantissa × 10^exponent within [min, max]. */
function multiples(min: number, max: number, mantissa: number, exponent: number): [number, number][] {
  const step = makeStep(mantissa, exponent)
  if (!(max >= min) || !Number.isFinite(min) || !Number.isFinite(max) || !(step > 0)) return []
  const kStart = Math.ceil(min / step - 1e-9)
  const kEnd = Math.floor(max / step + 1e-9)
  if (kEnd - kStart + 1 > MAX_TICKS) return []
  const out: [number, number][] = []
  for (let k = kStart; k <= kEnd; k++) {
    const v = exponent >= 0 ? k * mantissa * 10 ** exponent : (k * mantissa) / 10 ** -exponent
    out.push([k, v === 0 ? 0 : v]) // normalise -0
  }
  return out
}

/** Major ticks with labels plus minor gridline positions for one axis. */
export function generateTicks(
  min: number,
  max: number,
  pixels: number,
  targetSpacingPx = TARGET_TICK_SPACING_PX,
): AxisTicks {
  const nice = tickStepForPixels(max - min, pixels, targetSpacingPx)
  const major = tickValues(min, max, nice).map((value) => ({
    value,
    label: formatTickLabel(value, nice.step),
  }))
  // Minor step = step / 5 = (2 × mantissa) × 10^(exponent - 1); every 5th minor is a major.
  const minorMantissa = nice.mantissa * 2
  const minorExponent = nice.exponent - 1
  const minor = multiples(min, max, minorMantissa, minorExponent)
    .filter(([k]) => k % 5 !== 0)
    .map(([, v]) => v)
  return { step: nice.step, minorStep: makeStep(minorMantissa, minorExponent), major, minor }
}
