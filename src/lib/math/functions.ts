/** Allow-listed functions and constants available in expressions. */

export interface FunctionSpec {
  /** Minimum number of arguments. */
  minArgs: number
  /** Maximum number of arguments (Infinity for variadic). */
  maxArgs: number
  impl: (...args: number[]) => number
}

const unary = (impl: (v: number) => number): FunctionSpec => ({ minArgs: 1, maxArgs: 1, impl })

const sec = (v: number) => 1 / Math.cos(v)
const csc = (v: number) => 1 / Math.sin(v)
const cot = (v: number) => 1 / Math.tan(v)

export const FUNCTIONS: Readonly<Record<string, FunctionSpec>> = {
  sin: unary(Math.sin),
  cos: unary(Math.cos),
  tan: unary(Math.tan),
  sec: unary(sec),
  csc: unary(csc),
  cot: unary(cot),
  asin: unary(Math.asin),
  acos: unary(Math.acos),
  atan: unary(Math.atan),
  arcsin: unary(Math.asin),
  arccos: unary(Math.acos),
  arctan: unary(Math.atan),
  asec: unary((v) => Math.acos(1 / v)),
  acsc: unary((v) => Math.asin(1 / v)),
  acot: unary((v) => Math.atan(1 / v)),
  sinh: unary(Math.sinh),
  cosh: unary(Math.cosh),
  tanh: unary(Math.tanh),
  asinh: unary(Math.asinh),
  acosh: unary(Math.acosh),
  atanh: unary(Math.atanh),
  atan2: { minArgs: 2, maxArgs: 2, impl: (y, x) => Math.atan2(y, x) },
  ln: unary(Math.log),
  /** log(x) is base 10 (calculator convention); log(x, b) is base b. */
  log: {
    minArgs: 1,
    maxArgs: 2,
    impl: (v, base) => (base === undefined ? Math.log10(v) : Math.log(v) / Math.log(base)),
  },
  log10: unary(Math.log10),
  log2: unary(Math.log2),
  exp: unary(Math.exp),
  sqrt: unary(Math.sqrt),
  cbrt: unary(Math.cbrt),
  /** nthRoot(x, n): real n-th root, defined for negative x when n is odd. */
  nthRoot: {
    minArgs: 2,
    maxArgs: 2,
    impl: (v, n) => {
      if (v < 0 && Number.isInteger(n) && Math.abs(n % 2) === 1) return -Math.pow(-v, 1 / n)
      return Math.pow(v, 1 / n)
    },
  },
  abs: unary(Math.abs),
  sign: unary(Math.sign),
  floor: unary(Math.floor),
  ceil: unary(Math.ceil),
  round: unary(Math.round),
  min: { minArgs: 1, maxArgs: Infinity, impl: Math.min },
  max: { minArgs: 1, maxArgs: Infinity, impl: Math.max },
  mod: {
    minArgs: 2,
    maxArgs: 2,
    impl: (a, b) => ((a % b) + b) % b,
  },
}

export const CONSTANTS: Readonly<Record<string, number>> = {
  pi: Math.PI,
  e: Math.E,
  tau: 2 * Math.PI,
}

/** The independent variable. */
export const VARIABLE = 'x'

/** Names that can never be parameters. */
export const RESERVED_SYMBOLS: ReadonlySet<string> = new Set(['x', 'y'])

export function isKnownFunction(name: string): boolean {
  return Object.hasOwn(FUNCTIONS, name)
}

export function isKnownConstant(name: string): boolean {
  return Object.hasOwn(CONSTANTS, name)
}
