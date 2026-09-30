/// <reference lib="dom" />
// UX-SPEC §9 — acceptance checklist items 30–35 (36 is in table.spec.ts).
import { AxeBuilder } from '@axe-core/playwright'
import { type Page } from '@playwright/test'
import {
  LIVE_REGION_ID,
  WRAPPER_LABEL,
  canvas,
  expect,
  focusGraph,
  graphWrapper,
  liveRegion,
  nextFrame,
  openApp,
  readViewport,
  setExpression,
  sheetHandle,
  slider,
  test,
  toolbarButton,
} from '../fixtures/app.ts'

test.describe('landmarks and canvas alternative (#30, §9.1, §9.10)', () => {
  test('has the Expressions aside, Graph main and a single h1', async ({ page }) => {
    await openApp(page)
    await expect(page.getByRole('complementary', { name: 'Expressions' })).toBeVisible()
    await expect(page.getByRole('main', { name: 'Graph', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Graphing calculator')
    await expect(page.getByRole('list', { name: 'Expression list' })).toBeVisible()
  })

  test('canvas is role=img with a label listing expressions and visible ranges', async ({ page }) => {
    await openApp(page)
    await expect(canvas(page)).toHaveAttribute('role', 'img')
    await expect(canvas(page)).toHaveAccessibleName(
      /^Graph of 1 expressions?: y = sin\(x\)\. x from -10 to 10, y from -?[\d.]+ to [\d.]+\.$/,
    )
    await setExpression(page, 2, 'y = x^2')
    await expect(canvas(page)).toHaveAccessibleName(
      /^Graph of 2 expressions: y = sin\(x\), y = x\^2\. x from -10 to 10, y from/,
    )
    await focusGraph(page)
    await page.keyboard.press('+')
    await expect(canvas(page)).toHaveAccessibleName(/x from -5 to 5/)
  })

  test('the focusable wrapper describes the controls and points at the live region', async ({ page }) => {
    await openApp(page)
    const wrapper = graphWrapper(page)
    await expect(wrapper).toHaveAccessibleName(WRAPPER_LABEL)
    await expect(wrapper).toHaveAttribute('tabindex', '0')
    await expect(wrapper).toHaveAttribute('aria-describedby', new RegExp(`(^|\\s)${LIVE_REGION_ID}(\\s|$)`))
    await expect(page.getByRole('application')).toHaveCount(0)
  })
})

test.describe('#31 live region', () => {
  test('there is exactly one polite, atomic, visually hidden live region', async ({ page }) => {
    await openApp(page)
    await expect(page.locator('[aria-live]')).toHaveCount(1)
    const region = liveRegion(page)
    await expect(region).toHaveAttribute('aria-live', 'polite')
    await expect(region).toHaveAttribute('aria-atomic', 'true')
    const box = await region.boundingBox()
    expect((box?.width ?? 0) * (box?.height ?? 0)).toBeLessThanOrEqual(1)
  })

  test('announcements are throttled to one per 500ms, trailing edge wins', async ({ page }) => {
    await openApp(page)
    await page.evaluate((id) => {
      const el = document.getElementById(id)
      const log: { t: number; text: string }[] = []
      ;(window as unknown as { __announcements: typeof log }).__announcements = log
      if (!el) return
      new MutationObserver(() => {
        const text = el.textContent ?? ''
        if (text) log.push({ t: performance.now(), text })
      }).observe(el, { childList: true, characterData: true, subtree: true })
    }, LIVE_REGION_ID)
    await focusGraph(page)
    for (let i = 0; i < 4; i++) await page.keyboard.press('+')
    await page.waitForTimeout(1300)
    const log = await page.evaluate(
      () => (window as unknown as { __announcements: { t: number; text: string }[] }).__announcements,
    )
    expect(log.length).toBeGreaterThanOrEqual(1)
    expect(log.length).toBeLessThanOrEqual(3)
    for (let i = 1; i < log.length; i++) expect(log[i].t - log[i - 1].t).toBeGreaterThanOrEqual(450)
    expect(log[log.length - 1].text).toBe('Zoomed in. x from -0.625 to 0.625.')
  })

  test('wheel and drag do not announce viewport changes', async ({ page }) => {
    await openApp(page)
    const box = await canvas(page).boundingBox()
    if (!box) throw new Error('canvas not visible')
    await page.mouse.move(box.x + box.width / 2, box.y + 50)
    await page.mouse.wheel(0, -200)
    await page.waitForTimeout(700)
    await expect(liveRegion(page)).not.toHaveText(/Zoomed/)
  })
})

test.describe('#32 visible focus', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('every element reached by Tab shows a focus indicator', async ({ page }) => {
    await openApp(page)
    await setExpression(page, 2, 'y = a*x')
    await expect(slider(page, 'a')).toBeVisible()
    await page.locator('body').focus()
    const missing: string[] = []
    const seen = new Set<string>()
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      await page.waitForTimeout(160) // let shadcn's box-shadow transition finish
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || el === document.body) return null
        // The indicator may be drawn on the element or on a descendant (e.g. a slider thumb's inner dot).
        const shows = (node: Element) => {
          const s = getComputedStyle(node)
          const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0
          // Tailwind stacks transparent zero-size shadows; ignore those and look for a real one.
          const shadows = s.boxShadow === 'none' ? [] : s.boxShadow.split(/,(?![^(]*\))/)
          const ring = shadows.some((sh) => !/rgba\(0, 0, 0, 0\)/.test(sh) && /[1-9]\d*(\.\d+)?px/.test(sh))
          return outline || ring
        }
        const visible = shows(el) || Array.from(el.querySelectorAll('*')).some(shows)
        const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? ''
        return { key: `${el.tagName.toLowerCase()} "${name}"`, visible }
      })
      if (!info) continue
      if (seen.has(info.key)) continue
      seen.add(info.key)
      if (!info.visible) missing.push(info.key)
    }
    expect(seen.size).toBeGreaterThan(8)
    expect(missing, 'focused elements without a visible focus indicator').toEqual([])
  })

  test('the focus order runs panel → canvas → toolbar', async ({ page }) => {
    await openApp(page)
    await page.locator('body').focus()
    const order: string[] = []
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab')
      order.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''))
    }
    const idx = (label: string) => order.indexOf(label)
    expect(idx('Add expression')).toBeGreaterThanOrEqual(0)
    expect(idx('Add expression')).toBeLessThan(idx('Expression 1'))
    expect(idx('Show expression 1')).toBeLessThan(idx('Expression 1'))
    expect(idx('Expression 1')).toBeLessThan(idx('More options for expression 1'))
    expect(idx('More options for expression 1')).toBeLessThan(idx(WRAPPER_LABEL))
    expect(idx(WRAPPER_LABEL)).toBeLessThan(idx('Zoom in'))
  })
})

