/**
 * Expression errors and their microcopy (UX-SPEC §3.1).
 *
 * Messages are built as segment arrays: plain text plus *tokens* (code spans).
 * - `message` is the plain-text form: tokens wrapped in straight double quotes,
 *   e.g. `Missing closing bracket ")".` (tests, `title`, logs).
 * - `parts` is for rendering: tokens as <code>, single symbols with a spoken name.
 * - `partsToSpeech` gives the live-region form, e.g. "Missing closing bracket."
 */
export type ExpressionErrorCode =
  | 'empty'
  | 'empty-rhs'
  | 'empty-lhs'
  | 'invalid-character'
  | 'unbalanced-parens'
  | 'invalid-lhs'
  | 'multiple-equals'
  | 'unknown-function'
  | 'wrong-arg-count'
  | 'missing-parens'
  | 'unsupported-syntax'
  | 'uses-y'
  | 'self-reference'
  | 'too-long'
  | 'syntax'

/** Plain text, or a token shown as code. `spoken` is the screen-reader name of a symbol token. */
export type ErrorPart = { text: string } | { code: string; spoken?: string }

export interface ExpressionError {
  code: ExpressionErrorCode
  /** Plain-text message (tokens in straight double quotes), safe to show anywhere. */
  message: string
  /** Structured message for rich rendering (see ErrorText). */
  parts: ErrorPart[]
  /** 0-based index into the original input, when known. */
  position?: number
}

// ---- Tokens and spoken names -----------------------------------------------------

/** UX-SPEC §3.1 spoken names for single-symbol tokens. */
export const SYMBOL_NAMES: Readonly<Record<string, string>> = {
  '(': 'opening bracket',
  ')': 'closing bracket',
  '=': 'equals sign',
  '+': 'plus sign',
  '-': 'minus sign',
  '*': 'star',
  '/': 'slash',
  '^': 'caret',
  ',': 'comma',
  '**': 'double star',
}

/** Spoken name for a symbol token; undefined for words and expressions (read as written). */
export function spokenName(token: string): string | undefined {
  if (Object.hasOwn(SYMBOL_NAMES, token)) return SYMBOL_NAMES[token]
  const chars = Array.from(token)
  if (chars.length === 1 && !/[\p{L}\p{N}\s]/u.test(token)) return `symbol ${token}`
  return undefined
}

export const isToken = (p: ErrorPart): p is { code: string; spoken?: string } => 'code' in p

/** A token part, with its spoken name when it is a symbol. */
export function token(code: string): ErrorPart {
  const spoken = spokenName(code)
  return spoken === undefined ? { code } : { code, spoken }
}

/**
 * Build parts from a template: literal text becomes text parts, and every
 * interpolated value becomes a token. m`Use ${'^'} for powers.`
 */
export function m(strings: TemplateStringsArray, ...tokens: string[]): ErrorPart[] {
  const parts: ErrorPart[] = []
  strings.forEach((s, i) => {
    if (s) parts.push({ text: s })
    if (i < tokens.length) parts.push(token(tokens[i]))
  })
  return parts
}

/** Plain-text form: tokens wrapped in straight double quotes. */
export function partsToText(parts: readonly ErrorPart[]): string {
  return parts.map((p) => (isToken(p) ? `"${p.code}"` : p.text)).join('')
}

const normaliseWords = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * True when the spoken name of token `i` just repeats the preceding words, as in
 * "Missing closing bracket )": a screen reader should then say it only once.
 */
export function isRedundantSpoken(parts: readonly ErrorPart[], i: number): boolean {
  const p = parts[i]
  if (!p || !isToken(p) || !p.spoken) return false
  const before = normaliseWords(
    parts
      .slice(0, i)
      .map((q) => (isToken(q) ? (q.spoken ?? q.code) : q.text))
      .join(''),
  )
  const name = normaliseWords(p.spoken)
  return before === name || before.endsWith(` ${name}`)
}

/** Spoken form for the live region: symbol tokens by name, no quotes, no repeats. */
export function partsToSpeech(parts: readonly ErrorPart[]): string {
  return parts
    .map((p, i) => {
      if (!isToken(p)) return p.text
      if (isRedundantSpoken(parts, i)) return ''
      return p.spoken ?? p.code
    })
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,:;?!])/g, '$1')
    .trim()
}

