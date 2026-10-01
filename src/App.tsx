import { useMemo, useRef } from "react"
import { PanelLeftOpenIcon } from "lucide-react"
import { GraphView } from "@/components/graph/GraphView"
import { LiveRegion } from "@/components/LiveRegion"
import { ExpressionPanel } from "@/components/panel/ExpressionPanel"
import { HintTooltip } from "@/components/panel/HintTooltip"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useAppStore } from "@/hooks/useAppStore"
import { useIsDesktop, useReducedMotion } from "@/hooks/useMediaQuery"
import { useParameterAnimation } from "@/hooks/useParameterAnimation"
import { useSheetInset } from "@/hooks/useSheetInset"

export default function App() {
  const store = useAppStore()
  const { state, actions, plots, params, owners } = store
  const isDesktop = useIsDesktop()
  const reducedMotion = useReducedMotion()
  const ownedNames = useMemo(() => Object.values(owners).flat(), [owners])
  const animation = useParameterAnimation(state.parameters, ownedNames, actions.setParameterValue, reducedMotion)
  const insetBottom = useSheetInset(isDesktop, state.sheetExpanded)
  const showButtonRef = useRef<HTMLButtonElement>(null)
  const hideButtonRef = useRef<HTMLButtonElement>(null)

  const collapsed = isDesktop && state.panelCollapsed

  const setCollapsed = (value: boolean) => {
    actions.setPanelCollapsed(value)
    // Move focus to the control that replaces the one just activated.
    requestAnimationFrame(() => (value ? showButtonRef : hideButtonRef).current?.focus())
  }

  return (
    <TooltipProvider>
      <div className="flex h-dvh w-full flex-row overflow-hidden bg-background text-foreground">
        <ExpressionPanel
          store={store}
          actions={actions}
          animation={animation}
          isDesktop={isDesktop}
          onCollapse={() => setCollapsed(true)}
          collapseButtonRef={hideButtonRef}
        />
        <main aria-label="Graph" className="relative min-w-0 flex-1">
          {/* Inside a landmark (CR-13). */}
          <h1 className="sr-only">Graphing calculator</h1>
          {/* Before the graph so it comes first in the tab order when collapsed (CR-08). */}
          {collapsed && (
            <HintTooltip label="Show expressions panel" side="right">
              <Button
                ref={showButtonRef}
                type="button"
                variant="outline"
                size="icon"
                className="absolute top-3 left-3 z-10 size-9 bg-background/90 shadow-sm pointer-coarse:size-11"
                aria-label="Show expressions panel"
                onClick={() => setCollapsed(false)}
              >
                <PanelLeftOpenIcon aria-hidden />
              </Button>
            </HintTooltip>
          )}
          {/* GraphView renders the empty-state hint itself when plots is empty (contract). */}
          <GraphView
            plots={plots}
            params={params}
            viewport={state.viewport}
            onViewportChange={actions.setViewport}
            theme={state.theme}
            onToggleTheme={actions.toggleTheme}
            insetBottom={insetBottom}
          />
        </main>
      </div>
      <LiveRegion />
    </TooltipProvider>
  )
}
