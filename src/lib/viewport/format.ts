/** Number formatting shared by trace tooltip, table of values and tick labels. */

/** Strip trailing zeros from a mantissa like "1.2300" -> "1.23", "2.000" -> "2". */
function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/** "1.2300e+6" -> "1.23e6", "1.000e-5" -> "1e-5". */
function compactExponential(s: string): string {
  const [mantissa, exp] = s.split('e')
  return `${trimZeros(mantissa)}e${Number(exp)}`
}

/**
 * Format a value per UX-SPEC §5.3: up to `sigFigs` (default 4) significant figures,
 * trailing zeros stripped, -0 shown as 0, scientific notation when |v| < 1e-4 or
 * |v| >= 1e6, and "undefined" for non-finite values.
 *
 * Examples: 3.14159 -> "3.142", 1000000 -> "1e6", 0.00001234 -> "1.234e-5", 2.5 -> "2.5".
 */
export function formatNumber(value: number, sigFigs = 4): string {
  if (!Number.isFinite(value)) return 'undefined'
  if (value === 0) return '0'
  const rounded = Number(value.toPrecision(sigFigs))
  if (rounded === 0) return '0'
  const abs = Math.abs(rounded)
  if (abs < 1e-4 || abs >= 1e6) return compactExponential(rounded.toExponential(sigFigs - 1))
  return String(rounded)
}

/** Format a point as "(x, y)". */
export function formatPoint(x: number, y: number, sigFigs = 4): string {
  return `(${formatNumber(x, sigFigs)}, ${formatNumber(y, sigFigs)})`
}

/** Number of decimal places needed to show multiples of `step` exactly (step = m × 10^n). */
export function decimalsForStep(step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) return 0
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
}

/**
 * Format a tick value that is a multiple of `step`, with just enough precision to
 * distinguish adjacent ticks and no floating-point noise (0.1 + 0.2 -> "0.3").
 * Uses scientific notation for |value| >= 1e6, or tiny steps (< 1e-4).
 */
export function formatTickLabel(value: number, step: number): string {
  if (!Number.isFinite(value)) return ''
  // Snap values within a tiny fraction of a step to zero (e.g. 1e-17 -> 0).
  if (Math.abs(value) < Math.abs(step) * 1e-6) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e6 || step < 1e-4) {
    const sig = Math.max(1, Math.floor(Math.log10(abs) + 1e-9) - Math.floor(Math.log10(step) + 1e-9) + 1)
    return compactExponential(value.toExponential(Math.min(20, sig - 1)))
  }
  const s = value.toFixed(decimalsForStep(step))
  return s === '-0' || /^-0\.0*$/.test(s) ? s.slice(1) : s
}
