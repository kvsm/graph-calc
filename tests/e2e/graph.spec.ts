/// <reference lib="dom" />
// UX-SPEC §1.2, §5 — acceptance checklist items 21–27.
import { type Page } from '@playwright/test'
import {
  PALETTE,
  canvas,
  canvasSize,
  canvasToWorld,
  countColourPixels,
  expect,
  focusGraph,
  graphWrapper,
  liveRegion,
  num,
  openApp,
  parseCoords,
  readViewport,
  setExpression,
  sigFigs,
  spanX,
  spanY,
  test,
  toolbar,
  toolbarButton,
  traceCoords,
  waitForPlot,
  xGridSteps,
  axisPosition,
  sheetTop,
  worldToCanvas,
  worldToPage,
  type Viewport,
} from '../fixtures/app.ts'

const BLUE = PALETTE[0].light
const AXIS_LIGHT = '#525252'

test.use({ colorScheme: 'light' })

test.beforeEach(async ({ page }) => {
  await openApp(page)
  await expect.poll(() => countColourPixels(page, BLUE)).toBeGreaterThan(100)
})

function expectClose(actual: number, expected: number, tol: number, what = 'value') {
  expect(Math.abs(actual - expected), `${what}: ${actual} ≈ ${expected} ± ${tol}`).toBeLessThanOrEqual(tol)
}

async function viewportAfter(page: Page, before: Viewport) {
  await expect.poll(async () => JSON.stringify(await readViewport(page))).not.toBe(JSON.stringify(before))
  return readViewport(page)
}

async function expectDefaultView(page: Page) {
  const vp = await readViewport(page)
  const size = await canvasSize(page)
  expectClose(vp.xMin, -10, 0.01, 'xMin')
  expectClose(vp.xMax, 10, 0.01, 'xMax')
  expectClose(vp.yMin + vp.yMax, 0, 0.02, 'y centred on origin')
  expectClose(spanY(vp) / spanX(vp), size.height / size.width, 0.02, '1:1 aspect')
}

