/// <reference lib="dom" />
// UX-SPEC §2, §3, §6 — acceptance checklist items 5–11, 14–16.
import {
  EMPTY_GRAPH_HINT,
  FOOTER_TIP,
  PALETTE,
  PLACEHOLDER,
  allExprInputs,
  canvas,
  countColourPixels,
  expect,
  exprInput,
  liveRegion,
  openApp,
  openMenu,
  openTable,
  overflow,
  setExpression,
  swatch,
  tableRows,
  test,
} from '../fixtures/app.ts'

const BLUE = PALETTE[0].light
const VERMILLION = PALETTE[1].light
const GREEN = PALETTE[2].light

test.use({ colorScheme: 'light' })

test.beforeEach(async ({ page }) => {
  await openApp(page)
})

test.describe('first run (§6, #5)', () => {
  test('shows y = sin(x) in Blue plus one empty row with the placeholder', async ({ page }) => {
    await expect(allExprInputs(page)).toHaveCount(2)
    await expect(exprInput(page, 1)).toHaveValue('y = sin(x)')
    await expect(exprInput(page, 1)).not.toHaveAttribute('placeholder', PLACEHOLDER)
    await expect(exprInput(page, 2)).toHaveValue('')
    await expect(exprInput(page, 2)).toHaveAttribute('placeholder', PLACEHOLDER)
    await expect(swatch(page, 1)).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => countColourPixels(page, BLUE)).toBeGreaterThan(100)
  })

  test('shows the panel title and footer tip', async ({ page }) => {
    await expect(page.getByRole('complementary', { name: 'Expressions' }).getByText('Graph', { exact: true })).toBeVisible()
    await expect(page.getByText(FOOTER_TIP, { exact: true })).toBeVisible()
  })

  test('inputs have the spec input attributes', async ({ page }) => {
    const input = exprInput(page, 1)
    await expect(input).toHaveAttribute('spellcheck', 'false')
    await expect(input).toHaveAttribute('autocomplete', 'off')
    await expect(input).toHaveAttribute('autocapitalize', 'off')
  })
})

