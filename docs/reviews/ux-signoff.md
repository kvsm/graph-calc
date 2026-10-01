# UX sign-off

Reviewer: UX advocate. Build: `npm run build` at HEAD `6aa08b6`, served with `vite preview`, driven
with Playwright (Chromium). I used the same scripts and states as `ux-review.md`. Sizes were 1440×900, 800×1000, 375×812 and
320×640, each in light and dark. I added 3× crops of the origin labels, the hidden swatch and the focus rings, and checked the empty state on phone
in both the peek and expanded positions. The run produced no page errors, no console errors and no horizontal scroll at any size.

## Verdict: **SHIP**

All 27 findings from `ux-review.md` are resolved, and none regressed. The pass found three new issues: one
minor and two polish. None of them blocks release.

## Findings status

| ID | Sev | Status | Evidence |
|---|---|---|---|
| UX-01 | Major | Resolved | `b-empty`: the hint is now a bordered pill above the axis, clear of the tick labels |
| UX-02 | Major | Resolved | `800-*-04-sliders`: inline bounds are hidden at tablet width and still reachable through settings; nothing is clipped |
| UX-03 | Major | Resolved | `375-light-01-first`: the footer tip is hidden on phone and the handle is merged with the header; the peek shows two rows plus the empty row |
| UX-04 | Major | Resolved | `375-light-01-first`: the origin is centred in the area above the peek sheet (checklist 4a) |
| UX-05 | Major | Resolved | The placeholder "e.g. y = x^2" is untruncated at all four widths |
| UX-06 | Major | Resolved | `1440-light-07-trace-kbd`: an inset 2px ring shows on the graph when it is reached by Tab |
| UX-07 | Minor | Resolved | Sliders now use a deliberate two-line layout at every width, with settings beside the value |
| UX-08 | Minor | Resolved | Below `sm` the toolbar is a horizontal row and stays fully visible above the expanded sheet |
| UX-09 | Minor | Resolved | The edge labels `±10`, `±10000` and the top `20` are skipped rather than clipped |
| UX-10 | Minor | Resolved | `z-*-origin`: one `0` label sits bottom-left of the origin, clear of the y-axis (see N3) |
| UX-11 | Minor | Resolved | The trailing row has a dashed ring, a disabled toggle (out of the tab order) and no overflow button |
| UX-12 | Minor | Resolved | `c-animating`: trace ends when focus leaves the graph, so no stale tooltip remains |
| UX-13 | Minor | Resolved | Tokens render as `<code>` chips; spoken names are present and omitted when redundant ("Missing closing bracket )") |
| UX-14 | Minor | Resolved | `x = 3` and `a = 5` show the new §3.1 copy; no `·` |
| UX-15 | Minor | Resolved | `SIN(x)` shows "Unknown function SIN. Did you mean sin?" |
| UX-16 | Minor | Resolved | `b-phone-menu`: "Table of values" fits on one line |
| UX-17 | Minor | Resolved | Trace steps by 0.4 (minor grid) and lands on round x (`(12, -0.5366)`); the viewport follows |
| UX-18 | Minor | Resolved | `b-many`: `ln(x)+2` runs to the bottom edge |
| UX-19 | Polish | Resolved | The table dialog is narrower and its title is mono; the columns read well |
| UX-20 | Polish | Resolved | No tooltip sticks open after collapsing the panel |
| UX-21 | Polish | Resolved | Dark slot 5 is `#F0E442` in the picker and on curves; it is clearly distinct from Vermillion |
| UX-22 | Polish | Resolved | The header reads "Expressions" |
| UX-23 | Polish | Resolved | The index gap is tighter, and the index is hidden on phone |
| UX-24 | Polish | Resolved | A hidden expression's text is muted |
| UX-25 | Polish | Resolved | Keys show as `<kbd>` caps, and the dialog says "Shift: bigger steps" |
| UX-26 | Polish | Resolved | The tooltip coordinates are `text-sm font-medium` mono; the label line is muted |
| UX-27 | Polish | Resolved | Slider fill uses the curve colour in both themes |

## §13 manual walk (items automation can't judge)

| Item | Result |
|---|---|
| 14: hidden swatch is a hollow slashed ring | Pass. At 3× in both themes, the ring and slash are in the curve colour and legible |
| 27: tick labels adapt and stay legible | Pass. Spans of 20, about 20000 and about 0.004 all show clean "nice" steps with step precision (lead decision); edge labels are skipped |
| 32: focus ring quality | Pass. A 3px `ring/50` ring plus border shows on the swatch, input, overflow and toolbar buttons in both themes; the graph has an inset 2px ring. Focus order matches §9.3 |
| Hint pill (§6) | Pass on desktop and at phone peek. See N1 for the expanded phone sheet |
| Slider row at 320px | Pass. Two lines, nothing clipped, 44px targets, no horizontal scroll |
| 4a: phone framing | Pass. At 375 and 320 the origin is centred above the peek sheet, and reset returns to that position |

## New issues

**N1 · Minor · `z-phone-empty`**. Owner: frontend-dev-2
- Problem: In the empty state with the phone sheet **expanded** (which is what happens after deleting the last expression,
  because focus moves to the input), the hint pill is placed under the horizontal toolbar and is mostly hidden.
  At peek it is clear: at 375 the pill top is at y=113 and the toolbar bottom at y=66.
- Fix: Make `emptyHintPosition` treat the toolbar's bottom edge as the top of the usable area. Alternatively, hide the hint while the
  sheet is expanded, since the placeholder already tells the user what to do.

**N2 · Polish · `375-light-16-zoomed-in`, `320-light-04-sliders`**. Owner: frontend-dev-2
- Problem: On phone, the translucent toolbar (`bg-background/90`) lets tick labels and curves show through. A label partly
  under the toolbar looks garbled.
- Fix: Make the toolbar opaque below `sm` with `max-sm:bg-background`.

**N3 · Polish · `z-light-origin`**. Owner: frontend-dev-2
- Problem: Curves are drawn over tick labels (for example, `sin(x)` crosses the origin `0`) with no halo.
- Fix: Draw labels after the curves, with a 3px `strokeText` halo in the graph background colour.
