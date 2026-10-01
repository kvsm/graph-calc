/// <reference lib="dom" />
/**
 * Shared Playwright fixtures and helpers for the graphing calculator e2e suite.
 * Selectors follow docs/UX-SPEC.md §10 (role + accessible name) exactly.
 */
import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { PALETTE } from '../../src/lib/palette.ts'

export { expect, PALETTE }

// ---- Microcopy (UX-SPEC §10) ------------------------------------------------

export const PLACEHOLDER = 'e.g. y = x^2'
export const PANEL_TITLE = 'Expressions'
export const WRAPPER_LABEL = 'Graph. Arrow keys pan, plus and minus zoom, T traces.'
export const EMPTY_GRAPH_HINT = 'Add an expression to see it graphed.'
export const FOOTER_TIP = 'Tip: use a letter like a to make a slider.'
export const LIVE_REGION_ID = 'app-live-region'

/**
 * UX-SPEC §3.1 (87a6731), verbatim, with tokens in backticks as in the spec's Message column.
 * Tokens render as <code> spans; use `errorText()` for the visible text and `errorTokens()` for the tokens.
 */
export const ERROR_MESSAGES: ReadonlyArray<readonly [input: string, message: string]> = [
  ['sin(', 'Missing closing bracket `)`.'],
  ['sin(x))', 'Unexpected `)` - there are more closing brackets than opening ones.'],
  ['y =', 'Nothing after `=`. Type an expression, e.g. `y = 2x + 1`.'],
  ['f(x) =', 'Nothing after `=`. Type an expression, e.g. `y = 2x + 1`.'],
  ['foo(x)', 'Unknown function `foo`. Try `sin`, `cos`, `tan`, `sqrt`, `abs`, `ln`, `log` or `exp`.'],
  ['SIN(x)', 'Unknown function `SIN`. Did you mean `sin`?'],
  ['sin x', 'Add brackets: `sin(x)`.'],
  ['2 +', 'Expression ends unexpectedly after `+`.'],
  ['x = 3', 'Only `y` or `f(x)` equations can be graphed, e.g. `y = 3x` or `f(x) = 3x`.'],
  ['z = x', 'Only `y` or `f(x)` equations can be graphed, e.g. `y = 3x` or `f(x) = 3x`.'],
  ['a = 5', 'To make a slider, just use `a` in an expression, e.g. `y = a*sin(x)`.'],
  ['e = 5', "`e` is a constant (about 2.718), so it can't be set. Use another letter for a slider, e.g. `a`."],
  ['sqrt()', '`sqrt` needs a value, e.g. `sqrt(x)`.'],
  ['y = y + 1', "`y` can't appear on the right-hand side."],
  ['2 ** x', 'Use `^` for powers, e.g. `2^x`.'],
  ['x $ 2', "Couldn't understand this expression. Check for typos near `$`."],
]

/** Visible message text: the spec message without the backtick token markers. */
export const errorText = (message: string) => message.replace(/`/g, '')

/** Tokens (code spans) in a spec message, in order. */
export const errorTokens = (message: string) => Array.from(message.matchAll(/`([^`]+)`/g), (m) => m[1])

/** Spoken names for single-symbol tokens (§3.1). */
export const SYMBOL_NAMES: Readonly<Record<string, string>> = {
  '(': 'opening bracket',
  ')': 'closing bracket',
  '=': 'equals sign',
  '+': 'plus sign',
  '-': 'minus sign',
  '*': 'star',
  '/': 'slash',
  '^': 'caret',
  ',': 'comma',
  '**': 'double star',
}

/** A symbol token is one with no letters or digits; others are read as written. */
export const isSymbolToken = (t: string) => !/[A-Za-z0-9]/.test(t)

/** Spoken name of a symbol token: its §3.1 name, or "symbol <char>". */
export const spokenName = (t: string) => SYMBOL_NAMES[t] ?? `symbol ${t}`

/** Text a sighted user sees: textContent minus .sr-only nodes, whitespace collapsed. */
export async function visibleText(locator: Locator): Promise<string> {
  return locator.evaluate((el) => {
    const clone = el.cloneNode(true) as Element
    clone.querySelectorAll('.sr-only').forEach((n) => n.remove())
    return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
  })
}

// ---- Fixtures ---------------------------------------------------------------

interface Fixtures {
  /** Uncaught page errors; the test fails at teardown if any occurred (UX-SPEC §13 #13). */
  pageErrors: Error[]
  /** console.error messages, for tests that want to assert on them. */
  consoleErrors: string[]
}

export const test = base.extend<Fixtures>({
  pageErrors: [
    async ({ page }, provide) => {
      const errors: Error[] = []
      page.on('pageerror', (e) => errors.push(e))
      await provide(errors)
      expect(errors.map((e) => e.message), 'uncaught errors in the page').toEqual([])
    },
    { auto: true },
  ],
  consoleErrors: async ({ page }, provide) => {
    const messages: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') messages.push(m.text())
    })
    await provide(messages)
  },
})

