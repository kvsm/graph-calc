# UX review: built app vs UX-SPEC

Reviewer: UX advocate. Build: `npm run build` from working tree at `9287c41` (plus uncommitted math
changes), served with `vite preview`. Driven with Playwright (Chromium) at 1440×900, 800×1000,
375×812 and 320×640, each in light and dark (`colorScheme` emulation; phone sizes with
`hasTouch`/`isMobile`). Screenshots were kept in the scratchpad, not the repo. They are referred to below
as `<width>-<theme>-<state>`.

The two lead decisions are treated as part of the spec: `f(x) = …` is accepted, and tick labels use the step's precision.

Scope is experience and visuals. Code, accessibility and e2e have their own reviewers. I
mention a11y items only where they are visibly broken.

## Summary

| Severity | Count |
|---|---|
| Blocker | 0 |
| Major | 6 |
| Minor | 12 |
| Polish | 9 |

**Works well:** first run matches the spec (`y = sin(x)` in Blue, placeholder row). Curves are crisp,
and palette contrast holds in both themes. `tan(x)`/`1/x` have no connecting lines. Error messages
appear after a pause and stay out of the way while typing. The Colour popover, table dialog and shortcuts dialog are
clean. Trace clamps y labels to the edge when the axis is off-screen. No horizontal scroll at 320px,
including with three sliders. No console errors. Corrupt localStorage falls back to first run silently.

**Does the slider row fit at 320px?** Yes, with no overflow: min/max are hidden and the settings popover is
reachable. It always wraps to two lines, though (see UX-07). The real breakage is at tablet width (UX-02).

## Findings

Owners: **frontend-dev** is responsible for the panel, layout and App. **frontend-dev-2** is responsible for the graph and toolbar.

### Major

**UX-01 · Major · `1440-light-17-empty` / `b-empty`**. Owner: frontend-dev-2
- Problem: The empty-state hint "Add an expression to see it graphed." is painted on the canvas directly
  over the x-axis at the origin. The axis line runs through the text like a strikethrough and it collides with the
  `-2`/`0`/`2` tick labels. It is barely legible, which undermines the one state meant to guide a new user.
- Fix: Render it as an HTML overlay rather than on the canvas, placed above the axis:
  `pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 rounded-md border bg-background/90 px-3 py-1.5 text-sm text-muted-foreground shadow-sm`.
  Keep the copy as it is.

**UX-02 · Major · `800-light-04-sliders`, `800-dark-04-sliders`**. Owner: frontend-dev
- Problem: At tablet width (288px panel), the inline slider min input is clipped to **"-1C"**. The input is
  `w-12 px-1` inside a wrapping flex row that shrinks it. This looks broken on every parameter.
- Fix: Show the inline bounds only where there is room, and give them a fixed width:
  `hidden lg:block h-7 w-14 shrink-0 px-1.5 text-xs tabular-nums`. Tablet then uses the settings
  popover, as phone already does.

**UX-03 · Major · `375-light-06-sheet-peek-sliders`, `320-dark-01-first`**. Owner: frontend-dev
- Problem: The phone peek sheet (35dvh ≈ 224–284px) spends most of its height on chrome. The handle is 44px,
  the "Graph" header 48px and the footer tip about 40px. That leaves room for about 1.5 rows. At 320×640 the second row is cut in half by
  the footer tip, and at 375 the first slider is cut off.
- Fix: (1) Hide the footer tip on phones with `hidden sm:block`, since the placeholder already teaches. (2) Merge the handle into
  the header. Make the header row the drag handle, with the pill `absolute top-1.5 left-1/2 -translate-x-1/2`, and use
  `h-11` for the whole bar. That frees about 90px, roughly two more rows.

**UX-04 · Major · `375-light-01-first`, `b-phone-trace`, `320-dark-01-first`**. Owner: frontend-dev-2 (App passes the inset: frontend-dev)
- Problem: On phones the viewport is framed against the whole canvas, including the part hidden behind the
  sheet. The origin sits about three-quarters of the way down the visible area, the top half is empty (y 5..20), and the `20` label
  is clipped at the top. Reset view and the zoom buttons centre on a point just above the sheet.
