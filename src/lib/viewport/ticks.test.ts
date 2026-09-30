import { describe, expect, it } from 'vitest'
import { generateTicks, niceStep, tickStepForPixels, tickValues } from './ticks'

describe('niceStep', () => {
  it.each([
    [1, 1],
    [0.9, 1],
    [1.5, 2],
    [3, 2],
    [4, 5],
    [7, 5],
    [8, 10],
    [0.013, 0.01],
    [0.3, 0.2],
    [0.04, 0.05],
    [250, 200],
    [4e-7, 5e-7],
    [3.3e8, 5e8],
  ])('%d -> %d', (raw, expected) => {
    expect(niceStep(raw).step).toBe(expected)
  })

  it('always returns 1, 2 or 5 × 10^n', () => {
    for (let raw = 1e-9; raw < 1e9; raw *= 1.37) {
      const { step, mantissa, exponent } = niceStep(raw)
      expect([1, 2, 5]).toContain(mantissa)
      expect(step).toBeCloseTo(mantissa * 10 ** exponent, 20)
      // Nearest in log space, so within a factor of sqrt(2.5) of the raw step.
      expect(step / raw).toBeLessThan(1.59)
      expect(raw / step).toBeLessThan(1.59)
    }
  })

  it('handles invalid input', () => {
    expect(niceStep(0).step).toBe(1)
    expect(niceStep(-1).step).toBe(1)
    expect(niceStep(NaN).step).toBe(1)
  })
})

describe('tickStepForPixels', () => {
  it('aims for ~100px between ticks', () => {
    expect(tickStepForPixels(20, 800).step).toBe(2) // 2 units = 80px
    expect(tickStepForPixels(20, 2000).step).toBe(1) // 1 unit = 100px
    expect(tickStepForPixels(1, 1000).step).toBe(0.1)
  })
})

describe('tickValues', () => {
  it('returns multiples of the step within the range, inclusive', () => {
    expect(tickValues(-10, 10, niceStep(5))).toEqual([-10, -5, 0, 5, 10])
    expect(tickValues(0.5, 3.5, niceStep(1))).toEqual([1, 2, 3])
  })

  it('has no floating-point noise', () => {
    const values = tickValues(0, 1, niceStep(0.1))
    expect(values).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1])
    const small = tickValues(-0.0006, 0.0006, niceStep(0.0002))
    expect(small).toEqual([-0.0006, -0.0004, -0.0002, 0, 0.0002, 0.0004, 0.0006])
  })

  it('never produces -0', () => {
    for (const v of tickValues(-1, 1, niceStep(0.5))) expect(Object.is(v, -0)).toBe(false)
  })

  it('returns [] for invalid ranges or absurd tick counts', () => {
    expect(tickValues(1, 0, niceStep(1))).toEqual([])
    expect(tickValues(NaN, 1, niceStep(1))).toEqual([])
    expect(tickValues(0, 1e9, niceStep(1))).toEqual([])
  })
})

describe('generateTicks', () => {
  it('produces labelled major ticks and minor gridlines at step/5', () => {
    const t = generateTicks(-10, 10, 800)
    expect(t.step).toBe(2)
    expect(t.minorStep).toBe(0.4)
    expect(t.major.map((m) => m.label)).toEqual([
      '-10', '-8', '-6', '-4', '-2', '0', '2', '4', '6', '8', '10',
    ])
    // Minor lines exclude positions that coincide with major ticks.
    expect(t.minor).toContain(0.4)
    expect(t.minor).toContain(-9.6)
    expect(t.minor).not.toContain(2)
    expect(t.minor).toHaveLength(50 - 10)
  })

  it('labels decimal steps cleanly', () => {
    const t = generateTicks(0, 1, 1000)
    expect(t.step).toBe(0.1)
    expect(t.major.map((m) => m.label)).toEqual([
      '0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1.0',
    ])
  })

  it('uses scientific labels for huge and tiny ranges', () => {
    const big = generateTicks(0, 1e7, 1000)
    expect(big.major.find((m) => m.value === 5e6)?.label).toBe('5e6')
    const tiny = generateTicks(0, 1e-5, 1000)
    expect(tiny.major.find((m) => m.value === 5e-6)?.label).toBe('5e-6')
  })

  it('works when the range does not include zero', () => {
    const t = generateTicks(1000, 1001, 1000)
    expect(t.step).toBe(0.1)
    expect(t.major[0].label).toBe('1000.0')
    expect(t.major[3].label).toBe('1000.3')
  })
})
