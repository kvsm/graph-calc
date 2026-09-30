import { compileAst, type Params } from './compile'
import { ExpressionSyntaxError, fallbackMessage, type ExpressionError } from './errors'
import { parseToAst } from './mathjs'

export type ExpressionForm =
  /** `y = …` (or `… = y`) */
  | 'equation'
  /** `f(x) = …` */
  | 'function'
  /** bare `…`, treated as y = … */
  | 'bare'

export interface CompiledExpression {
  /** The original input string. */
  source: string
  /** The right-hand side after normalisation (what was actually parsed). */
  body: string
  form: ExpressionForm
  /** Function name for `f(x) = …` forms, e.g. "f". */
  name?: string
  /** Free parameters (single letters other than x, y and e), sorted alphabetically. */
  parameters: string[]
  /**
   * Evaluate at x. Missing parameters evaluate as NaN.
   * Complex, infinite or otherwise non-finite results are returned as NaN.
   */
  evaluate: (x: number, params?: Params) => number
}

export type ParseResult =
  | { ok: true; expression: CompiledExpression }
  | { ok: false; error: ExpressionError }

const NO_PARAMS: Params = Object.freeze({})

/** Characters allowed in the raw input (before normalisation). */
const ALLOWED_CHAR = /[A-Za-z0-9\s.,+\-*/^()=_Ͱ-Ͽ×·⋅÷−²³]/

const ONLY_Y_SUPPORTED = 'Only y = … is supported. Write it as y = … or just the expression.'

function fail(code: ExpressionError['code'], message: string, position?: number): ParseResult {
  return {
    ok: false,
    error: position === undefined ? { code, message } : { code, message, position },
  }
}

function checkCharacters(input: string): ParseResult | null {
  for (let i = 0; i < input.length; i++) {
    if (!ALLOWED_CHAR.test(input[i])) {
      return fail('invalid-character', fallbackMessage(input[i]), i)
    }
  }
  return null
}

/** Check bracket balance in `text`, reporting positions offset into the full input. */
function checkParens(text: string, offset: number): ParseResult | null {
  const open: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') open.push(i)
    else if (text[i] === ')') {
      if (open.length === 0) {
        return fail(
          'unbalanced-parens',
          'Unexpected ) — there are more closing brackets than opening ones.',
          offset + i,
        )
      }
      open.pop()
    }
  }
  if (open.length > 0) {
    return fail('unbalanced-parens', 'Missing closing bracket ).', offset + open[open.length - 1])
  }
  return null
}

function normalise(text: string): string {
  return text
    .replace(/π/g, 'pi')
    .replace(/τ/g, 'tau')
    .replace(/[×·⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/\s+/g, ' ')
    .trim()
}

const LHS_FUNCTION = /^([A-Za-z][A-Za-z0-9_]*)\s*\(\s*([^()]*?)\s*\)$/
const SINGLE_LETTER = /^[A-Za-zͰ-Ͽ]$/
const NUMBER_LITERAL = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i

type Lhs = { form: ExpressionForm; name?: string }

function classifyLhs(lhs: string, rhs: string, position: number): Lhs | ParseResult {
  if (lhs === 'y') return { form: 'equation' }
  const match = LHS_FUNCTION.exec(lhs)
  if (match) {
    if (match[2] !== 'x') return fail('invalid-lhs', fallbackMessage(match[2] || lhs), position)
    return { form: 'function', name: match[1] }
  }
  if (SINGLE_LETTER.test(lhs) && lhs !== 'x' && NUMBER_LITERAL.test(rhs.replace(/\s/g, ''))) {
    // Looks like an attempt to define a parameter, e.g. "a = 5".
    return fail(
      'invalid-lhs',
      `Only y = … is supported. To make a slider, just use ${lhs} in an expression, e.g. ${lhs}·sin(x).`,
      position,
    )
  }
  return fail('invalid-lhs', ONLY_Y_SUPPORTED, position)
}

/** Translate a raw mathjs parse error into a friendly message. */
function friendlyParseError(err: unknown, body: string, offset: number): ParseResult {
  const raw = err instanceof Error ? err.message : String(err)
  const charMatch = /\(char (\d+)\)/.exec(raw)
  // mathjs reports 1-based character positions.
  const index = charMatch ? Math.max(0, Number(charMatch[1]) - 1) : undefined
  const position = index === undefined ? undefined : offset + index

  if (/Unexpected end of expression/i.test(raw)) {
    const last = body.trimEnd().slice(-1)
    return fail(
      'syntax',
      /[+\-*/^,(]/.test(last)
        ? `Expression ends unexpectedly after ${last}.`
        : 'Expression ends unexpectedly.',
      position,
    )
  }
  if (/Parenthesis \) expected/i.test(raw)) {
    return fail('unbalanced-parens', 'Missing closing bracket ).', position)
  }
  const part = /Unexpected (?:part|operator) "?([^"\s]+)"?/.exec(raw)
  if (part) return fail('syntax', fallbackMessage(part[1]), position)
  const token = index === undefined ? undefined : body.slice(index).split(' ')[0]
  return fail('syntax', fallbackMessage(token), position)
}