async function targetSizes(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((els) =>
    els
      .filter((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && !e.closest('[inert]')
      })
      .map((e) => {
        const r = e.getBoundingClientRect()
        return { name: e.getAttribute('aria-label') ?? e.tagName, w: Math.round(r.width), h: Math.round(r.height) }
      }),
  )
}

test.describe('#33 target sizes', () => {
  test('all interactive targets are at least 24×24px (fine pointer)', async ({ page }) => {
    await openApp(page)
    await setExpression(page, 2, 'y = a*x')
    const small = (await targetSizes(page, 'button, input, [role="slider"], [role="radio"], a[href]')).filter(
      (t) => t.w < 24 || t.h < 24,
    )
    expect(small).toEqual([])
  })

  test.describe('coarse pointer', () => {
    test.use({ viewport: { width: 800, height: 1000 }, hasTouch: true, isMobile: true })

    test('toolbar, swatch, overflow and play buttons are at least 44×44px', async ({ page }) => {
      await openApp(page)
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'coarse pointer emulated').toBe(true)
      await setExpression(page, 2, 'y = a*x')
      await expect(page.getByRole('button', { name: 'Animate a', exact: true })).toBeVisible()
      const selector = [
        '[role="toolbar"][aria-label="Graph controls"] button',
        'button[aria-label^="Show expression "]',
        'button[aria-label^="More options for expression "]',
        'button[aria-label^="Animate "]',
      ].join(', ')
      const sizes = await targetSizes(page, selector)
      expect(sizes.length).toBeGreaterThanOrEqual(5 + 3 + 3 + 1)
      expect(sizes.filter((t) => t.w < 44 || t.h < 44)).toEqual([])
    })
  })
})

test.describe('#34 reduced motion', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('panel collapses instantly and zoom buttons jump', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openApp(page)
    await page.getByRole('button', { name: 'Hide expressions panel', exact: true }).click()
    await nextFrame(page, 1)
    const width = await page.evaluate(() => document.querySelector('aside')?.getBoundingClientRect().width ?? 0)
    expect(width).toBeLessThanOrEqual(1)
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0)

    await toolbarButton(page, 'Zoom in').click()
    await nextFrame(page, 2)
    const vp = await readViewport(page)
    expect([vp.xMin, vp.xMax]).toEqual([-5, 5])
  })

  test.describe('phone', () => {
    test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })
    test('sheet opens instantly', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await openApp(page)
      await sheetHandle(page).tap()
      await nextFrame(page, 1)
      const box = await sheetHandle(page).boundingBox()
      expect((812 - (box?.y ?? 812)) / 812).toBeGreaterThan(0.8)
    })
  })
})

test.describe('#35 axe: zero serious/critical violations', () => {
  const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

  async function expectNoSeriousViolations(page: Page) {
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    const serious = results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join(' | ')}`)
    expect(serious).toEqual([])
  }

  async function populate(page: Page) {
    await setExpression(page, 2, 'y = a*sin(x)')
    await setExpression(page, 3, 'foo(x)')
    await expect(slider(page, 'a')).toBeVisible()
  }

  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`${scheme} desktop`, () => {
      test.use({ colorScheme: scheme, viewport: { width: 1280, height: 800 } })

      test('first run', async ({ page }) => {
        await openApp(page)
        await expectNoSeriousViolations(page)
      })

      test('with sliders and an error', async ({ page }) => {
        await openApp(page)
        await populate(page)
        await expectNoSeriousViolations(page)
      })

      test('with the table of values open', async ({ page }) => {
        await openApp(page)
        await page.getByRole('button', { name: 'More options for expression 1', exact: true }).click()
        await page.getByRole('menuitem', { name: 'Table of values' }).click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await expectNoSeriousViolations(page)
      })

      test('with the panel collapsed', async ({ page }) => {
        await openApp(page)
        await page.getByRole('button', { name: 'Hide expressions panel', exact: true }).click()
        await expectNoSeriousViolations(page)
      })
    })

    test.describe(`${scheme} phone`, () => {
      test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 }, hasTouch: true })

      test('peek sheet', async ({ page }) => {
        await openApp(page)
        await expectNoSeriousViolations(page)
      })

      test('expanded sheet with sliders and an error', async ({ page }) => {
        await openApp(page)
        await sheetHandle(page).tap()
        await populate(page)
        await expectNoSeriousViolations(page)
      })
    })
  }
})
