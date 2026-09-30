import { describe, expect, it } from 'vitest'
import { decimalsForStep, formatNumber, formatPoint, formatTickLabel } from './format'

describe('formatNumber (UX-SPEC §5.3)', () => {
  it.each([
    [3.14159, '3.142'],
    [1000000, '1e6'],
    [0.00001234, '1.234e-5'],
    [2.5, '2.5'],
    [0, '0'],
    [-0, '0'],
    [1, '1'],
    [-1.5, '-1.5'],
    [0.1 + 0.2, '0.3'],
    [123456, '123500'],
    [999999.9, '1e6'],
    [0.0001, '0.0001'],
    [0.00009999, '9.999e-5'],
    [-2.5e-7, '-2.5e-7'],
    [1.23e-7, '1.23e-7'],
    [6.02e23, '6.02e23'],
    [1e-20, '1e-20'],
    [NaN, 'undefined'],
    [Infinity, 'undefined'],
    [-Infinity, 'undefined'],
  ])('%d -> %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected)
  })

  it('supports a custom number of significant figures', () => {
    expect(formatNumber(Math.PI, 6)).toBe('3.14159')
  })

  it('formats points', () => {
    expect(formatPoint(Math.PI / 2, 1)).toBe('(1.571, 1)')
    expect(formatPoint(-0, NaN)).toBe('(0, undefined)')
  })
})

describe('decimalsForStep', () => {
  it.each([
    [1, 0],
    [2, 0],
    [10, 0],
    [0.5, 1],
    [0.2, 1],
    [0.1, 1],
    [0.05, 2],
    [0.001, 3],
    [0, 0],
  ])('%d -> %d', (step, expected) => {
    expect(decimalsForStep(step)).toBe(expected)
  })
})

describe('formatTickLabel', () => {
  it.each([
    [0.30000000000000004, 0.1, '0.3'],
    [0.1 + 0.2, 0.1, '0.3'],
    [-0, 1, '0'],
    [1e-17, 0.1, '0'],
    [-1e-17, 0.1, '0'],
    [5, 1, '5'],
    [-20, 10, '-20'],
    [1.5, 0.5, '1.5'],
    [0.25, 0.05, '0.25'],
    [2, 0.2, '2.0'],
    [5000000, 1000000, '5e6'],
    [1.5e7, 5e6, '1.5e7'],
    [3e-5, 1e-5, '3e-5'],
    [1.2e-5, 2e-6, '1.2e-5'],
    [1000.3, 0.1, '1000.3'],
  ])('%d (step %d) -> %s', (value, step, expected) => {
    expect(formatTickLabel(value, step)).toBe(expected)
  })

  it('returns an empty string for non-finite values', () => {
    expect(formatTickLabel(NaN, 1)).toBe('')
  })
})
