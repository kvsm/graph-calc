import { niceStep } from "@/lib/viewport"
import type { Viewport } from "@/state/types"

export const TABLE_ROWS = 21

/** Defaults from UX-SPEC §7: start = round(view xMin), step = nice step giving 21 rows. */
export function tableDefaults(viewport: Viewport | null): { start: number; step: number } {
  const xMin = viewport?.xMin ?? -10
  const xMax = viewport?.xMax ?? 10
  return { start: Math.round(xMin), step: niceStep((xMax - xMin) / (TABLE_ROWS - 1)).step }
}

/** x values without float noise (start + i·step). */
export function tableXs(start: number, step: number, rows = TABLE_ROWS): number[] {
  return Array.from({ length: rows }, (_, i) => Number((start + i * step).toPrecision(12)))
}
