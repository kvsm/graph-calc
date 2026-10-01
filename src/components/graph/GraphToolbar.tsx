import type { KeyboardEvent, ReactNode } from "react"
import { Keyboard, Moon, RotateCcw, Sun, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Theme } from "@/lib/palette"
import { useIsPhone } from "./useIsPhone"

export interface GraphToolbarProps {
  canZoomIn: boolean
  canZoomOut: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  theme: Theme
  onToggleTheme: () => void
  onShowShortcuts: () => void
}

function ToolButton({
  label,
  tooltip,
  tooltipSide,
  onClick,
  unavailable,
  children,
}: {
  label: string
  tooltip: string
  tooltipSide: "left" | "bottom"
  onClick: () => void
  /** At a limit: stays focusable (aria-disabled) so focus is never dropped to <body> (CR-07). */
  unavailable?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 pointer-coarse:size-11 max-sm:size-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
          aria-label={label}
          aria-disabled={unavailable || undefined}
          onClick={() => {
            if (!unavailable) onClick()
          }}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

/** Arrow keys (per orientation) and Home/End move focus between buttons; every button stays tabbable. */
function rovingKeyDown(horizontal: boolean) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    const next = horizontal ? "ArrowRight" : "ArrowDown"
    const prev = horizontal ? "ArrowLeft" : "ArrowUp"
    if (![next, prev, "Home", "End"].includes(e.key)) return
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"))
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0 || buttons.length === 0) return
    e.preventDefault()
    const to =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? buttons.length - 1
          : (i + (e.key === next ? 1 : -1) + buttons.length) % buttons.length
    buttons[to].focus()
  }
}

/** Relies on the app-level TooltipProvider (CR-21). */
export function GraphToolbar(props: GraphToolbarProps) {
  const phone = useIsPhone()
  const side = phone ? "bottom" : "left"
  const themeLabel = props.theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
  return (
    <div
      role="toolbar"
      aria-label="Graph controls"
      aria-orientation={phone ? "horizontal" : "vertical"}
      onKeyDown={rovingKeyDown(phone)}
      className="absolute top-3 right-3 flex flex-col gap-1 rounded-lg border bg-background/90 p-1 shadow-sm max-sm:flex-row max-sm:bg-background"
    >
      <ToolButton label="Zoom in" tooltip="Zoom in (+)" tooltipSide={side} onClick={props.onZoomIn} unavailable={!props.canZoomIn}>
        <ZoomIn aria-hidden="true" />
      </ToolButton>
      <ToolButton label="Zoom out" tooltip="Zoom out (−)" tooltipSide={side} onClick={props.onZoomOut} unavailable={!props.canZoomOut}>
        <ZoomOut aria-hidden="true" />
      </ToolButton>
      <ToolButton label="Reset view" tooltip="Reset view (0)" tooltipSide={side} onClick={props.onReset}>
        <RotateCcw aria-hidden="true" />
      </ToolButton>
      <Separator orientation={phone ? "vertical" : "horizontal"} className={phone ? "mx-0.5" : "my-0.5"} />
      <ToolButton label={themeLabel} tooltip={themeLabel} tooltipSide={side} onClick={props.onToggleTheme}>
        {props.theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      </ToolButton>
      <ToolButton label="Keyboard shortcuts" tooltip="Keyboard shortcuts (?)" tooltipSide={side} onClick={props.onShowShortcuts}>
        <Keyboard aria-hidden="true" />
      </ToolButton>
    </div>
  )
}