// ---- Locators ---------------------------------------------------------------

export const exprInput = (page: Page, n: number) =>
  page.getByRole('textbox', { name: `Expression ${n}`, exact: true })
export const allExprInputs = (page: Page) => page.getByRole('textbox', { name: /^Expression \d+$/ })
export const swatch = (page: Page, n: number) =>
  page.getByRole('button', { name: `Show expression ${n}`, exact: true })
export const overflow = (page: Page, n: number) =>
  page.getByRole('button', { name: `More options for expression ${n}`, exact: true })
export const canvas = (page: Page) => page.getByTestId('graph-canvas')
export const graphWrapper = (page: Page) => page.getByLabel(WRAPPER_LABEL, { exact: true })
export const liveRegion = (page: Page) => page.locator(`[id="${LIVE_REGION_ID}"]`)
export const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Graph controls' })
export const toolbarButton = (page: Page, name: string) =>
  toolbar(page).getByRole('button', { name, exact: true })
export const panel = (page: Page) => page.getByRole('complementary', { name: 'Expressions' })
export const slider = (page: Page, v: string) => page.getByRole('slider', { name: v, exact: true })
export const sheetHandle = (page: Page) =>
  page.getByRole('button', { name: 'Resize expressions panel', exact: true })
/** The trace tooltip's coordinate line, e.g. "(1.571, 1)". */
export const traceCoords = (page: Page) =>
  page.getByRole('main').getByText(/^\(\s*[-−]?[\d.]+(e[-+]?\d+)?,\s*([-−]?[\d.]+(e[-+]?\d+)?|undefined)\s*\)$/)

// ---- Actions ----------------------------------------------------------------

/** Load the app (fresh context = empty localStorage) and wait for the first-run row. */
export async function openApp(page: Page) {
  await page.goto('/')
  await expect(exprInput(page, 1)).toBeVisible()
}

/** Replace the text of expression row n and commit it (blur), so errors show immediately. */
export async function setExpression(page: Page, n: number, text: string, { commit = true } = {}) {
  const input = exprInput(page, n)
  await input.fill(text)
  if (commit) await input.blur()
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Wait until the graph has picked up an expression (after the 150ms debounce): the canvas
 * aria-label lists visible expressions. Pass `present: false` to wait for it to disappear.
 */
export async function waitForPlot(page: Page, text: string, { present = true } = {}) {
  const re = new RegExp(`[:,] ${escapeRe(text)}[,.]`)
  if (present) await expect(canvas(page)).toHaveAttribute('aria-label', re)
  else await expect(canvas(page)).not.toHaveAttribute('aria-label', re)
}

export async function openMenu(page: Page, n: number) {
  await overflow(page, n).click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  return menu
}

export async function openTable(page: Page, n: number) {
  const menu = await openMenu(page, n)
  await menu.getByRole('menuitem', { name: 'Table of values' }).click()
  const dialog = page.getByRole('dialog', { name: /^Table of values:/ })
  await expect(dialog).toBeVisible()
  return dialog
}

/** [x, y] cell texts of the table-of-values body rows. */
export async function tableRows(dialog: Locator): Promise<string[][]> {
  return dialog
    .locator('tbody tr')
    .evaluateAll((rows) =>
      rows.map((r) => Array.from(r.querySelectorAll('td,th')).map((c) => (c.textContent ?? '').trim())),
    )
}

/** Focus the canvas wrapper without clicking (clicking would move the trace/pan). */
export async function focusGraph(page: Page) {
  await graphWrapper(page).focus()
  await expect(graphWrapper(page)).toBeFocused()
}

export async function nextFrame(page: Page, frames = 2) {
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        const step = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)))
        step(n)
      }),
    frames,
  )
}

/** Wait until localStorage stops changing (persistence may be debounced). */
export async function waitForStorageToSettle(page: Page, quietMs = 400) {
  let last = ''
  await expect
    .poll(
      async () => {
        const now = await page.evaluate(() => {
          try {
            return JSON.stringify(Object.entries(localStorage).sort())
          } catch {
            return 'unavailable'
          }
        })
        const stable = now === last
        last = now
        return stable
      },
      { intervals: [quietMs], timeout: 10_000 },
    )
    .toBe(true)
}

