/// <reference lib="dom" />
// UX-SPEC §1 — acceptance checklist items 1–4 (layout, collapse, bottom sheet, no horizontal scroll).
import { type Page } from '@playwright/test'
import {
  canvas,
  expect,
  exprInput,
  openApp,
  panel,
  readViewport,
  setExpression,
  sheetHandle,
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

  test('toolbar stays at the top-right with 44px buttons', async ({ page }) => {
    await openApp(page)
    const box = await toolbar(page).boundingBox()
    if (!box) throw new Error('toolbar not visible')
    expect(box.y).toBeLessThan(40)
    expect(375 - (box.x + box.width)).toBeLessThanOrEqual(24)
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
