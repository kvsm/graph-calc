// Pure derivations from state: parse results, plots, slider ownership.
import { parseExpression, type CompiledExpression, type ExpressionError, type ParseResult } from "@/lib/math"
import { defaultParameter } from "./model"
import type { ExpressionItem, ExpressionStatus, Parameter, PlotItem } from "./types"

const CACHE_LIMIT = 500
const cache = new Map<string, ParseResult>()

/** parseExpression with a small memo, so identical text yields the identical result object. */
export function parseCached(text: string): ParseResult {
  const hit = cache.get(text)
  if (hit) return hit
  const result = parseExpression(text)
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  cache.set(text, result)
  return result
}

/** The error to show for `text` right now (null for empty or valid text). */
export function currentError(text: string): ExpressionError | null {
  const result = parseCached(text)
  if (result.ok || result.error.code === "empty") return null
  return result.error
}

export type CompiledMap = Readonly<Record<string, CompiledExpression | null>>

/**
 * Next compiled map: valid text replaces the previous compile, invalid text keeps
 * the last valid one (UX-SPEC §3), empty text clears it. Returns `prev` itself when
 * nothing changed so downstream memoisation holds.
 */
export function nextCompiled(prev: CompiledMap, items: readonly ExpressionItem[]): CompiledMap {
  const next: Record<string, CompiledExpression | null> = {}
  let changed = Object.keys(prev).length !== items.length
  for (const item of items) {
    let value: CompiledExpression | null
    if (item.text.trim() === "") value = null
    else {
      const result = parseCached(item.text)
      value = result.ok ? result.expression : (prev[item.id] ?? null)
    }
    next[item.id] = value
    if (prev[item.id] !== value) changed = true
  }
  return changed ? next : prev
}

export function deriveStatuses(
  items: readonly ExpressionItem[],
  compiled: CompiledMap,
): Record<string, ExpressionStatus> {
  const out: Record<string, ExpressionStatus> = {}
  for (const item of items) {
    out[item.id] = { compiled: compiled[item.id] ?? null, error: currentError(item.text) }
  }
  return out
}

export function derivePlots(items: readonly ExpressionItem[], compiled: CompiledMap): PlotItem[] {
  const plots: PlotItem[] = []
  for (const item of items) {
    const expression = compiled[item.id]
    if (!expression) continue
    plots.push({
      id: item.id,
      label: expression.source.trim(),
      colorIndex: item.colorIndex,
      visible: item.visible,
      expression,
    })
  }
  return plots
}

/**
 * Which expression shows the slider for each parameter: the first (in list order)
 * whose compiled expression uses it (UX-SPEC §4). Returns row id -> sorted names.
 */
export function sliderOwners(
  items: readonly ExpressionItem[],
  compiled: CompiledMap,
): Record<string, string[]> {
  const owned = new Set<string>()
  const out: Record<string, string[]> = {}
  for (const item of items) {
    const names = (compiled[item.id]?.parameters ?? []).filter((n) => !owned.has(n))
    names.forEach((n) => owned.add(n))
    if (names.length > 0) out[item.id] = names
  }
  return out
}

/** Effective parameter (stored settings or defaults). */
export function resolveParameter(parameters: Readonly<Record<string, Parameter>>, name: string): Parameter {
  return parameters[name] ?? defaultParameter(name)
}

/** Values for every parameter used by any compiled expression. */
export function paramValues(
  owners: Readonly<Record<string, string[]>>,
  parameters: Readonly<Record<string, Parameter>>,
): Record<string, number> {
  const values: Record<string, number> = {}
  for (const names of Object.values(owners)) {
    for (const name of names) values[name] = resolveParameter(parameters, name).value
  }
  return values
}
