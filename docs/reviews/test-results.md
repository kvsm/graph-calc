# E2E results: fix round 2 (HEAD ba0b3b7, plus tests at de397e5)

Author: tester. Suite: `npx playwright test` (Chromium). 206 tests.

- **189 passed, 17 failed.**
  - **16 are pending UX-13/14.** They are all in `errors.spec.ts` › #12 and need the new §3.1 copy from 87a6731,
    which renders tokens as `<code>` spans with sr-only spoken names. They are expected to fail until
    frontend-dev-2 and frontend-dev land UX-13/14, so they aren't triaged here.
  - **1 is an app bug, listed below.**
- **The 5 failures from the previous run are resolved:**
  - Trace step: a test bug, fixed in 75750bc. Shift snaps to the next major grid line, which matches §5.2
    "x snaps to that grid".
  - Persistence round trip, panel collapse and theme persistence: these pass now, fixed by the app in ba0b3b7.
  - Sheet toggle: now fails only on the handle height (bug D1 below). The peek and expanded heights are correct,
    at 0.349 and 0.849 of the viewport.
- **Test updates for the spec changes:**
  - Grid-step trace (UX-17).
  - `aria-disabled` zoom limits (CR-07), asserted directly.
  - Phone toolbar `aria-orientation="horizontal"` (CR-05).
  - `data-testid="empty-graph-hint"` (UX-01).
  - §3.1 code-span copy (87a6731).

## App bugs

### D1. minor: the phone sheet handle is 43px tall, not 44px (owner: frontend-dev)
- **Test:** `responsive.spec.ts` › #4 phone bottom sheet (375×812) › is a bottom sheet in peek state (~35%) that
  toggles to ~85% by tap
- **Spec:** §1.3 calls for a 44px-tall drag handle bar, and §9.5 requires targets of at least 44×44px under a
  coarse pointer.
- **Expected:** handle height ≥ 44px. **Actual:** 43px.
- **Cause:** the header row is `h-11 border-b` (44px including its 1px bottom border, because of border-box).
  The handle button is `absolute inset-0`, so it only fills the 43px padding box.
- **Where:** `src/components/panel/ExpressionPanel.tsx:312` (the header) and `:317` (the button)
- **Fix:** use `h-12` for the header, or extend the button over the border with `-bottom-px`.

---

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
