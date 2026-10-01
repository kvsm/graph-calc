import { Component, type ErrorInfo, type ReactNode } from "react"
import { STORAGE_KEY } from "@/state/persistence"

interface State {
  error: Error | null
}

/** Clear saved state and reload: the recovery action offered after a crash. */
function resetApp() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked: reloading still gives a fresh first-run state.
  }
  window.location.reload()
}

/**
 * Last line of defence (CR-02): if rendering throws, show a friendly recovery
 * screen instead of a blank page. Plain elements only, so it can't fail itself.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; onReset?: () => void }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Graphing calculator crashed", error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main
        aria-labelledby="crash-title"
        className="flex h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground"
      >
        <h1 id="crash-title" className="text-lg font-semibold">
          Something went wrong
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The calculator hit an unexpected error. Resetting clears your saved expressions and starts fresh.
        </p>
        <button
          type="button"
          onClick={this.props.onReset ?? resetApp}
          className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          Reset app
        </button>
      </main>
    )
  }
}
