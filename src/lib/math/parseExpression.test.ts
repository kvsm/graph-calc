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

describe('parseExpression: bracket-free functions (sinx)', () => {
  // Rule: inside one identifier, a known function name takes the rest of the identifier
  // (up to the next function name) as its argument. Longest function name wins.
  it.each([
    ['sinx', 1, Math.sin(1)],
    ['cosx', 1, Math.cos(1)],
    ['tanx', 1, Math.tan(1)],
    ['lnx', 2, Math.log(2)],
    ['logx', 100, 2],
    ['sqrtx', 9, 3],
    ['expx', 1, Math.E],
    ['absx', -3, 3],
    ['sin2x', 1, Math.sin(2)],
    ['sinpix', 0.5, 1],
    ['xsinx', 2, 2 * Math.sin(2)],
    ['sinxcosx', 1, Math.sin(1) * Math.cos(1)],
    ['2sinx', 1, 2 * Math.sin(1)],
    ['sinhx', 1, Math.sinh(1)],
    ['asinx', 1, Math.PI / 2],
    ['log2x', 8, 3],
    ['sinx + 1', 0, 1],
    ['sinx/2', Math.PI / 2, 0.5],
  ])('%s at x=%d', (input, x, expected) => {
    const e = ok(input)
    expect(e.parameters).toEqual([])
    expect(e.evaluate(x)).toBeCloseTo(expected, 12)
  })

  it('takes parameters inside the argument', () => {
    const e = ok('sinax')
    expect(e.parameters).toEqual(['a'])
    expect(e.evaluate(1, { a: Math.PI / 2 })).toBeCloseTo(1, 12)
  })

  it('still splits plain letter products', () => {
    expect(ok('si').parameters).toEqual(['i', 's'])
    expect(ok('ab').parameters).toEqual(['a', 'b'])
    expect(ok('ae').parameters).toEqual(['a'])
    expect(ok('ex').evaluate(2)).toBeCloseTo(2 * Math.E, 12)
  })

  it.each([
    ['sin x', 'Add brackets: sin(x).'],
    ['3 sin x', 'Add brackets: sin(x).'],
    ['sin', 'Add brackets: sin(x).'],
    ['xsin', 'Add brackets: sin(x).'],
    ['sinx^2', 'Add brackets: sin(x)^2 or sin(x^2).'],
    ['sin2x^2', 'Add brackets: sin(2x)^2 or sin(2x^2).'],
    ['sin^2', 'Add brackets: sin(x)^2.'],
  ])('%s asks for brackets', (input, message) => {
    const e = err(input)
    expect(e.code).toBe('missing-parens')
    expect(e.message).toBe(message)
  })

  it('reports junk inside a bracket-free argument', () => {
    expect(err('sinx2y').message).toBe('Couldn\'t understand this expression. Check for typos near "sinx2y".')
  })
})

describe('parseExpression: left-hand side rules', () => {
  it('never turns the function name into a parameter', () => {
    const e = ok('f(x) = a x')
    expect(e.parameters).toEqual(['a'])
  })

  it.each([
    ['f(x) = y', "y can't appear on the right-hand side."],
    ['f(x) = f(x)', "f can't appear on the right-hand side."],
    ['f(x) = 2f', "f can't appear on the right-hand side."],
    ['g(x) = x + g', "g can't appear on the right-hand side."],
    ['y', "y can't appear on the right-hand side."],
    ['g(y) = y', "Couldn't understand this expression. Check for typos near \"y\"."],
  ])('%s', (input, message) => {
    expect(err(input).message).toBe(message)
  })

  it.each(['e = 3', 'pi = 3', 'tau = 1'])('%s explains that the name is a constant', (input) => {
    const name = input.split(' ')[0]
    expect(err(input).message).toBe(`${name} is a constant, so it can't be changed. Only y = … is supported.`)
  })

  it.each(['a = -5', 'a = 2.5', 'a = 1e3'])('%s gets the slider hint', (input) => {
    expect(err(input).message).toBe(
      'Only y = … is supported. To make a slider, just use a in an expression, e.g. a·sin(x).',
    )
  })

  it('Y = x is not y (case-sensitive)', () => {
    expect(err('Y = x').message).toBe('Only y = … is supported. Write it as y = … or just the expression.')
  })

  it('accepts x = y as the mirrored form of y = x', () => {
    expect(ok('x = y').evaluate(3)).toBe(3)
  })

  it.each(['y=', 'y = ', 'f(x) ='])('%s is empty-rhs', (input) => {
    expect(err(input).code).toBe('empty-rhs')
  })
})

describe('parseExpression: precedence (pinned against mathjs changes)', () => {
  it.each([
    ['2x^2', 3, 18], // 2·(x²)
    ['1/2x', 3, 1.5], // (1/2)·x, mathjs implicit-multiplication precedence
    ['-2^2', 0, -4], // -(2²)
    ['x^-1', 4, 0.25],
    ['2^x^2', 2, 16], // right-associative
    ['sin (x)', Math.PI / 2, 1],
    ['a x', 2, 6],
    ['2e', 0, 2 * Math.E],
    ['2e3', 0, 2000],
    ['1e-3x', 2, 0.002],
  ])('%s at x=%d is %d', (input, x, expected) => {
    expect(at(input, x, { a: 3 })).toBeCloseTo(expected, 12)
  })

  it('x^(1/3) is a gap for negative x (use cbrt)', () => {
    expect(at('x^(1/3)', -8)).toBeNaN()
  })
})

describe('parseExpression: more §3.1 wording', () => {
  it.each(['2 -', '2 *', '2 /', '2 ^', 'x^', 'sin(x) +'])('%s ends unexpectedly', (input) => {
    const op = input.trim().slice(-1)
    expect(err(input).message).toBe(`Expression ends unexpectedly after ${op}.`)
  })

  it.each([
    ['sin()', 'sin needs a value, e.g. sin(x).'],
    ['log()', 'log needs a value, e.g. log(x).'],
    ['ln(x, 2)', 'ln needs 1 value.'],
    ['sin(x, 2)', 'sin needs 1 value.'],
  ])('%s', (input, message) => {
    expect(err(input).message).toBe(message)
  })

  it.each([
    [')(', 'Unexpected ) — there are more closing brackets than opening ones.', 0],
    ['(x))', 'Unexpected ) — there are more closing brackets than opening ones.', 3],
    ['((x)', 'Missing closing bracket ).', 0],
    ['abs(x', 'Missing closing bracket ).', 3],
  ])('%s', (input, message, position) => {
    const e = err(input)
    expect(e.message).toBe(message)
    expect(e.position).toBe(position)
  })

  it('handles stress inputs quickly without throwing', () => {
    const nested = '('.repeat(2000) + 'x' + ')'.repeat(2000)
    const long = Array.from({ length: 5000 }, () => 'x').join('+')
    for (const input of [nested, long]) {
      const t0 = performance.now()
      expect(() => parseExpression(input)).not.toThrow()
      expect(performance.now() - t0).toBeLessThan(250)
    }
  })
})
