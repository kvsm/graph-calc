# Graphing Calculator — UX Specification

Owner: UX advocate. Audience: frontend dev (build), testers and reviewers (verify against §13).
Where this spec and TEAM-BRIEF.md disagree, TEAM-BRIEF wins; raise it with the lead.
Everything below is a decision, not a menu. "MUST" items are checked in §13.

---

## 1. Layout

The app is one full-viewport screen: `h-dvh w-full overflow-hidden`. No page-level scrolling
at any width. Two regions: **Expression panel** and **Graph**.

| Breakpoint | Tailwind | Panel | Graph |
|---|---|---|---|
| Phone | `< sm` (<640px) | Bottom sheet (see 1.3) | Full screen behind sheet |
| Tablet | `sm`–`lg` (640–1023px) | Left side panel `w-72` (288px), collapsible | `flex-1` |
| Desktop | `≥ lg` (≥1024px) | Left side panel `w-96` (384px), collapsible | `flex-1` |

### 1.1 Desktop / tablet
- Root: `flex flex-row`. Panel is `<aside aria-label="Expressions">` with `border-r bg-background`,
  `flex flex-col`. Graph is `<main>` containing the canvas, `relative flex-1 min-w-0`.
- Panel structure, top to bottom:
  1. **Header** (`h-12 px-3 flex items-center justify-between border-b`): title "Expressions" (text-sm
     font-semibold), then icon buttons: *Add expression* (`Plus`), *Collapse panel* (`PanelLeftClose`).
  2. **List** in shadcn `ScrollArea` (`flex-1`), items separated by `Separator`.
  3. **Footer** hint (`p-3 text-xs text-muted-foreground`): "Tip: use a letter like a to make a slider."
- Collapse: panel animates to `w-0` (150ms, disabled under reduced motion) and is removed from
  the tab order (`inert`). A floating *Show expressions* button (`PanelLeftOpen`) appears top-left
  of the graph. Collapsed state persists in localStorage.

### 1.2 Graph toolbar
- Vertical stack of icon buttons, **top-right** of the graph: `absolute top-3 right-3 flex flex-col gap-1`,
  inside a `rounded-lg border bg-background/90 shadow-sm p-1` container with `role="toolbar"`
  `aria-label="Graph controls"` and `aria-orientation="vertical"`.
- Order: Zoom in, Zoom out, Reset view, `Separator`, Theme toggle, Keyboard shortcuts.
- Buttons: shadcn `Button variant="ghost" size="icon"` — `size-9` (36px) on desktop,
  `size-11` (44px) under `pointer-coarse:` (Tailwind v4 variant). Each has a `Tooltip` showing
  label + shortcut (e.g. "Zoom in (+)").

### 1.3 Phone (<640px)
- The panel becomes a **bottom sheet** built from a fixed `div` (not shadcn `Sheet`, because the
  graph must stay interactive behind it; `Sheet` is modal). Two snap states:
  - **Peek**: `h-[35dvh]` — graph remains visible and usable above.
  - **Expanded**: `h-[min(85dvh,calc(100dvh-4.5rem))]`, capped so it never covers the toolbar row (CR-05).
- Sheet top has a 44px-tall drag handle bar (`button`, `aria-label="Resize expressions panel"`,
  `aria-expanded`). Tap toggles peek/expanded; vertical drag snaps to nearest state. Keyboard:
  Enter/Space toggles.
- Below `sm` the toolbar is a **single horizontal row** at `top-3 right-3` (`max-sm:flex-row`, separator
  vertical, `aria-orientation="horizontal"`), 44px buttons (CR-05). The expanded sheet cap above keeps it visible.
