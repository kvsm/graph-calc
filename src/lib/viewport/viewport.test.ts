import { describe, expect, it } from 'vitest'
import {
  MAX_SPAN,
  MIN_SPAN,
  canZoom,
  center,
  centerOn,
  defaultViewport,
  fitAspect,
  isValidViewport,
  panByFraction,
  panByPixels,
  panWorld,
  resizeViewport,
  screenToWorld,
  spanX,
  spanY,
  toScreenX,
  toScreenY,
  toWorldX,
  toWorldY,
  unitsPerPixel,
  wheelZoomFactor,
  worldToScreen,
  zoomAt,
  zoomAtWorld,
  zoomCenter,
  type Viewport,
} from './viewport'

const size = { width: 800, height: 600 }
const vp: Viewport = { xMin: -10, xMax: 10, yMin: -7.5, yMax: 7.5 }

function expectViewportClose(a: Viewport, b: Viewport, digits = 9) {
  expect(a.xMin).toBeCloseTo(b.xMin, digits)
  expect(a.xMax).toBeCloseTo(b.xMax, digits)
  expect(a.yMin).toBeCloseTo(b.yMin, digits)
  expect(a.yMax).toBeCloseTo(b.yMax, digits)
}

describe('defaultViewport', () => {
  it('shows x in [-10, 10] with a 1:1 aspect centred on the origin', () => {
    expect(defaultViewport(size)).toEqual(vp)
    const tall = defaultViewport({ width: 400, height: 800 })
    expect(tall).toEqual({ xMin: -10, xMax: 10, yMin: -20, yMax: 20 })
    const upp = unitsPerPixel(tall, { width: 400, height: 800 })
    expect(upp.x).toBeCloseTo(upp.y, 12)
  })

  it('falls back to a square view for a zero size', () => {
    expect(defaultViewport({ width: 0, height: 0 })).toEqual({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 })
  })
})

describe('transforms', () => {
  it('maps corners and the origin', () => {
    expect(worldToScreen(vp, size, { x: -10, y: 7.5 })).toEqual({ x: 0, y: 0 })
    expect(worldToScreen(vp, size, { x: 10, y: -7.5 })).toEqual({ x: 800, y: 600 })
    expect(worldToScreen(vp, size, { x: 0, y: 0 })).toEqual({ x: 400, y: 300 })
  })

  it('y points up in world space and down on screen', () => {
    expect(toScreenY(vp, size, 1)).toBeLessThan(toScreenY(vp, size, 0))
  })

  it('round-trips world -> screen -> world', () => {
    for (const p of [{ x: 1.234, y: -5.6 }, { x: -9.99, y: 7.4 }, { x: 0, y: 0 }]) {
      const back = screenToWorld(vp, size, worldToScreen(vp, size, p))
      expect(back.x).toBeCloseTo(p.x, 12)
      expect(back.y).toBeCloseTo(p.y, 12)
    }
  })

  it('scalar helpers agree with point helpers', () => {
    expect(toScreenX(vp, size, 5)).toBe(600)
    expect(toWorldX(vp, size, 600)).toBe(5)
    expect(toWorldY(vp, size, 0)).toBe(7.5)
  })

  it('computes spans, centre and units per pixel', () => {
    expect(spanX(vp)).toBe(20)
    expect(spanY(vp)).toBe(15)
    expect(center({ xMin: 0, xMax: 4, yMin: 2, yMax: 6 })).toEqual({ x: 2, y: 4 })
    expect(unitsPerPixel(vp, size)).toEqual({ x: 0.025, y: 0.025 })
  })
})

describe('pan', () => {
  it('dragging right/down moves the content right/down', () => {
    const next = panByPixels(vp, size, 40, 40)
    // The world point that was under (400, 300) is now under (440, 340).
    const moved = worldToScreen(next, size, { x: 0, y: 0 })
    expect(moved.x).toBeCloseTo(440, 9)
    expect(moved.y).toBeCloseTo(340, 9)
    expect(spanX(next)).toBeCloseTo(20, 12)
  })

  it('pans by a fraction of the span (arrow keys)', () => {
    expectViewportClose(panByFraction(vp, 0.1, 0), { xMin: -8, xMax: 12, yMin: -7.5, yMax: 7.5 })
    expectViewportClose(panByFraction(vp, 0, -0.5), { xMin: -10, xMax: 10, yMin: -15, yMax: 0 })
  })

  it('pans in world units and recentres', () => {
    expect(panWorld(vp, 1, 2)).toEqual({ xMin: -9, xMax: 11, yMin: -5.5, yMax: 9.5 })
    expectViewportClose(centerOn(vp, { x: 100, y: -3 }), { xMin: 90, xMax: 110, yMin: -10.5, yMax: 4.5 })
  })
})

