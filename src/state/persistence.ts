// localStorage persistence (UX-SPEC §6, §13.37). Every access is wrapped in
// try/catch; anything invalid falls back to first-run defaults silently.
import { PALETTE } from "@/lib/palette"
import { MAX_SPAN, MIN_SPAN, isValidViewport, spanX } from "@/lib/viewport"
import { ensureTrailingRow, firstRunState, type AppState } from "./model"
import type { ExpressionItem, Parameter, Theme } from "./types"

export const STORAGE_KEY = "graphing-calculator:v1"

interface StoredState {
  version: 1
  expressions: ExpressionItem[]
  parameters: Record<string, Parameter>
  viewport: AppState["viewport"]
  /** Only stored once the user picks a theme explicitly. */
  theme: Theme | null
  panelCollapsed: boolean
  sheetExpanded: boolean
  nextColorIndex: number
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

/** Ids end up in DOM ids and aria-describedby, so keep them to safe characters (CR-18). */
const ID_PATTERN = /^[\w-]{1,64}$/
/** Parameters are single letters (UX-SPEC §4); this also rules out "__proto__" etc. */
const PARAM_NAME_PATTERN = /^[A-Za-zͰ-Ͽ]$/

function validViewport(v: unknown): AppState["viewport"] {
  if (!isValidViewport(v)) return null
  const span = spanX(v)
  return span >= MIN_SPAN && span <= MAX_SPAN ? v : null
}

function validItem(v: unknown): ExpressionItem | null {
  if (!isObject(v)) return null
  const { id, text, colorIndex, visible } = v
  if (typeof id !== "string" || !ID_PATTERN.test(id) || typeof text !== "string" || typeof visible !== "boolean") {
    return null
  }
  if (!Number.isInteger(colorIndex) || (colorIndex as number) < 0) return null
  return { id, text, colorIndex: (colorIndex as number) % PALETTE.length, visible }
}

function validParameter(name: string, v: unknown): Parameter | null {
  if (!isObject(v)) return null
  const { value, min, max, step } = v
  if (![value, min, max, step].every(isFiniteNumber)) return null
  const p = { name, value, min, max, step } as Parameter
  if (!(p.min < p.max) || !(p.step > 0)) return null
  return { ...p, value: Math.min(p.max, Math.max(p.min, p.value)) }
}

/** Parse a stored JSON string into state. Returns null if it's unusable. */
export function deserialize(raw: string | null, systemTheme: Theme): AppState | null {
  if (!raw) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObject(data) || data.version !== 1 || !Array.isArray(data.expressions)) return null

  const seen = new Set<string>()
  const expressions: ExpressionItem[] = []
  for (const raw of data.expressions) {
    const item = validItem(raw)
    if (item && !seen.has(item.id)) {
      seen.add(item.id)
      expressions.push(item)
    }
  }
  if (expressions.length === 0 && data.expressions.length > 0) return null

  const parameters: Record<string, Parameter> = {}
  if (isObject(data.parameters)) {
    for (const [name, v] of Object.entries(data.parameters)) {
      if (!PARAM_NAME_PATTERN.test(name)) continue
      const p = validParameter(name, v)
      if (p) parameters[name] = p
    }
  }

  const storedTheme = data.theme === "light" || data.theme === "dark" ? data.theme : null
  const nextColorIndex =
    Number.isInteger(data.nextColorIndex) && (data.nextColorIndex as number) >= 0
      ? (data.nextColorIndex as number)
      : expressions.length

  return ensureTrailingRow({
    expressions,
    parameters,
    viewport: validViewport(data.viewport),
    theme: storedTheme ?? systemTheme,
    themeExplicit: storedTheme !== null,
    panelCollapsed: data.panelCollapsed === true,
    sheetExpanded: data.sheetExpanded === true,
    nextColorIndex,
  })
}

export function serialize(state: AppState): string {
  const stored: StoredState = {
    version: 1,
    expressions: state.expressions,
    parameters: state.parameters,
    viewport: state.viewport,
    theme: state.themeExplicit ? state.theme : null,
    panelCollapsed: state.panelCollapsed,
    sheetExpanded: state.sheetExpanded,
    nextColorIndex: state.nextColorIndex,
  }
  return JSON.stringify(stored)
}

export function loadState(systemTheme: Theme): AppState {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // Storage blocked (private mode, sandboxed iframe…): first run.
  }
  return deserialize(raw, systemTheme) ?? firstRunState(systemTheme)
}

export function saveState(state: AppState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, serialize(state))
  } catch {
    // Quota exceeded or storage blocked: ignore.
  }
}
