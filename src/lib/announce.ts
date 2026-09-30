// Single polite live region (UX-SPEC §9). Render <LiveRegion /> once in App;
// call announce() from anywhere. Throttled to one message per 500ms: the latest
// message wins.
export const LIVE_REGION_ID = "app-live-region"
const THROTTLE_MS = 500

let lastAt = 0
let pending: string | null = null
let timer: ReturnType<typeof setTimeout> | null = null

function write(message: string) {
  const el = document.getElementById(LIVE_REGION_ID)
  if (!el) return
  // Clear first so repeating the same text is re-announced.
  el.textContent = ""
  requestAnimationFrame(() => {
    el.textContent = message
  })
  lastAt = Date.now()
}

export function announce(message: string) {
  const wait = THROTTLE_MS - (Date.now() - lastAt)
  if (wait <= 0 && !timer) {
    write(message)
    return
  }
  pending = message
  if (!timer) {
    timer = setTimeout(() => {
      timer = null
      if (pending !== null) write(pending)
      pending = null
    }, Math.max(wait, 0))
  }
}
