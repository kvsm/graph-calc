import { useCallback, useSyncExternalStore } from "react"

function getMatch(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : false
}

/** Subscribe to a CSS media query. Returns false where matchMedia is unavailable. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => getMatch(query), () => false)
}

/** `sm` breakpoint and up (UX-SPEC §1): side panel instead of bottom sheet. */
export const DESKTOP_QUERY = "(min-width: 640px)"
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"
export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)"

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY)
}

/** True when the user prefers reduced motion (UX-SPEC §9.6). */
export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY)
}

export function systemPrefersDark(): boolean {
  return getMatch(DARK_SCHEME_QUERY)
}