test.describe('#23 toolbar', () => {
  const names = ['Zoom in', 'Zoom out', 'Reset view', 'Switch to dark theme', 'Keyboard shortcuts']

  test('is a vertical toolbar at the top-right with the buttons in spec order', async ({ page }) => {
    const bar = toolbar(page)
    await expect(bar).toHaveAttribute('aria-orientation', 'vertical')
    const buttons = bar.getByRole('button')
    await expect(buttons).toHaveCount(names.length)
    for (const [i, name] of names.entries()) await expect(buttons.nth(i)).toHaveAccessibleName(name)

    const main = await page.getByRole('main').boundingBox()
    const box = await bar.boundingBox()
    if (!main || !box) throw new Error('toolbar/main not visible')
    expect(main.x + main.width - (box.x + box.width)).toBeLessThanOrEqual(24)
    expect(box.y - main.y).toBeLessThanOrEqual(24)
    const boxes = await buttons.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].top).toBeGreaterThan(boxes[i - 1].top)
      expectClose(boxes[i].left, boxes[0].left, 2, 'buttons stacked vertically')
    }
  })

  const tooltips: [string, RegExp][] = [
    ['Zoom in', /Zoom in.*\(\+\)/],
    ['Zoom out', /Zoom out.*\([-−]\)/],
    ['Reset view', /Reset view.*\(0\)/],
    ['Switch to dark theme', /Switch to dark theme/],
    ['Keyboard shortcuts', /Keyboard shortcuts.*\(\?\)/],
  ]
  for (const [name, text] of tooltips) {
    test(`"${name}" has a tooltip with its shortcut`, async ({ page }) => {
      await toolbarButton(page, name).hover()
      await expect(page.getByRole('tooltip')).toHaveText(text)
    })
  }

  test('Zoom in / Zoom out are ×2 / ×0.5 around the centre; Reset view restores the default', async ({ page }) => {
    const start = await readViewport(page)
    await toolbarButton(page, 'Zoom in').click()
    const zin = await viewportAfter(page, start)
    expectClose(spanX(zin), spanX(start) / 2, 0.01, 'span after zoom in')
    expectClose(zin.xMin + zin.xMax, 0, 0.01, 'centre kept')
    await expect(liveRegion(page)).toHaveText(/^Zoomed in\. x from -5 to 5/)
    await toolbarButton(page, 'Zoom out').click()
    await toolbarButton(page, 'Zoom out').click()
    const zout = await readViewport(page)
    expectClose(spanX(zout), spanX(start) * 2, 0.02, 'span after zoom out')
    await toolbarButton(page, 'Reset view').click()
    await expectDefaultView(page)
    await expect(liveRegion(page)).toHaveText('View reset.')
  })

  test('Keyboard shortcuts opens a dialog listing the shortcuts', async ({ page }) => {
    await toolbarButton(page, 'Keyboard shortcuts').click()
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(/tracing/i)
    // UX-17: Shift is described as bigger steps, not pixels.
    await expect(dialog).toContainText(/bigger steps/i)
    await expect(dialog).not.toContainText(/\d+\s*px/)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(toolbarButton(page, 'Keyboard shortcuts')).toBeFocused()
  })

  test('zoom buttons are disabled at the zoom limits', async ({ page }) => {
    await focusGraph(page)
    for (let i = 0; i < 26; i++) await page.keyboard.press('+')
    await expect(toolbarButton(page, 'Zoom in')).toHaveAttribute('aria-disabled', 'true')
    expect(spanX(await readViewport(page))).toBeGreaterThanOrEqual(1e-6 * 0.99)
    await focusGraph(page)
    for (let i = 0; i < 46; i++) await page.keyboard.press('-')
    await expect(toolbarButton(page, 'Zoom out')).toHaveAttribute('aria-disabled', 'true')
    expect(spanX(await readViewport(page))).toBeLessThanOrEqual(1e6 * 1.01)
  })

  for (const [name, key] of [['Zoom in', 'Enter'], ['Zoom out', 'Space']] as const) {
    test(`CR-07 "${name}" keeps keyboard focus when it reaches the zoom limit`, async ({ page }) => {
      const button = toolbarButton(page, name)
      await button.focus()
      for (let i = 0; i < 45; i++) await page.keyboard.press(key)
      // CR-07: aria-disabled (not the disabled attribute), so the button keeps focus.
      await expect(button).toHaveAttribute('aria-disabled', 'true')
      await expect(button).not.toHaveAttribute('disabled', /.*/)
      const active = await page.evaluate(() => {
        const el = document.activeElement
        return {
          body: el === document.body || el === null,
          inToolbar: !!el?.closest('[role="toolbar"]'),
          label: el?.getAttribute('aria-label') ?? el?.tagName ?? '',
        }
      })
      expect(active.body, `focus fell to <body> (active: ${active.label})`).toBe(false)
      expect(active.inToolbar).toBe(true)
      // Pressing again at the limit is a no-op, not an error.
      await page.keyboard.press(key)
      await expect(toolbar(page)).toBeVisible()
    })
  }
})

