# Project status and handover (2026-09-30)

## Where things stand
- Phases 1–3 are done: scaffold, math and viewport core, full UI, and three reviews.
- The app works end to end. The last full verification ran before fix round 2, at 9287c41:
  typecheck, lint and build clean; 425 unit tests (535 later); e2e 163/166 after the tester's
  triage; the 3 app bugs it found were fixed in 27ee729 and cc02384.
- The session ended **while fix round 2 was in progress**. Agents were told to commit only green work
  and stash anything unfinished (`git stash list`: "frontend-dev WIP", "frontend-dev-2 WIP", "tester WIP").

## Key docs
- `docs/TEAM-BRIEF.md`: requirements, stack, working agreements
- `docs/UX-SPEC.md`: behaviour source of truth, including lead decisions (§13 = acceptance checklist)
- `docs/PHASE2-CONTRACT.md`: file ownership and shared interfaces (`src/state/types.ts`)
- `docs/reviews/`: test-gaps, test-results, code-a11y-review (CR-*), ux-review (UX-*)

## Outstanding: fix round 2 (check `git log` to see which of these landed)
**frontend-dev** (App, state, panel, hooks, lib/math, index.css):
- CR-01 (animation keeps running for a deleted parameter)
- CR-02 (TableOfValues evaluate guard + app error boundary)
- CR-03 (500-char input cap + AST depth/node cap + 150ms parse debounce)
- CR-04 (popover accessible names)
- CR-06 (focus ring ≥3:1: drop `ring-ring/50`)
- UX-02 (slider min/max inline only at lg)
- UX-03 (phone peek shows ≥2 rows)
- UX-05 (placeholder copy)
- UX-04 (pass `insetBottom` to GraphView)
- CR-05 (cap expanded sheet below the toolbar row)
- CR-14 (`modal={false}` on row menus)
- CR-20 (constant "Animate a" label + aria-pressed)
- remaining minor and polish items assigned in both review files

**frontend-dev-2** (src/components/graph):
- UX-01 (empty hint as an HTML overlay off the axis)
- UX-04 (honour `insetBottom`)
- CR-05 (horizontal toolbar below sm)
- CR-07 (aria-disabled zoom buttons keep focus)
- CR-16, CR-21, and UX-08/09/10/12/17/18/25/26

**tester** (tests/e2e):
- Part C: e2e coverage for the items above, plus checklist item 4a
- then a full run and triage into docs/reviews/test-results.md

## To finish
1. `git stash list`: apply and finish any WIP, or drop it.
2. Complete the outstanding items above.
3. Verify: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e`.
4. Final UX screenshot pass at 1440/800/375/320 in light and dark against UX-SPEC §13.
