import { LIVE_REGION_ID } from "@/lib/announce"

/** The app's single polite live region (UX-SPEC §9.2). Write to it via announce(). */
export function LiveRegion() {
  return <div id={LIVE_REGION_ID} aria-live="polite" aria-atomic="true" className="sr-only" />
}