/**
 * Parse an expression such as `y = 2x + 1`, `f(x) = a sin(x)` or `sqrt(x)` into
 * a compiled, sandboxed evaluator. Never throws.
 */
export function parseExpression(input: string): ParseResult {
  try {
    return parseUnsafe(input)
  } catch (err) {
    if (err instanceof ExpressionSyntaxError) return { ok: false, error: err.toExpressionError() }
    return fail('syntax', fallbackMessage())
  }
}

function parseUnsafe(input: string): ParseResult {
  if (input.trim() === '') return fail('empty', 'Type an expression, e.g. y = x^2')

  const powIndex = input.indexOf('**')
  if (powIndex !== -1) return fail('syntax', 'Use ^ for powers, e.g. 2^x.', powIndex)

  const charError = checkCharacters(input)
  if (charError) return charError

  const firstEq = input.indexOf('=')
  if (firstEq !== -1 && input.indexOf('=', firstEq + 1) !== -1) {
    return fail('multiple-equals', fallbackMessage('='), input.indexOf('=', firstEq + 1))
  }

  let form: ExpressionForm = 'bare'
  let name: string | undefined
  let rhsRaw = input
  let rhsOffset = 0

  if (firstEq !== -1) {
    let lhsRaw = input.slice(0, firstEq)
    rhsRaw = input.slice(firstEq + 1)
    rhsOffset = firstEq + 1
    let lhsOffset = 0

    // Accept the mirrored form "… = y".
    if (normalise(rhsRaw) === 'y' && normalise(lhsRaw) !== 'y') {
      ;[lhsRaw, rhsRaw] = [rhsRaw, lhsRaw]
      ;[lhsOffset, rhsOffset] = [rhsOffset, lhsOffset]
    }

    const lhs = normalise(lhsRaw)
    if (lhs === '') return fail('empty-lhs', ONLY_Y_SUPPORTED, firstEq)
    if (normalise(rhsRaw) === '') {
      return fail('empty-rhs', 'Nothing after =. Type an expression, e.g. y = 2x + 1.', firstEq)
    }
    const lhsParens = checkParens(lhsRaw, lhsOffset)
    if (lhsParens) return lhsParens
    const classified = classifyLhs(lhs, normalise(rhsRaw), lhsOffset)
    if ('ok' in classified) return classified
    form = classified.form
    name = classified.name
  }

  const parenError = checkParens(rhsRaw, rhsOffset)
  if (parenError) return parenError

  const body = normalise(rhsRaw)
  let ast
  try {
    ast = parseToAst(body)
  } catch (err) {
    // Map positions in `body` back to the input (normalisation trims leading whitespace).
    const leading = rhsRaw.length - rhsRaw.trimStart().length
    return friendlyParseError(err, body, rhsOffset + leading)
  }

  const { fn, parameters } = compileAst(ast)

  const evaluate = (x: number, params: Params = NO_PARAMS): number => {
    const y = fn(x, params)
    return Number.isFinite(y) ? y : NaN
  }

  const expression: CompiledExpression = { source: input, body, form, parameters, evaluate }
  if (name !== undefined) expression.name = name
  return { ok: true, expression }
}
