import { describe, expect, it } from 'vitest'
import { parseExpression, type CompiledExpression, type ParseResult } from './index'

function ok(input: string): CompiledExpression {
  const result = parseExpression(input)
  if (!result.ok) throw new Error(`Expected "${input}" to parse, got: ${result.error.message}`)
  return result.expression
}

function err(input: string) {
  const result: ParseResult = parseExpression(input)
  if (result.ok) throw new Error(`Expected "${input}" to fail`)
  return result.error
}

const at = (input: string, x: number, params?: Record<string, number>) =>
  ok(input).evaluate(x, params)

describe('parseExpression: accepted forms', () => {
  it.each([
    ['y = x^2', 'equation'],
    ['y=x^2', 'equation'],
    ['x^2', 'bare'],
    ['f(x) = x^2', 'function'],
    ['g( x ) = x^2', 'function'],
    ['x^2 = y', 'equation'],
  ] as const)('%s -> %s', (input, form) => {
    const e = ok(input)
    expect(e.form).toBe(form)
    expect(e.evaluate(3)).toBe(9)
  })

  it('records the function name for f(x) = …', () => {
    expect(ok('f(x) = x').name).toBe('f')
    expect(ok('y = x').name).toBeUndefined()
  })

  it('keeps the source and the normalised body', () => {
    const e = ok('  y =  2 π x ')
    expect(e.source).toBe('  y =  2 π x ')
    expect(e.body).toBe('2 pi x')
  })

  it('supports constant functions', () => {
    expect(at('y = 3', 100)).toBe(3)
  })
})

describe('parseExpression: arithmetic and implicit multiplication', () => {
  it.each([
    ['2x', 5, 10],
    ['3sin(x)', Math.PI / 2, 3],
    ['2pi', 0, 2 * Math.PI],
    ['2π', 0, 2 * Math.PI],
    ['x(x+1)', 2, 6],
    ['(x+1)(x-1)', 3, 8],
    ['2(x+1)', 1, 4],
    ['xsin(x)', Math.PI / 2, Math.PI / 2],
    ['pix', 2, 2 * Math.PI],
    ['2ex', 1, 2 * Math.E],
    ['-x^2', 3, -9],
    ['e^-x', 0, 1],
    ['2^3^2', 0, 512],
    ['x²', 4, 16],
    ['x³', 2, 8],
    ['6 ÷ 2 × x', 3, 9],
    ['3 − x', 1, 2],
    ['1e3 x', 2, 2000],
    ['+x', 4, 4],
  ])('%s at x=%d is %d', (input, x, expected) => {
    expect(at(input, x)).toBeCloseTo(expected, 12)
  })
})

describe('parseExpression: constants and functions', () => {
  it.each([
    ['pi', 0, Math.PI],
    ['e', 0, Math.E],
    ['tau', 0, 2 * Math.PI],
    ['sin(x)', Math.PI / 6, 0.5],
    ['cos(x)', 0, 1],
    ['tan(x)', Math.PI / 4, 1],
    ['sec(x)', 0, 1],
    ['csc(x)', Math.PI / 2, 1],
    ['cot(x)', Math.PI / 4, 1],
    ['asin(x)', 1, Math.PI / 2],
    ['arcsin(x)', 1, Math.PI / 2],
    ['acos(x)', 1, 0],
    ['arccos(x)', 0, Math.PI / 2],
    ['atan(x)', 1, Math.PI / 4],
    ['arctan(x)', 1, Math.PI / 4],
    ['sinh(x)', 0, 0],
    ['cosh(x)', 0, 1],
    ['tanh(x)', 0, 0],
    ['ln(x)', Math.E, 1],
    ['log(x)', 1000, 3],
    ['log(x, 2)', 8, 3],
    ['log10(x)', 100, 2],
    ['log2(x)', 8, 3],
    ['sqrt(x)', 9, 3],
    ['cbrt(x)', -8, -2],
    ['nthRoot(x, 3)', -27, -3],
    ['abs(x)', -4, 4],
    ['exp(x)', 1, Math.E],
    ['floor(x)', 1.7, 1],
    ['ceil(x)', 1.2, 2],
    ['round(x)', 1.5, 2],
    ['sign(x)', -3, -1],
    ['min(x, 2)', 5, 2],
    ['max(x, 2, 7)', 5, 7],
    ['mod(x, 3)', -1, 2],
    ['atan2(1, x)', 1, Math.PI / 4],
  ])('%s at x=%d', (input, x, expected) => {
    expect(at(input, x)).toBeCloseTo(expected, 12)
  })
})

describe('parseExpression: parameters', () => {
  it('detects free parameters, sorted and de-duplicated', () => {
    expect(ok('y = b x + a sin(c x) + a').parameters).toEqual(['a', 'b', 'c'])
  })

  it('does not report x, constants or functions as parameters', () => {
    expect(ok('y = pi e sin(x) sqrt(x) tau').parameters).toEqual([])
  })

  it('splits multi-letter tokens into single-letter parameters', () => {
    const e = ok('ax + bc')
    expect(e.parameters).toEqual(['a', 'b', 'c'])
    expect(e.evaluate(2, { a: 3, b: 4, c: 5 })).toBe(26)
  })

  it('treats a letter before brackets as multiplication', () => {
    const e = ok('a(x+1)')
    expect(e.parameters).toEqual(['a'])
    expect(e.evaluate(1, { a: 3 })).toBe(6)
  })

  it('evaluates with parameter values', () => {
    expect(at('a*sin(x)', Math.PI / 2, { a: 2 })).toBe(2)
    expect(at('bcos(x)', 0, { b: 4 })).toBe(4)
  })

  it('returns NaN when a parameter is missing', () => {
    expect(at('a*x', 1)).toBeNaN()
  })

  it('supports Greek letters as parameters', () => {
    const e = ok('αx')
    expect(e.parameters).toEqual(['α'])
    expect(e.evaluate(2, { α: 3 })).toBe(6)
  })
})