describe('zoom', () => {
  it('zooms in around the centre', () => {
    expectViewportClose(zoomCenter(vp, 2), { xMin: -5, xMax: 5, yMin: -3.75, yMax: 3.75 })
    expectViewportClose(zoomCenter(vp, 0.5), { xMin: -20, xMax: 20, yMin: -15, yMax: 15 })
  })

  it('keeps the point under the cursor fixed', () => {
    const cursor = { x: 123, y: 456 }
    const before = screenToWorld(vp, size, cursor)
    const next = zoomAt(vp, size, cursor, 1.7)
    const after = screenToWorld(next, size, cursor)
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.y).toBeCloseTo(before.y, 9)
    expect(spanX(next)).toBeCloseTo(20 / 1.7, 9)
  })

  it('preserves the aspect ratio', () => {
    const next = zoomAtWorld(vp, { x: 3, y: 1 }, 3)
    expect(spanX(next) / spanY(next)).toBeCloseTo(spanX(vp) / spanY(vp), 12)
  })

  it('clamps the x-span to [MIN_SPAN, MAX_SPAN]', () => {
    let v = vp
    for (let i = 0; i < 100; i++) v = zoomCenter(v, 2)
    expect(spanX(v)).toBeCloseTo(MIN_SPAN, 15)
    for (let i = 0; i < 100; i++) v = zoomCenter(v, 0.5)
    expect(spanX(v)).toBeCloseTo(MAX_SPAN, 3)
  })

  it('returns the same object and reports canZoom=false at a limit', () => {
    const tiny = { xMin: 0, xMax: MIN_SPAN, yMin: 0, yMax: MIN_SPAN }
    expect(canZoom(tiny, 2)).toBe(false)
    expect(zoomCenter(tiny, 2)).toBe(tiny)
    expect(canZoom(tiny, 0.5)).toBe(true)
    const huge = { xMin: 0, xMax: MAX_SPAN, yMin: 0, yMax: MAX_SPAN }
    expect(canZoom(huge, 0.5)).toBe(false)
    expect(canZoom(huge, 2)).toBe(true)
  })

  it('ignores invalid factors', () => {
    for (const f of [0, -1, 1, NaN, Infinity]) expect(zoomCenter(vp, f)).toBe(vp)
  })

  it('computes the wheel zoom factor with clamping', () => {
    expect(wheelZoomFactor(0)).toBe(1)
    expect(wheelZoomFactor(-100)).toBeCloseTo(1.0015 ** 100, 12)
    expect(wheelZoomFactor(100)).toBeLessThan(1)
    expect(wheelZoomFactor(-10000)).toBe(2)
    expect(wheelZoomFactor(10000)).toBe(0.5)
  })
})

describe('resize and aspect', () => {
  it('keeps centre and scale when the plot is resized', () => {
    const next = resizeViewport(vp, size, { width: 400, height: 600 })
    expectViewportClose(next, { xMin: -5, xMax: 5, yMin: -7.5, yMax: 7.5 })
    expect(unitsPerPixel(next, { width: 400, height: 600 })).toEqual(unitsPerPixel(vp, size))
  })

  it('ignores zero sizes', () => {
    expect(resizeViewport(vp, { width: 0, height: 0 }, size)).toBe(vp)
    expect(fitAspect(vp, { width: 0, height: 10 })).toBe(vp)
  })

  it('fits the y-span for a 1:1 aspect around the current y centre', () => {
    const next = fitAspect({ xMin: 0, xMax: 10, yMin: 4, yMax: 6 }, { width: 100, height: 50 })
    expect(next).toEqual({ xMin: 0, xMax: 10, yMin: 2.5, yMax: 7.5 })
  })
})

describe('isValidViewport', () => {
  it('accepts well-formed viewports', () => {
    expect(isValidViewport(vp)).toBe(true)
  })

  it.each([
    null,
    undefined,
    42,
    'vp',
    {},
    { xMin: 0, xMax: 1, yMin: 0 },
    { xMin: 1, xMax: 0, yMin: 0, yMax: 1 },
    { xMin: 0, xMax: 1, yMin: 0, yMax: 0 },
    { xMin: 0, xMax: NaN, yMin: 0, yMax: 1 },
    { xMin: '0', xMax: 1, yMin: 0, yMax: 1 },
    { xMin: -Number.MAX_VALUE, xMax: Number.MAX_VALUE, yMin: 0, yMax: 1 },
  ])('rejects %j', (value) => {
    expect(isValidViewport(value)).toBe(false)
  })
})
