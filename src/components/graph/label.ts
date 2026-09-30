/** Text for the canvas label, tooltip and live-region announcements (UX-SPEC §5.3, §9). */
import { formatNumber, type Viewport } from "@/lib/viewport"
import type { PanDirection } from "./keyboard"

/** Tooltip expression text limit, including the ellipsis. */
export const TOOLTIP_TEXT_MAX = 24
/** Expressions listed in the canvas label before "and N more". */
export const LABEL_MAX_LISTED = 10

export function truncate(text: string, max = TOOLTIP_TEXT_MAX): string {
  const chars = Array.from(text)
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : text
}

export function xRangeText(vp: Viewport): string {
  return `x from ${formatNumber(vp.xMin)} to ${formatNumber(vp.xMax)}`
}

export function rangeText(vp: Viewport): string {
  return `${xRangeText(vp)}, y from ${formatNumber(vp.yMin)} to ${formatNumber(vp.yMax)}`
}

/**
 * e.g. "Graph of 2 expressions: y = sin(x), y = x^2. x from -10 to 10, y from -6.2 to 6.2."
 * `labels` are the visible expressions' texts.
 */
export function graphAriaLabel(labels: readonly string[], vp: Viewport): string {
  const range = `${rangeText(vp)}.`
  if (labels.length === 0) return `Graph with no expressions. ${range}`
  const listed = labels.slice(0, LABEL_MAX_LISTED).map((l) => l.trim())
  const more = labels.length - listed.length
  const list = listed.join(", ") + (more > 0 ? `, and ${more} more` : "")
  const noun = labels.length === 1 ? "expression" : "expressions"
  return `Graph of ${labels.length} ${noun}: ${list}. ${range}`
}

/** "y = sin(x): x 1.571, y 1." — prefixed with "Curve 2 of 3. " when switching curves. */
export function traceAnnouncement(
  label: string,
  x: number,
  y: number,
  curve?: { index: number; count: number },
): string {
  const prefix = curve ? `Curve ${curve.index + 1} of ${curve.count}. ` : ""
  return `${prefix}${label.trim()}: x ${formatNumber(x)}, y ${formatNumber(y)}.`
}

export type ViewChange = "zoomIn" | "zoomOut" | "reset" | PanDirection

/** "Zoomed in. x from -5 to 5." / "View reset." / "Moved left. x from …, y from …." */
export function viewAnnouncement(change: ViewChange, vp: Viewport): string {
  switch (change) {
    case "reset":
      return "View reset."
    case "zoomIn":
      return `Zoomed in. ${xRangeText(vp)}.`
    case "zoomOut":
      return `Zoomed out. ${xRangeText(vp)}.`
    default:
      return `Moved ${change}. ${rangeText(vp)}.`
  }
}