test.describe('#21 #22 pointer', () => {
  test('wheel zoom keeps the point under the cursor fixed and the page does not scroll', async ({ page }) => {
    const box = await canvas(page).boundingBox()
    if (!box) throw new Error('canvas not visible')
    const px = box.width * 0.3
    const py = box.height * 0.4
    const size = await canvasSize(page)
    const before = await readViewport(page)
    const anchor = canvasToWorld(before, size, px, py)
    await page.mouse.move(box.x + px, box.y + py)
    await page.mouse.wheel(0, -200)
    const after = await viewportAfter(page, before)
    expect(spanX(after)).toBeLessThan(spanX(before))
    const moved = canvasToWorld(after, size, px, py)
    expectClose(moved.x, anchor.x, spanX(after) * 0.01, 'anchor x')
    expectClose(moved.y, anchor.y, spanY(after) * 0.01, 'anchor y')
    const scroll = await page.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY,
      root: document.scrollingElement?.scrollTop ?? 0,
    }))
    expect(scroll).toEqual({ x: 0, y: 0, root: 0 })
  })

  test('wheel zoom factor follows 1.0015^(-deltaY)', async ({ page }) => {
    const box = await canvas(page).boundingBox()
    if (!box) throw new Error('canvas not visible')
    const before = await readViewport(page)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 100)
    const after = await viewportAfter(page, before)
    expectClose(spanX(after) / spanX(before), Math.pow(1.0015, 100), 0.02, 'zoom-out factor')
  })

  test('dragging pans the view', async ({ page }) => {
    const box = await canvas(page).boundingBox()
    if (!box) throw new Error('canvas not visible')
    const before = await readViewport(page)
    const size = await canvasSize(page)
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 100, cy + 50, { steps: 8 })
    await page.mouse.up()
    const after = await viewportAfter(page, before)
    const dxWorld = (100 / size.width) * spanX(before)
    const dyWorld = (50 / size.height) * spanY(before)
    expectClose(after.xMin, before.xMin - dxWorld, spanX(before) * 0.01, 'xMin after drag')
    expectClose(after.yMax, before.yMax + dyWorld, spanY(before) * 0.01, 'yMax after drag')
    expectClose(spanX(after), spanX(before), 0.01, 'span unchanged by pan')
  })

  test('shows a grab cursor over the canvas', async ({ page }) => {
    const cursors = await canvas(page).evaluate((el) => [
      getComputedStyle(el).cursor,
      el.parentElement ? getComputedStyle(el.parentElement).cursor : '',
    ])
    expect(cursors).toContain('grab')
  })

  test('uses touch-action: none on the canvas', async ({ page }) => {
    expect(await canvas(page).evaluate((el) => getComputedStyle(el).touchAction)).toBe('none')
  })

  test('double-click zooms in ×2 around the point', async ({ page }) => {
    const box = await canvas(page).boundingBox()
    if (!box) throw new Error('canvas not visible')
    const before = await readViewport(page)
    const size = await canvasSize(page)
    const px = box.width * 0.25
    const py = box.height * 0.5
    const anchor = canvasToWorld(before, size, px, py)
    await page.mouse.dblclick(box.x + px, box.y + py)
    const after = await viewportAfter(page, before)
    expectClose(spanX(after), spanX(before) / 2, spanX(before) * 0.01, 'span after double-click')
    expectClose(canvasToWorld(after, size, px, py).x, anchor.x, spanX(after) * 0.01, 'anchor x')
  })
})

test.describe('#22 pinch (touch emulation via CDP)', () => {
  test.use({ hasTouch: true })

  test('two-finger pinch zooms around the midpoint', async ({ page }) => {
    const box = await canvas(page).boundingBox()
    if (!box) throw new Error('canvas not visible')
    const before = await readViewport(page)
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const client = await page.context().newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', d: number) =>
      client.send('Input.dispatchTouchEvent', {
        type,
        touchPoints:
          type === 'touchEnd'
            ? []
            : [
                { x: cx - d, y: cy, id: 1 },
                { x: cx + d, y: cy, id: 2 },
              ],
      })
    await touch('touchStart', 50)
    for (let d = 55; d <= 100; d += 5) await touch('touchMove', d)
    await touch('touchEnd', 100)
    const after = await viewportAfter(page, before)
    const ratio = spanX(before) / spanX(after)
    expect(ratio).toBeGreaterThan(1.5)
    expect(ratio).toBeLessThan(2.6)
    expectClose((after.xMin + after.xMax) / 2, (before.xMin + before.xMax) / 2, spanX(after) * 0.05, 'midpoint')
  })
})