test.describe('adding and editing (§2.1, §3)', () => {
  test('#6 typing in the trailing empty row creates an expression and a new empty row', async ({ page }) => {
    await exprInput(page, 2).fill('y = x^2')
    await expect(allExprInputs(page)).toHaveCount(3)
    await expect(exprInput(page, 3)).toHaveValue('')
    await expect(exprInput(page, 3)).toHaveAttribute('placeholder', PLACEHOLDER)
    await expect(exprInput(page, 2)).not.toHaveAttribute('placeholder', PLACEHOLDER)
  })

  test('new expressions get the next palette colour (Vermillion)', async ({ page }) => {
    await setExpression(page, 2, 'y = 2')
    await expect.poll(() => countColourPixels(page, VERMILLION)).toBeGreaterThan(50)
  })

  test('Add expression button focuses the trailing empty row', async ({ page }) => {
    await page.getByRole('button', { name: 'Add expression', exact: true }).click()
    await expect(exprInput(page, 2)).toBeFocused()
    await expect(allExprInputs(page)).toHaveCount(2)
  })

  test('#7 the curve updates within ~150ms of the last keystroke', async ({ page }) => {
    await expect.poll(() => countColourPixels(page, BLUE)).toBeGreaterThan(100)
    const input = exprInput(page, 2)
    await input.fill('y = 2')
    const start = Date.now()
    await expect
      .poll(() => countColourPixels(page, VERMILLION), { intervals: [20], timeout: 2000 })
      .toBeGreaterThan(50)
    // 150ms debounce + a frame; generous margin for CI and polling overhead.
    expect(Date.now() - start).toBeLessThan(700)
  })

  test('#7 an invalid edit keeps the last valid curve', async ({ page }) => {
    await expect.poll(() => countColourPixels(page, BLUE)).toBeGreaterThan(100)
    const before = await countColourPixels(page, BLUE)
    await exprInput(page, 1).fill('y = sin(')
    await page.waitForTimeout(800)
    await expect(exprInput(page, 1)).toHaveAttribute('aria-invalid', 'true')
    expect(await countColourPixels(page, BLUE)).toBeGreaterThan(before * 0.8)
  })

  test('#8 Enter focuses the trailing row when it is next', async ({ page }) => {
    await exprInput(page, 1).focus()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await expect(exprInput(page, 2)).toBeFocused()
    await expect(allExprInputs(page)).toHaveCount(2)
  })

  test('#8 Enter inserts a new empty row directly below and focuses it', async ({ page }) => {
    await setExpression(page, 2, 'y = x^2')
    await exprInput(page, 1).focus()
    await page.keyboard.press('Enter')
    await expect(allExprInputs(page)).toHaveCount(4)
    await expect(exprInput(page, 2)).toBeFocused()
    await expect(exprInput(page, 2)).toHaveValue('')
    await expect(exprInput(page, 3)).toHaveValue('y = x^2')
  })

  test('Shift+Enter behaves like Enter', async ({ page }) => {
    await setExpression(page, 2, 'y = x^2')
    await exprInput(page, 1).focus()
    await page.keyboard.press('Shift+Enter')
    await expect(exprInput(page, 2)).toBeFocused()
    await expect(exprInput(page, 2)).toHaveValue('')
  })

  test('#9 Backspace on an empty non-only row deletes it and puts the caret at the end of the previous input', async ({ page }) => {
    await setExpression(page, 2, 'y = x^2')
    await exprInput(page, 1).focus()
    await page.keyboard.press('Enter')
    await expect(exprInput(page, 2)).toBeFocused()
    await page.keyboard.press('Backspace')
    await expect(allExprInputs(page)).toHaveCount(3)
    await expect(exprInput(page, 1)).toBeFocused()
    const caret = await exprInput(page, 1).evaluate((el) => {
      const i = el as HTMLInputElement
      return { start: i.selectionStart, end: i.selectionEnd, length: i.value.length }
    })
    expect(caret.start).toBe(caret.length)
    expect(caret.end).toBe(caret.length)
    await expect(exprInput(page, 2)).toHaveValue('y = x^2')
  })

  test('Backspace on the only row is ignored', async ({ page }) => {
    const menu = await openMenu(page, 1)
    await menu.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(allExprInputs(page)).toHaveCount(1)
    await exprInput(page, 1).focus()
    await page.keyboard.press('Backspace')
    await expect(allExprInputs(page)).toHaveCount(1)
  })

  test('#10 Up/Down arrows move between expression inputs with the caret at the end', async ({ page }) => {
    await setExpression(page, 2, 'y = x^2')
    await exprInput(page, 1).focus()
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowDown')
    await expect(exprInput(page, 2)).toBeFocused()
    expect(await exprInput(page, 2).evaluate((el) => (el as HTMLInputElement).selectionStart)).toBe(7)
    await page.keyboard.press('ArrowDown')
    await expect(exprInput(page, 3)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect(exprInput(page, 1)).toBeFocused()
  })

  test('Escape blurs the input and focuses the row swatch', async ({ page }) => {
    await exprInput(page, 1).focus()
    await page.keyboard.press('Escape')
    await expect(swatch(page, 1)).toBeFocused()
  })

  test('y = 3 is valid (horizontal line)', async ({ page }) => {
    await setExpression(page, 1, 'y = 3')
    await expect(exprInput(page, 1)).not.toHaveAttribute('aria-invalid', 'true')
    await expect.poll(() => countColourPixels(page, BLUE)).toBeGreaterThan(100)
  })
})

test.describe('#11 implicit multiplication (checked via the table of values at x = 1)', () => {
  const cases: [string, string][] = [
    ['2x', '2'],
    ['3sin(x)', '2.524'],
    ['x(x+1)', '2'],
    ['2pi', '6.283'],
    ['(x+1)(x-1)', '0'],
    ['f(x) = 2x', '2'],
  ]
  for (const [input, y] of cases) {
    test(`${input} plots as implicit multiplication`, async ({ page }) => {
      await setExpression(page, 1, input)
      await expect(exprInput(page, 1)).not.toHaveAttribute('aria-invalid', 'true')
      await expect.poll(() => countColourPixels(page, BLUE)).toBeGreaterThan(50)
      const dialog = await openTable(page, 1)
      const rows = await tableRows(dialog)
      expect(rows.find((r) => r[0] === '1'), `row for x = 1 in ${JSON.stringify(rows)}`).toEqual(['1', y])
    })
  }
})

test.describe('visibility toggle (#14)', () => {
  test('hides and shows the curve, updating aria-pressed', async ({ page }) => {
    await expect.poll(() => countColourPixels(page, BLUE)).toBeGreaterThan(100)
    await swatch(page, 1).click()
    await expect(swatch(page, 1)).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => countColourPixels(page, BLUE)).toBe(0)
    // Label stays constant; state is conveyed by aria-pressed.
    await expect(swatch(page, 1)).toHaveAccessibleName('Show expression 1')
    await swatch(page, 1).click()
    await expect(swatch(page, 1)).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => countColourPixels(page, BLUE)).toBeGreaterThan(100)
  })

  test('shows a Hide / Show tooltip', async ({ page }) => {
    await swatch(page, 1).hover()
    await expect(page.getByRole('tooltip')).toHaveText(/Hide/)
    await swatch(page, 1).click()
    await page.mouse.move(0, 0)
    await swatch(page, 1).hover()
    await expect(page.getByRole('tooltip')).toHaveText(/Show/)
  })
})