export function makeError(code: ExpressionErrorCode, parts: ErrorPart[], position?: number): ExpressionError {
  const message = partsToText(parts)
  return position === undefined ? { code, message, parts } : { code, message, parts, position }
}

// ---- Microcopy (UX-SPEC §3.1) ------------------------------------------------------

const fmt4 = (v: number) => String(Number(v.toPrecision(4)))

export const messages = {
  missingClosingBracket: () => m`Missing closing bracket ${')'}.`,
  unexpectedClosingBracket: () => m`Unexpected ${')'} - there are more closing brackets than opening ones.`,
  nothingAfterEquals: () => m`Nothing after ${'='}. Type an expression, e.g. ${'y = 2x + 1'}.`,
  unknownFunction: (name: string) =>
    m`Unknown function ${name}. Try ${'sin'}, ${'cos'}, ${'tan'}, ${'sqrt'}, ${'abs'}, ${'ln'}, ${'log'} or ${'exp'}.`,
  didYouMean: (name: string, suggestion: string) => m`Unknown function ${name}. Did you mean ${suggestion}?`,
  addBrackets: (fn: string, arg = 'x') => m`Add brackets: ${`${fn}(${arg})`}.`,
  addBracketsPower: (fn: string, arg: string, exp: string, ambiguous: boolean) =>
    ambiguous
      ? m`Add brackets: ${`${fn}(${arg})^${exp}`} or ${`${fn}(${arg}^${exp})`}.`
      : m`Add brackets: ${`${fn}(${arg})^${exp}`}.`,
  endsAfter: (op: string) => m`Expression ends unexpectedly after ${op}.`,
  endsUnexpectedly: () => m`Expression ends unexpectedly.`,
  onlyYOrF: () => m`Only ${'y'} or ${'f(x)'} equations can be graphed, e.g. ${'y = 3x'} or ${'f(x) = 3x'}.`,
  sliderHint: (letter: string) =>
    m`To make a slider, just use ${letter} in an expression, e.g. ${`y = ${letter}*sin(x)`}.`,
  constantAssignment: (name: string, value: number): ErrorPart[] => [
    token(name),
    { text: ` is a constant (about ${fmt4(value)}), so it can't be set. Use another letter for a slider, e.g. ` },
    token('a'),
    { text: '.' },
  ],
  builtInName: (name: string) => m`${name} is built in. Use another name, e.g. ${'f(x) = 3x'}.`,
  needsValue: (name: string) => m`${name} needs a value, e.g. ${`${name}(x)`}.`,
  arity: (name: string, min: number, max: number) => {
    const plural = (n: number) => (n === 1 ? 'value' : 'values')
    if (min === max) return [token(name), { text: ` needs ${min} ${plural(min)}.` }]
    if (max === Infinity) return [token(name), { text: ` needs at least ${min} ${plural(min)}.` }]
    return [token(name), { text: ` needs ${min} or ${max} values.` }]
  },
  cantAppearOnRight: (name: string) => m`${name} can't appear on the right-hand side.`,
  useCaret: () => m`Use ${'^'} for powers, e.g. ${'2^x'}.`,
  empty: () => m`Type an expression, e.g. ${'y = x^2'}`,
  tooLong: (max: number): ErrorPart[] => [{ text: `This expression is too long. Keep it under ${max} characters.` }],
  tooComplex: () => m`This expression is too complex to graph. Try splitting it up.`,
  fallback: (near?: string) => {
    const t = near?.trim()
    return t
      ? m`Couldn't understand this expression. Check for typos near ${t}.`
      : m`Couldn't understand this expression.`
  },
} satisfies Record<string, (...args: never[]) => ErrorPart[]>

/** The catch-all message from UX-SPEC §3.1, plain text (kept for compatibility). */
export function fallbackMessage(near?: string): string {
  return partsToText(messages.fallback(near))
}

/** Internal exception used to bail out of compilation with a friendly error. */
export class ExpressionSyntaxError extends Error {
  readonly code: ExpressionErrorCode
  readonly parts: ErrorPart[]
  readonly position?: number

  constructor(code: ExpressionErrorCode, parts: ErrorPart[], position?: number) {
    super(partsToText(parts))
    this.name = 'ExpressionSyntaxError'
    this.code = code
    this.parts = parts
    this.position = position
  }

  toExpressionError(): ExpressionError {
    return makeError(this.code, this.parts, this.position)
  }
}