test.describe('#24 keyboard on the focused canvas', () => {
  test('the wrapper is focusable and not role=application', async ({ page }) => {
    await expect(graphWrapper(page)).toHaveAttribute('tabindex', '0')
    await expect(page.getByRole('application')).toHaveCount(0)
  })

  test('arrows pan 10% (Shift 50%), +/= zoom in, -/_ zoom out, 0 resets', async ({ page }) => {
    await focusGraph(page)
    const start = await readViewport(page)
    await page.keyboard.press('ArrowRight')
    let vp = await viewportAfter(page, start)
    expectClose(vp.xMin, start.xMin + spanX(start) * 0.1, 0.01, 'ArrowRight')
    await page.keyboard.press('Shift+ArrowLeft')
    vp = await viewportAfter(page, vp)
    expectClose(vp.xMin, start.xMin + spanX(start) * (0.1 - 0.5), 0.01, 'Shift+ArrowLeft')
    const beforeUp = vp
    await page.keyboard.press('ArrowUp')
    vp = await viewportAfter(page, vp)
    expectClose(vp.yMin, beforeUp.yMin + spanY(beforeUp) * 0.1, spanY(beforeUp) * 0.01, 'ArrowUp moves the view up')
    await page.keyboard.press('0')
    await expectDefaultView(page)

    for (const [key, factor] of [['+', 0.5], ['=', 0.5], ['-', 2], ['_', 2]] as const) {
      const b = await readViewport(page)
      await page.keyboard.press(key)
      const a = await viewportAfter(page, b)
      expectClose(spanX(a) / spanX(b), factor, 0.01, `key ${key}`)
    }
    await page.keyboard.press('0')
    await expectDefaultView(page)
  })

  test('? opens the keyboard shortcuts dialog', async ({ page }) => {
    await focusGraph(page)
    await page.keyboard.press('?')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  })

  test('T traces the first curve at the centre; ←/→ move; Escape exits', async ({ page }) => {
    await focusGraph(page)
    const vp = await readViewport(page)
    const size = await canvasSize(page)
    await page.keyboard.press('t')
    await expect(page.getByRole('main').getByText('y = sin(x)', { exact: true })).toBeVisible()
    const c0 = parseCoords((await traceCoords(page).textContent()) ?? '')
    const x0 = num(c0.x)
    expectClose(x0, 0, spanX(vp) / size.width + 1e-9, 'trace starts at the centre x')
    expectClose(num(c0.y), Math.sin(x0), 0.001, 'trace y on the curve')
    await expect(liveRegion(page)).toHaveText(/^y = sin\(x\): x -?[\d.e-]+, y -?[\d.e-]+\.$/)

    await page.keyboard.press('ArrowRight')
    await expect(traceCoords(page)).not.toHaveText(`(${c0.x}, ${c0.y})`)
    const c1 = parseCoords((await traceCoords(page).textContent()) ?? '')
    // UX-17: ← → move one minor grid step (major / 5); Shift moves one major step; x snaps to the grid.
    const { major, minor } = await xGridSteps(page)
    expectClose(num(c1.x), Math.round(x0 / minor) * minor + minor, minor * 1e-3, 'ArrowRight moves one minor grid step')
    expect(Math.abs(num(c1.x) / minor - Math.round(num(c1.x) / minor)), 'x snapped to the minor grid').toBeLessThan(1e-3)
    await page.keyboard.press('Shift+ArrowRight')
    await expect(traceCoords(page)).not.toHaveText(`(${c1.x}, ${c1.y})`)
    const c2 = parseCoords((await traceCoords(page).textContent()) ?? '')
    // Shift moves to the next major grid line (x snaps to the major grid), e.g. 0.4 → 2.
    const nextMajor = (Math.floor(num(c1.x) / major + 1e-9) + 1) * major
    expectClose(num(c2.x), nextMajor, minor * 1e-3, 'Shift+ArrowRight moves to the next major grid line')
    expectClose(num(c2.y), Math.sin(num(c2.x)), 0.001, 'still on the curve')

    // Trace keys must not pan the view.
    expect(await readViewport(page)).toEqual(vp)
    await page.keyboard.press('Escape')
    await expect(traceCoords(page)).toBeHidden()
  })

  test('the viewport pans to keep the trace point in view', async ({ page }) => {
    await focusGraph(page)
    const start = await readViewport(page)
    await page.keyboard.press('t')
    await expect(traceCoords(page)).toBeVisible()
    for (let i = 0; i < 60; i++) await page.keyboard.press('Shift+ArrowRight')
    const c = parseCoords((await traceCoords(page).textContent()) ?? '')
    const vp = await readViewport(page)
    expect(vp.xMax).toBeGreaterThan(start.xMax)
    expect(num(c.x)).toBeGreaterThanOrEqual(vp.xMin)
    expect(num(c.x)).toBeLessThanOrEqual(vp.xMax)
  })

  test('] / [ and ↑ / ↓ switch curves (wrapping) and keep x', async ({ page }) => {
    await setExpression(page, 2, 'y = x^2 + 1')
    await waitForPlot(page, 'y = x^2 + 1')
    await focusGraph(page)
    await page.keyboard.press('t')
    const main = page.getByRole('main')
    await expect(main.getByText('y = sin(x)', { exact: true })).toBeVisible()
    const x = parseCoords((await traceCoords(page).textContent()) ?? '').x
    await page.keyboard.press(']')
    await expect(main.getByText('y = x^2 + 1', { exact: true })).toBeVisible()
    const c = parseCoords((await traceCoords(page).textContent()) ?? '')
    expect(c.x).toBe(x)
    expectClose(num(c.y), num(x) ** 2 + 1, 0.01, 'y on the second curve')
    await expect(liveRegion(page)).toHaveText(/^Curve 2 of 2\. y = x\^2 \+ 1: x /)
    await page.keyboard.press(']') // wraps
    await expect(main.getByText('y = sin(x)', { exact: true })).toBeVisible()
    await page.keyboard.press('[') // wraps backwards
    await expect(main.getByText('y = x^2 + 1', { exact: true })).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await expect(main.getByText('y = sin(x)', { exact: true })).toBeVisible()
    await page.keyboard.press('ArrowUp')
    await expect(main.getByText('y = x^2 + 1', { exact: true })).toBeVisible()
  })

  test('hidden curves are skipped when tracing', async ({ page }) => {
    await setExpression(page, 2, 'y = x^2 + 1')
    await waitForPlot(page, 'y = x^2 + 1')
    await page.getByRole('button', { name: 'Show expression 1', exact: true }).click()
    await waitForPlot(page, 'y = sin(x)', { present: false })
    await focusGraph(page)
    await page.keyboard.press('t')
    await expect(page.getByRole('main').getByText('y = x^2 + 1', { exact: true })).toBeVisible()
  })

  test('Tab leaves the canvas while tracing (not trapped)', async ({ page }) => {
    await focusGraph(page)
    await page.keyboard.press('t')
    await expect(traceCoords(page)).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(graphWrapper(page)).not.toBeFocused()
    await expect(toolbarButton(page, 'Zoom in')).toBeFocused()
  })
})

