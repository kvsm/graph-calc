import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { PanelLeftCloseIcon, PlusIcon } from "lucide-react"
import { announce } from "@/lib/announce"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { AppActions, AppStore } from "@/hooks/useAppStore"
import type { ParameterAnimation } from "@/hooks/useParameterAnimation"
import { resolveParameter } from "@/state/derive"
import { ExpressionRow, type RowNavigation } from "./ExpressionRow"

export const FOOTER_TIP = "Tip: use a letter like a to make a slider."

export interface ExpressionPanelProps {
  store: Pick<AppStore, "state" | "statuses" | "owners" | "params">
  actions: AppActions
  animation: ParameterAnimation
  isDesktop: boolean
  /** Collapse the desktop panel ("Hide expressions panel"). */
  onCollapse: () => void
  collapseButtonRef?: React.Ref<HTMLButtonElement>
}

type FocusRequest = { id: string } | null

export function ExpressionPanel({
  store,
  actions,
  animation,
  isDesktop,
  onCollapse,
  collapseButtonRef,
}: ExpressionPanelProps) {
  const { state, statuses, owners, params } = store
  const { expressions } = state
  const inputs = useRef(new Map<string, HTMLInputElement>())
  const pendingFocus = useRef<FocusRequest>(null)

  const focusInput = useCallback((id: string) => {
    const el = inputs.current.get(id)
    if (!el) return false
    el.focus()
    const end = el.value.length
    el.setSelectionRange(end, end)
    return true
  }, [])

  // Apply focus requests after the render that created/removed rows.
  useEffect(() => {
    const req = pendingFocus.current
    if (req && focusInput(req.id)) pendingFocus.current = null
  })

  const requestFocus = (id: string) => {
    if (!focusInput(id)) pendingFocus.current = { id }
  }

  const registerInput = useCallback((id: string, el: HTMLInputElement | null) => {
    if (el) inputs.current.set(id, el)
    else inputs.current.delete(id)
  }, [])

  const trailing = expressions.at(-1)

  const navigate = (index: number, nav: RowNavigation) => {
    const item = expressions[index]
    const prev = expressions[index - 1]
    const next = expressions[index + 1]
    switch (nav) {
      case "up":
        if (prev) requestFocus(prev.id)
        break
      case "down":
        if (next) requestFocus(next.id)
        break
      case "enter": {
        if (item.text.trim() === "" && item === trailing) break
        if (next && next === trailing) requestFocus(next.id)
        else requestFocus(actions.insertAfter(item.id))
        break
      }
      case "backspace-empty": {
        if (expressions.length <= 1) break
        if (item === trailing) {
          if (prev) requestFocus(prev.id)
          break
        }
        const target = prev ?? next
        actions.remove(item.id)
        if (target) requestFocus(target.id)
        break
      }
    }
  }

  const deleteRow = (index: number) => {
    const item = expressions[index]
    const target = expressions[index + 1] ?? expressions[index - 1]
    actions.remove(item.id)
    announce(`Expression ${index + 1} deleted.`)
    // Focus after the re-render, so it runs after the closing menu has restored focus.
    if (target) pendingFocus.current = { id: target.id }
  }

  const addExpression = () => {
    if (!isDesktop) actions.setSheetExpanded(true)
    if (trailing) requestFocus(trailing.id)
  }

  const onInputFocus = (el: HTMLInputElement) => {
    if (isDesktop) return
    if (!state.sheetExpanded) actions.setSheetExpanded(true)
    // Keep the focused input clear of the on-screen keyboard.
    requestAnimationFrame(() => el.scrollIntoView?.({ block: "nearest" }))
  }

  const content = (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
        <span className="text-sm font-semibold">Graph</span>
        <div className="flex items-center gap-1">
          <IconButton label="Add expression" onClick={addExpression}>
            <PlusIcon aria-hidden />
          </IconButton>
          {isDesktop && (
            <IconButton label="Hide expressions panel" onClick={onCollapse} ref={collapseButtonRef}>
              <PanelLeftCloseIcon aria-hidden />
            </IconButton>
          )}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {/* Rows are separated with a border rather than <Separator> so the list stays valid (li-only children). */}
        <ul aria-label="Expression list" className="divide-y">
          {expressions.map((item, i) => (
            <ExpressionRow
                key={item.id}
                item={item}
                index={i + 1}
                status={statuses[item.id] ?? { compiled: null, error: null }}
                isTrailing={item === trailing && item.text === ""}
                theme={state.theme}
                sliders={(owners[item.id] ?? []).map((n) => resolveParameter(state.parameters, n))}
                playing={animation.playing}
                params={params}
                viewport={state.viewport}
                registerInput={registerInput}
                onTextChange={(text) => actions.setText(item.id, text)}
                onNavigate={(nav) => navigate(i, nav)}
                onVisibleChange={(visible) => actions.setVisible(item.id, visible)}
                onColorChange={(c) => actions.setColor(item.id, c)}
                onDelete={() => deleteRow(i)}
                onParameterChange={actions.setParameter}
                onTogglePlay={animation.toggle}
                onInputFocus={onInputFocus}
              />
          ))}
        </ul>
      </ScrollArea>
      <p className="shrink-0 p-3 text-xs text-muted-foreground">{FOOTER_TIP}</p>
    </>
  )

  if (isDesktop) {
    const collapsed = state.panelCollapsed
    return (
      <aside
        aria-label="Expressions"
        inert={collapsed}
        className={cn(
          "relative flex shrink-0 flex-col overflow-hidden bg-background motion-safe:transition-[width] motion-safe:duration-150",
          collapsed ? "w-0" : "w-72 border-r lg:w-96",
        )}
      >
        <div className="flex h-full w-72 flex-col lg:w-96">{content}</div>
      </aside>
    )
  }

  return (
    <BottomSheet expanded={state.sheetExpanded} onExpandedChange={actions.setSheetExpanded}>
      {content}
    </BottomSheet>
  )
}