describe('parseExpression: non-finite results become NaN gaps', () => {
  it.each([
    ['sqrt(x)', -1],
    ['1/x', 0],
    ['ln(x)', 0],
    ['ln(x)', -1],
    ['log(x)', -5],
    ['asin(x)', 2],
    ['x^0.5', -4],
    ['exp(x)', 1000],
    ['Infinity', 0],
  ])('%s at x=%d is NaN', (input, x) => {
    expect(at(input, x)).toBeNaN()
  })

  it('returns finite values unchanged', () => {
    expect(at('1/x', 2)).toBe(0.5)
  })
})

describe('parseExpression: error messages (UX-SPEC §3.1)', () => {
  it.each([
    ['sin(', 'Missing closing bracket ).'],
    ['sin(x))', 'Unexpected ) — there are more closing brackets than opening ones.'],
    ['y =', 'Nothing after =. Type an expression, e.g. y = 2x + 1.'],
    ['foo(x)', 'Unknown function "foo". Try sin, cos, tan, sqrt, abs, ln, log or exp.'],
    ['2 +', 'Expression ends unexpectedly after +.'],
    ['x = 3', 'Only y = … is supported. Write it as y = … or just the expression.'],
    ['z = x', 'Only y = … is supported. Write it as y = … or just the expression.'],
    ['sqrt()', 'sqrt needs a value, e.g. sqrt(x).'],
    ['y = y + 1', "y can't appear on the right-hand side."],
    ['2 ** x', 'Use ^ for powers, e.g. 2^x.'],
    [
      'a = 5',
      'Only y = … is supported. To make a slider, just use a in an expression, e.g. a·sin(x).',
    ],
  ])('%s', (input, message) => {
    expect(err(input).message).toBe(message)
  })

  it.each([
    ['x $ 2', '$'],
    ['x & 2', '&'],
    ['|x|', '|'],
    ['x!', '!'],
    ['"abc"', '"'],
    ['[1, 2]', '['],
    ['2..3', '.3'],
    ['2 3', '3'],
    ['sin x', 'sin'],
    ['y = x = 2', '='],
    ['x mod 2', 'mod'],
    ['true', 'true'],
    ['x.y', 'x.y'],
    ['k2', 'k2'],
  ])('%s falls back to "check for typos near %s"', (input, token) => {
    expect(err(input).message).toBe(
      `Couldn't understand this expression. Check for typos near "${token}".`,
    )
  })

  it('uses stable error codes', () => {
    expect(err('').code).toBe('empty')
    expect(err('   ').code).toBe('empty')
    expect(err('y =').code).toBe('empty-rhs')
    expect(err('= x').code).toBe('empty-lhs')
    expect(err('sin(x').code).toBe('unbalanced-parens')
    expect(err('x)').code).toBe('unbalanced-parens')
    expect(err('foo(x)').code).toBe('unknown-function')
    expect(err('x # 1').code).toBe('invalid-character')
    expect(err('log(1, 2, 3)').code).toBe('wrong-arg-count')
    expect(err('y = y').code).toBe('uses-y')
    expect(err('f(t) = t').code).toBe('invalid-lhs')
  })

  it('reports 0-based positions into the original input', () => {
    expect(err('x + $').position).toBe(4)
    expect(err('y = (x + 1').position).toBe(4)
    expect(err('y = x)').position).toBe(5)
  })

  it('never throws on arbitrary junk', () => {
    const junk = ['((((', '))))', '^^^', '=', '==', '.', ',', 'x,,', '()', '(,)', 'sin(cos(', '\n\n', '_']
    for (const input of junk) {
      expect(() => parseExpression(input)).not.toThrow()
      expect(parseExpression(input).ok).toBe(false)
    }
  })

  it('gives arity errors for wrong argument counts', () => {
    expect(err('log(1, 2, 3)').message).toBe('log needs 1 or 2 values.')
    expect(err('atan2(x)').message).toBe('atan2 needs 2 values.')
  })
})

describe('parseExpression: security', () => {
  it.each([
    'import({}, {})',
    'createUnit("foo")',
    'evaluate("1+1")',
    'parse("x")',
    'simplify("x")',
    'derivative("x^2", "x")',
    'resolve(x)',
    'compile("x")',
    'f(x) = x; g(x) = 2',
    'a = 1; a',
    'x.constructor',
    'cos.constructor("return 1")()',
    '[1,2,3]',
    'matrix([1])',
    '1 cm to inch',
  ])('rejects %s', (input) => {
    const result = parseExpression(input)
    expect(result.ok).toBe(false)
  })

  it('does not expose prototype properties as functions or parameters', () => {
    for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      const result = parseExpression(`${name}(x)`)
      expect(result.ok).toBe(false)
    }
  })

})
