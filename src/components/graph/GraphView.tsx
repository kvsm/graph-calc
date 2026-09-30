// STUB owned by frontend-dev-2 — replace with the real canvas implementation.
import type { GraphViewProps } from "@/state/types"

export function GraphView({ plots }: GraphViewProps) {
  return (
    <div className="relative size-full" role="img" aria-label={`Graph of ${plots.length} expressions`} />
  )
}