- **Visible area (UX-04):** on phones the graph frames the area *above* the sheet, not the whole canvas.
  The default view, Reset view, and toolbar/keyboard zoom centre all use that visible rect
  (canvas height minus the sheet's current height), and so does the empty-state hint's position.
- The on-screen keyboard: when an input is focused, auto-expand the sheet so the input is not
  covered (`scrollIntoView({block:"nearest"})`).
- Sheet has `rounded-t-xl border-t bg-background shadow-lg`, safe-area padding
  `pb-[env(safe-area-inset-bottom)]`.
- No horizontal scroll at 320px width (MUST).

---

## 2. Expression list item anatomy

Each item is an `<li>` in a `<ul aria-label="Expression list">`. Layout: `flex items-start gap-2 px-2 py-2`.

```
[swatch] [ index ]  [ input ..................................... ] [ ⋯ ]
                    [ error message (if any) ]
                    [ slider rows (if params) ]
```

1. **Swatch / visibility toggle** — shadcn `Toggle` (`size-6` visual circle inside a `size-9`
   hit area, `size-11` on coarse pointers), `pressed` = visible.
   - Visible: filled circle in the curve colour. Hidden: 2px ring in the curve colour, hollow,
     with a diagonal slash — never rely on fill alone.
   - `aria-label="Show expression 2"` with `aria-pressed` reflecting state (the pressed state
     conveys visibility; the label stays constant).
2. **Index** — `text-xs text-muted-foreground tabular-nums w-5 text-right` shows 1-based number.
   Decorative (`aria-hidden`); the number is already in the input's label.
3. **Input** — shadcn `Input`, `font-mono text-sm`, `spellCheck={false}`, `autoComplete="off"`,
   `autoCapitalize="off"`, `inputMode="text"`. `aria-label="Expression 2"`.
   Placeholder on the **last, empty** row only: "e.g. y = x^2".
   Invalid: `aria-invalid="true"` (shadcn styles a destructive ring) and
   `aria-describedby` → error element id.
4. **Error line** — below the input, `text-xs text-destructive flex gap-1`, with an `AlertCircle`
   icon (`aria-hidden`). `id="expr-<id>-error"`. Only shown after the debounce settles (§3).
5. **Overflow menu** — `Button variant="ghost" size="icon"` (`MoreVertical`),
   `aria-label="More options for expression 2"`, opens shadcn `DropdownMenu` **non-modal** (`modal={false}`,
   CR-14: the rest of the page stays interactive; Escape closes it and focus returns to the trigger) with:
   - **Colour…** → opens a `Popover` anchored to the swatch with a radiogroup of the 7 palette
     swatches (§8), each `size-8` (`size-11` coarse), `role="radio"`, `aria-label` = colour name
     ("Blue", "Vermillion", ...). Arrow keys move, Enter/Space selects, Escape closes and returns
     focus to the menu trigger.
   - **Table of values** → opens shadcn `Dialog` (§7). Disabled when the expression is empty or invalid.
   - `DropdownMenuSeparator`
   - **Delete** (destructive text colour, `Trash2` icon). Immediate, no confirmation, no undo.
     Focus moves to the next item's input, or the previous one if it was last.

Hover state on the whole row: `hover:bg-muted/50`. The row containing focus: `focus-within:bg-muted/50`.

### 2.1 Adding
- There is always exactly **one trailing empty row**. Typing into it makes it a real expression
  and a new empty row appears below it. The header *Add expression* button focuses that empty row.
- Colours are assigned round-robin from the palette in order (§8) by creation count, skipping
  none; users can override.

---

## 3. Input behaviour

| Behaviour | Decision |
|---|---|
| Live plotting | Re-parse and re-plot **150ms** after the last keystroke (debounce). The last valid plot stays visible while the current text is invalid. |
| Error display | Error line appears after **600ms** of no typing (avoids flashing "Missing )" mid-typing), and immediately on blur or Enter. Clears immediately when the text becomes valid. |
| Enter | Commits, then inserts a new empty expression directly below and focuses it. If the next row is already the trailing empty row, just focus it. |
| Shift+Enter | Same as Enter (no multi-line). |
| Backspace on empty | Deletes the row and focuses the **end** of the previous input. Ignored on the only row. |
| Arrow Up / Down | Move focus to the previous / next expression input (caret to end). |
| Escape | Blurs the input (focus moves to its row's swatch toggle). |
| Accepted forms | `y = f(x)`, bare `f(x)`, and `f(x) = ...` (accepted, per team-lead decision; overrides earlier draft). Whitespace ignored. `^` for powers, `pi`/`π`, `e`, `sqrt`, `abs`, `exp`, `ln` (= natural log), `log` (= base 10), `log(x, b)`, trig + inverse (`asin`/`arcsin` both work). |
| Implicit multiplication | **Yes**: `2x`, `3sin(x)`, `2pi`, `x(x+1)`, `(x+1)(x-1)`. `ax` is parsed as `a*x` when `a` is a parameter (single-letter variables; multi-letter tokens are functions/constants only). |
| Constant `y = 3` | Valid: horizontal line. |

### 3.1 Error messages (exact microcopy)
Messages are sentence case, name the problem and hint the fix. They contain only characters a user
can type (no `·`, `…` or curly quotes in anything the user might copy).

**Tokens.** Each `code` span in the Message column is a *token segment*. Build messages as segment
arrays (`{ text } | { token }`), not strings with inline quotes. Render tokens as
`<code className="rounded bg-muted px-1 font-mono text-[0.95em]">`, with no surrounding quotes.
- Word tokens (`sin`, `foo`, `a`, `y = 2x + 1`) are read as written.
- Single-symbol tokens also get a spoken name so screen readers don't skip them:
  `<code><span aria-hidden="true">)</span><span className="sr-only">closing bracket</span></code>`.
  Names: `(` opening bracket, `)` closing bracket, `=` equals sign, `+` plus sign, `-` minus sign,
  `*` star, `/` slash, `^` caret, `,` comma, `**` double star. Any other symbol is read as "symbol" followed by the character.
- Live-region announcements (§9.2) use the spoken form, e.g. "Expression 2: Missing closing bracket."
- The plain-text form (tests, `title`, logs) wraps tokens in straight double quotes: `Missing closing bracket ")".`

| Input | Message |
|---|---|
| `sin(` | Missing closing bracket `)`. |
| `sin(x))` | Unexpected `)` - there are more closing brackets than opening ones. |
| `y =`, `f(x) =` | Nothing after `=`. Type an expression, e.g. `y = 2x + 1`. |
| `foo(x)` | Unknown function `foo`. Try `sin`, `cos`, `tan`, `sqrt`, `abs`, `ln`, `log` or `exp`. |
| `SIN(x)` (known name, wrong case) | Unknown function `SIN`. Did you mean `sin`? |
| `sin x` | Add brackets: `sin(x)`. |
| `2 +` | Expression ends unexpectedly after `+`. |
| `x = 3`, `z = x` | Only `y` or `f(x)` equations can be graphed, e.g. `y = 3x` or `f(x) = 3x`. |
| `a = 5` (assignment attempt) | To make a slider, just use `a` in an expression, e.g. `y = a*sin(x)`. |
| `e = 5` | `e` is a constant (about 2.718), so it can't be set. Use another letter for a slider, e.g. `a`. |
| `sqrt()` | `sqrt` needs a value, e.g. `sqrt(x)`. |
| `y = y + 1` | `y` can't appear on the right-hand side. |
| `2 ** x` | Use `^` for powers, e.g. `2^x`. |
| anything else the parser rejects | Couldn't understand this expression. Check for typos near `<token>`. |

Evaluation-time non-finite values (e.g. `sqrt(x)` for x<0, `1/0`) are **not** errors — they are
gaps in the curve.

---

## 4. Parameter sliders

- Any single-letter free variable other than `x`, `y`, `e` creates a slider row under that
  expression (one row per variable, in alphabetical order). The same variable name in two
  expressions shares one value; the slider appears under the first expression using it.
- Row layout (`flex items-center gap-2 pl-7 pt-2`):
  `[▶ play] a = [ 1.0 ] [min] ===o===== [max]`
  - Play button: `Button ghost icon size-8` (`size-11` coarse), `Play`/`Pause` icons,
    constant `aria-label="Animate a"` with `aria-pressed` carrying the state (CR-20); play/pause is shown only by the icon.
  - Label `a =` (`font-mono text-sm`), then a numeric `Input` (`w-16 text-right tabular-nums`,
    `aria-label="Value of a"`), editable directly.
  - Min / max: small `Input` (`w-12 text-xs`), `aria-label="Minimum for a"` / `"Maximum for a"`.
  - shadcn `Slider` (`flex-1 min-w-24`), `aria-label="a"`, `aria-valuetext="a = 1.0"`.
  - Step: in a `Popover` from a `Settings2` icon button (`aria-label="Slider settings for a"`)
    containing min, max, step inputs. On phones min/max inputs are hidden inline and only
    available via this popover.
- Defaults: value **1**, min **-10**, max **10**, step **0.1**. Value display uses the step's
  decimal places (step 0.1 → `1.0`).
- Validation: min must be < max (otherwise revert on blur with inline text "Min must be less than max");
  step > 0; typed values outside bounds extend the bound to fit.
- Animate: ping-pongs min→max→min, full sweep in **4s**, via `requestAnimationFrame`, snapped to step.
  Only one animation per variable. Under `prefers-reduced-motion: reduce` the play button is still
  shown but animation advances in **discrete steps every 500ms** (no smooth motion) — users
  explicitly opted in, but motion is reduced. Keyboard on slider: Arrow = 1 step, PageUp/Down =
  10 steps, Home/End = min/max (Radix default).

---

## 5. Graph interactions

### 5.1 Pointer / touch
| Input | Action |
|---|---|
| Drag (mouse/pen/1 finger) | Pan. Cursor `grab` / `grabbing`. |
| Wheel / trackpad scroll | Zoom **around the cursor**, factor `1.0015^(-deltaY)` (clamped per event to 0.5–2). `preventDefault` so the page never scrolls. |
| Pinch (2 fingers) | Zoom around the pinch midpoint; simultaneous 2-finger pan. |
| Double-click / double-tap | Zoom in ×2 around the point. |
| Hover (fine pointer) | Trace: snap to the nearest visible curve point within 24px (screen) of the pointer; show tooltip. |
| Touch press-and-hold (300ms) | Trace mode; moving the finger traces instead of panning until lift. |
| Toolbar zoom in / out | ×2 / ×0.5 around the viewport centre (on phones, the centre of the area above the sheet, §1.3). |
| Reset view | x ∈ [-10, 10], y scaled to keep **1:1 aspect** centred on origin (on phones, centred in the area above the sheet, §1.3). |

Zoom limits: visible x-span between `1e-6` and `1e6`. Buttons/keys at a limit do nothing
(and zoom buttons get `disabled`).
All canvas gestures use `touch-action: none` on the canvas only.

### 5.2 Keyboard (canvas focused)
The canvas wrapper is focusable (`tabIndex=0`).

| Key | Action |
|---|---|
| ← → ↑ ↓ | Pan 10% of the visible span. With Shift: 50%. |
| `+` / `=` | Zoom in ×2 (centre). |
| `-` / `_` | Zoom out ×2. |
| `0` | Reset view. |
| `T` | Enter/exit trace mode. Entering puts the point on the first visible curve at the x nearest the viewport centre. |
| `Tab` while tracing | Leaves the canvas (trace is NOT trapped). |
| `]` / `[` | In trace mode: next / previous visible curve (wraps), keeping the same x. |
| ← → in trace mode | Move the trace point by one minor grid step in x (major step ÷ 5); Shift moves one major step. x snaps to that grid, so readouts are round (0.4, 0.8, …). The viewport pans to keep it in view. The shortcuts dialog describes Shift as "bigger steps" (no px). |
| ↑ ↓ in trace mode | Same as `]` / `[`. |
| `Escape` | Exit trace mode. |

The "Keyboard shortcuts" toolbar button (`Keyboard` icon, shortcut `?`) opens a `Dialog`
listing this table.

### 5.3 Trace tooltip
- Marker: 8px circle filled with the curve colour, 2px ring in the graph background colour.
- Tooltip (custom absolutely-positioned `div`, styled like shadcn `Tooltip`: `rounded-md border
  bg-popover px-2 py-1 text-xs shadow-md`), offset 12px up-right of the point, flipped to stay inside
  the graph.
- Content, two lines:
  ```
  ● y = sin(x)          (swatch + expression text, truncated to 24 chars with …)
  (1.571, 1)            (font-mono tabular-nums)
  ```
- Number formatting: up to **4 significant figures**, trailing zeros stripped, `-0` shown as `0`.
  Use scientific notation `1.23e-7` when |v| < 1e-4 or |v| ≥ 1e6 (v ≠ 0). Undefined → "undefined".
  Examples: `3.14159 → 3.142`, `1000000 → 1e6`, `0.00001234 → 1.234e-5`, `2.5000 → 2.5`.
- Same formatter is used for the table of values and live-region announcements.

### 5.4 Axes, grid, ticks
- Grid: minor lines at 1/5 of major step, major at a "nice" step (1, 2, 5 × 10^n) giving ~80–120px spacing.
- Tick labels: `text-xs` (12px) system font. Use as many decimals as the step needs so adjacent labels are always distinct (team-lead decision; supersedes the earlier "4 sig figs max"). Labels clamp to the viewport edge
  when the axis is off-screen.
- Colours in §8.2.

---

## 6. Empty state / first run
- First run (nothing in localStorage): one expression `y = sin(x)` in palette colour 1 (Blue),
  plus the trailing empty row with the placeholder "e.g. y = x^2". Default viewport.
- If the user deletes everything: only the empty row with placeholder remains, and the graph shows
  a centred, non-interactive hint `text-sm text-muted-foreground`: "Add an expression to see it graphed."
- Persisted state restores silently. Corrupt/unavailable storage → first-run state, no error shown.

---

## 7. Table of values
- shadcn `Dialog` titled "Table of values: y = sin(x)", `max-w-md`, `max-h-[80dvh]`.
- Controls row: "Start" (default = round(view xmin)), "Step" (default = nice step giving 21 rows),
  number `Input`s. shadcn `Table` with `<caption className="sr-only">`, columns **x** and **y**,
  `<th scope="col">`, 21 rows, `font-mono tabular-nums text-right`, inside `ScrollArea`.
- Undefined → "undefined" (not blank). Values use the §5.3 formatter.
- Close via Escape, the X button (`aria-label="Close"`), or clicking the overlay. Focus returns to
  the overflow trigger.

---

## 8. Colour

### 8.1 Curve palette (Okabe–Ito derived, colour-blind safe)
Light graph background `#FFFFFF`; dark graph background `#0A0A0A` (shadcn neutral `--background`).
Each slot has a light-theme and dark-theme hex; the curve switches with the theme. Contrast is
WCAG relative-luminance ratio, computed with a node script (sRGB → linear, `(L1+.05)/(L2+.05)`).
The "vs panel" columns check the swatch against `muted` backgrounds (`#F5F5F5` / `#171717`) for hover rows.

| # | Name | Light hex | vs #FFF | vs #F5F5F5 | Dark hex | vs #0A0A0A | vs #171717 |
|---|---|---|---|---|---|---|---|
| 1 | Blue | `#0072B2` | 5.19 | 4.76 | `#56B4E9` | 8.58 | 7.77 |
| 2 | Vermillion | `#D55E00` | 3.87 | 3.55 | `#F07A3A` | 7.12 | 6.45 |
| 3 | Green | `#007A5A` | 5.34 | 4.90 | `#2FC4A0` | 8.98 | 8.13 |
| 4 | Magenta | `#B8528E` | 4.53 | 4.16 | `#CC79A7` | 6.47 | 5.86 |
| 5 | Orange | `#A66A00` | 4.48 | 4.11 | `#F0E442` | 14.97 | 13.56 |
| 6 | Violet | `#6A3D9A` | 7.64 | 7.01 | `#B39DFF` | 8.66 | 7.84 |
| 7 | Grey | `#3D3D3D` | 10.86 | 9.96 | `#E0E0E0` | 15.00 | 13.58 |

All ≥ 3:1 (non-text contrast, WCAG 1.4.11). Slot 5 is Okabe–Ito yellow in dark (the earlier `#E69F00` was too close to Vermillion `#F07A3A` on thin lines) but keeps the name "Orange" in both themes, so colour-picker labels do not change with the theme. Ship as a TS constant
`PALETTE: {name, light, dark}[]` in `src/lib/palette.ts`; store the **slot index** per expression
(not hex) so theme switching works. Curves are drawn at **2.5px** line width (3px when traced).
Colour is never the only identifier: the tooltip and table show the expression text.

### 8.2 UI / graph chrome
| Token | Light | Dark | Contrast |
|---|---|---|---|
| Grid minor | `#F0F0F0` | `#1A1A1A` | decorative |
| Grid major | `#E5E5E5` | `#262626` | decorative (1.26 / 1.31) |
| Axes + tick labels | `#525252` | `#A3A3A3` | 7.81 / 7.85 (text AA) |
| Focus ring | `#2563EB` | `#60A5FA` | 5.17 / 7.79 |
| Error text | `#B91C1C` | `#F87171` | 6.47 / 7.16 |

Map these to shadcn CSS variables (`--ring`, `--destructive`) and graph-specific
`--graph-bg`, `--graph-grid`, `--graph-grid-major`, `--graph-axis`. The canvas reads them via
`getComputedStyle` on theme change.

### 8.3 Theme
- Initial theme: localStorage value, else `prefers-color-scheme`. Toggle cycles light ↔ dark
  (no "system" third state). Applies `.dark` on `<html>`. Listen for OS changes only while the
  user hasn't chosen explicitly.

---

## 9. Accessibility requirements

1. **Canvas**: do not use `role="application"`. Put
   `role="img"` on the `<canvas>` with `aria-label` generated, e.g.
   "Graph of 2 expressions: y = sin(x), y = x^2. x from -10 to 10, y from -6.2 to 6.2."
   The focusable wrapper has `aria-label="Graph. Arrow keys pan, plus and minus zoom, T traces."`
   and `aria-describedby` → the live region. The table of values (§7) is the full text alternative.
2. **Live region**: one visually hidden `<div aria-live="polite" aria-atomic="true">` owned by the app.
   Announcements, **throttled to at most one per 500ms** (trailing edge wins):
   - Trace: "y = sin(x): x 1.571, y 1." (on move; curve switch prefixes "Curve 2 of 3.")
   - Viewport (keyboard/buttons only, not wheel/drag): "Zoomed in. x from -5 to 5." / "View reset."
   - Errors: announced once when the error line appears, on blur (not while typing): "Expression 2: Missing closing bracket."
   - Delete: "Expression 2 deleted."
   - Slider animation: NOT announced per frame; announce "Animating a" / "Paused a = 3.4".
3. **Focus order** (desktop): panel header buttons → each expression row (swatch → input → overflow
   → slider controls) → footer → graph canvas → toolbar. Phone: sheet handle → sheet content → canvas → toolbar.
   Opening Popover/Dialog traps focus inside; row overflow menus are non-modal (CR-14) and do not trap
   focus outside the menu. Closing any of them (including with Escape) returns focus to the trigger.
4. **Focus rings**: every focusable element shows `focus-visible:ring-[3px] ring-ring/50`
   plus `outline-none` only when the ring exists (shadcn default). The canvas wrapper shows an
   inset 2px `--ring` outline (`focus-visible:outline-2 outline-offset-[-2px]`). Never remove focus styles.
5. **Target sizes**: all targets ≥ 24×24px (WCAG 2.5.8); under `pointer-coarse:` ≥ 44×44px.
6. **Reduced motion**: under `prefers-reduced-motion: reduce` — no panel/sheet slide transitions
   (instant), no animated zoom (buttons jump), slider animation stepped (§4). Implement with
   Tailwind `motion-safe:` / `motion-reduce:` variants and a `useReducedMotion()` hook for JS.
7. **Labels**: every control has an accessible name per §10; icon-only buttons use `aria-label`
   (Tooltip is supplementary, not the name).
8. **Zoom/reflow**: at 200% browser zoom and at 320 CSS px width, all features remain usable
   without horizontal scrolling.
9. **Colour**: meets §8 ratios; hidden state indicated by shape (hollow + slash), not only colour.
10. **Landmarks**: `<aside aria-label="Expressions">`, `<main aria-label="Graph">`, one `<h1>` ("Graphing calculator", `sr-only`).

---

## 10. Microcopy

| Element | Visible text | Accessible name / tooltip |
|---|---|---|
| Panel title | Expressions | — |
| Add button | — | "Add expression" |
| Collapse panel | — | "Hide expressions panel" |
| Expand panel (floating) | — | "Show expressions panel" |
| Sheet handle | — | "Resize expressions panel" |
| Swatch toggle | — | "Show expression N" (aria-pressed) ; tooltip "Hide" / "Show" |
| Expression input | — | "Expression N" |
| Placeholder | e.g. y = x^2 | — |
| Overflow trigger | — | "More options for expression N" |
| Menu items | Colour… / Table of values / Delete | same |
| Colour popover | "Curve colour" (heading) | radiogroup "Curve colour for expression N" |
| Slider | — | "a", valuetext "a = 1.0" |
| Slider value / min / max | — | "Value of a" / "Minimum for a" / "Maximum for a" |
| Slider settings | Min / Max / Step | "Slider settings for a" |
| Play / pause | — | "Animate a" (constant) + `aria-pressed` (CR-20) |
| Toolbar | — | "Graph controls" |
| Zoom in / out | — | "Zoom in" (+) / "Zoom out" (−) |
| Reset | — | "Reset view" (0) |
| Theme | — | "Switch to dark theme" / "Switch to light theme" |
| Shortcuts | — | "Keyboard shortcuts" |
| Table dialog | Table of values: <expr> ; Start ; Step | Close: "Close" |
| Empty graph | Add an expression to see it graphed. | — |
| Footer tip | Tip: use a letter like a to make a slider. | — |

---

## 11. Performance-visible UX
- Pan/zoom redraws on `requestAnimationFrame`; never re-parse on pan/zoom (re-sample only).
- Typing must never block: parse errors are caught and surfaced per §3.1.

## 12. Out of scope (do not build)
Implicit equations (`x^2+y^2=1`), inequalities, polar/parametric, points/lists, undo/redo,
drag-reordering, share links, export image.

---

## 13. Acceptance checklist

Layout
1. At 1280×800 the panel is 384px wide on the left; at 800×1000 it is 288px; at 375×812 it is a bottom sheet.
2. No horizontal scrollbar at 320px width or at 200% zoom on 1280px.
3. Collapsing the panel hides it, removes its contents from the tab order, and shows a "Show expressions panel" button; state persists after reload.
4. On phone, the sheet toggles between ~35% and ~85% viewport height (never higher than `100dvh - 4.5rem`) via tap and via Enter/Space on the handle; the graph above stays pannable and the horizontal toolbar row stays fully visible when expanded.
4a. On phone, first run and Reset view put the origin at the centre of the area above the peek sheet, and zoom buttons zoom around that point.

Expressions
5. First run shows `y = sin(x)` in Blue (`#0072B2` light) plus an empty row with the placeholder "e.g. y = x^2", shown untruncated at 320, 800 and 1440px widths; the panel header reads "Expressions".
6. Typing in the trailing empty row creates an expression and a new empty row appears.
7. The curve updates within ~150ms of the last keystroke; an invalid edit keeps the last valid curve.
8. Enter in an input creates/focuses a new row directly below.
9. Backspace in an empty (non-only) row deletes it and focuses the end of the previous input.
10. Up/Down arrows move between expression inputs.
11. `2x`, `3sin(x)`, `x(x+1)`, `2pi` all plot as implicit multiplication.
12. `sin(`, `y =`, `foo(x)`, `2 +`, `x = 3`, `a = 5` each show the exact §3.1 message, with tokens rendered as `<code>` spans (single symbols carrying an sr-only spoken name), no `·` or `…` characters, `aria-invalid="true"`, and `aria-describedby` pointing at it.
13. No input from §3.1 crashes the app or throws to the console as uncaught.
14. Swatch toggle hides/shows the curve; hidden state is a hollow slashed ring; `aria-pressed` updates.
15. Overflow menu offers Colour…, Table of values, Delete; it is non-modal, Escape closes it and focus returns to its trigger; Colour opens a keyboard-operable radiogroup of 7 colours.
16. Deleting moves focus to the next row's input (or previous if last) and announces "Expression N deleted."

Sliders
17. `a*sin(x)` creates a slider for `a` with value 1, range -10..10, step 0.1; dragging updates the curve live.
18. Min/max/step are editable; min ≥ max is rejected with "Min must be less than max".
19. Play animates a ping-pong sweep; with reduced motion it advances in discrete 500ms steps. The button's accessible name stays "Animate a" while playing; `aria-pressed` toggles and only the icon changes.
20. Slider exposes `aria-valuetext` like "a = 1.0".

Graph
21. Wheel zoom keeps the point under the cursor fixed; the page does not scroll.
22. Drag pans; pinch zooms on touch (Playwright touch emulation or manual).
23. Toolbar is top-right, vertical at ≥640px and a single horizontal row of 44px buttons below 640px, with Zoom in, Zoom out, Reset view, Theme, Keyboard shortcuts; each has an aria-label and tooltip.
24. Focused canvas: arrows pan, +/- zoom, 0 resets, T enters trace, [ ] switch curves, ←/→ move along the curve by one minor grid step (Shift: one major step) with x snapped to that grid, Escape exits; Tab leaves the canvas.
25. `tan(x)` and `1/x` show no vertical connecting lines at asymptotes.
26. Trace tooltip shows the expression and `(x, y)` with ≤4 significant figures (e.g. `(1.571, 1)`), scientific notation for tiny/huge values.
27. Tick labels and grid adapt when zooming from span 20 to span 0.001 and to span 10000.

Colour & theme
28. All 7 palette colours meet ≥3:1 against the graph background in both themes (§8.1 values used verbatim).
29. Theme follows `prefers-color-scheme` initially; toggle switches and persists; curves swap to their dark variants.

Accessibility
30. Canvas has `role="img"` and an `aria-label` listing expressions and visible ranges; the focusable wrapper has an aria-label describing controls.
31. A single polite live region announces trace coordinates, keyboard zoom/reset, errors (on blur) and deletions, no more than once per 500ms.
32. Every interactive element has a visible focus indicator when reached by keyboard.
33. All targets ≥24×24px; under coarse pointer emulation, toolbar, swatch, overflow and play buttons are ≥44×44px.
34. With reduced motion, panel/sheet open instantly and zoom buttons jump without animation.
35. axe (via @axe-core/playwright) reports zero serious/critical violations in light and dark themes, desktop and phone.
36. Table of values dialog has a title, a captioned table with `th scope="col"`, traps focus, and returns focus to the trigger on close.

Persistence
37. Expressions (text, colour slot, visibility, slider settings), viewport, theme and panel state survive reload; blocked/corrupt localStorage falls back to first-run without errors.
