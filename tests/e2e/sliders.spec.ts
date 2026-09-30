// UX-SPEC §4 — acceptance checklist items 17–20.
import { type Page } from '@playwright/test'
import {
  canvasSignature,
  expect,
  exprInput,
  liveRegion,
  openApp,
  setExpression,
  slider,
  test,
} from '../fixtures/app.ts'

const valueInput = (page: Page, v: string) => page.getByLabel(`Value of ${v}`, { exact: true })
const minInput = (page: Page, v: string) => page.getByLabel(`Minimum for ${v}`, { exact: true })
const maxInput = (page: Page, v: string) => page.getByLabel(`Maximum for ${v}`, { exact: true })

async function sampleValues(page: Page, durationMs: number, everyMs: number) {
  const samples: { t: number; v: number }[] = []
  const start = Date.now()
  while (Date.now() - start < durationMs) {
    const v = Number(await slider(page, 'a').getAttribute('aria-valuenow'))
    samples.push({ t: Date.now() - start, v })
    await page.waitForTimeout(everyMs)
  }
  return samples
}

test.beforeEach(async ({ page }) => {
  await openApp(page)
  await setExpression(page, 2, 'y = a*sin(x)')
  await expect(slider(page, 'a')).toBeVisible()
})

test.describe('#17 slider creation and live updates', () => {
  test('a*sin(x) creates a slider for a with value 1, range -10..10, step 0.1', async ({ page }) => {
    const s = slider(page, 'a')
    await expect(s).toHaveAttribute('aria-valuenow', '1')
    await expect(s).toHaveAttribute('aria-valuemin', '-10')
    await expect(s).toHaveAttribute('aria-valuemax', '10')
    await expect(valueInput(page, 'a')).toHaveValue('1.0')
    await expect(minInput(page, 'a')).toHaveValue('-10')
    await expect(maxInput(page, 'a')).toHaveValue('10')
    await page.getByRole('button', { name: 'Slider settings for a', exact: true }).click()
    await expect(page.getByRole('dialog').getByLabel('Step')).toHaveValue('0.1')
  })

  test('moving the slider updates the curve live', async ({ page }) => {
    await page.waitForTimeout(300)
    const before = await canvasSignature(page)
    await slider(page, 'a').focus()
    await page.keyboard.press('End')
    await expect(slider(page, 'a')).toHaveAttribute('aria-valuenow', '10')
    await expect.poll(() => canvasSignature(page)).not.toBe(before)
  })

  test('dragging the slider thumb changes the value', async ({ page }) => {
    const thumb = slider(page, 'a')
    const box = await thumb.boundingBox()
    if (!box) throw new Error('slider thumb not visible')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 })
    await page.mouse.up()
    expect(Number(await thumb.getAttribute('aria-valuenow'))).toBeGreaterThan(1)
  })

  test('keyboard: Arrow = 1 step, PageUp = 10 steps, Home/End = min/max', async ({ page }) => {
    const s = slider(page, 'a')
    await s.focus()
    await page.keyboard.press('ArrowRight')
    await expect(s).toHaveAttribute('aria-valuenow', '1.1')
    await page.keyboard.press('PageUp')
    await expect(s).toHaveAttribute('aria-valuenow', '2.1')
    await page.keyboard.press('Home')
    await expect(s).toHaveAttribute('aria-valuenow', '-10')
    await page.keyboard.press('End')
    await expect(s).toHaveAttribute('aria-valuenow', '10')
  })

  test('the value input is editable and drives the slider', async ({ page }) => {
    await valueInput(page, 'a').fill('3')
    await valueInput(page, 'a').blur()
    await expect(slider(page, 'a')).toHaveAttribute('aria-valuenow', '3')
  })

  test('a typed value outside the bounds extends the bound', async ({ page }) => {
    await valueInput(page, 'a').fill('15')
    await valueInput(page, 'a').blur()
    await expect(slider(page, 'a')).toHaveAttribute('aria-valuenow', '15')
    expect(Number(await maxInput(page, 'a').inputValue())).toBeGreaterThanOrEqual(15)
  })

  test('the same variable in two expressions shares one slider', async ({ page }) => {
    await setExpression(page, 3, 'y = a*x')
    await expect(page.getByRole('slider', { name: 'a', exact: true })).toHaveCount(1)
  })

  test('sliders are listed alphabetically, and x, y, e never become sliders', async ({ page }) => {
    await setExpression(page, 2, 'y = b*x + a + e^x')
    await expect(slider(page, 'b')).toBeVisible()
    const names = await page
      .getByRole('slider')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent))
    expect(names).toEqual(['a', 'b'])
  })
})