- Fix: `GraphView` should take an `insetBottom` prop (the sheet's current height in px) and use the visible
  rect for reset (centre and 1:1 fit), toolbar/key zoom centre, and the empty-state hint position. App passes the
  sheet height, using ResizeObserver on the `aside`.

**UX-05 · Major · every `*-01-first`**. Owner: frontend-dev (spec copy change: UX)
- Problem: The placeholder "Type an expression, e.g. y = x^2" is truncated at every width. It reads "…e.g. y = x^"
  on desktop, "…e.g. y" on phone and "…expression," on tablet. The example is the useful part, and it is the part that gets cut.
- Fix: Change the copy to **"e.g. y = x^2"** (it fits in 150px of monospace). I will amend UX-SPEC §2/§10 to
  match. Keep the longer explanation in the footer tip on desktop.

**UX-06 · Major · `c-canvas-focus`**. Owner: frontend-dev-2
- Problem: When the graph is reached with Tab and trace is started with `T`, there is no visible focus indicator on the
  graph. A keyboard user can't tell that the arrow keys will now pan or trace. The a11y review may also flag this; it is listed here
  because it is visibly absent.
- Fix: On the focusable wrapper, add
  `outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2` (spec §9.4).

### Minor

**UX-07 · Minor · `1440-light-04-sliders`, `320-light-04-sliders`**. Owner: frontend-dev
- Problem: Each slider wraps unpredictably. Line 1 is play, `a =` and value. Line 2 is min, track, max and the settings
  icon. The settings icon lands far from the name it configures, and three params take six uneven lines.
- Fix: Use a deliberate two-line layout at every width. Line 1:
  `flex items-center gap-2` with `[play] a = [value]` and settings `ml-auto`. Line 2:
  `flex items-center gap-2 pl-10` with `[min] track [max]`. Remove `flex-wrap` and `min-w-40`.

**UX-08 · Minor · `375-dark-02-sheet-expanded`, `320-light-04-sliders`**. Owner: frontend-dev-2
- Problem: When the phone sheet is expanded, its top edge cuts through the vertical toolbar. Zoom-out is half
  visible and the rest is hidden, which looks like a rendering bug.
- Fix: On phones, lay the toolbar out horizontally along the top:
  `max-sm:flex-row max-sm:top-2 max-sm:right-2` (the separator becomes vertical). That makes it about 44px tall, so it fits in
  the 15% strip above the expanded sheet.

**UX-09 · Minor · `1440-light-01-first`, `1440-light-15-zoomed-out`, `375-light-01-first`**. Owner: frontend-dev-2
- Problem: Edge tick labels are clipped. `-10` shows as "0" at the left, `10` shows as "1" at the right, `±10000`
  loses digits, and the top `20` is cut off.
- Fix: When measuring each label, skip any whose text box would cross the canvas edge (minus 2px), or
  switch `textAlign` to `left`/`right` for the first and last labels.

**UX-10 · Minor · `1440-light-01-first`**. Owner: frontend-dev-2
- Problem: The x-axis `0` label is drawn on top of the y-axis line, so it looks like "ø".
- Fix: Draw a single origin label at the bottom-left of the origin (`textAlign: right`, offset −4px, +4px) and
  skip the `0` label on both axes.

**UX-11 · Minor · `1440-light-01-first`, `1440-light-03-error`**. Owner: frontend-dev
- Problem: The always-present empty row looks like a real expression. It has a solid colour swatch and a working
  overflow menu, and it takes the next palette colour. Users may think an expression exists but isn't plotting.
- Fix: For the trailing empty row, show a swatch with a dashed ring
  (`border-dashed border-muted-foreground/40 bg-transparent`), disable its Toggle, and hide the overflow
  button (`invisible`) until text is entered.

**UX-12 · Minor · `c-animating`**. Owner: frontend-dev-2
- Problem: The trace marker and tooltip stay on the graph after focus leaves it. They remain while typing in the panel and while
  a slider animates, so there is a stale "(0, 0)" readout sitting on the curves.
- Fix: End trace on wrapper `blur` and on `pointerleave` for hover trace.

**UX-13 · Minor · `1440-light-03-error`, messages list below**. Owner: frontend-dev
- Problem: Symbols aren't set apart from the prose. "Missing closing bracket )." and "Nothing after =."
  read like typos.
- Fix: Quote the token and render it in mono: `Missing closing bracket <code>)</code>.`, using
  `<code className="font-mono">`. Or in plain strings, use `Missing closing bracket ")".`

**UX-14 · Minor · error copy**. Owner: frontend-dev
- Problem: The copy is out of date now that `f(x) = …` is accepted. `x = 3` says "Only y = … is supported."
  `a = 5` suggests `a·sin(x)`, and the middle dot can't be typed.
- Fix: `x = 3` becomes "Only y = … or f(x) = … can be graphed. Write it as y = …". `a = 5` becomes "To make a slider,
  just use a in an expression, e.g. y = a*sin(x)."

**UX-15 · Minor · error copy**. Owner: frontend-dev
- Problem: `SIN(x)` gives Unknown function "SIN", with no hint that case matters (common when typing on a phone).
- Fix: When the lower-case form is known, say: `Unknown function "SIN". Did you mean sin?`

**UX-16 · Minor · `b-phone-menu`**. Owner: frontend-dev
- Problem: On phones, the overflow menu wraps "Table of values" onto two lines.
- Fix: Add `className="min-w-48"` to `DropdownMenuContent`, and `whitespace-nowrap` to its items.

**UX-17 · Minor · `1440-light-07-trace-kbd`**. Owner: frontend-dev-2 (spec change: UX)
- Problem: Keyboard trace moves 1px per press. Thirty presses moved x only 0→0.568, and the values are
  ragged (0.5682). The spec is at fault here, because following it made trace tedious.
- Fix: Move by one minor grid step per arrow press (major step ÷ 5) and by one major step with Shift, snapping x to that
  grid so readouts are round (0.4, 0.8…). I will amend UX-SPEC §5.2. The shortcuts dialog copy changes to match.

**UX-18 · Minor · `b-many`**. Owner: frontend-dev-2
- Problem: `y = ln(x)+2` stops at y≈−6.8 near x→0⁺ instead of running off the bottom edge. It looks as if the
  function has a minimum.
- Fix: Refine sampling towards domain boundaries, or extend the last segment to the canvas edge when the
  slope is diverging (the same treatment as the `1/x` asymptote).

### Polish

**UX-19 · Polish · `1440-light-10-table`**. Owner: frontend-dev
- Problem: Both table columns are 50% wide and right-aligned, so the x values sit in the middle of the dialog, far from
  the "x" header's visual anchor.
- Fix: Use `table-fixed` with x as `w-1/3 pr-6 text-right` and y as `text-right`, and narrow the dialog to `sm:max-w-sm`.
  Show the expression in the title in mono.

**UX-20 · Polish · `1440-light-14-collapsed`**. Owner: frontend-dev
- Problem: After collapsing, focus moves to "Show expressions panel" and its tooltip opens and stays open, flush against the
  viewport's left edge.
- Fix: Only open the tooltip for focus that is `:focus-visible` or for hover. Use `side="right"` so it points into the graph.

**UX-21 · Polish · `b-many-dark`**. Owner: frontend-dev (spec: UX)
- Problem: In dark mode, Vermillion `#F07A3A` and Orange `#E69F00` are hard to tell apart on thin lines.
- Fix: Change dark Orange to Okabe–Ito yellow `#F0E442` (14.97:1 on `#0A0A0A`). Leave light unchanged. I will update §8.1.

**UX-22 · Polish · all**. Owner: frontend-dev (spec copy: UX)
- Problem: The panel header says "Graph", but the panel holds expressions, and the graph is the other half of the screen.
- Fix: Change the header copy to "Expressions" (it matches the `aside` label). I will amend §1.1/§10.

**UX-23 · Polish · `1440-light-01-first`**. Owner: frontend-dev
- Problem: The row index floats in a gap of about 30px between the swatch and the input, so it doesn't read as belonging to either.
- Fix: Use `w-4` for the index with `-ml-1`, or drop the gap to `gap-1` between the swatch and index. Hide it on phones (`max-sm:hidden`) to give the
  input width back.

**UX-24 · Polish · `1440-light-12-hidden`**. Owner: frontend-dev
- Problem: A hidden expression's text keeps full strength, so the list doesn't reflect what's on the graph.
- Fix: When `!visible`, add `text-muted-foreground` to the input.

**UX-25 · Polish · `1440-light-13-shortcuts`**. Owner: frontend-dev-2
- Problem: The shortcuts dialog says "Shift: 10 px", which exposes the implementation. Keys are plain text rather than key caps.
- Fix: Use "Shift: bigger steps" (see UX-17), and wrap keys in
  `<kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">`.

**UX-26 · Polish · `1440-dark-08-trace-hover`**. Owner: frontend-dev-2
- Problem: Both tooltip lines are about 12px, and the coordinates, which are the point of the tooltip, have no more weight than the label.
- Fix: Style the expression line as `text-xs text-muted-foreground` and the coordinates as `text-sm font-medium tabular-nums`.

**UX-27 · Polish · `1440-light-04-sliders`**. Owner: frontend-dev
- Problem: The slider fill is neutral black/white, so nothing ties a slider to its curve.
- Fix: Set the Range fill to the owning expression's curve colour (`style={{ backgroundColor: color }}`),
  and keep the thumb neutral.

## Error message sample (as rendered)

| Input | Message | Verdict |
|---|---|---|
| `sin(` | Missing closing bracket ). | Token formatting (UX-13) |
| `sin(x))` | Unexpected ) — there are more closing brackets than opening ones. | Good |
| `y =` | Nothing after =. Type an expression, e.g. y = 2x + 1. | Token formatting (UX-13) |
| `foo(x)` | Unknown function "foo". Try sin, cos, tan, sqrt, abs, ln, log or exp. | Good |
| `2 +` / `y=x^` | Expression ends unexpectedly after +. / after ^. | Good |
| `x = 3` | Only y = … is supported. Write it as y = … or just the expression. | Out of date (UX-14) |
| `a = 5` | Only y = … is supported. To make a slider, just use a in an expression, e.g. a·sin(x). | Out of date / untypeable dot (UX-14) |
| `sin x` | Add brackets: sin(x). | Good |
| `SIN(x)` | Unknown function "SIN". Try sin, … | Add "Did you mean" (UX-15) |
| `y = $` | Couldn't understand this expression. Check for typos near "$". | Good |
| `f(x) = x^2`, `y = 3`, `2x`, `log(x, 2)`, `1/0`, `ln(-1)` | no error | Correct |

## Follow-ups for UX (spec)

When the lead agrees, I will amend UX-SPEC for UX-05 (placeholder), UX-17 (trace step), UX-21 (dark orange)
and UX-22 (panel title). I have not made these edits in this commit.
