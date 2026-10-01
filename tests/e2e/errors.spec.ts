// UX-SPEC §3 / §3.1 — acceptance checklist items 12 and 13, plus error announcements (§9.2).
import { type Page } from '@playwright/test'
import {
  ERROR_MESSAGES,
  errorText,
  errorTokens,
  isSymbolToken,
  spokenName,
  visibleText,
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

const missingBracketError = (page: Page) =>
  page.locator('[id^="expr-"][id$="-error"]').filter({ hasText: /^Missing closing bracket/ })

test.beforeEach(async ({ page }) => {
  await openApp(page)
})

test.describe('#12 exact §3.1 messages with code-span tokens, aria-invalid and aria-describedby', () => {
  for (const [input, message] of ERROR_MESSAGES) {
    test(`${JSON.stringify(input)} → ${errorText(message)}`, async ({ page }) => {
      await setExpression(page, 1, input)
      const field = exprInput(page, 1)
      await expect(field).toHaveAttribute('aria-invalid', 'true')

      const describedBy = (await field.getAttribute('aria-describedby')) ?? ''
      const errorId = describedBy.split(/\s+/).find((id) => /^expr-.+-error$/.test(id))
      expect(errorId, `aria-describedby="${describedBy}" should reference expr-<id>-error`).toBeTruthy()
      const errorLine = page.locator(`[id="${errorId}"]`)
      await expect(errorLine).toBeVisible()

      // Visible text matches the spec once the code-span markup is ignored.
      await expect.poll(() => visibleText(errorLine)).toBe(errorText(message))
      // Only characters a user can type.
      expect(await errorLine.textContent()).not.toMatch(/[·…“”‘’]/)

      // Each token is rendered inside a <code> element, in order.
      const codes = errorLine.locator('code')
      const tokens = errorTokens(message)
      await expect(codes).toHaveCount(tokens.length)
      for (const [i, token] of tokens.entries()) {
        expect(await visibleText(codes.nth(i))).toBe(token)
        if (isSymbolToken(token)) {
          // Single symbols carry an sr-only spoken name and hide the glyph from AT.
          await expect(codes.nth(i).locator('[aria-hidden="true"]')).toHaveText(token)
          await expect(codes.nth(i).locator('.sr-only')).toHaveText(spokenName(token))
        }
      }
    })
  }
})

test.describe('error timing (§3)', () => {
  test('error appears ~600ms after typing stops, not mid-typing', async ({ page }) => {
    const field = exprInput(page, 1)
    await field.fill('')
    await field.pressSequentially('y = sin(', { delay: 30 })
    const typedAt = Date.now()
    const error = missingBracketError(page)
    await expect(error).toBeHidden()
    await expect(field).toBeFocused()
    await expect(error).toBeVisible({ timeout: 3000 })
    expect(Date.now() - typedAt).toBeGreaterThanOrEqual(450)
  })

  test('error appears immediately on blur', async ({ page }) => {
    const field = exprInput(page, 1)
    await field.fill('y = sin(')
    await field.blur()
    await expect(missingBracketError(page)).toBeVisible({ timeout: 300 })
  })

  test('error clears immediately when the text becomes valid', async ({ page }) => {
    const field = exprInput(page, 1)
    await setExpression(page, 1, 'y = sin(')
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await field.focus()
    await page.keyboard.press('End')
    await page.keyboard.type('x)')
    await expect(missingBracketError(page)).toBeHidden({ timeout: 400 })
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

test.describe('CR-02 / CR-03 long input and crash safety', () => {
  const rootIsRendered = (page: import('@playwright/test').Page) =>
    page.evaluate(() => (document.getElementById('root')?.innerHTML.length ?? 0) > 0)

  test('a 20,000-character paste never blanks the app and stays responsive', async ({ page }) => {
    const field = exprInput(page, 1)
    await field.fill('x'.repeat(20_000))
    await field.blur()
    expect(await rootIsRendered(page)).toBe(true)
    await expect(field).toBeVisible()
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    // The UI still responds promptly (no multi-second freeze on re-sample).
    const start = Date.now()
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await expect(page.getByTestId('graph-canvas')).toHaveAttribute('aria-label', /x from -5 to 5/, { timeout: 2000 })
    expect(Date.now() - start).toBeLessThan(1500)
    expect(await rootIsRendered(page)).toBe(true)
  })

  test('a pasted implicit product (20,000 factors) in a second row does not crash the table or graph', async ({ page }) => {
    await setExpression(page, 2, 'x'.repeat(20_000))
    expect(await rootIsRendered(page)).toBe(true)
    await page.getByRole('button', { name: 'More options for expression 2', exact: true }).click()
    const item = page.getByRole('menuitem', { name: 'Table of values' })
    if (await item.isEnabled()) await item.click()
    await page.waitForTimeout(300)
    expect(await rootIsRendered(page)).toBe(true)
  })

  test('an input over 500 characters shows an error', async ({ page }) => {
    const long = 'x' + '+x'.repeat(250) // 501 characters, otherwise valid
    expect(long.length).toBe(501)
    await setExpression(page, 1, long)
    const field = exprInput(page, 1)
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    const describedBy = (await field.getAttribute('aria-describedby')) ?? ''
    const errorId = describedBy.split(/\s+/).find((id) => /^expr-.+-error$/.test(id))
    expect(errorId).toBeTruthy()
    await expect(page.locator(`[id="${errorId}"]`)).not.toBeEmpty()
  })

  test('a render error is caught by an error boundary instead of blanking the page', async ({ page, pageErrors }) => {
    // Inject a failure into number formatting, which the graph label uses while rendering.
    await page.addInitScript(() => {
      const original = Number.prototype.toPrecision
      Number.prototype.toPrecision = function (this: number, p?: number) {
        if ((window as unknown as { __boom?: boolean }).__boom) throw new Error('test-injected render error')
        return original.call(this, p)
      }
    })
    await page.reload()
    await expect(exprInput(page, 1)).toBeVisible()
    await page.evaluate(() => {
      ;(window as unknown as { __boom?: boolean }).__boom = true
    })
    await exprInput(page, 2).fill('y = 2x')
    await page.waitForTimeout(600)
    await page.evaluate(() => {
      ;(window as unknown as { __boom?: boolean }).__boom = false
    })
    expect(await rootIsRendered(page), '#root was emptied (no error boundary)').toBe(true)
    // Either the app survived, or the boundary replaced it with a fallback offering a way out.
    if (!(await exprInput(page, 1).isVisible())) {
      await expect(page.getByRole('button', { name: /reset|reload|try again|start over/i }).first()).toBeVisible()
    }
    // The injected error is expected here; don't let the auto fixture fail on it.
    pageErrors.splice(0, pageErrors.length)
  })
})
