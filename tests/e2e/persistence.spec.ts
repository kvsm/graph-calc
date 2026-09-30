/// <reference lib="dom" />
// UX-SPEC §1.1, §6, §8.3 — acceptance checklist item 37 (and the persistence half of #3).
import { type Page } from '@playwright/test'
import {
  PALETTE,
  allExprInputs,
  blockLocalStorage,
  countColourPixels,
  expect,
  exprInput,
  failLocalStorageWrites,
  focusGraph,
  openApp,
  openMenu,
  readViewport,
  setExpression,
  slider,
  swatch,
  test,
  toolbarButton,
  waitForStorageToSettle,
} from '../fixtures/app.ts'

test.use({ colorScheme: 'light' })

async function expectFirstRun(page: Page) {
  await expect(allExprInputs(page)).toHaveCount(2)
  await expect(exprInput(page, 1)).toHaveValue('y = sin(x)')
  await expect(exprInput(page, 2)).toHaveValue('')
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  const vp = await readViewport(page)
  expect([vp.xMin, vp.xMax]).toEqual([-10, 10])
}

test('expressions, colour, visibility, sliders, viewport, theme and panel state survive reload', async ({ page }) => {
  await openApp(page)
  // Colour: expression 1 → Green.
  const menu = await openMenu(page, 1)
  await menu.getByRole('menuitem', { name: 'Colour…' }).click()
  await page.getByRole('radiogroup', { name: 'Curve colour for expression 1' }).getByRole('radio', { name: 'Green' }).click()
  await page.keyboard.press('Escape')
  // Expression 2 with a slider, hidden.
  await setExpression(page, 2, 'y = a*x')
  await page.getByLabel('Minimum for a', { exact: true }).fill('-5')
  await page.getByLabel('Minimum for a', { exact: true }).blur()
  await page.getByLabel('Value of a', { exact: true }).fill('2')
  await page.getByLabel('Value of a', { exact: true }).blur()
  await page.getByRole('button', { name: 'Slider settings for a', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Step').fill('0.5')
  await page.getByRole('dialog').getByLabel('Step').blur()
  await page.keyboard.press('Escape')
  await swatch(page, 2).click()
  await expect(swatch(page, 2)).toHaveAttribute('aria-pressed', 'false')
  // Viewport: pan right 10%.
  await focusGraph(page)
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await readViewport(page)).xMin).toBe(-8)
  // Theme and panel.
  await toolbarButton(page, 'Switch to dark theme').click()
  await page.getByRole('button', { name: 'Hide expressions panel', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Show expressions panel', exact: true })).toBeVisible()

  await waitForStorageToSettle(page)
  await page.reload()

  await expect(page.getByRole('button', { name: 'Show expressions panel', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true)
  const vp = await readViewport(page)
  expect(vp.xMin).toBe(-8)
  expect(vp.xMax).toBe(12)
  await expect.poll(() => countColourPixels(page, PALETTE[2].dark)).toBeGreaterThan(100)

  await page.getByRole('button', { name: 'Show expressions panel', exact: true }).click()
  await expect(exprInput(page, 1)).toHaveValue('y = sin(x)')
  await expect(exprInput(page, 2)).toHaveValue('y = a*x')
  await expect(allExprInputs(page)).toHaveCount(3)
  await expect(swatch(page, 1)).toHaveAttribute('aria-pressed', 'true')
  await expect(swatch(page, 2)).toHaveAttribute('aria-pressed', 'false')
  await expect(slider(page, 'a')).toHaveAttribute('aria-valuenow', '2')
  await expect(slider(page, 'a')).toHaveAttribute('aria-valuemin', '-5')
  await expect(page.getByLabel('Value of a', { exact: true })).toHaveValue('2.0')
  await page.getByRole('button', { name: 'Slider settings for a', exact: true }).click()
  await expect(page.getByRole('dialog').getByLabel('Step')).toHaveValue('0.5')
  await page.keyboard.press('Escape')

  const again = await openMenu(page, 1)
  await again.getByRole('menuitem', { name: 'Colour…' }).click()
  await expect(
    page.getByRole('radiogroup', { name: 'Curve colour for expression 1' }).getByRole('radio', { name: 'Green' }),
  ).toHaveAttribute('aria-checked', 'true')
})

test('Reset view is persisted as the default viewport', async ({ page }) => {
  await openApp(page)
  await focusGraph(page)
  await page.keyboard.press('+')
  await page.keyboard.press('0')
  await waitForStorageToSettle(page)
  await page.reload()
  const vp = await readViewport(page)
  expect([vp.xMin, vp.xMax]).toEqual([-10, 10])
})

for (const garbage of ['{corrupt', 'null', '[]', '42', '{"expressions":"nope","viewport":{"xMin":"a"}}', '{"xMin":5,"xMax":1}']) {
  test(`corrupt storage (${garbage}) falls back to first run without errors`, async ({ page, consoleErrors }) => {
    await openApp(page)
    await setExpression(page, 2, 'y = x^2')
    await focusGraph(page)
    await page.keyboard.press('ArrowRight')
    await toolbarButton(page, 'Switch to dark theme').click()
    await waitForStorageToSettle(page)
    const keys = await page.evaluate((value) => {
      const ks = Object.keys(localStorage)
      for (const k of ks) localStorage.setItem(k, value)
      return ks
    }, garbage)
    expect(keys.length, 'the app should have persisted something').toBeGreaterThan(0)
    await page.reload()
    await expect(exprInput(page, 1)).toBeVisible()
    await expectFirstRun(page)
    expect(consoleErrors.filter((m) => !/favicon/i.test(m))).toEqual([])
  })
}

test('blocked localStorage (throws on access) falls back to first run and stays usable', async ({ page }) => {
  await blockLocalStorage(page)
  await openApp(page)
  await expectFirstRun(page)
  await setExpression(page, 2, 'y = x^2')
  await expect(allExprInputs(page)).toHaveCount(3)
  await toolbarButton(page, 'Switch to dark theme').click()
  await page.reload()
  await expectFirstRun(page)
})

test('failing localStorage writes (quota exceeded) do not break editing', async ({ page }) => {
  await failLocalStorageWrites(page)
  await openApp(page)
  await setExpression(page, 2, 'y = x^2')
  await expect(allExprInputs(page)).toHaveCount(3)
  await focusGraph(page)
  await page.keyboard.press('+')
  await expect.poll(async () => (await readViewport(page)).xMin).toBe(-5)
})
