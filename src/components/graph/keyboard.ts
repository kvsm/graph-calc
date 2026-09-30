/** Map key presses on the focused graph to actions (UX-SPEC §5.2). */

export type PanDirection = "left" | "right" | "up" | "down"

export type GraphKeyAction =
  | { type: "pan"; fx: number; fy: number; direction: PanDirection }
  | { type: "zoom"; factor: number }
  | { type: "reset" }
  | { type: "toggleTrace" }
  | { type: "exitTrace" }
  | { type: "traceStep"; pixels: number }
  | { type: "traceCurve"; dir: 1 | -1 }
  | { type: "help" }

export interface KeyInput {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

/** Returns null for keys the graph does not handle, so the browser keeps them (e.g. Tab, Ctrl+plus). */
export function graphKeyAction(e: KeyInput, tracing: boolean): GraphKeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  const shift = !!e.shiftKey
  if (tracing) {
    switch (e.key) {
      case "ArrowLeft":
        return { type: "traceStep", pixels: shift ? -10 : -1 }
      case "ArrowRight":
        return { type: "traceStep", pixels: shift ? 10 : 1 }
      case "ArrowUp":
      case "]":
        return { type: "traceCurve", dir: 1 }
      case "ArrowDown":
      case "[":
        return { type: "traceCurve", dir: -1 }
      case "Escape":
        return { type: "exitTrace" }
    }
  } else {
    const f = shift ? 0.5 : 0.1
    switch (e.key) {
      case "ArrowLeft":
        return { type: "pan", fx: -f, fy: 0, direction: "left" }
      case "ArrowRight":
        return { type: "pan", fx: f, fy: 0, direction: "right" }
      case "ArrowUp":
        return { type: "pan", fx: 0, fy: f, direction: "up" }
      case "ArrowDown":
        return { type: "pan", fx: 0, fy: -f, direction: "down" }
    }
  }
  switch (e.key) {
    case "+":
    case "=":
      return { type: "zoom", factor: 2 }
    case "-":
    case "_":
      return { type: "zoom", factor: 0.5 }
    case "0":
      return { type: "reset" }
    case "t":
    case "T":
      return { type: "toggleTrace" }
    case "?":
      return { type: "help" }
  }
  return null
}

/** Rows for the keyboard shortcuts dialog. */
export const SHORTCUTS: readonly { keys: string; action: string }[] = [
  { keys: "← → ↑ ↓", action: "Pan 10% of the view (Shift: 50%)" },
  { keys: "+ or =", action: "Zoom in" },
  { keys: "− or _", action: "Zoom out" },
  { keys: "0", action: "Reset view" },
  { keys: "T", action: "Start or stop tracing" },
  { keys: "] or ↑", action: "While tracing: next curve" },
  { keys: "[ or ↓", action: "While tracing: previous curve" },
  { keys: "← →", action: "While tracing: move along the curve (Shift: 10 px)" },
  { keys: "Escape", action: "Stop tracing" },
  { keys: "Tab", action: "Leave the graph" },
  { keys: "?", action: "Show keyboard shortcuts" },
]
