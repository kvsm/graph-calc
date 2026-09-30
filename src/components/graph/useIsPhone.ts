import { useSyncExternalStore } from "react"

/** Below Tailwind's `sm` breakpoint (640px). */
export const PHONE_QUERY = "(max-width: 639.98px)"

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {}
  const mq = window.matchMedia(PHONE_QUERY)
  mq.addEventListener?.("change", onChange)
  return () => mq.removeEventListener?.("change", onChange)
}

const snapshot = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