test.describe('#26 trace tooltip', () => {
  test('hovering near the curve shows the expression and (x, y) with ≤4 significant figures', async ({ page }) => {
    const p = await worldToPage(page, Math.PI / 2, 1)
    await page.mouse.move(p.x + 3, p.y + 8)
    await expect(page.getByRole('main').getByText('y = sin(x)', { exact: true })).toBeVisible()
    const c = parseCoords((await traceCoords(page).textContent()) ?? '')
    expect(sigFigs(c.x)).toBeLessThanOrEqual(4)
    expect(sigFigs(c.y)).toBeLessThanOrEqual(4)
    expectClose(num(c.x), Math.PI / 2, 0.3, 'hover x')
    expectClose(num(c.y), Math.sin(num(c.x)), 0.002, 'snapped to the curve')
  })

  test('hovering far (>24px) from every curve shows no tooltip', async ({ page }) => {
    const p = await worldToPage(page, 0, 5)
    await page.mouse.move(p.x, p.y)
    await page.waitForTimeout(200)
    await expect(traceCoords(page)).toBeHidden()
  })

  test('whole numbers are shown without trailing zeros, e.g. y = 1 traces as "1"', async ({ page }) => {
    await setExpression(page, 1, 'y = 1')
    await waitForPlot(page, 'y = 1')
    await focusGraph(page)
    await page.keyboard.press('t')
    const c = parseCoords((await traceCoords(page).textContent()) ?? '')
    expect(c.y).toBe('1')
  })

  const sci: [string, string][] = [
    ['y = 0.00001234', '1.234e-5'],
    ['y = 2000000', '2e6'],
    ['y = -0.0000005', '-5e-7'],
  ]
  for (const [expr, y] of sci) {
    test(`uses scientific notation for ${expr}`, async ({ page }) => {
      await setExpression(page, 1, expr)
      await waitForPlot(page, expr)
      await focusGraph(page)
      // Off-screen at the default view: zoom out to the 1e6 span limit, then pan up (50% per press) to y ≈ 2e6.
      if (expr === 'y = 2000000') {
        for (let i = 0; i < 20; i++) await page.keyboard.press('-')
        for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowUp')
      }
      await focusGraph(page)
      await page.keyboard.press('t')
      await expect(traceCoords(page)).toBeVisible()
      expect(parseCoords((await traceCoords(page).textContent()) ?? '').y).toBe(y)
    })
  }

  test('long expressions are truncated to 24 characters with …', async ({ page }) => {
    const long = 'y = sin(x) + 0*x + 0*x + 0*x + 0*x'
    await setExpression(page, 1, long)
    await waitForPlot(page, long)
    await focusGraph(page)
    await page.keyboard.press('t')
    await expect(page.getByRole('main').getByText(/^y = sin\(x\).*…$/)).toBeVisible()
    const text = (await page.getByRole('main').getByText(/^y = sin\(x\).*…$/).textContent()) ?? ''
    expect(text.length).toBeLessThanOrEqual(25)
  })
})

