# Phase 2 — UI build contract

Two frontend devs build in parallel against the fixed interfaces below.
Source of truth for behaviour: docs/UX-SPEC.md. Team-lead decision: `f(x) = ...` is accepted.

## Shared files (lead-owned; change only by messaging the team lead)
- `src/state/types.ts` — `ExpressionItem`, `Parameter`, `ExpressionStatus`, `PlotItem`, `GraphViewProps`
- `src/lib/palette.ts` — `PALETTE`, `paletteColor(index, theme)`
- `src/lib/announce.ts` — `announce(msg)` + `LIVE_REGION_ID` (throttled polite live region)
- `src/lib/math`, `src/lib/viewport` — Phase 1 cores. Bug fixes allowed by either dev; keep APIs stable.

## frontend-dev — app shell + expression panel
Owns: `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/state/**` (except types.ts),
`src/components/panel/**`, `src/hooks/**`, `src/components/LiveRegion.tsx`.
- Store (`src/state/`): expressions, parameters, viewport (`Viewport | null`), theme,
  panel collapsed/sheet state; derive `ExpressionStatus` per row (re-parse only on text change)
  and `PlotItem[]`; persist to localStorage (try/catch, validate on load with `isValidViewport`).
- Theme: `.dark` on `<html>`, UX-SPEC §8.3; define `--graph-bg`, `--graph-grid`,
  `--graph-grid-major`, `--graph-axis` and focus/error tokens in `index.css` per §8.2.
- `TooltipProvider` around the app. Render `<LiveRegion />` once (element id `LIVE_REGION_ID`,
  `aria-live="polite"`, visually hidden).
- Layout §1.1/§1.3, expression rows §2–§3, sliders §4 (incl. animate), first run §6,
  table of values dialog §7, "Show expressions" floating button when collapsed.
- Render `<GraphView {...GraphViewProps} />` from `@/components/graph/GraphView` inside `<main>`.

## frontend-dev-2 — graph
Owns: `src/components/graph/**` (replace the stub `GraphView.tsx`).
- Canvas 2D, DPR-aware, ResizeObserver; reads graph CSS variables via getComputedStyle on theme change.
- Grid/axes/ticks §5.4 using `@/lib/viewport`; curves via `sampleFunction` with `params`,
  clipped/clamped y; line widths §8.1; redraw via rAF, re-sample only on viewport/params/plots change.
- Interactions §5.1 (drag pan, wheel zoom at cursor, pinch, double-tap, press-and-hold trace),
  keyboard §5.2 on the focusable canvas, trace tooltip §5.3, `role="img"` + generated label §9.
- Toolbar §1.2 (zoom in/out/reset, theme toggle → `onToggleTheme`, keyboard shortcuts dialog).
- All viewport changes go through `onViewportChange`; Reset = `onViewportChange(null)`.
- Announce trace/zoom via `announce()`.

## Both
- Component tests (Vitest + RTL) for what you own. Run `npm run build && npm run lint && npm test` before committing.
- Commit with pathspecs: `git commit -m "..." -- <your paths>`. On `.git/index.lock`, wait and retry.
- Need a new dependency? Message the team lead first (package.json is shared).
