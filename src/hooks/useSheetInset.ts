import { useSyncExternalStore } from "react"
import { sheetHeight } from "@/components/panel/sheet"

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange)
  return () => window.removeEventListener("resize", onChange)
}

const getViewportHeight = () => (typeof window === "undefined" ? 0 : window.innerHeight)

/**
 * The graph area covered by the phone bottom sheet, in CSS px (UX-04). Follows the
 * snap state and window resizes, not individual drag frames. 0 on desktop/tablet.
 */
export function useSheetInset(isDesktop: boolean, sheetExpanded: boolean): number {
  const vh = useSyncExternalStore(subscribe, getViewportHeight, () => 0)
  return isDesktop ? 0 : sheetHeight(sheetExpanded, vh)
}
