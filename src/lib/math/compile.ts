/**
 * Compiles an allow-listed mathjs AST into a plain JS closure over numbers.
 *
 * Anything not explicitly allowed (assignments, accessors, matrices, strings,
 * units, relational/logical operators, unknown functions, ...) is rejected
 * with a friendly ExpressionSyntaxError. No mathjs code runs at evaluation time.
 */
import type { MathNode } from 'mathjs'
import { ExpressionSyntaxError, fallbackMessage } from './errors'
import {
  CONSTANTS,
  FUNCTIONS,
  RESERVED_SYMBOLS,
  VARIABLE,
  isKnownConstant,
  isKnownFunction,
} from './functions'

export type Params = Readonly<Record<string, number>>
type Evaluator = (x: number, params: Params) => number

export interface CompiledAst {
  fn: Evaluator
  /** Free parameters, sorted alphabetically. */
  parameters: string[]
}

const BINARY_OPS: Record<string, (a: number, b: number) => number> = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide: (a, b) => a / b,
  pow: (a, b) => Math.pow(a, b),
}

/** Multi-letter tokens recognised when splitting an identifier like "pix" into pi·x. */
const WORD_TOKENS = Object.keys(CONSTANTS).sort((a, b) => b.length - a.length)
const LETTER = /^[A-Za-zͰ-Ͽ]/

/**
 * Split an identifier into implicit-multiplication factors: constants (pi, tau, e)
 * and single letters, e.g. "ax" -> ["a", "x"], "pix" -> ["pi", "x"].
 * Returns null if the identifier contains anything else (e.g. digits).
 */
export function splitIdentifier(name: string): string[] | null {
  const parts: string[] = []
  let rest = name
  while (rest.length > 0) {
    const token = WORD_TOKENS.find((w) => rest.startsWith(w)) ?? LETTER.exec(rest)?.[0]
    if (!token) return null
    parts.push(token)
    rest = rest.slice(token.length)
  }
  return parts
}

/** True for a single letter or a named constant. */
function isAtomicSymbol(name: string): boolean {
  const parts = splitIdentifier(name)
  return parts !== null && parts.length === 1
}

function arityMessage(name: string, min: number, max: number): string {
  const plural = (n: number) => (n === 1 ? 'value' : 'values')
  if (min === max) return `${name} needs ${min} ${plural(min)}.`
  if (max === Infinity) return `${name} needs at least ${min} ${plural(min)}.`
  return `${name} needs ${min} or ${max} values.`
}

export function compileAst(root: MathNode): CompiledAst {
  const seen = new Set<string>()

  const product = (factors: Evaluator[]): Evaluator => {
    if (factors.length === 1) return factors[0]
    return factors.reduce((acc, f) => (x, p) => acc(x, p) * f(x, p))
  }

  const symbol = (name: string): Evaluator => {
    if (name === VARIABLE) return (x) => x
    if (isKnownConstant(name)) {
      const value = CONSTANTS[name]
      return () => value
    }
    if (RESERVED_SYMBOLS.has(name)) {
      throw new ExpressionSyntaxError('uses-y', "y can't appear on the right-hand side.")
    }
    if (isKnownFunction(name)) {
      // e.g. "sin x": a function used without brackets.
      throw new ExpressionSyntaxError('missing-parens', fallbackMessage(name))
    }
    if (isAtomicSymbol(name)) {
      seen.add(name)
      return (_x, params) => params[name] ?? NaN
    }
    const parts = splitIdentifier(name)
    if (!parts) throw new ExpressionSyntaxError('syntax', fallbackMessage(name))
    return product(parts.map(symbol))
  }

  const callFunction = (name: string, args: Evaluator[]): Evaluator => {
    const spec = FUNCTIONS[name]
    if (args.length === 0) {
      throw new ExpressionSyntaxError('wrong-arg-count', `${name} needs a value, e.g. ${name}(x).`)
    }
    if (args.length < spec.minArgs || args.length > spec.maxArgs) {
      throw new ExpressionSyntaxError(
        'wrong-arg-count',
        arityMessage(name, spec.minArgs, spec.maxArgs),
      )
    }
    const { impl } = spec
    if (args.length === 1) {
      const [a] = args
      return (x, p) => impl(a(x, p))
    }
    if (args.length === 2) {
      const [a, b] = args
      return (x, p) => impl(a(x, p), b(x, p))
    }
    return (x, p) => impl(...args.map((a) => a(x, p)))
  }

  const visit = (node: MathNode): Evaluator => {
    switch (node.type) {
      case 'ConstantNode': {
        const { value } = node as unknown as { value: unknown }
        if (typeof value !== 'number') {
          throw new ExpressionSyntaxError('unsupported-syntax', fallbackMessage(String(value)))
        }
        return () => value
      }
      case 'SymbolNode':
        return symbol((node as unknown as { name: string }).name)
      case 'ParenthesisNode':
        return visit((node as unknown as { content: MathNode }).content)
      case 'OperatorNode': {
        const { fn, args, op } = node as unknown as { fn: string; args: MathNode[]; op: string }
        if (fn === 'unaryMinus' && args.length === 1) {
          const a = visit(args[0])
          return (x, p) => -a(x, p)
        }
        if (fn === 'unaryPlus' && args.length === 1) return visit(args[0])
        const binary = BINARY_OPS[fn]
        if (binary && args.length === 2) {
          const a = visit(args[0])
          const b = visit(args[1])
          return (x, p) => binary(a(x, p), b(x, p))
        }
        throw new ExpressionSyntaxError('unsupported-syntax', fallbackMessage(op))
      }
      case 'FunctionNode': {
        const { fn, args } = node as unknown as { fn: MathNode; args: MathNode[] }
        if (fn.type !== 'SymbolNode') {
          throw new ExpressionSyntaxError('unsupported-syntax', fallbackMessage(fn.toString()))
        }
        const name = (fn as unknown as { name: string }).name
        if (isKnownFunction(name)) return callFunction(name, args.map(visit))

        // Implicit multiplication written without an operator, e.g. "xsin(x)" or "bcos(x)".
        for (let i = 1; i < name.length; i++) {
          const suffix = name.slice(i)
          if (!isKnownFunction(suffix)) continue
          const prefix = splitIdentifier(name.slice(0, i))
          if (!prefix) continue
          return product([...prefix.map(symbol), callFunction(suffix, args.map(visit))])
        }

        // A single symbol followed by brackets is multiplication: "a(x+1)", "x(x-1)", "pi(2)".
        if (isAtomicSymbol(name) && args.length === 1) {
          return product([symbol(name), visit(args[0])])
        }
        throw new ExpressionSyntaxError(
          'unknown-function',
          `Unknown function "${name}". Try sin, cos, tan, sqrt, abs, ln, log or exp.`,
        )
      }
      default:
        throw new ExpressionSyntaxError('unsupported-syntax', fallbackMessage(node.toString()))
    }
  }

  const fn = visit(root)
  return { fn, parameters: [...seen].sort() }
}
