import { describe, expect, it } from 'vitest'
import {
  ExpressionSyntaxError,
  fallbackMessage,
  isRedundantSpoken,
  m,
  makeError,
  messages,
  partsToSpeech,
  partsToText,
  spokenName,
  SYMBOL_NAMES,
  token,
  type ErrorPart,
} from './errors'
import { parseExpression } from './parseExpression'

const err = (input: string) => {
  const r = parseExpression(input)
  if (r.ok) throw new Error(`expected "${input}" to fail`)
  return r.error
}

describe('spokenName (UX-SPEC §3.1)', () => {
  it.each(Object.entries(SYMBOL_NAMES))('%s is read as %s', (sym, name) => {
    expect(spokenName(sym)).toBe(name)
  })
  it('covers every symbol in the spec', () => {
    expect(SYMBOL_NAMES).toEqual({
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
    })
  })
  it('reads other single symbols as "symbol" plus the character', () => {
    expect(spokenName('$')).toBe('symbol $')
    expect(spokenName('|')).toBe('symbol |')
  })
  it('reads words and expressions as written', () => {
    for (const t of ['sin', 'a', 'y = 2x + 1', '3', '.3', 'x.y']) expect(spokenName(t)).toBeUndefined()
  })
})

describe('parts helpers', () => {
  it('m`` turns interpolations into tokens', () => {
    expect(m`Use ${'^'} for powers, e.g. ${'2^x'}.`).toEqual([
      { text: 'Use ' },
      { code: '^', spoken: 'caret' },
      { text: ' for powers, e.g. ' },
      { code: '2^x' },
      { text: '.' },
    ])
    expect(m`${'a'}`).toEqual([{ code: 'a' }])
    expect(token(')')).toEqual({ code: ')', spoken: 'closing bracket' })
  })

  it('plain text wraps tokens in straight double quotes', () => {
    expect(partsToText(messages.missingClosingBracket())).toBe('Missing closing bracket ")".')
    expect(partsToText([{ text: 'a' }])).toBe('a')
  })

  it('speech uses spoken names, drops quotes and repeats, and tidies spacing', () => {
    expect(partsToSpeech(messages.missingClosingBracket())).toBe('Missing closing bracket.')
    expect(partsToSpeech(messages.endsAfter('+'))).toBe('Expression ends unexpectedly after plus sign.')
    expect(partsToSpeech(messages.unknownFunction('foo'))).toBe(
      'Unknown function foo. Try sin, cos, tan, sqrt, abs, ln, log or exp.',
    )
  })

  it('isRedundantSpoken only flags names the preceding words already say', () => {
    const p: ErrorPart[] = messages.missingClosingBracket()
    expect(isRedundantSpoken(p, 1)).toBe(true)
    expect(isRedundantSpoken(messages.unexpectedClosingBracket(), 1)).toBe(false)
    expect(isRedundantSpoken(p, 0)).toBe(false)
    expect(isRedundantSpoken(p, 99)).toBe(false)
  })

  it('makeError keeps message and parts in sync, with an optional position', () => {
    const e = makeError('syntax', messages.useCaret(), 3)
    expect(e).toEqual({ code: 'syntax', message: 'Use "^" for powers, e.g. "2^x".', parts: messages.useCaret(), position: 3 })
    expect('position' in makeError('syntax', messages.useCaret())).toBe(false)
  })

  it('ExpressionSyntaxError carries parts and a plain-text message', () => {
    const ex = new ExpressionSyntaxError('uses-y', messages.cantAppearOnRight('y'))
    expect(ex.message).toBe('"y" can\'t appear on the right-hand side.')
    expect(ex.toExpressionError().parts).toEqual(messages.cantAppearOnRight('y'))
  })

  it('fallbackMessage stays a plain string', () => {
    expect(fallbackMessage('k2')).toBe('Couldn\'t understand this expression. Check for typos near "k2".')
    expect(fallbackMessage()).toBe("Couldn't understand this expression.")
  })
})

describe('every parse error has parts matching its message', () => {
  const inputs = [
    'sin(', 'sin(x))', 'y =', 'f(x) =', 'foo(x)', 'SIN(x)', 'sin x', '2 +', 'x = 3', 'z = x', 'a = 5', 'e = 5',
    'sqrt()', 'y = y + 1', '2 ** x', 'x $ 2', '', 'log(1, 2, 3)', 'sin(x) = x', 'x'.repeat(600),
  ]
  it.each(inputs.map((i) => [i]))('%s', (input) => {
    const e = err(input)
    expect(e.parts.length).toBeGreaterThan(0)
    expect(partsToText(e.parts)).toBe(e.message)
    // Only characters a user can type: no ellipsis, middle dot, curly quotes or em dash.
    expect(e.message).not.toMatch(/[…·“”‘’—]/)
  })
})

describe('§3.1 table, as parts', () => {
  it.each([
    ['sin(', [{ text: 'Missing closing bracket ' }, { code: ')', spoken: 'closing bracket' }, { text: '.' }]],
    [
      'x = 3',
      [
        { text: 'Only ' },
        { code: 'y' },
        { text: ' or ' },
        { code: 'f(x)' },
        { text: ' equations can be graphed, e.g. ' },
        { code: 'y = 3x' },
        { text: ' or ' },
        { code: 'f(x) = 3x' },
        { text: '.' },
      ],
    ],
    [
      'a = 5',
      [
        { text: 'To make a slider, just use ' },
        { code: 'a' },
        { text: ' in an expression, e.g. ' },
        { code: 'y = a*sin(x)' },
        { text: '.' },
      ],
    ],
    ['sin x', [{ text: 'Add brackets: ' }, { code: 'sin(x)' }, { text: '.' }]],
  ])('%s', (input, parts) => {
    expect(err(input).parts).toEqual(parts)
  })
})