test.describe('#18 min/max/step validation', () => {
  test('min ≥ max is rejected with "Min must be less than max" and reverts on blur', async ({ page }) => {
    await minInput(page, 'a').fill('20')
    await minInput(page, 'a').blur()
    await expect(page.getByText('Min must be less than max', { exact: true })).toBeVisible()
    await expect(minInput(page, 'a')).toHaveValue('-10')
    await expect(slider(page, 'a')).toHaveAttribute('aria-valuemin', '-10')
  })

  test('min and max are editable', async ({ page }) => {
    await minInput(page, 'a').fill('-2')
    await minInput(page, 'a').blur()
    await maxInput(page, 'a').fill('2')
    await maxInput(page, 'a').blur()
    await expect(slider(page, 'a')).toHaveAttribute('aria-valuemin', '-2')
    await expect(slider(page, 'a')).toHaveAttribute('aria-valuemax', '2')
  })

  test('step is editable in the settings popover and controls display precision', async ({ page }) => {
    await page.getByRole('button', { name: 'Slider settings for a', exact: true }).click()
    const pop = page.getByRole('dialog')
    await expect(pop.getByLabel('Min')).toBeVisible()
    await expect(pop.getByLabel('Max')).toBeVisible()
    await pop.getByLabel('Step').fill('1')
    await pop.getByLabel('Step').blur()
    await page.keyboard.press('Escape')
    await slider(page, 'a').focus()
    await page.keyboard.press('ArrowRight')
    await expect(slider(page, 'a')).toHaveAttribute('aria-valuenow', '2')
    await expect(valueInput(page, 'a')).toHaveValue('2')
    await expect(slider(page, 'a')).toHaveAttribute('aria-valuetext', 'a = 2')
  })

  test('step must be > 0', async ({ page }) => {
    await page.getByRole('button', { name: 'Slider settings for a', exact: true }).click()
    const step = page.getByRole('dialog').getByLabel('Step')
    await step.fill('0')
    await step.blur()
    await expect(step).not.toHaveValue('0')
  })
})

test.describe('#19 animation', () => {
  test('Play animates a sweep, toggles to Pause and announces', async ({ page }) => {
    const play = page.getByRole('button', { name: 'Animate a', exact: true })
    await expect(play).toHaveAttribute('aria-pressed', 'false')
    await play.click()
    const pause = page.getByRole('button', { name: 'Pause a', exact: true })
    await expect(pause).toHaveAttribute('aria-pressed', 'true')
    await expect(liveRegion(page)).toHaveText('Animating a')
    const samples = await sampleValues(page, 1500, 50)
    // Smooth motion: many distinct values, all snapped within bounds.
    expect(new Set(samples.map((s) => s.v)).size).toBeGreaterThan(8)
    for (const { v } of samples) {
      expect(v).toBeGreaterThanOrEqual(-10)
      expect(v).toBeLessThanOrEqual(10)
      expect(Math.abs(v * 10 - Math.round(v * 10))).toBeLessThan(1e-6)
    }
    await pause.click()
    await expect(liveRegion(page)).toHaveText(/^Paused a = -?\d+(\.\d)?$/)
    const stopped = await slider(page, 'a').getAttribute('aria-valuenow')
    await page.waitForTimeout(300)
    await expect(slider(page, 'a')).toHaveAttribute('aria-valuenow', stopped ?? '')
  })

  test('the sweep ping-pongs between min and max (full sweep ≈ 4s)', async ({ page }) => {
    await minInput(page, 'a').fill('0')
    await minInput(page, 'a').blur()
    await maxInput(page, 'a').fill('1')
    await maxInput(page, 'a').blur()
    await page.getByRole('button', { name: 'Animate a', exact: true }).click()
    const samples = await sampleValues(page, 5000, 100)
    const values = samples.map((s) => s.v)
    expect(Math.max(...values)).toBe(1)
    const peak = values.indexOf(1)
    expect(Math.min(...values.slice(peak))).toBeLessThan(1) // came back down
  })

  test('with reduced motion it advances in discrete ~500ms steps', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByRole('button', { name: 'Animate a', exact: true }).click()
    const samples = await sampleValues(page, 2600, 40)
    const changes: number[] = []
    for (let i = 1; i < samples.length; i++) if (samples[i].v !== samples[i - 1].v) changes.push(samples[i].t)
    expect(changes.length).toBeGreaterThanOrEqual(3)
    expect(changes.length).toBeLessThanOrEqual(7)
    for (let i = 1; i < changes.length; i++) expect(changes[i] - changes[i - 1]).toBeGreaterThan(350)
  })
})

test.describe('#20 accessible value text', () => {
  test('slider exposes aria-valuetext "a = 1.0"', async ({ page }) => {
    await expect(slider(page, 'a')).toHaveAttribute('aria-valuetext', 'a = 1.0')
    await expect(exprInput(page, 2)).toHaveValue('y = a*sin(x)')
  })
})
