# Graphing Calculator — Team Brief

Owner: team lead. All agents read this first.

## Product
A single-page graphing calculator web app (think lightweight Desmos).

### Must-have features
1. **Expression list** (side panel): add, edit, delete, show/hide expressions. Each has an
   auto-assigned colour (colour-blind-safe palette) the user can change.
2. **Plotting** of explicit functions `y = f(x)` (also accept bare `f(x)` like `sin(x)`),
   including trig, log/ln, sqrt, abs, exp, powers, pi, e. Handle discontinuities
   (e.g. `tan(x)`, `1/x`) without drawing vertical connecting lines.
3. **Parameters / sliders**: any free variable other than `x` (e.g. `a` in `a*sin(x)`)
   becomes a slider with editable min/max/step.
4. **Viewport**: pan (drag, arrow keys), zoom (wheel, pinch, +/- buttons and keys),
   reset view. Axes, gridlines and tick labels that adapt to zoom level.
5. **Trace / hover**: show coordinates of the nearest curve point under the pointer;
   keyboard-accessible equivalent.
6. **Errors**: invalid expressions show an inline, human-readable error; they never crash the app.
7. **Table of values** per expression (also serves as the accessible alternative to the canvas).
8. **Light/dark theme** toggle respecting `prefers-color-scheme`.
9. **Persistence**: expressions + viewport saved to localStorage (wrapped in try/catch).
10. **Responsive**: usable on phone widths (panel stacks/collapses), no horizontal scroll.

### Non-functional
- WCAG 2.2 AA: keyboard operable, visible focus, labelled controls, sufficient contrast,
  `prefers-reduced-motion` respected, canvas has a text alternative.
- No crashes on bad input. Fast: 60fps pan/zoom with ~10 expressions.

## Stack (fixed)
- Vite + React + TypeScript (strict)
- Tailwind CSS v4 + shadcn/ui (components under `src/components/ui`)
- `mathjs` for parsing/evaluation (sandboxed: no assignment/import side effects)
- Canvas 2D for rendering
- Vitest + React Testing Library for unit/component tests; Playwright for e2e (Chromium)
- ESLint (+ jsx-a11y plugin)

## Layout conventions
- `src/lib/math/` — pure parsing, evaluation, sampling (no React)
- `src/lib/viewport/` — pure viewport maths (ticks, transforms)
- `src/components/` — app components; `src/components/ui/` — shadcn
- `src/hooks/` — hooks; `tests/e2e/` — Playwright specs
- Unit tests colocated as `*.test.ts(x)`

## Scripts (must exist)
`npm run dev`, `npm run build`, `npm run lint`, `npm test` (vitest run), `npm run test:e2e`

## Working agreements
- Only frontend devs (`frontend-dev`, `frontend-dev-2`) edit `src/` app code, each within the paths they have been assigned. Commit with pathspecs (`git commit -- <your paths>`); on `.git/index.lock` wait and retry, never delete it. Testers write tests; reviewers write reports
  in `docs/reviews/` and do not edit app code.
- Reports list findings as: severity (blocker/major/minor), file:line, problem, suggested fix.
- Commit your own work with clear messages (`git add` only your files).
