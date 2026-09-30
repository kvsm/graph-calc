// Shared contract between the expression panel (frontend-dev) and the graph
// (frontend-dev-2). See docs/PHASE2-CONTRACT.md. Change only by agreement.
import type { CompiledExpression, ExpressionError } from "@/lib/math"
import type { Theme } from "@/lib/palette"
import type { Viewport } from "@/lib/viewport"

export type { Theme, Viewport }

/** One row in the expression list, as persisted. */
export interface ExpressionItem {
  id: string
  text: string
  colorIndex: number
  visible: boolean
}

/** Slider state for one free parameter (shared across expressions by name). */
export interface Parameter {
  name: string
  value: number
  min: number
  max: number
  step: number
}

/** Derived, per-row parse state (not persisted). */
export interface ExpressionStatus {
  /** Last successfully compiled expression, kept while the text is invalid (UX-SPEC §3). */
  compiled: CompiledExpression | null
  /** Current error, or null. `empty` inputs have no error. */
  error: ExpressionError | null
}

/** What the graph draws. Only rows with a compiled expression appear. */
export interface PlotItem {
  id: string
  /** Expression text, used in trace tooltip / aria labels. */
  label: string
  colorIndex: number
  visible: boolean
  expression: CompiledExpression
}

export interface GraphViewProps {
  plots: PlotItem[]
  /** Current parameter values by name. */
  params: Record<string, number>
  /** null means "use defaultViewport(size)" — also what Reset sets. */
  viewport: Viewport | null
  onViewportChange: (viewport: Viewport | null) => void
  theme: Theme
  onToggleTheme: () => void
  /**
   * CSS px of the graph covered by an overlay at the bottom (the phone sheet).
   * Default view, reset, zoom buttons and trace keep content within the
   * uncovered area. 0 or undefined when nothing covers the graph.
   */
  insetBottom?: number
}