test.describe('overflow menu (#15)', () => {
  test('offers Colour…, Table of values and Delete', async ({ page }) => {
    const menu = await openMenu(page, 1)
    await expect(menu.getByRole('menuitem')).toHaveText(['Colour…', 'Table of values', 'Delete'])
  })

  test('Table of values is disabled for an invalid expression', async ({ page }) => {
    await setExpression(page, 1, 'sin(')
    const menu = await openMenu(page, 1)
    await expect(menu.getByRole('menuitem', { name: 'Table of values' })).toBeDisabled()
  })

  test('Colour… opens a keyboard-operable radiogroup of 7 named colours', async ({ page }) => {
    const menu = await openMenu(page, 1)
    await menu.getByRole('menuitem', { name: 'Colour…' }).click()
    const group = page.getByRole('radiogroup', { name: 'Curve colour for expression 1' })
    await expect(group).toBeVisible()
    await expect(page.getByText('Curve colour', { exact: true })).toBeVisible()
    const radios = group.getByRole('radio')
    await expect(radios).toHaveCount(7)
    for (const [i, c] of PALETTE.entries()) await expect(radios.nth(i)).toHaveAccessibleName(c.name)
    await expect(group.getByRole('radio', { name: 'Blue' })).toHaveAttribute('aria-checked', 'true')

    // Arrow keys move, Enter selects.
    await expect(group.getByRole('radio', { name: 'Blue' })).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(group.getByRole('radio', { name: 'Green' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect.poll(() => countColourPixels(page, GREEN)).toBeGreaterThan(100)
    await expect.poll(() => countColourPixels(page, BLUE)).toBe(0)
  })

  test('Escape closes the colour popover and returns focus to the menu trigger', async ({ page }) => {
    const menu = await openMenu(page, 1)
    await menu.getByRole('menuitem', { name: 'Colour…' }).click()
    const group = page.getByRole('radiogroup', { name: 'Curve colour for expression 1' })
    await expect(group).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(group).toBeHidden()
    await expect(overflow(page, 1)).toBeFocused()
  })
})

test.describe('deleting (#16)', () => {
  test('moves focus to the next row and announces the deletion', async ({ page }) => {
    await setExpression(page, 2, 'y = x^2')
    const menu = await openMenu(page, 1)
    await menu.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(allExprInputs(page)).toHaveCount(2)
    await expect(exprInput(page, 1)).toHaveValue('y = x^2')
    await expect(exprInput(page, 1)).toBeFocused()
    await expect(liveRegion(page)).toHaveText('Expression 1 deleted.')
  })

  test('deleting everything leaves the placeholder row and the empty-graph hint', async ({ page }) => {
    const menu = await openMenu(page, 1)
    await menu.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(allExprInputs(page)).toHaveCount(1)
    await expect(exprInput(page, 1)).toHaveAttribute('placeholder', PLACEHOLDER)
    await expect(page.getByText(EMPTY_GRAPH_HINT, { exact: true })).toBeVisible()
    await expect.poll(() => countColourPixels(page, BLUE)).toBe(0)
    await expect(canvas(page)).toBeVisible()
  })
})
