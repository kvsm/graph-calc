import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import {
  deriveStatuses,
  derivePlots,
  nextCompiled,
  paramValues,
  sliderOwners,
  type CompiledMap,
} from "@/state/derive"
import { createId, reducer, type AppState } from "@/state/model"
import { loadState, saveState } from "@/state/persistence"
import type { Parameter, Theme, Viewport } from "@/state/types"
import { DARK_SCHEME_QUERY, systemPrefersDark } from "./useMediaQuery"

/** Re-parse/re-plot delay after the last keystroke (UX-SPEC §3). */
export const PARSE_DEBOUNCE_MS = 150
const SAVE_DEBOUNCE_MS = 250

export interface AppActions {
  setText: (id: string, text: string) => void
  /** Inserts an empty row after `afterId` and returns its id. */
  insertAfter: (afterId: string) => string
  remove: (id: string) => void
  setVisible: (id: string, visible: boolean) => void
  setColor: (id: string, colorIndex: number) => void
  setParameter: (name: string, patch: Partial<Omit<Parameter, "name">>) => void
  setParameterValue: (name: string, value: number) => void
  setViewport: (viewport: Viewport | null) => void
  toggleTheme: () => void
  setPanelCollapsed: (collapsed: boolean) => void
  setSheetExpanded: (expanded: boolean) => void
}

const systemTheme = (): Theme => (systemPrefersDark() ? "dark" : "light")

export function useAppStore() {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState(systemTheme()))

  // Debounced parse: plots follow the text 150ms after the last change, keeping the
  // last valid compile while the text is invalid. Parse synchronously on first render.
  const [compiled, setCompiled] = useState<CompiledMap>(() => nextCompiled({}, state.expressions))
  useEffect(() => {
    const t = setTimeout(() => setCompiled((prev) => nextCompiled(prev, state.expressions)), PARSE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [state.expressions])

  // Persistence: debounced save, flushed when the page is hidden.
  const latest = useRef<AppState>(state)
  useEffect(() => {
    latest.current = state
    const t = setTimeout(() => saveState(state), SAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [state])
  useEffect(() => {
    const flush = () => saveState(latest.current)
    window.addEventListener("pagehide", flush)
    return () => window.removeEventListener("pagehide", flush)
  }, [])

  // Theme: apply `.dark` on <html>; follow the OS until the user chooses (§8.3).
  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.theme === "dark")
  }, [state.theme])
  useEffect(() => {
    if (state.themeExplicit || typeof window.matchMedia !== "function") return
    const mql = window.matchMedia(DARK_SCHEME_QUERY)
    const onChange = () => dispatch({ type: "setTheme", theme: mql.matches ? "dark" : "light", explicit: false })
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [state.themeExplicit])

  const themeRef = useRef(state.theme)
  useEffect(() => {
    themeRef.current = state.theme
  }, [state.theme])

  const setParameterValue = useCallback(
    (name: string, value: number) => dispatch({ type: "setParameter", name, patch: { value } }),
    [],
  )

  const actions = useMemo<AppActions>(
    () => ({
      setText: (id, text) => dispatch({ type: "setText", id, text }),
      insertAfter: (afterId) => {
        const newId = createId()
        dispatch({ type: "insertAfter", afterId, newId })
        return newId
      },
      remove: (id) => dispatch({ type: "delete", id }),
      setVisible: (id, visible) => dispatch({ type: "setVisible", id, visible }),
      setColor: (id, colorIndex) => dispatch({ type: "setColor", id, colorIndex }),
      setParameter: (name, patch) => dispatch({ type: "setParameter", name, patch }),
      setParameterValue,
      setViewport: (viewport) => dispatch({ type: "setViewport", viewport }),
      toggleTheme: () =>
        dispatch({ type: "setTheme", theme: themeRef.current === "dark" ? "light" : "dark", explicit: true }),
      setPanelCollapsed: (collapsed) => dispatch({ type: "setPanelCollapsed", collapsed }),
      setSheetExpanded: (expanded) => dispatch({ type: "setSheetExpanded", expanded }),
    }),
    [setParameterValue],
  )

  const statuses = useMemo(() => deriveStatuses(state.expressions, compiled), [state.expressions, compiled])
  const plots = useMemo(() => derivePlots(state.expressions, compiled), [state.expressions, compiled])
  const owners = useMemo(() => sliderOwners(state.expressions, compiled), [state.expressions, compiled])
  const params = useMemo(() => paramValues(owners, state.parameters), [owners, state.parameters])

  return { state, actions, statuses, plots, owners, params }
}

export type AppStore = ReturnType<typeof useAppStore>
