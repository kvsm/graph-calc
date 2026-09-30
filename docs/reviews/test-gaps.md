# Unit test gaps: src/lib/math and src/lib/viewport

Author: tester. Scope: gaps in the existing Vitest suites checked against UX-SPEC §3, §3.1, §4, §5.3 and §5.4.
I confirmed the behaviour noted as "actual" below by running the current code through a scratch Vitest harness
kept outside the repo. I have not edited `src/`.

Format: **severity**, file:line, problem, and suggested fix (the missing test, plus a code fix where the behaviour is wrong).

## A. Behaviour bugs the missing tests would catch

1. **major**, `src/lib/math/compile.ts:45` (`splitIdentifier`), with no test in `parseExpression.test.ts:118`.
   `sinx`, `cosx` and `lnx` parse as products of single-letter parameters. `sinx` becomes `s·i·n·x`, which gives
   sliders **s, i, n**, and `cosx` gives c, o, s. Users often type `sinx`, and the result is three surprise sliders
   and a wrong curve. (This is assigned to frontend-dev.)
   Fix: when an identifier starts with a known function name followed by letters, either treat it as `sin(x)` or
   return the fallback error `Couldn't understand this expression. Check for typos near "sinx".`
   Tests: `sinx`, `cosx`, `lnx`, `sqrtx`, `expx` should give no sliders. Also `si` and `ab` should still work as
   `s·i` and `a·b`.
2. **major**, `src/lib/math/parseExpression.ts:181` (mirrored `… = y`). `f(x) = y` is swapped into `y = f(x)`,
   and `f(x)` then parses as `f·x`, so it silently creates a slider `f`. `f(x) = f(x)` is also accepted, again
   with a slider `f`.
   Fix: reject function-form left-hand sides whose right-hand side mentions `y` or the function name itself. Add
   tests for both inputs.
3. **minor**, `src/lib/math/parseExpression.ts:105`. `e = 3` gives "…just use e in an expression, e.g. e·sin(x)",
   but `e` is the constant, not a parameter (§4). The same would apply to any reserved letter.
   Fix: exclude `e` (and `y`) from the slider hint so they get the generic "Only y = … is supported" message.
   Add a test.
4. **minor**, `src/lib/viewport/format.ts:52` against UX-SPEC §5.4, which says "tick labels … 4 sig figs max".
   The actual labels are longer: `generateTicks(999.9995, 1000.0005, 800)` gives `1000.0001` (8 s.f.), and
   `generateTicks(1e6, 1e6+1, 1000)` gives `1.0000001e6` (8 s.f.). The existing test at `ticks.test.ts:103`
   pins `1000.0` and `1000.3`, which are 5 s.f. There's a conflict here: adjacent ticks can't be told apart at
   4 s.f. once the view is far from the origin.
   Fix: UX needs to decide. Either amend §5.4 to say "enough figures to distinguish adjacent ticks", or use an
   offset label (for example `+1e6` on the axis). Then add a test that pins whichever is chosen.

## B. §3.1 error wording: missing cases

5. **minor**, `parseExpression.test.ts:175`. Only `2 +` is tested for "ends unexpectedly after …". Add `2 -`,
   `2 *`, `2 /`, `2 ^`, `x^` and `sin(x) +`. All of these currently give the right message, but none are pinned.
6. **minor**, `parseExpression.test.ts:175`. `y =` is tested, but `y=`, `y = ` (trailing space) and `f(x) =`
   (all currently `empty-rhs`) aren't.
7. **minor**, `parseExpression.test.ts:175`. The `sqrt()` wording is tested, but `sin()` and `log()` ("… needs a
   value, e.g. sin(x).") aren't. `ln(x, 2)` and `sin(x, 2)` ("ln needs 1 value.") are also untested; only
   `log`/`atan2` arity is covered at line 244.
8. **minor**, `parseExpression.test.ts:175`. Bracket edge cases are untested: `)(` gives "Unexpected )", `((x)`
   and `abs(x` give "Missing closing bracket )." and `(x))` gives "Unexpected )". Add these, with the expected
   `position`.
9. **minor**, `parseExpression.test.ts:175`. The assignment variants `a = -5`, `a = 2.5` and `a = 1e3` (slider
   hint) aren't tested. Nor are `Y = x` (uppercase, which currently gives "Only y = …") or `x = y`, which is
   currently **accepted** as `y = x` via the mirror. It's worth deciding whether `x = y` should be accepted,
   given that §3.1 rejects `x = 3`.
10. **minor**, `parseExpression.test.ts:175`. `y` on its own and `g(y) = y` both give "y can't appear on the
    right-hand side." Only `y = y + 1` and `y = y` are tested.
11. **minor**, `parseExpression.test.ts:216`. There are no tests for `sin^2(x)` or `3 sin x` (`missing-parens`,
    with the fallback near "sin"). Consider a friendlier message, e.g. "Use sin(x)^2", and ask UX.
12. **minor**, a spec wording mismatch rather than a test gap. §3.1 gives the inline text "Missing closing
    bracket )." but §9.2's announcement example is "Expression 2: Missing closing bracket." without the `)`.
    Whoever builds the announcement should reuse the inline message; the e2e test uses a prefix regex.

