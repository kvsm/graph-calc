# Code and accessibility review

Reviewer: code/a11y reviewer. Scope: all of `src/` except stock `src/components/ui` (checked: unchanged since
scaffold 73df3d5, so no harmful modifications). I read the code and ran the app at **2efbae4** (built from a
clean worktree, `vite preview`, Playwright + `@axe-core/playwright`, Chromium). I also checked the later graph
commit d0c9f53. Every finding below was reproduced or read directly in the code.

I haven't repeated what `docs/reviews/test-results.md` already reports: the missing graph-wrapper outline
(`outline-none`) and the panel and sheet animating under reduced motion. I confirmed both independently.

**Totals: 0 blocker, 6 major, 15 minor.**

---

## Security: the sandbox holds

I bundled `src/lib/math` with rolldown and ran about 80 hostile inputs through `parseExpression`. None of them
reached code execution or prototype access:

- `x.constructor`, `sin["constructor"]`, `x["constructor"]`, `import(...)`, `evaluate("…")`, `parse("x")`,
  `cos.constructor("return 1")()`, strings, matrices, objects, `?:`, `==`, `!`, `%`, `&`, `<<` and units
  (`x to cm`) are all rejected. Most are rejected by the `ALLOWED_CHAR` allow-list (`parseExpression.ts:38`)
  before mathjs sees them, and the rest by the AST allow-list in `compile.ts`. No mathjs function runs at
  evaluation time.
- `constructor(x)`, `toString(x)`, `__proto__(x)` and `hasOwnProperty(x)` give "Unknown function" errors.
  `FUNCTIONS` and `CONSTANTS` lookups use `Object.hasOwn`.
- Bare `constructor` compiles as the implicit product c·o·n·s·t·r·u, which is harmless. Parameter lookups
  (`params[name]`) only ever use single-letter names.
- After all probes, `Object.prototype` was untouched.
- **XSS:** there is no `innerHTML` or `dangerouslySetInnerHTML` anywhere in `src/`. Expression text reaches
  the DOM only as React text children, `aria-label` attributes, or `textContent` (`announce.ts:17`), so it is
  safe.
- **DoS:** nested brackets (up to 1e5 deep) and long operator chains fail cleanly with a parse error. But very
  long inputs do cause a crash and multi-second freezes. See CR-02 and CR-03.

---

## Findings

### CR-01: major, correctness: the slider animation keeps running after its slider disappears
- **Where:** `src/hooks/useParameterAnimation.ts:26`, `:38`, `:67`
- **Problem:** `playing` is only changed by `toggle()`. Deleting the expression, or editing `a` out of it,
  removes the slider and its Pause button, but the rAF loop keeps calling `setValue` every frame. The whole
  app re-renders at 60fps with no visible change, the persisted value keeps moving, and the user can't stop it.
  - **Reproduced:** play `a` in `a*sin(x)`, change the text to `sin(x)`, wait 1.9s, then type `a*sin(x)`
    again. The slider comes back as "Pause a" with the value moved to 6.0.
- **Fix:** pass the set of currently owned parameter names (`Object.values(owners).flat()`) into the hook. In
  an effect, drop any `playing` name that is no longer owned (and delete its cursor), or intersect the two
  inside `tick`. Announce "Paused a = …" when a name is dropped.

