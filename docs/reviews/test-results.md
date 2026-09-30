# E2E results: Part B (UI at 9287c41)

Author: tester. Suite: `npx playwright test` (Chromium). 166 tests.

- **Lead's run before my fixes:** 146 passed, 20 failed.
- **After my test fixes:** 163 passed, 3 failed. All 3 are app bugs, listed below. The suite also passes on
  `--repeat-each=2`, apart from those 3.

## App bugs

### 1. major: graph wrapper has no visible focus indicator (owner: frontend-dev-2)
- **Test:** `accessibility.spec.ts` › #32 visible focus › every element reached by Tab shows a focus indicator
- **Spec:** §9.4 says the canvas wrapper shows an inset 2px `--ring` outline on `focus-visible`. Also checklist #32.
- **Expected:** a visible outline when the wrapper is reached by Tab.
- **Actual:** the computed style on `:focus-visible` is `outline-style: none; outline-width: 2px;
  outline-color: rgb(37, 99, 235)`, so nothing is drawn. In Tailwind v4, `outline-none` sets
  `--tw-outline-style: none`, and `outline-2` reuses that variable.
- **Where:** `src/components/graph/GraphView.tsx:520`. The class list is
  `outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring`.
- **Fix:** replace `outline-none` with `outline-hidden` (Tailwind v4's replacement for v3's `outline-none`),
  or add `focus-visible:outline-solid`.

### 2. major: panel collapse still animates under reduced motion (owner: frontend-dev)
- **Test:** `accessibility.spec.ts` › #34 reduced motion › panel collapses instantly and zoom buttons jump
- **Spec:** §9.6 says no panel slide transitions under `prefers-reduced-motion: reduce`. Also checklist #34.
- **Expected:** the aside width is 0 on the next frame.
- **Actual:** the width animates 384 → 341 → 251 → 163 → 99 → … over about 150ms. `document.getAnimations()`
  shows CSS transitions on `width`, `border-right-width` and `background-color`.
- **Cause:** `duration-150` is unconditional. With `motion-safe:transition-[width]` switched off,
  `transition-property` falls back to its initial value `all`, so every property transitions for 150ms.
- **Where:** `src/components/panel/ExpressionPanel.tsx:172`
- **Fix:** use `motion-safe:duration-150` (or add `motion-reduce:transition-none`).

### 3. major: phone sheet still animates under reduced motion (owner: frontend-dev)
- **Test:** `accessibility.spec.ts` › #34 reduced motion › phone › sheet opens instantly
- **Spec:** §9.6 and §1.3, checklist #34.
- **Expected:** the sheet is about 85% of the viewport height on the next frame after tapping the handle.
- **Actual:** the handle's y position animates 529 → 483 → 388 → 295 → 228 → … Its height fraction is 0.41–0.72
  one frame after the tap.
- **Cause:** the same unconditional `duration-150` as bug 2, next to `motion-safe:transition-[height]`.
- **Where:** `src/components/panel/ExpressionPanel.tsx:271`
- **Fix:** as for bug 2.

## Observation (not failing; spec is ambiguous, UX to decide)
- Pressing `T` when the nearest curve point is off-screen (e.g. `y = 2000000` at the default view) starts the
  trace and announces "y = 2000000: x 0, y 2e6." But the tooltip isn't shown and the view doesn't pan. §5.2
  only requires panning for ←/→ in trace mode. Consider applying `keepInView` on entry as well
  (`src/components/graph/GraphView.tsx`, owner frontend-dev-2).

## Failures that were test bugs (fixed in tests/, commit follows this file)
| Test | Cause |
|---|---|
| graph › Keyboard shortcuts dialog | `/trace/i` doesn't match "tracing" |
| graph › `]`/`[` switching; hidden curves skipped; tooltip `y = 1`, 1.234e-5, -5e-7 | Pressed `T` before the 150ms debounce re-plotted. Added `waitForPlot()`, which waits on the canvas aria-label |
| graph › tooltip `y = 2000000` | The line is off-screen at every zoom level from the origin, so the test now zooms and pans to it |
| sliders › alphabetical / x,y,e | Read the slider list before slider `b` appeared (debounce) |
| a11y › #33 coarse targets | Counted buttons before "Animate a" appeared. All targets measure 44×44 |
| a11y › #32 slider thumb | The ring is drawn on the thumb's aria-hidden inner dot. The check now includes descendants |
| persistence › round trip | Collapsing the panel widens the canvas and keeps centre and scale (x range -12.29…16.29 is correct). Now compares the viewport before and after reload |
| persistence › corrupt storage ×6 | The app flushes state on `pagehide` (`src/hooks/useAppStore.ts:56`), overwriting the corruption. The garbage is now injected with an init script |
| responsive › #3 collapse | `toBeHidden` counts clipped inputs as visible, and the width was read mid-transition. Now checks `inert`, not-in-viewport, and polls the width |
