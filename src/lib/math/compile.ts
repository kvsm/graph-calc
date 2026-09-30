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

/** Function names, longest first, so "sinhx" is sinh(x) and "atanx" is atan(x). */
const FUNCTION_NAMES = Object.keys(FUNCTIONS).sort((a, b) => b.length - a.length)

export type IdentifierSegment = { kind: 'plain'; text: string } | { kind: 'fn'; name: string }

/**
 * Split an identifier at known function names, e.g. "xsinx" -> [x][sin][x],
 * "sinxcosx" -> [sin][x][cos][x]. At each position the longest function name wins.
 */
export function segmentIdentifier(name: string): IdentifierSegment[] {
  const segments: IdentifierSegment[] = []
  let plain = ''
  let i = 0
  while (i < name.length) {
    const fn = FUNCTION_NAMES.find((f) => name.startsWith(f, i))
    if (fn) {
      if (plain) segments.push({ kind: 'plain', text: plain })
      plain = ''
      segments.push({ kind: 'fn', name: fn })
      i += fn.length
    } else {
      plain += name[i]
      i += 1
    }
  }
  if (plain) segments.push({ kind: 'plain', text: plain })
  return segments
}

const addBrackets = (fn: string, arg = 'x') => `Add brackets: ${fn}(${arg}).`

/** Upper bound on AST nodes compiled per expression (keeps sampling fast; CR-03). */
export const MAX_NODES = 1000
export const TOO_COMPLEX_MESSAGE = 'This expression is too complex to graph. Try splitting it up.'

export interface CompileOptions {
  /** Extra names that may not appear (e.g. "f" in "f(x) = …"). */
  reserved?: readonly string[]
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

export function compileAst(root: MathNode, options: CompileOptions = {}): CompiledAst {
  const seen = new Set<string>()
  const reserved = new Set(options.reserved ?? [])

  let nodeCount = 0

  // A flat loop rather than nested closures, so long products can't overflow the stack.
  const product = (factors: Evaluator[]): Evaluator => {
    if (factors.length === 1) return factors[0]
    return (x, p) => {
      let result = 1
      for (const f of factors) result *= f(x, p)
      return result
    }
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
    if (reserved.has(name)) {
      throw new ExpressionSyntaxError('self-reference', `${name} can't appear on the right-hand side.`)
    }
    if (isKnownFunction(name)) {
      // e.g. "sin x": a function used without brackets.
      throw new ExpressionSyntaxError('missing-parens', addBrackets(name))
    }
    if (isAtomicSymbol(name)) {
      seen.add(name)
      return (_x, params) => params[name] ?? NaN
    }
    const segments = segmentIdentifier(name)
    if (segments.some((s) => s.kind === 'fn')) return bracketFree(name, segments)
    const parts = splitIdentifier(name)
    if (!parts) throw new ExpressionSyntaxError('syntax', fallbackMessage(name))
    return product(parts.map(symbol))
  }

  /** A run like "2ax" as factors: optional number, then letters/constants. */
  const plainFactors = (text: string, whole: string): Evaluator[] => {
    const m = /^(\d+(?:\.\d+)?)?(.*)$/.exec(text)
    const factors: Evaluator[] = []
    if (m?.[1]) {
      const value = Number(m[1])
      factors.push(() => value)
    }
    const letters = m?.[2] ?? text
    if (letters) {
      const parts = splitIdentifier(letters)
      if (!parts) throw new ExpressionSyntaxError('syntax', fallbackMessage(whole))
      factors.push(...parts.map(symbol))
    }
    return factors
  }

  /**
   * Bracket-free function application inside one identifier: each function takes
   * the rest of the identifier, up to the next function name, as its argument.
   * "sinx" -> sin(x), "sin2x" -> sin(2x), "xsinx" -> x·sin(x), "sinxcosx" -> sin(x)·cos(x).
   */
  const bracketFree = (whole: string, segments: IdentifierSegment[]): Evaluator => {
    const factors: Evaluator[] = []
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      if (seg.kind === 'plain') {
        factors.push(...plainFactors(seg.text, whole))
        continue
      }
      const next = segments[i + 1]
      if (!next || next.kind !== 'plain') {
        throw new ExpressionSyntaxError('missing-parens', addBrackets(seg.name))
      }
      factors.push(callFunction(seg.name, [product(plainFactors(next.text, whole))]))
      i += 1
    }
    return product(factors)
  }

  /** "sinx^2" could mean sin(x)^2 or sin(x^2), and "sin^2" lacks brackets: ask for brackets. */
  const rejectAmbiguousPower = (base: MathNode, exponent: MathNode) => {
    if (base.type !== 'SymbolNode') return
    const name = (base as unknown as { name: string }).name
    const simpleExp = exponent.type === 'ConstantNode' || exponent.type === 'SymbolNode'
    const exp = simpleExp ? exponent.toString() : null
    if (isKnownFunction(name)) {
      throw new ExpressionSyntaxError(
        'missing-parens',
        exp ? `Add brackets: ${name}(x)^${exp}.` : addBrackets(name),
      )
    }
    if (isAtomicSymbol(name)) return
    const segments = segmentIdentifier(name)
    const at = segments.findIndex((s) => s.kind === 'fn')
    if (at === -1) return
    const fnName = (segments[at] as { name: string }).name
    const next = segments[at + 1]
    const arg = next?.kind === 'plain' ? next.text : 'x'
    throw new ExpressionSyntaxError(
      'missing-parens',
      exp
        ? `Add brackets: ${fnName}(${arg})^${exp} or ${fnName}(${arg}^${exp}).`
        : addBrackets(fnName, arg),
    )
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
    nodeCount += 1
    if (nodeCount > MAX_NODES) throw new ExpressionSyntaxError('too-long', TOO_COMPLEX_MESSAGE)
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
        if (fn === 'pow' && args.length === 2) rejectAmbiguousPower(args[0], args[1])
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
        const lower = name.toLowerCase()
        throw new ExpressionSyntaxError(
          'unknown-function',
          lower !== name && isKnownFunction(lower)
            ? `Unknown function "${name}". Did you mean ${lower}?`
            : `Unknown function "${name}". Try sin, cos, tan, sqrt, abs, ln, log or exp.`,
        )
      }
      default:
        throw new ExpressionSyntaxError('unsupported-syntax', fallbackMessage(node.toString()))
    }
  }

  const fn = visit(root)
  return { fn, parameters: [...seen].sort() }
}
