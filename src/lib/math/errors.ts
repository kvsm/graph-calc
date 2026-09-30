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

export interface ExpressionError {
  code: ExpressionErrorCode
  /** Human-readable message, safe to show in the UI. */
  message: string
  /** 0-based index into the original input, when known. */
  position?: number
}

/** The catch-all message from UX-SPEC §3.1. */
export function fallbackMessage(token?: string): string {
  const t = token?.trim()
  return t
    ? `Couldn't understand this expression. Check for typos near "${t}".`
    : "Couldn't understand this expression."
}

/** Internal exception used to bail out of compilation with a friendly error. */
export class ExpressionSyntaxError extends Error {
  readonly code: ExpressionErrorCode
  readonly position?: number

  constructor(code: ExpressionErrorCode, message: string, position?: number) {
    super(message)
    this.name = 'ExpressionSyntaxError'
    this.code = code
    this.position = position
  }

  toExpressionError(): ExpressionError {
    return this.position === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, position: this.position }
  }
}
