/// <reference lib="dom" />
// UX-SPEC §1 — acceptance checklist items 1–4 (layout, collapse, bottom sheet, no horizontal scroll).
import { type Page } from '@playwright/test'
import {
  axisPosition,
  canvas,
  expect,
  exprInput,
  openApp,
  panel,
  readViewport,
  setExpression,
  sheetHandle,
  sheetTop,
  test,
  toolbar,
  waitForStorageToSettle,
} from '../fixtures/app.ts'

async function expectNoHorizontalScroll(page: Page) {
  const m = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const offenders = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => {
        const r = el.getBoundingClientRect()
        const s = getComputedStyle(el)
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && r.right > vw + 1 && !el.closest('[inert]')
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).slice(0, 60)}`)
    return {
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      clientWidth: vw,
      offenders,
    }
  })
  expect(m.scrollWidth, `document overflows horizontally: ${m.offenders.join(', ')}`).toBeLessThanOrEqual(m.clientWidth)
  expect(m.bodyScrollWidth).toBeLessThanOrEqual(m.clientWidth)
  expect(m.offenders, 'elements extending past the right edge').toEqual([])
  expect(await page.evaluate(() => window.scrollX)).toBe(0)
}

const LONG_EXPR = 'y = sin(x) + cos(2x) + tan(3x) + sqrt(abs(x)) + ln(x^2 + 1) + a*b*c'

test.describe('#1 breakpoints', () => {
  test.describe('desktop 1280×800', () => {
    test.use({ viewport: { width: 1280, height: 800 } })
    test('panel is 384px wide on the left', async ({ page }) => {
      await openApp(page)
      const box = await panel(page).boundingBox()
      expect(box?.x).toBe(0)
      expect(Math.round(box?.width ?? 0)).toBe(384)
      expect(Math.round(box?.height ?? 0)).toBe(800)
      await expect(page.getByRole('main')).toBeVisible()
    })
  })

  test.describe('tablet 800×1000', () => {
    test.use({ viewport: { width: 800, height: 1000 } })
    test('panel is 288px wide on the left', async ({ page }) => {
      await openApp(page)
      const box = await panel(page).boundingBox()
      expect(box?.x).toBe(0)
      expect(Math.round(box?.width ?? 0)).toBe(288)
    })
  })
})

test.describe('#3 collapsing the panel (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('hides it, removes it from the tab order, shows "Show expressions panel", and persists', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Hide expressions panel', exact: true }).click()
    const show = page.getByRole('button', { name: 'Show expressions panel', exact: true })
    await expect(show).toBeVisible()
    // Clipped by the zero-width panel (Playwright still counts clipped elements as "visible").
    await expect(exprInput(page, 1)).not.toBeInViewport()
    await expect(page.locator('aside')).toHaveAttribute('inert', '')
    await expect
      .poll(() => page.evaluate(() => document.querySelector('aside')?.getBoundingClientRect().width ?? 0))
      .toBeLessThanOrEqual(1)

    // Nothing inside the panel can be reached by Tab.
    await page.locator('body').focus()
    const reached: string[] = []
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab')
      reached.push(
        await page.evaluate(() => {
          const el = document.activeElement
          return el?.closest('aside') ? `IN PANEL: ${el.getAttribute('aria-label') ?? el.tagName}` : 'ok'
        }),
      )
    }
    expect(reached.filter((r) => r !== 'ok')).toEqual([])

    await waitForStorageToSettle(page)
    await page.reload()
    await expect(show).toBeVisible()
    await show.click()
    await expect(exprInput(page, 1)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hide expressions panel', exact: true })).toBeVisible()
  })
})

test.describe('#4 phone bottom sheet (375×812)', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })

  const handleFraction = async (page: Page) => {
    const box = await sheetHandle(page).boundingBox()
    if (!box) throw new Error('sheet handle not visible')
    return (812 - box.y) / 812 // sheet height as a fraction of the viewport
  }

  test('is a bottom sheet in peek state (~35%) that toggles to ~85% by tap', async ({ page }) => {
    await openApp(page)
    await expect(sheetHandle(page)).toBeVisible()
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'false')
    expect(Math.abs((await handleFraction(page)) - 0.35)).toBeLessThan(0.04)
    const handleBox = await sheetHandle(page).boundingBox()
    expect(Math.round(handleBox?.height ?? 0)).toBeGreaterThanOrEqual(44)

    await sheetHandle(page).tap()
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true')
    await expect.poll(() => handleFraction(page)).toBeGreaterThan(0.81)
    expect(await handleFraction(page)).toBeLessThan(0.89)
    await sheetHandle(page).tap()
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'false')
    await expect.poll(() => handleFraction(page)).toBeLessThan(0.39)
  })

  test('Enter and Space on the handle toggle the sheet', async ({ page }) => {
    await openApp(page)
    await sheetHandle(page).focus()
    await page.keyboard.press('Enter')
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Space')
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'false')
  })

  test('the graph above the peeking sheet stays pannable', async ({ page }) => {
    await openApp(page)
    const before = await readViewport(page)
    await page.mouse.move(180, 150)
    await page.mouse.down()
    await page.mouse.move(260, 170, { steps: 6 })
    await page.mouse.up()
    await expect.poll(async () => (await readViewport(page)).xMin).toBeLessThan(before.xMin)
  })

  test('focusing an input expands the sheet', async ({ page }) => {
    await openApp(page)
    await exprInput(page, 1).tap()
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(exprInput(page, 1)).toBeInViewport()
  })

  test('on phones slider min/max are only in the settings popover', async ({ page }) => {
    await openApp(page)
    await setExpression(page, 1, 'y = a*sin(x)')
    await expect(page.getByLabel('Minimum for a', { exact: true })).toBeHidden()
    await page.getByRole('button', { name: 'Slider settings for a', exact: true }).tap()
    await expect(page.getByRole('dialog').getByLabel('Min')).toBeVisible()
  })

  test('the canvas fills the screen behind the sheet', async ({ page }) => {
    await openApp(page)
    const box = await canvas(page).boundingBox()
    expect(Math.round(box?.width ?? 0)).toBe(375)
  })
})

test.describe('#2 no horizontal scroll', () => {
  for (const width of [320, 375]) {
    test.describe(`${width}px phone`, () => {
      test.use({ viewport: { width, height: 700 }, hasTouch: true })

      test('at first run', async ({ page }) => {
        await openApp(page)
        await expectNoHorizontalScroll(page)
      })

      test('with an expanded sheet, a long expression, sliders and an error', async ({ page }) => {
        await openApp(page)
        await sheetHandle(page).tap()
        await setExpression(page, 1, LONG_EXPR)
        await setExpression(page, 2, 'foo(x)')
        await expect(page.getByRole('slider', { name: 'a', exact: true })).toBeVisible()
        await expectNoHorizontalScroll(page)
      })

      test('with the table of values open', async ({ page }) => {
        await openApp(page)
        await sheetHandle(page).tap()
        await page.getByRole('button', { name: 'More options for expression 1', exact: true }).tap()
        await page.getByRole('menuitem', { name: 'Table of values' }).tap()
        await expect(page.getByRole('dialog')).toBeVisible()
        await expectNoHorizontalScroll(page)
      })
    })
  }

  test.describe('200% zoom on 1280px (640 CSS px)', () => {
    test.use({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 })

    test('no horizontal scroll with a long expression and sliders', async ({ page }) => {
      await openApp(page)
      const handle = sheetHandle(page)
      if (await handle.isVisible()) await handle.click()
      await setExpression(page, 1, LONG_EXPR)
      await expectNoHorizontalScroll(page)
    })
  })
})

const TOOLBAR_NAMES = ['Zoom in', 'Zoom out', 'Reset view', 'Switch to dark theme', 'Keyboard shortcuts']

test.describe('CR-05 phone toolbar is one horizontal row the sheet never covers (#4, #23)', () => {
  for (const [width, height] of [[375, 812], [320, 640]] as const) {
    test.describe(`${width}×${height}`, () => {
      test.use({ viewport: { width, height }, hasTouch: true })

      test('toolbar is a single horizontal row of 44px buttons at the top-right', async ({ page }) => {
        await openApp(page)
        const bar = toolbar(page)
        await expect(bar).toHaveAttribute('aria-orientation', 'horizontal')
        const box = await bar.boundingBox()
        if (!box) throw new Error('toolbar not visible')
        expect(box.y).toBeLessThan(40)
        expect(width - (box.x + box.width)).toBeLessThanOrEqual(24)
        expect(box.x).toBeGreaterThanOrEqual(0)
        const boxes = await bar.getByRole('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
        expect(boxes).toHaveLength(TOOLBAR_NAMES.length)
        for (let i = 0; i < boxes.length; i++) {
          expect(Math.round(boxes[i].width)).toBeGreaterThanOrEqual(44)
          expect(Math.round(boxes[i].height)).toBeGreaterThanOrEqual(44)
          if (i > 0) {
            expect(Math.abs(boxes[i].top - boxes[0].top)).toBeLessThanOrEqual(2)
            expect(boxes[i].left).toBeGreaterThan(boxes[i - 1].left)
          }
        }
      })

      test('the expanded sheet stops below the toolbar and every toolbar button stays clickable', async ({ page }) => {
        await openApp(page)
        await sheetHandle(page).tap()
        await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true')
        await page.waitForTimeout(250) // let the expand transition finish
        const bar = await toolbar(page).boundingBox()
        if (!bar) throw new Error('toolbar not visible')
        expect(await sheetTop(page)).toBeGreaterThanOrEqual(bar.y + bar.height)
        // Never taller than 100dvh - 4.5rem (72px).
        expect(height - (await sheetTop(page))).toBeLessThanOrEqual(height - 72 + 1)
        for (const name of TOOLBAR_NAMES) {
          // trial: runs the actionability checks (visible, stable, not covered) without clicking.
          await toolbar(page).getByRole('button', { name, exact: true }).click({ trial: true, timeout: 2000 })
        }
        await toolbar(page).getByRole('button', { name: 'Zoom in', exact: true }).click()
        await expect(canvas(page)).toHaveAttribute('aria-label', /x from -5 to 5/)
        await toolbar(page).getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click()
        await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
      })

      test('focus on toolbar buttons is not obscured while the sheet is expanded', async ({ page }) => {
        await openApp(page)
        await exprInput(page, 1).tap() // auto-expands the sheet
        await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'true')
        await page.waitForTimeout(250)
        const top = await sheetTop(page)
        for (const name of TOOLBAR_NAMES) {
          const b = toolbar(page).getByRole('button', { name, exact: true })
          await b.focus()
          const box = await b.boundingBox()
          expect((box?.y ?? 0) + (box?.height ?? 0), `${name} is above the sheet`).toBeLessThanOrEqual(top)
        }
      })
    })
  }
})

test.describe('4a phone framing: the view centres on the area above the peek sheet', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })

  async function originOnScreen(page: Page) {
    await page.waitForTimeout(100)
    const axes = await axisPosition(page)
    const box = await canvas(page).boundingBox()
    if (!box || axes.x === null || axes.y === null) throw new Error(`axes not found: ${JSON.stringify(axes)}`)
    return { x: box.x + axes.x, y: box.y + axes.y }
  }

  async function expectOriginCentredAboveSheet(page: Page) {
    const o = await originOnScreen(page)
    const box = await canvas(page).boundingBox()
    const top = box?.y ?? 0
    const visibleBottom = await sheetTop(page)
    expect(Math.abs(o.x - 375 / 2), `origin x ${o.x}`).toBeLessThanOrEqual(4)
    expect(Math.abs(o.y - (top + visibleBottom) / 2), `origin y ${o.y}, visible area ${top}..${visibleBottom}`).toBeLessThanOrEqual(6)
  }

  test('first run puts the origin at the centre of the visible area', async ({ page }) => {
    await openApp(page)
    await expect(sheetHandle(page)).toHaveAttribute('aria-expanded', 'false')
    await expectOriginCentredAboveSheet(page)
  })

  test('Reset view re-centres there after panning', async ({ page }) => {
    await openApp(page)
    await page.mouse.move(180, 150)
    await page.mouse.down()
    await page.mouse.move(260, 220, { steps: 6 })
    await page.mouse.up()
    await toolbar(page).getByRole('button', { name: 'Reset view', exact: true }).click()
    await expectOriginCentredAboveSheet(page)
  })

  test('zoom buttons zoom around the centre of the visible area', async ({ page }) => {
    await openApp(page)
    const before = await originOnScreen(page)
    await toolbar(page).getByRole('button', { name: 'Zoom in', exact: true }).click()
    await expect(canvas(page)).toHaveAttribute('aria-label', /x from -5 to 5/)
    const after = await originOnScreen(page)
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(3)
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(3)
  })
})