test.describe('#25 no vertical lines at asymptotes', () => {
  /**
   * In a narrow strip around the asymptote |f| exceeds 2·yMax, so a correct plot has no
   * curve pixels in the middle half of the canvas there. A connecting line would cross it.
   */
  async function curvePixelsAcross(page: Page, asymptotes: number[], halfWidthWorld: number) {
    const vp = await readViewport(page)
    const size = await canvasSize(page)
    let total = 0
    for (const a of asymptotes) {
      const left = worldToCanvas(vp, size, a - halfWidthWorld, 0).x
      const right = worldToCanvas(vp, size, a + halfWidthWorld, 0).x
      const top = worldToCanvas(vp, size, 0, vp.yMax / 2).y
      const bottom = worldToCanvas(vp, size, 0, vp.yMin / 2).y
      total += await countColourPixels(page, BLUE, { x0: left, x1: right, y0: top, y1: bottom })
    }
    return total
  }

  test('tan(x)', async ({ page }) => {
    await setExpression(page, 1, 'y = tan(x)')
    await waitForPlot(page, 'y = tan(x)')
    await page.waitForTimeout(400)
    await expect.poll(() => countColourPixels(page, BLUE)).toBeGreaterThan(100)
    const vp = await readViewport(page)
    const half = Math.PI / 2 - Math.atan(2 * vp.yMax)
    const asymptotes: number[] = []
    for (let k = -4; k <= 4; k++) {
      const a = Math.PI / 2 + k * Math.PI
      if (a > vp.xMin + 0.5 && a < vp.xMax - 0.5) asymptotes.push(a)
    }
    expect(asymptotes.length).toBeGreaterThanOrEqual(4)
    expect(await curvePixelsAcross(page, asymptotes, half)).toBe(0)
  })

  test('1/x', async ({ page }) => {
    await setExpression(page, 1, 'y = 1/x')
    await waitForPlot(page, 'y = 1/x')
    await page.waitForTimeout(400)
    await expect.poll(() => countColourPixels(page, BLUE)).toBeGreaterThan(100)
    const vp = await readViewport(page)
    expect(await curvePixelsAcross(page, [0], 1 / (2 * vp.yMax))).toBe(0)
  })
})