// ---- Viewport (read from the canvas aria-label, UX-SPEC §9.1) ---------------

export interface Viewport {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

const NUM = '([-−]?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?)'
const RANGE_RE = new RegExp(`x from ${NUM} to ${NUM}, y from ${NUM} to ${NUM}`)

export function parseViewportLabel(label: string): Viewport {
  const m = RANGE_RE.exec(label)
  if (!m) throw new Error(`Canvas aria-label has no "x from … to …, y from … to …": ${label}`)
  const [xMin, xMax, yMin, yMax] = m.slice(1, 5).map((s) => Number(s.replace('−', '-')))
  return { xMin, xMax, yMin, yMax }
}

export async function readViewport(page: Page): Promise<Viewport> {
  return parseViewportLabel((await canvas(page).getAttribute('aria-label')) ?? '')
}

export const spanX = (vp: Viewport) => vp.xMax - vp.xMin
export const spanY = (vp: Viewport) => vp.yMax - vp.yMin

export interface CanvasSize {
  width: number
  height: number
}

export async function canvasSize(page: Page): Promise<CanvasSize> {
  return canvas(page).evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight }))
}

/** World -> CSS px relative to the canvas top-left. */
export function worldToCanvas(vp: Viewport, size: CanvasSize, x: number, y: number) {
  return {
    x: ((x - vp.xMin) / spanX(vp)) * size.width,
    y: ((vp.yMax - y) / spanY(vp)) * size.height,
  }
}

/** CSS px relative to the canvas top-left -> world. */
export function canvasToWorld(vp: Viewport, size: CanvasSize, px: number, py: number) {
  return { x: vp.xMin + (px / size.width) * spanX(vp), y: vp.yMax - (py / size.height) * spanY(vp) }
}

/** Absolute page coordinates of a world point (for page.mouse). */
export async function worldToPage(page: Page, x: number, y: number) {
  const [vp, size, box] = await Promise.all([readViewport(page), canvasSize(page), canvas(page).boundingBox()])
  if (!box) throw new Error('graph canvas is not visible')
  const p = worldToCanvas(vp, size, x, y)
  return { x: box.x + p.x, y: box.y + p.y }
}

// ---- Pixel sampling ---------------------------------------------------------

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

/** Rectangle in CSS px relative to the canvas; omitted edges default to the canvas bounds. */
export interface Rect {
  x0?: number
  x1?: number
  y0?: number
  y1?: number
}

/**
 * Count canvas pixels within `tolerance` (sum of |ΔR|+|ΔG|+|ΔB|) of `hex`.
 * The centre of a 2.5px curve stroke is drawn at full colour, so a small
 * tolerance distinguishes palette colours from grid/axis greys.
 */
export async function countColourPixels(page: Page, hex: string, region: Rect = {}, tolerance = 40) {
  const rgb = hexToRgb(hex)
  return canvas(page).evaluate(
    (el, { rgb, region, tolerance }) => {
      const c = el as HTMLCanvasElement
      const ctx = c.getContext('2d')
      if (!ctx) throw new Error('graph canvas has no 2d context')
      const sx = c.width / Math.max(1, c.clientWidth)
      const sy = c.height / Math.max(1, c.clientHeight)
      const x0 = Math.max(0, Math.floor((region.x0 ?? 0) * sx))
      const y0 = Math.max(0, Math.floor((region.y0 ?? 0) * sy))
      const x1 = Math.min(c.width, Math.ceil((region.x1 ?? c.clientWidth) * sx))
      const y1 = Math.min(c.height, Math.ceil((region.y1 ?? c.clientHeight) * sy))
      if (x1 <= x0 || y1 <= y0) return 0
      const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data
      let n = 0
      for (let i = 0; i < d.length; i += 4) {
        const diff = Math.abs(d[i] - rgb[0]) + Math.abs(d[i + 1] - rgb[1]) + Math.abs(d[i + 2] - rgb[2])
        if (diff <= tolerance && d[i + 3] > 200) n++
      }
      return n
    },
    { rgb, region, tolerance },
  )
}

