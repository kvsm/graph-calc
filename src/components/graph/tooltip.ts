/** Trace tooltip placement (UX-SPEC §5.3): 12px up-right of the point, flipped to stay inside. */
import type { Size, Vec2 } from "@/lib/viewport"

export const TOOLTIP_OFFSET = 12

export function tooltipPosition(
  point: Vec2,
  tip: Size,
  bounds: Size,
  offset = TOOLTIP_OFFSET,
): { left: number; top: number } {
  let left = point.x + offset
  if (left + tip.width > bounds.width) left = point.x - offset - tip.width
  let top = point.y - offset - tip.height
  if (top < 0) top = point.y + offset
  left = Math.max(0, Math.min(left, bounds.width - tip.width))
  top = Math.max(0, Math.min(top, bounds.height - tip.height))
  return { left, top }
}