test.describe('#27 ticks and grid adapt to zoom', () => {
  // Tick label values are canvas-only; exact labels are covered by src/lib/viewport unit tests.
  // Here we check the chrome is still drawn at extreme spans and nothing throws.
  for (const [label, key, presses] of [
    ['span 0.001', '+', 14],
    ['span 10000', '-', 9],
  ] as const) {
    test(`axes, tick labels and grid still render at ${label}`, async ({ page }) => {
      await focusGraph(page)
      for (let i = 0; i < presses; i++) await page.keyboard.press(key)
      const vp = await readViewport(page)
      if (key === '+') expect(spanX(vp)).toBeLessThan(0.002)
      else expect(spanX(vp)).toBeGreaterThan(9000)
      await page.waitForTimeout(200)
      expect(await countColourPixels(page, AXIS_LIGHT, {}, 30)).toBeGreaterThan(50)
      expect(await countColourPixels(page, '#E5E5E5', {}, 6)).toBeGreaterThan(50)
    })
  }
})

test.describe('UX-01 empty-state hint', () => {
  async function deleteAll(page: Page) {
    await page.getByRole('button', { name: 'More options for expression 1', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(page.getByTestId('empty-graph-hint')).toBeVisible()
  }

  async function expectHintClearOfXAxis(page: Page) {
    const hint = page.getByTestId('empty-graph-hint')
    await expect(hint).toHaveText('Add an expression to see it graphed.')
    // An HTML element, not canvas paint.
    expect(await hint.evaluate((el) => el.tagName.toLowerCase())).not.toBe('canvas')
    await expect(hint).not.toHaveAttribute('role', 'img')
    await page.waitForTimeout(150)
    const [box, cbox, axes] = await Promise.all([hint.boundingBox(), canvas(page).boundingBox(), axisPosition(page)])
    if (!box || !cbox) throw new Error('hint or canvas not visible')
    expect(axes.y, 'x-axis line found on the canvas').not.toBeNull()
    const axisY = cbox.y + (axes.y ?? 0)
    const overlaps = box.y - 2 <= axisY && axisY <= box.y + box.height + 2
    expect(overlaps, `hint ${box.y}..${box.y + box.height} crosses the x-axis at y=${axisY}`).toBe(false)
    return box
  }

  test('is an HTML overlay that does not overlap the x-axis (desktop)', async ({ page }) => {
    await deleteAll(page)
    await expect(canvas(page)).toHaveAttribute('aria-label', /^Graph with no expressions\./)
    await expectHintClearOfXAxis(page)
  })

  test('stays clear of the x-axis after panning', async ({ page }) => {
    await deleteAll(page)
    await focusGraph(page)
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp')
    await expectHintClearOfXAxis(page)
  })

  test.describe('phone', () => {
    test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })

    test('sits in the visible area above the sheet and off the x-axis', async ({ page }) => {
      await deleteAll(page)
      const box = await expectHintClearOfXAxis(page)
      expect(box.y + box.height).toBeLessThanOrEqual(await sheetTop(page))
      expect(box.y).toBeGreaterThanOrEqual(0)
    })
  })
})

test.describe('#23 toolbar on phones (CR-05)', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })

  test('is a horizontal toolbar row', async ({ page }) => {
    await expect(toolbar(page)).toHaveAttribute('aria-orientation', 'horizontal')
    const tops = await toolbar(page)
      .getByRole('button')
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
    expect(new Set(tops).size).toBe(1)
  })
})