/** The most common opaque colour on the canvas as "#rrggbb" (i.e. the graph background). */
export async function dominantColour(page: Page): Promise<string> {
  return canvas(page).evaluate((el) => {
    const c = el as HTMLCanvasElement
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('graph canvas has no 2d context')
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    const counts = new Map<number, number>()
    for (let i = 0; i < d.length; i += 16) {
      const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    let best = 0
    let bestN = -1
    for (const [k, n] of counts) if (n > bestN) [best, bestN] = [k, n]
    return `#${best.toString(16).padStart(6, '0')}`
  })
}

/** Cheap fingerprint of the canvas pixels, to detect redraws. */
export async function canvasSignature(page: Page): Promise<string> {
  return canvas(page).evaluate((el) => {
    const c = el as HTMLCanvasElement
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('graph canvas has no 2d context')
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let h = 2166136261
    for (let i = 0; i < d.length; i += 7) h = Math.imul(h ^ d[i], 16777619)
    return `${c.width}x${c.height}:${h >>> 0}`
  })
}

export function colourDistance(a: string, b: string) {
  const [x, y] = [hexToRgb(a), hexToRgb(b)]
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2])
}

// ---- Number formatting checks (UX-SPEC §5.3) ---------------------------------

/** Significant figures in a formatted number string like "1.571", "1.234e-5", "0.0001". */
export function sigFigs(s: string): number {
  const mantissa = s.replace(/^[-−]/, '').split('e')[0].replace('.', '').replace(/^0+/, '')
  return Math.max(1, mantissa.length)
}

export function parseCoords(text: string): { x: string; y: string } {
  const m = /\(\s*(\S+?),\s*(\S+?)\s*\)/.exec(text)
  if (!m) throw new Error(`not a coordinate pair: ${text}`)
  return { x: m[1], y: m[2] }
}

export const num = (s: string) => Number(s.replace('−', '-'))

// ---- Storage scenarios --------------------------------------------------------

/** Make every localStorage access throw, as in a locked-down/private browser. */
export async function blockLocalStorage(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      },
    })
  })
}

/** Make localStorage writes throw (quota exceeded). Reads still work. */
export async function failLocalStorageWrites(page: Page) {
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    }
  })
}

// ---- Grid steps (UX-SPEC §5.4; mirrors src/lib/viewport/ticks.ts) ------------

/** The 1/2/5 × 10^n step nearest (in log space) to `raw`. */
export function niceStep(raw: number): number {
  const exp = Math.floor(Math.log10(raw))
  let best = 1
  let bestErr = Infinity
  for (const e of [exp - 1, exp, exp + 1]) {
    for (const m of [1, 2, 5]) {
      const step = e >= 0 ? m * 10 ** e : m / 10 ** -e
      const err = Math.abs(Math.log(step / raw))
      if (err < bestErr) [best, bestErr] = [step, err]
    }
  }
  return best
}

/** Major x grid step for the current view (~100px spacing); the minor step is major / 5. */
export async function xGridSteps(page: Page) {
  const [vp, size] = await Promise.all([readViewport(page), canvasSize(page)])
  const major = niceStep((spanX(vp) / Math.max(1, size.width)) * 100)
  return { major, minor: major / 5 }
}

// ---- Axis location by pixel scan ----------------------------------------------

/**
 * Locate the drawn axes: the canvas row / column (CSS px, relative to the canvas) with the
 * most axis-coloured pixels. Independent of how the aria-label ranges are framed.
 */
export async function axisPosition(page: Page, axisHex = '#525252', tolerance = 24) {
  const rgb = hexToRgb(axisHex)
  return canvas(page).evaluate(
    (el, { rgb, tolerance }) => {
      const c = el as HTMLCanvasElement
      const ctx = c.getContext('2d')
      if (!ctx) throw new Error('graph canvas has no 2d context')
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      const rows = new Array<number>(c.height).fill(0)
      const cols = new Array<number>(c.width).fill(0)
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4
          const diff = Math.abs(d[i] - rgb[0]) + Math.abs(d[i + 1] - rgb[1]) + Math.abs(d[i + 2] - rgb[2])
          if (diff <= tolerance && d[i + 3] > 200) {
            rows[y]++
            cols[x]++
          }
        }
      }
      const argmax = (a: number[]) => a.reduce((best, v, i) => (v > a[best] ? i : best), 0)
      const ry = argmax(rows)
      const cx = argmax(cols)
      const sx = c.clientWidth / c.width
      const sy = c.clientHeight / c.height
      return {
        /** y of the x-axis line, or null if no horizontal axis line is drawn. */
        y: rows[ry] > c.width * 0.5 ? ry * sy : null,
        /** x of the y-axis line, or null if no vertical axis line is drawn. */
        x: cols[cx] > c.height * 0.3 ? cx * sx : null,
      }
    },
    { rgb, tolerance },
  )
}

/** Top of the phone bottom sheet (its drag handle), in page px. */
export async function sheetTop(page: Page) {
  const box = await sheetHandle(page).boundingBox()
  if (!box) throw new Error('sheet handle not visible')
  return box.y
}