## C. Parsing and implicit multiplication: missing cases

13. **major**, `parseExpression.test.ts:49`. Precedence of implicit multiplication against powers and division
    isn't pinned. Actual behaviour: `2x^2` gives 18 at x=3 (correct: 2·x²), `-2^2` gives -4 (correct), `1/2x`
    gives 1.5 at x=3 (it's parsed as (1/2)·x, not 1/(2x)), and `x^-1` gives 1/3. Add tests so a mathjs upgrade
    can't change these silently, and ask UX whether `1/2x` meaning (1/2)x is acceptable.
14. **minor**, `parseExpression.test.ts:49`. There are no tests for `sin (x)` (space before the bracket), `ax`
    vs `a x`, `xe`/`ex`, `2e`, `2e3` (a number literal, not 2·e·3), `1e-3x` or `x^(1/3)` at negative x
    (currently NaN, a gap, which is expected).
15. **minor**, `parseExpression.test.ts:236`. Stress inputs aren't tested: 2000 nested brackets and a
    10,000-character `x+x+…` both return the fallback without a token rather than throwing (verified), and the
    performance isn't bounded. Add both inputs with a time budget (e.g. < 50ms) to protect typing latency (§11).
16. **minor**, `parseExpression.test.ts:118`. Parameter extraction isn't tested for `f(x) = a x`, where the
    function name `f` must not become a parameter. `e` inside identifiers (`ae`, which is a·e) should give only
    `a`.

## D. Number formatting and ticks (§5.3, §5.4)

17. **minor**, `format.test.ts:4`. Negative scientific values near the thresholds are missing: `-0.00001234`
    gives `-1.234e-5`, `-1e6` gives `-1e6`, and `-0.000049999` gives `-5e-5`. Values that round up across 1e6
    are also missing (`999950` gives `1e6`).
18. **minor**, `ticks.test.ts:73`. Checklist #27's spans aren't covered directly. Add
    `generateTicks(-5000, 5000, 800)`, which should give step 1000 and labels `-5000 … 5000`, and
    `generateTicks(-0.0005, 0.0005, 800)`, which should give step 1e-4 and labels `-0.0005 … 0.0005`. Also add
    the zoom limits: `generateTicks(-5e-7, 5e-7, 800)` (sci labels `-5e-7 … 5e-7`) and `(-5e5, 5e5)` for
    MAX_SPAN.
19. **minor**, `format.test.ts:56`. The boundary between fixed and scientific notation isn't tested:
    `formatTickLabel(1e-4, 1e-4)` gives `0.0001` (fixed), but a step of `5e-5` switches to scientific. Also
    add negative scientific tick labels (`-5e-6` at step 1e-6).
20. **minor**, `ticks.test.ts:73`. The "~80–120px spacing" rule (§5.4) is only tested for 800, 1000 and
    2000px. Add a property test: for spans from 1e-6 to 1e6 and widths from 320 to 2560px,
    `step * px/span` should stay within [~63, ~158] (the log-nearest nice step). Also add a guard that the
    label count is never 0 on a valid viewport.
21. **minor**, no test. §5.4 says labels "clamp to the viewport edge when the axis is off-screen". That's UI
    logic (`src/components/graph`), and there's no pure helper to test. Suggest extracting it (e.g.
    `axisLabelPosition(vp, size)`) so it can be unit tested. The e2e suite can't read canvas text.

## E. Viewport

22. **minor**, `viewport.test.ts`. Keyboard zoom at the limits isn't tested as a sequence: 25× `zoomCenter(…, 2)`
    from the default should end at exactly `MIN_SPAN` and then return the same object (the e2e suite tests
    the disabled button).
23. **minor**, `viewport.test.ts`. `resizeViewport`/`fitAspect` aren't tested with a 320×700 phone size
    (a tall aspect), where the y span is larger than the x span.
