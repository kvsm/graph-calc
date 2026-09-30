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

describe('generateTicks at checklist #27 spans and zoom limits (test-gaps D18)', () => {
  const labels = (t: ReturnType<typeof generateTicks>) => t.major.map((m) => m.label)
  it('span 10000', () => {
    const t = generateTicks(-5000, 5000, 800)
    expect(t.step).toBe(1000)
    expect(labels(t)[0]).toBe('-5000')
    expect(labels(t).at(-1)).toBe('5000')
    expect(labels(t)).toContain('0')
  })
  it('span 0.001', () => {
    const t = generateTicks(-0.0005, 0.0005, 800)
    expect(t.step).toBe(1e-4)
    expect(labels(t)).toEqual([
      '-0.0005', '-0.0004', '-0.0003', '-0.0002', '-0.0001', '0',
      '0.0001', '0.0002', '0.0003', '0.0004', '0.0005',
    ])
  })
  it('MIN_SPAN (1e-6) uses scientific labels', () => {
    const t = generateTicks(-5e-7, 5e-7, 800)
    expect(t.step).toBe(1e-7)
    expect(labels(t)[0]).toBe('-5e-7')
    expect(labels(t).at(-1)).toBe('5e-7')
    expect(labels(t)).toContain('0')
    expect(new Set(labels(t)).size).toBe(labels(t).length)
  })
  it('MAX_SPAN (1e6)', () => {
    const t = generateTicks(-5e5, 5e5, 800)
    expect(t.step).toBe(1e5)
    expect(labels(t)[0]).toBe('-500000')
    expect(labels(t).at(-1)).toBe('500000')
    expect(new Set(labels(t)).size).toBe(labels(t).length)
  })
})

describe('tick spacing property (test-gaps D20)', () => {
  const spans: number[] = []
  for (let e = -6; e <= 6; e++) for (const m of [1, 1.7, 3.3, 6.1]) spans.push(m * 10 ** e)
  const widths = [320, 375, 640, 800, 1024, 1280, 1920, 2560]

  it('keeps major spacing within the log-nearest band [~63, ~158] px', () => {
    for (const span of spans) {
      for (const px of widths) {
        const t = generateTicks(-span / 2 + 0.123 * span, span / 2 + 0.123 * span, px)
        const spacing = (t.step * px) / span
        expect(spacing, `span ${span} px ${px}`).toBeGreaterThanOrEqual(63)
        expect(spacing, `span ${span} px ${px}`).toBeLessThanOrEqual(159)
      }
    }
  })

  it('always yields at least one labelled major tick with distinct labels', () => {
    for (const span of spans) {
      for (const px of widths) {
        const t = generateTicks(1e3 - span / 2, 1e3 + span / 2, px)
        const ls = t.major.map((m) => m.label)
        expect(ls.length, `span ${span} px ${px}`).toBeGreaterThan(0)
        expect(new Set(ls).size, `span ${span} px ${px}`).toBe(ls.length)
      }
    }
  })
})
