// UX-SPEC §3 / §3.1 — acceptance checklist items 12 and 13, plus error announcements (§9.2).
import {
  ERROR_MESSAGES,
  PALETTE,
  allExprInputs,
  countColourPixels,
  expect,
  exprInput,
  liveRegion,
  openApp,
  setExpression,
  test,
} from '../fixtures/app.ts'

test.beforeEach(async ({ page }) => {
  await openApp(page)
})

test.describe('#12 exact §3.1 messages with aria-invalid and aria-describedby', () => {
  for (const [input, message] of ERROR_MESSAGES) {
    test(`${JSON.stringify(input)} → ${message}`, async ({ page }) => {
      await setExpression(page, 1, input)
      const field = exprInput(page, 1)
      await expect(field).toHaveAttribute('aria-invalid', 'true')
      await expect(field).toHaveAccessibleDescription(message)

      const describedBy = (await field.getAttribute('aria-describedby')) ?? ''
      const errorId = describedBy.split(/\s+/).find((id) => /^expr-.+-error$/.test(id))
      expect(errorId, `aria-describedby="${describedBy}" should reference expr-<id>-error`).toBeTruthy()
      const errorLine = page.locator(`[id="${errorId}"]`)
      await expect(errorLine).toBeVisible()
      await expect(errorLine).toHaveText(message)
    })
  }
})

test.describe('error timing (§3)', () => {
  test('error appears ~600ms after typing stops, not mid-typing', async ({ page }) => {
    const field = exprInput(page, 1)
    await field.fill('')
    await field.pressSequentially('y = sin(', { delay: 30 })
    const typedAt = Date.now()
    const error = page.getByText('Missing closing bracket ).', { exact: true })
    await expect(error).toBeHidden()
    await expect(field).toBeFocused()
    await expect(error).toBeVisible({ timeout: 3000 })
    expect(Date.now() - typedAt).toBeGreaterThanOrEqual(450)
  })

  test('error appears immediately on blur', async ({ page }) => {
    const field = exprInput(page, 1)
    await field.fill('y = sin(')
    await field.blur()
    await expect(page.getByText('Missing closing bracket ).', { exact: true })).toBeVisible({ timeout: 300 })
  })

  test('error clears immediately when the text becomes valid', async ({ page }) => {
    const field = exprInput(page, 1)
    await setExpression(page, 1, 'y = sin(')
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await field.focus()
    await page.keyboard.press('End')
    await page.keyboard.type('x)')
    await expect(page.getByText('Missing closing bracket ).', { exact: true })).toBeHidden({ timeout: 400 })
    await expect(field).not.toHaveAttribute('aria-invalid', 'true')
  })

  test('the error is announced once on blur', async ({ page }) => {
    await setExpression(page, 1, 'sin(')
    await expect(liveRegion(page)).toHaveText(/^Expression 1: Missing closing bracket/)
  })
})

test.describe('#13 no crashes', () => {
  test('every §3.1 input and assorted junk leaves the app working with no uncaught errors', async ({
    page,
    consoleErrors,
  }) => {
    const junk = ['((((', '))))', '^^^', '=', '==', '.', ',', 'x,,', '()', '(,)', 'sin(cos(', '_',
      'import({}, {})', 'x.constructor', 'constructor(x)', '__proto__', '[1,2]', '"abc"',
      '1 cm to inch', '('.repeat(500) + 'x', 'x+'.repeat(2000) + 'x', 'y = x = 2', '😀', 'sinx']
    for (const input of [...ERROR_MESSAGES.map(([i]) => i), ...junk]) {
      await setExpression(page, 1, input)
    }
    // Still interactive: a valid expression plots.
    await setExpression(page, 1, 'y = sin(x)')
    await expect(exprInput(page, 1)).not.toHaveAttribute('aria-invalid', 'true')
    await expect.poll(() => countColourPixels(page, PALETTE[0].light)).toBeGreaterThan(100)
    await expect(allExprInputs(page)).toHaveCount(2)
    expect(consoleErrors).toEqual([])
  })

  test('evaluation-time non-finite values are gaps, not errors', async ({ page }) => {
    for (const input of ['y = sqrt(x)', 'y = 1/x', 'y = ln(x)', 'y = 1/0']) {
      await setExpression(page, 1, input)
      await expect(exprInput(page, 1)).not.toHaveAttribute('aria-invalid', 'true')
    }
  })
})
