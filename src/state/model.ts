// App state model + pure reducer. React-free so it can be unit tested directly.
import { PALETTE } from "@/lib/palette"
import type { ExpressionItem, Parameter, Theme, Viewport } from "./types"

export interface AppState {
  /** Rows in display order. The last row is always an empty "trailing" row (UX-SPEC §2.1). */
  expressions: ExpressionItem[]
  /** Slider settings by parameter name (kept even when unused so re-typing restores them). */
  parameters: Record<string, Parameter>
  viewport: Viewport | null
  theme: Theme
  /** True once the user has toggled the theme; until then we follow the OS (§8.3). */
  themeExplicit: boolean
  panelCollapsed: boolean
  sheetExpanded: boolean
  /** Creation counter used for round-robin colour assignment. */
  nextColorIndex: number
}

export const DEFAULT_PARAMETER: Omit<Parameter, "name"> = { value: 1, min: -10, max: 10, step: 0.1 }

export function defaultParameter(name: string): Parameter {
  return { name, ...DEFAULT_PARAMETER }
}

let idCounter = 0
export function createId(): string {
  idCounter += 1
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `e${Date.now().toString(36)}${idCounter.toString(36)}${rand}`
}

export type Action =
  | { type: "setText"; id: string; text: string }
  | { type: "insertAfter"; afterId: string; newId: string }
  | { type: "delete"; id: string }
  | { type: "setVisible"; id: string; visible: boolean }
  | { type: "setColor"; id: string; colorIndex: number }
  | { type: "setParameter"; name: string; patch: Partial<Omit<Parameter, "name">> }
  | { type: "setViewport"; viewport: Viewport | null }
  | { type: "setTheme"; theme: Theme; explicit: boolean }
  | { type: "setPanelCollapsed"; collapsed: boolean }
  | { type: "setSheetExpanded"; expanded: boolean }

function makeItem(state: AppState, id: string = createId()): [ExpressionItem, number] {
  const colorIndex = state.nextColorIndex % PALETTE.length
  return [{ id, text: "", colorIndex, visible: true }, state.nextColorIndex + 1]
}

/** Guarantee the list ends with exactly one empty row (appending one if needed). */
export function ensureTrailingRow(state: AppState): AppState {
  const last = state.expressions.at(-1)
  if (last && last.text === "") return state
  const [item, nextColorIndex] = makeItem(state)
  return { ...state, expressions: [...state.expressions, item], nextColorIndex }
}

export function firstRunState(theme: Theme): AppState {
  const base: AppState = {
    expressions: [{ id: createId(), text: "y = sin(x)", colorIndex: 0, visible: true }],
    parameters: {},
    viewport: null,
    theme,
    themeExplicit: false,
    panelCollapsed: false,
    sheetExpanded: false,
    nextColorIndex: 1,
  }
  return ensureTrailingRow(base)
}

function updateItem(state: AppState, id: string, patch: Partial<ExpressionItem>): AppState {
  let changed = false
  const expressions = state.expressions.map((item) => {
    if (item.id !== id) return item
    changed = true
    return { ...item, ...patch }
  })
  return changed ? { ...state, expressions } : state
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "setText": {
      const current = state.expressions.find((e) => e.id === action.id)
      if (!current || current.text === action.text) return state
      return ensureTrailingRow(updateItem(state, action.id, { text: action.text }))
    }
    case "insertAfter": {
      const index = state.expressions.findIndex((e) => e.id === action.afterId)
      if (index === -1) return state
      const [item, nextColorIndex] = makeItem(state, action.newId)
      const expressions = [...state.expressions]
      expressions.splice(index + 1, 0, item)
      return { ...state, expressions, nextColorIndex }
    }
    case "delete": {
      if (state.expressions.length <= 1) return state
      const expressions = state.expressions.filter((e) => e.id !== action.id)
      if (expressions.length === state.expressions.length) return state
      return ensureTrailingRow({ ...state, expressions })
    }
    case "setVisible":
      return updateItem(state, action.id, { visible: action.visible })
    case "setColor":
      return updateItem(state, action.id, {
        colorIndex: ((action.colorIndex % PALETTE.length) + PALETTE.length) % PALETTE.length,
      })
    case "setParameter": {
      const prev = state.parameters[action.name] ?? defaultParameter(action.name)
      const next = { ...prev, ...action.patch, name: action.name }
      return { ...state, parameters: { ...state.parameters, [action.name]: next } }
    }
    case "setViewport":
      return state.viewport === action.viewport ? state : { ...state, viewport: action.viewport }
    case "setTheme":
      if (state.theme === action.theme && state.themeExplicit === action.explicit) return state
      return { ...state, theme: action.theme, themeExplicit: action.explicit }
    case "setPanelCollapsed":
      return state.panelCollapsed === action.collapsed ? state : { ...state, panelCollapsed: action.collapsed }
    case "setSheetExpanded":
      return state.sheetExpanded === action.expanded ? state : { ...state, sheetExpanded: action.expanded }
  }
}
