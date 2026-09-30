/// <reference lib="dom" />
// UX-SPEC §8 — acceptance checklist items 28 and 29.
import {
  PALETTE,
  colourDistance,
  countColourPixels,
  dominantColour,
  expect,
  hexToRgb,
  openApp,
  test,
  toolbarButton,
} from '../fixtures/app.ts'

const isDark = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.classList.contains('dark'))

function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

test.describe('#28 palette', () => {
  const SPEC = [
    ['Blue', '#0072B2', '#56B4E9'],
    ['Vermillion', '#D55E00', '#F07A3A'],
    ['Green', '#007A5A', '#2FC4A0'],
    ['Magenta', '#B8528E', '#CC79A7'],
    ['Orange', '#A66A00', '#F0E442'],
    ['Violet', '#6A3D9A', '#B39DFF'],
    ['Grey', '#3D3D3D', '#E0E0E0'],
  ]

  test('uses the §8.1 values verbatim, all ≥ 3:1 against the graph background', () => {
    expect(PALETTE.map((c) => [c.name, c.light.toUpperCase(), c.dark.toUpperCase()])).toEqual(SPEC)
    for (const c of PALETTE) {
      expect(contrast(c.light, '#FFFFFF'), `${c.name} light`).toBeGreaterThanOrEqual(3)
      expect(contrast(c.dark, '#0A0A0A'), `${c.name} dark`).toBeGreaterThanOrEqual(3)
    }
  })
})

test.describe('#29 theme', () => {
  test.describe('OS prefers light', () => {
    test.use({ colorScheme: 'light' })

    test('starts light with a white graph and the light curve colour', async ({ page }) => {
      await openApp(page)
      expect(await isDark(page)).toBe(false)
      await expect(toolbarButton(page, 'Switch to dark theme')).toBeVisible()
      await expect.poll(() => countColourPixels(page, PALETTE[0].light)).toBeGreaterThan(100)
      expect(colourDistance(await dominantColour(page), '#FFFFFF')).toBeLessThanOrEqual(6)
    })

    test('toggle switches to dark, swaps curve colours, and persists across reload', async ({ page }) => {
      await openApp(page)
      await toolbarButton(page, 'Switch to dark theme').click()
      await expect.poll(() => isDark(page)).toBe(true)
      await expect(toolbarButton(page, 'Switch to light theme')).toBeVisible()
      await expect.poll(() => countColourPixels(page, PALETTE[0].dark)).toBeGreaterThan(100)
      await expect.poll(() => countColourPixels(page, PALETTE[0].light)).toBe(0)
      await expect.poll(async () => colourDistance(await dominantColour(page), '#0A0A0A')).toBeLessThanOrEqual(6)

      await page.reload()
      await expect.poll(() => isDark(page)).toBe(true)
      await expect(toolbarButton(page, 'Switch to light theme')).toBeVisible()

      await toolbarButton(page, 'Switch to light theme').click()
      await expect.poll(() => isDark(page)).toBe(false)
      await expect.poll(() => countColourPixels(page, PALETTE[0].light)).toBeGreaterThan(100)
    })

    test('follows OS changes until the user chooses explicitly', async ({ page }) => {
      await openApp(page)
      await page.emulateMedia({ colorScheme: 'dark' })
      await expect.poll(() => isDark(page)).toBe(true)
      await page.emulateMedia({ colorScheme: 'light' })
      await expect.poll(() => isDark(page)).toBe(false)

      await toolbarButton(page, 'Switch to dark theme').click()
      await expect.poll(() => isDark(page)).toBe(true)
      await page.emulateMedia({ colorScheme: 'light' })
      await page.waitForTimeout(200)
      expect(await isDark(page)).toBe(true)
    })

    test('the toggle cycles only light ↔ dark (no third state)', async ({ page }) => {
      await openApp(page)
      const button = page.getByRole('toolbar', { name: 'Graph controls' }).getByRole('button', { name: /^Switch to (dark|light) theme$/ })
      const seen: boolean[] = []
      for (let i = 0; i < 4; i++) {
        await button.click()
        await page.waitForTimeout(50)
        seen.push(await isDark(page))
      }
      expect(seen).toEqual([true, false, true, false])
    })
  })

  test.describe('OS prefers dark', () => {
    test.use({ colorScheme: 'dark' })

    test('starts dark with the dark graph background and dark curve colour', async ({ page }) => {
      await openApp(page)
      expect(await isDark(page)).toBe(true)
      await expect(toolbarButton(page, 'Switch to light theme')).toBeVisible()
      await expect.poll(() => countColourPixels(page, PALETTE[0].dark)).toBeGreaterThan(100)
      expect(colourDistance(await dominantColour(page), '#0A0A0A')).toBeLessThanOrEqual(6)
    })
  })
})
