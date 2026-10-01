// Phone bottom-sheet geometry (UX-SPEC §1.3, CR-05). The CSS classes and the
// numbers used for GraphView's insetBottom must agree, so both live here.

/** Peek height as a fraction of the viewport height. */
export const PEEK_FRACTION = 0.35
/** Expanded height as a fraction of the viewport height… */
export const EXPANDED_FRACTION = 0.85
/** …but never closer to the top than this (keeps the phone toolbar row uncovered). */
export const TOOLBAR_CLEARANCE_PX = 72

export const PEEK_CLASS = "h-[35dvh]"
export const EXPANDED_CLASS = "h-[min(85dvh,calc(100dvh-4.5rem))]"

/** Height in CSS px that the sheet covers at the bottom of a viewport of `vh` px. */
export function sheetHeight(expanded: boolean, vh: number): number {
  if (!(vh > 0)) return 0
  if (!expanded) return Math.round(vh * PEEK_FRACTION)
  return Math.round(Math.max(0, Math.min(vh * EXPANDED_FRACTION, vh - TOOLBAR_CLEARANCE_PX)))
}
