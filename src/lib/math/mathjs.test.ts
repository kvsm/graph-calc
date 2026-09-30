import { describe, expect, it } from 'vitest'
import { disabledMathjsFunctions, lockedMath, parseToAst } from './mathjs'

describe('locked-down mathjs instance', () => {
  it.each(['import', 'createUnit', 'evaluate', 'parse', 'simplify', 'derivative', 'resolve', 'compile'])(
    '%s is disabled',
    (name) => {
      expect(disabledMathjsFunctions).toContain(name)
      const fn = (lockedMath as unknown as Record<string, () => unknown>)[name]
      expect(fn).toBeTypeOf('function')
      expect(() => fn()).toThrow(/disabled/)
    },
  )

  it('still parses expressions via the captured parser', () => {
    expect(parseToAst('2x + 1').toString()).toBe('2 x + 1')
  })
})