### CR-02: major, correctness/crash: a long expression white-screens the app when you open its table
- **Where:** `src/components/panel/TableOfValuesDialog.tsx:70`. The root cause is `compile.ts:110`
  (`product` nests one closure per factor) and `parseExpression.ts:225` (`evaluate` doesn't catch errors).
- **Problem:** implicit multiplication of N factors compiles to an N-deep closure chain. At about 20,000
  characters (for example a pasted `xxxx…`), `evaluate` throws `RangeError: Maximum call stack size exceeded`.
  The graph survives, because `sampleFunction` and `safeEval` catch the error. The table calls
  `expression.evaluate` during render with no guard and there is no error boundary, so React unmounts
  everything.
  - **Reproduced in the browser:** `#root` innerHTML length drops to 0, with a `pageerror` of "Maximum call
    stack size exceeded".
  - This breaks the brief's rule that errors "never crash the app".
- **Fix:**
  - Make `CompiledExpression.evaluate` total: wrap `fn(x, params)` in try/catch and return NaN on error, as
    the doc comment already promises for non-finite results.
  - Build `product` as a loop over an array of factors instead of nested closures.
  - Add a top-level error boundary around `<App />` in `main.tsx` that falls back to a reset option.

### CR-03: major, performance/DoS: long input freezes the UI for seconds on every re-sample
- **Where:** `src/lib/math/parseExpression.ts:165` (no length limit) and `src/lib/math/compile.ts:110`
- **Problem:** with the same kind of input, each `sampleFunction` call (900×700 view) takes **289ms at 5,000
  characters and 3.2s at 20,000** (measured in node). A re-sample happens on every pan or zoom frame, so the
  tab effectively hangs.
  - Parsing is also synchronous on every keystroke, not debounced: `useAppStore.ts:104` → `deriveStatuses` →
    `currentError` → `parseCached`. That costs about 80ms per keystroke at 1e5 characters.
- **Fix:**
  - Reject inputs over a sane limit (for example 500–1,000 characters) with a friendly error in
    `parseUnsafe`, before calling mathjs.
  - Cap the number of AST nodes and identifier factors in `compileAst` (for example 2,000).
  - Optionally derive `statuses` from the debounced text, so errors aren't computed per keystroke.

### CR-04: major, a11y (4.1.2, axe serious): the colour and slider-settings popovers are unnamed dialogs
- **Where:** `src/components/panel/ExpressionRow.tsx:146` (colour popover) and
  `src/components/panel/ParameterSlider.tsx:122` (slider settings)
- **Problem:** Radix `PopoverContent` renders `role="dialog"` with no accessible name. axe reports
  `aria-dialog-name` (serious) for both popovers in light and dark themes. That fails checklist #35 whenever a
  popover is open. The visible "Curve colour" `<h2>` isn't connected to the dialog.
- **Fix:**
  - Colour popover: give the `<h2>` an id and set `aria-labelledby` on `PopoverContent`.
  - Slider settings: add `aria-label={`Slider settings for ${name}`}`, or a visually hidden heading.

### CR-05: major, a11y/layout (2.4.11 Focus Not Obscured, 2.5.x): on phones the expanded sheet covers the toolbar
- **Where:** `src/components/graph/GraphToolbar.tsx:78` (vertical toolbar) together with
  `src/components/panel/ExpressionPanel.tsx:270-272` (`z-20`, `h-[85dvh]`)
- **Problem:** at 375×812 the expanded sheet's top edge is at y=122. The 44px toolbar buttons sit at:

  | Button | y range |
  |---|---|
  | Reset | 113–157 |
  | Theme | 170–214 |
  | Keyboard shortcuts | 218–262 |

  So Theme and Shortcuts are fully under the sheet and Reset is partly covered. Playwright can't click them
  ("aside subtree intercepts pointer events"), and keyboard focus on them is completely hidden.
  - The sheet expands automatically whenever an input gets focus (`ExpressionPanel.tsx:113`), so this is the
    normal state while editing.
  - The spec's own numbers conflict: 15% of 812px is 122px, but a 5-button, 44px vertical stack is about
    250px tall.
- **Fix:** below `sm`, make the toolbar horizontal (`flex-row`, about 52px tall), which fits above the sheet.
  Alternatively, cap the expanded sheet at `calc(100dvh - <toolbar bottom> - 12px)`.
  - Tell ux-advocate that §1.2 and §1.3 need reconciling.
  - While fixing this, the centred empty-state hint is also hidden under the expanded sheet.

### CR-06: major, a11y (1.4.11): the focus indicator is about 2:1 wherever it is only the 50%-alpha ring
- **Where:**
  - `src/components/panel/ExpressionRow.tsx:137`: swatch `Toggle`. The stock toggle has
    `focus-visible:border-ring` but no border width, so nothing is drawn.
  - `src/components/panel/ColorPicker.tsx:55`
  - `src/components/panel/ExpressionPanel.tsx:280` (sheet handle)
  - `src/components/panel/ParameterSlider.tsx:98`: the slider dot always has a ring-coloured border, so focus
    adds only the faint ring.
- **Problem:** `ring-ring/50` blends to #92B1F5 on white (**2.14:1**) and #355882 on #0A0A0A (**2.69:1**),
  both computed from the tokens in `index.css`. A focused swatch reports `border-width: 0` and only the 3px
  semi-transparent ring (checked with computed styles).
  - Buttons and inputs are fine, because they also get a 1px solid `--ring` border (5.17:1 / 7.79:1).
  - Spec §8.2 lists the focus ring at 5.17:1, but the colour is only used at 50% alpha.
- **Fix:** in `index.css`, add a solid indicator for everything, for example:
  ```css
  @layer base {
    :focus-visible {
      outline: 2px solid var(--ring);
      outline-offset: 2px;
    }
  }
  ```
  Or change these four components to `focus-visible:ring-ring` at full opacity (or add
  `focus-visible:outline-2 outline-solid outline-ring`).

### CR-07: minor, a11y: disabled zoom buttons drop keyboard focus to `<body>`
- **Where:** `src/components/graph/GraphToolbar.tsx:41` and `src/components/graph/GraphView.tsx:555`
- **Problem:** pressing Enter on "Zoom in" 25 times reaches the span limit. The button becomes `disabled`
  while it has focus, and `document.activeElement` becomes `BODY` (reproduced). Tab recovers, but screen
  readers lose their place.
- **Fix:** at the limit, use `aria-disabled="true"` with a no-op handler instead of `disabled`, or move focus
  to the opposite zoom button.

### CR-08: minor, a11y (2.4.3): "Show expressions panel" is last in the tab order
- **Where:** `src/App.tsx:51`
- **Problem:** the floating button replaces the panel at the top-left, but it is rendered after `<GraphView>`.
  The collapsed tab order is canvas → five toolbar buttons → Show expressions panel. Focus after collapsing is
  correct.
- **Fix:** render it before `<GraphView>` inside `<main>`.

### CR-09: minor, a11y (§9.2): deleting with Backspace isn't announced
- **Where:** `src/components/panel/ExpressionPanel.tsx:83`
- **Problem:** `deleteRow` announces "Expression N deleted.", but the Backspace-on-empty path calls
  `actions.remove` without announcing anything (reproduced: the live region kept its previous text).
- **Fix:** call `announce(`Expression ${index + 1} deleted.`)` in that branch.

### CR-10: minor, a11y: the error is announced again on every blur
- **Where:** `src/components/panel/ExpressionRow.tsx:92-94`
- **Problem:** three focus/blur cycles on an unchanged invalid row produced three identical announcements
  (captured with a MutationObserver). §9.2 says to announce "once when the error line appears".
- **Fix:** keep a ref with the last announced `error.message` for this row, and announce only when it
  changes. Reset the ref when the text changes.

### CR-11: minor, a11y (§9.5): slider inputs are under 44px on coarse pointers
- **Where:** `src/components/panel/ParameterSlider.tsx:64`, `:72`, `:105`
- **Problem:** with coarse-pointer emulation at 800px:
  - "Value of a" is 64×32px.
  - "Minimum for a" and "Maximum for a" are 48×28px.

  §9.5 asks for at least 44×44px for all targets under `pointer-coarse`. They do pass the 24px AA minimum.
- **Fix:** add `pointer-coarse:h-11` (and a wider min/max field on coarse pointers).

### CR-12: minor, a11y (§9.6): dialog, menu and tooltip animations ignore reduced motion
- **Where:** `src/index.css` (tw-animate-css classes in the stock dialog, popover, menu and tooltip)
- **Problem:** under `reducedMotion: 'reduce'`, the shortcuts dialog still runs its `enter 0.1s` zoom
  animation.
- **Fix:** add a reduced-motion override in `index.css`, which also covers test-results #2 and #3:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, ::before, ::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```

### CR-13: minor, a11y (axe `region`, moderate): the `<h1>` is outside any landmark
- **Where:** `src/App.tsx:32`
- **Problem:** axe reports `region` in every state.
- **Fix:** move the sr-only `<h1>` inside `<main>`, or wrap it in a `<header>`.

### CR-14: minor, a11y (axe serious while a menu is open): `aria-hidden-focus`
- **Where:** `src/components/panel/ExpressionRow.tsx:202`
- **Problem:** the modal `DropdownMenu` applies `aria-hidden` to `.h-dvh` while its focusable descendants stay
  in the DOM. axe reports `aria-hidden-focus` (serious) whenever the menu is open.
  - Focus is trapped in the menu, so in practice this is Radix's known pattern.
  - The live region itself stays exposed, because `aria-hidden` skips `[aria-live]` (checked).
- **Fix:** decide one way or the other. Either accept it and keep the #35 scans to closed states, or use
  `<DropdownMenu modal={false}>`. Note that the second option conflicts with §9.3 "traps focus".

### CR-15: minor, performance: the whole expression list re-renders on every pan frame and every animation frame
- **Where:** `src/components/panel/ExpressionPanel.tsx:137-157` and `src/components/panel/ExpressionRow.tsx:52`
- **Problem:** any `state` change re-renders `App` → `ExpressionPanel` → every `ExpressionRow`, including each
  row's Radix Tooltip, DropdownMenu, Popover and Dialog. Rows aren't memoised, get new inline callbacks every
  render, and receive `viewport` (which changes on every pan) and `params`.
  - Measured script time per pan move, unthrottled:

    | Setup | Script time per move |
    |---|---|
    | 1 row (with sampling) | 2.95ms |
    | 10 rows, all hidden (no sampling) | 4.30ms |
    | 10 visible rows | 6.91ms |
    | 10 visible rows, 4× CPU throttle | 70ms |

  - The brief's 60fps target on phones is at risk.
- **Fix:**
  - Wrap `ExpressionRow` in `React.memo` and pass stable callbacks: `useCallback` keyed by id, or pass `id`
    plus the `actions` object.
  - Don't pass `viewport` to rows. Give the table dialog a getter (`() => viewportRef.current`), since it only
    reads the viewport when opening.
  - Pass `params` only to rows whose table is open.

### CR-16: minor, performance: `getComputedStyle` on every draw
- **Where:** `src/components/graph/GraphView.tsx:199`
- **Problem:** `readGraphColors` runs on every pan frame and forces a style read. It measured about 0.4ms of
  recalc-style per move with 10 rows.
- **Fix:** memoise the colours on `theme`. Read them in an effect when the theme changes, after the class is
  applied.

### CR-17: minor, a11y (1.4.11, judgement call): input borders are 1.26:1 (light) and 1.47:1 (dark)
- **Where:** `src/index.css:71-72` (`--border`, `--input`) and `:111-112`
- **Problem:** the expression, value, min and max inputs are identified only by their border. There are no
  visible labels.
- **Fix:** darken `--input` to at least 3:1 against `--background`, for example `oklch(0.64 0 0)` in light.
  In dark, `oklch(1 0 0 / 40%)` or a solid equivalent.

### CR-18: minor, robustness: persisted state is only partly validated
- **Where:** `src/state/persistence.ts:28`, `:66`, and `src/lib/viewport/viewport.ts:176`
- **Problem:**
  - Parameter names aren't validated. A stored `"__proto__"` key assigns the prototype of `parameters`. That's
    harmless today, because lookups only use single letters, but it is avoidable.
  - Expression ids are any non-empty string, and they end up inside DOM ids and `aria-describedby`, where
    spaces break the reference.
  - `isValidViewport` accepts spans outside `MIN_SPAN` to `MAX_SPAN`.
- **Fix:**
  - Accept only parameter names matching `/^[A-Za-zͰ-Ͽ]$/`, and build `parameters` with
    `Object.create(null)` or skip `__proto__`.
  - Accept only ids matching `/^[\w-]+$/`.
  - Reject, or clamp, viewports whose x-span is outside the zoom limits.

### CR-19: minor, correctness: the `f(x) = …` form accepts reserved names on the left-hand side
- **Where:** `src/lib/math/parseExpression.ts:93` (`LHS_FUNCTION`)
- **Problem:** `sin(x) = x`, `x(x) = 1`, `y(x) = 1` and `toString(x) = x` all parse as valid function
  definitions, which is inconsistent with "Only y = … is supported".
- **Fix:** in `classifyLhs`, reject names that are `x`, `y`, known functions or constants, and give the
  `invalid-lhs` message.

### CR-20: minor, a11y: the play button changes its label and also uses `aria-pressed`
- **Where:** `src/components/panel/ParameterSlider.tsx:53-54`
- **Problem:** the result is announced as "Pause a, toggle button, pressed", which signals the state twice.
  APG says toggle buttons should keep a constant label. The spec (§4, §10) mandates both, so this needs a spec
  decision.
- **Fix:** keep "Animate a" plus `aria-pressed`, or drop `aria-pressed` and keep the changing label. Ask
  ux-advocate which.

### CR-21: minor, code quality: dead or duplicate UI code
- **Where:** `src/components/panel/ParameterSlider.tsx:3`, `:76`, and `src/components/graph/GraphToolbar.tsx:72`
- **Problem:**
  - `ParameterSlider` uses the Radix `Slider` primitive directly, while `src/components/ui/slider.tsx` is
    never imported.
  - `ui/sheet.tsx` and `ui/switch.tsx` are also unused.
  - `GraphToolbar` wraps itself in a second `TooltipProvider`, although `App` already provides one.
- **Fix:** delete the unused shadcn files, or use `ui/slider`. Remove the nested provider.

---

## Checked and fine
- **Cleanup:**
  - GraphView disconnects its ResizeObserver, removes its pointer and wheel listeners, clears its hold timer
    and cancels its rAF.
  - `useParameterAnimation` cancels its rAF and interval.
  - `useAppStore` clears its debounce timers and removes its `pagehide` and `matchMedia` listeners.
  - The live-region throttle is correct: the trailing message wins.
- **Viewport maths:**
  - Size-zero guards are in place: `defaultViewport`, `resizeViewport`, `fitAspect` and `effectiveViewport`,
    plus the `hasSize` gates in GraphView.
  - Zoom is clamped to 1e-6–1e6. `clampScreenY` guards the canvas path near asymptotes.
  - The sampler rejects non-finite ranges.
- **Stale closures:** imperative handlers read from `latest.current`, which is updated in a layout effect.
  `toggleTheme` uses `themeRef`. I found no stale closures.
- **Idle canvas:** there is no redraw loop when idle. It draws one rAF per change.
- **Re-sampling on keystrokes:** fixed by d0c9f53 (`sampleCache`, which compares only the parameters each
  plot uses).
- **Focus management:**
  - Deleting from the menu focuses the next input and announces the deletion.
  - Escape in an input moves focus to the swatch.
  - The table dialog returns focus to the overflow trigger.
  - Collapsing the panel focuses "Show expressions panel", and the aside is `inert`.
  - The desktop tab order matches §9.3.
- **Names and roles:**
  - The canvas has `role="img"` with a generated label.
  - The wrapper is a labelled group.
  - The toolbar has `role="toolbar"` with a vertical orientation.
  - The radiogroup and radios have names.
  - The slider has `aria-valuetext`.
  - The sheet handle has `aria-expanded`.
- **Contrast (tokens):**

  | Pair | Light | Dark |
  |---|---|---|
  | muted-foreground on background | 4.73 | 7.63 |
  | muted-foreground on a hover/focus row | 4.53 | 6.84 |
  | destructive | 6.47 | 7.16 |
  | axis on major grid | 6.20 | 6.00 |

  All palette colours are at least 3.70:1 against hover rows.
- **Layout:** no horizontal scroll at 375px.
- **axe:** with nothing open, the only violation is `region` (CR-13), in light and dark, on desktop and phone.
- **Contract:** `src/state/types.ts`, `palette.ts` and `announce.ts` are unchanged since 4f36ab7. No commit
  crosses the panel/graph ownership boundary.

---

## Owner split

| Owner | Findings |
|---|---|
| **frontend-dev** (App/state/panel/hooks/lib/math/index.css) | CR-01, CR-02, CR-03, CR-04, CR-06 (majors); CR-08, CR-09, CR-10, CR-11, CR-12, CR-13, CR-14, CR-15, CR-17, CR-18, CR-19, CR-20, CR-21 (the `ui/*` part) |
| **frontend-dev-2** (src/components/graph) | CR-05 (major; coordinate the sheet cap with frontend-dev); CR-07, CR-16, CR-21 (the nested TooltipProvider) |
| **ux-advocate** (spec decisions) | CR-05 (§1.2 vs §1.3 geometry), CR-14 (modal menu vs axe), CR-20 (aria-pressed plus a changing label) |
