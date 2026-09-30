import type { KeyboardEvent, ReactNode } from "react"
import { Keyboard, Moon, RotateCcw, Sun, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { Theme } from "@/lib/palette"

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
  onClick,
  disabled,
  children,
}: {
  label: string
  tooltip: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 pointer-coarse:size-11"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{tooltip}</TooltipContent>
    </Tooltip>
  )
}

/** Up/Down (and Home/End) move focus between toolbar buttons; every button stays tabbable. */
function onToolbarKeyDown(e: KeyboardEvent<HTMLDivElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"]
  if (!keys.includes(e.key)) return
  const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"))
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (i < 0 || buttons.length === 0) return
  e.preventDefault()
  const next =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? buttons.length - 1
        : (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
  buttons[next].focus()
}

export function GraphToolbar(props: GraphToolbarProps) {
  const themeLabel = props.theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
  return (
    <TooltipProvider>
      <div
        role="toolbar"
        aria-label="Graph controls"
        aria-orientation="vertical"
        onKeyDown={onToolbarKeyDown}
        className="absolute top-3 right-3 flex flex-col gap-1 rounded-lg border bg-background/90 p-1 shadow-sm"
      >
        <ToolButton label="Zoom in" tooltip="Zoom in (+)" onClick={props.onZoomIn} disabled={!props.canZoomIn}>
          <ZoomIn aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Zoom out" tooltip="Zoom out (−)" onClick={props.onZoomOut} disabled={!props.canZoomOut}>
          <ZoomOut aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Reset view" tooltip="Reset view (0)" onClick={props.onReset}>
          <RotateCcw aria-hidden="true" />
        </ToolButton>
        <Separator className="my-0.5" />
        <ToolButton label={themeLabel} tooltip={themeLabel} onClick={props.onToggleTheme}>
          {props.theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </ToolButton>
        <ToolButton label="Keyboard shortcuts" tooltip="Keyboard shortcuts (?)" onClick={props.onShowShortcuts}>
          <Keyboard aria-hidden="true" />
        </ToolButton>
      </div>
    </TooltipProvider>
  )
}