function IconButton({
  label,
  onClick,
  children,
  ref,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  ref?: React.Ref<HTMLButtonElement>
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 pointer-coarse:size-11"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

const PEEK_VH = 35
const EXPANDED_VH = 85
const DRAG_THRESHOLD_PX = 6

/**
 * Phone bottom sheet (UX-SPEC §1.3): a fixed, non-modal panel with peek and
 * expanded snap states. The handle toggles on tap/Enter/Space and snaps on drag.
 */
function BottomSheet({
  expanded,
  onExpandedChange,
  children,
}: {
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  children: React.ReactNode
}) {
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const sheetRef = useRef<HTMLElement>(null)

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const height = sheetRef.current?.getBoundingClientRect().height ?? 0
    drag.current = { startY: e.clientY, startHeight: height, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d) return
    const dy = d.startY - e.clientY
    if (!d.moved && Math.abs(dy) < DRAG_THRESHOLD_PX) return
    d.moved = true
    const max = (window.innerHeight * EXPANDED_VH) / 100
    setDragHeight(Math.min(max, Math.max(48, d.startHeight + dy)))
  }
  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!d?.moved) return
    suppressClick.current = true
    const midpoint = (window.innerHeight * (PEEK_VH + EXPANDED_VH)) / 200
    onExpandedChange((dragHeight ?? d.startHeight) > midpoint)
    setDragHeight(null)
  }

  return (
    <aside
      ref={sheetRef}
      aria-label="Expressions"
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-xl border-t bg-background pb-[env(safe-area-inset-bottom)] shadow-lg",
        dragHeight === null && "motion-safe:transition-[height] motion-safe:duration-150",
        expanded ? "h-[85dvh]" : "h-[35dvh]",
      )}
      style={dragHeight !== null ? { height: dragHeight } : undefined}
    >
      <button
        type="button"
        aria-label="Resize expressions panel"
        aria-expanded={expanded}
        className="flex h-11 w-full shrink-0 touch-none items-center justify-center rounded-t-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null
          setDragHeight(null)
        }}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          onExpandedChange(!expanded)
        }}
      >
        <span aria-hidden className="h-1.5 w-10 rounded-full bg-muted-foreground/40" />
      </button>
      {children}
    </aside>
  )
}
