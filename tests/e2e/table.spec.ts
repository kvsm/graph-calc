/// <reference lib="dom" />
// UX-SPEC §7 — table of values; acceptance checklist item 36.
import { expect, openApp, openTable, overflow, setExpression, tableRows, test } from '../fixtures/app.ts'

test.beforeEach(async ({ page }) => {
  await openApp(page)
})

test('dialog is titled with the expression and shows 21 rows from round(xmin) with a nice step', async ({ page }) => {
  const dialog = await openTable(page, 1)
  await expect(dialog).toHaveAccessibleName('Table of values: y = sin(x)')
  await expect(dialog.getByLabel('Start', { exact: true })).toHaveValue('-10')
  await expect(dialog.getByLabel('Step', { exact: true })).toHaveValue('1')
  const rows = await tableRows(dialog)
  expect(rows).toHaveLength(21)
  expect(rows[0][0]).toBe('-10')
  expect(rows[20][0]).toBe('10')
  expect(rows.find((r) => r[0] === '0')).toEqual(['0', '0'])
  expect(rows.find((r) => r[0] === '1')).toEqual(['1', '0.8415'])
  expect(rows.find((r) => r[0] === '-1')).toEqual(['-1', '-0.8415'])
})

test('table is captioned with x / y column headers scoped to columns', async ({ page }) => {
  const dialog = await openTable(page, 1)
  const table = dialog.getByRole('table')
  await expect(table.locator('caption')).toHaveCount(1)
  await expect(table.locator('caption')).not.toBeEmpty()
  await expect(table.getByRole('columnheader')).toHaveText(['x', 'y'])
  const scopes = await table.locator('thead th').evaluateAll((ths) => ths.map((t) => t.getAttribute('scope')))
  expect(scopes).toEqual(['col', 'col'])
})

test('undefined values show "undefined", not blank', async ({ page }) => {
  await setExpression(page, 1, 'y = sqrt(x)')
  const dialog = await openTable(page, 1)
  await expect(dialog).toHaveAccessibleName('Table of values: y = sqrt(x)')
  const rows = await tableRows(dialog)
  expect(rows.find((r) => r[0] === '-1')).toEqual(['-1', 'undefined'])
  expect(rows.find((r) => r[0] === '4')).toEqual(['4', '2'])
})

test('values use the §5.3 formatter', async ({ page }) => {
  await setExpression(page, 1, 'y = 1000000x')
  const dialog = await openTable(page, 1)
  const rows = await tableRows(dialog)
  expect(rows.find((r) => r[0] === '1')).toEqual(['1', '1e6'])
  expect(rows.find((r) => r[0] === '-0' || r[0] === '0')?.[0]).toBe('0')
})

test('Start and Step are editable', async ({ page }) => {
  const dialog = await openTable(page, 1)
  await dialog.getByLabel('Start', { exact: true }).fill('0')
  await dialog.getByLabel('Step', { exact: true }).fill('0.5')
  await dialog.getByLabel('Step', { exact: true }).blur()
  await expect.poll(async () => (await tableRows(dialog))[1]?.[0]).toBe('0.5')
  const rows = await tableRows(dialog)
  expect(rows[0][0]).toBe('0')
  expect(rows).toHaveLength(21)
  expect(rows[20][0]).toBe('10')
})

test('focus is trapped inside the dialog', async ({ page }) => {
  const dialog = await openTable(page, 1)
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
  }
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Shift+Tab')
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
  }
})

for (const how of ['Escape', 'Close button', 'overlay click'] as const) {
  test(`closing via ${how} returns focus to the overflow trigger`, async ({ page }) => {
    const dialog = await openTable(page, 1)
    if (how === 'Escape') await page.keyboard.press('Escape')
    else if (how === 'Close button') await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    else await page.mouse.click(5, 5)
    await expect(dialog).toBeHidden()
    await expect(overflow(page, 1)).toBeFocused()
  })
}
