import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react"
import { PanelLeftCloseIcon, PlusIcon } from "lucide-react"
import { announce } from "@/lib/announce"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { AppActions, AppStore } from "@/hooks/useAppStore"
import type { ParameterAnimation } from "@/hooks/useParameterAnimation"
import type { ExpressionItem } from "@/state/types"
import { ExpressionRow, type RowNavigation } from "./ExpressionRow"
import { HintTooltip } from "./HintTooltip"
import { EXPANDED_CLASS, EXPANDED_FRACTION, PEEK_CLASS, PEEK_FRACTION, TOOLBAR_CLEARANCE_PX } from "./sheet"
import type { TableContext } from "./TableOfValuesDialog"

export const FOOTER_TIP = "Tip: use a letter like a to make a slider."
export const PANEL_TITLE = "Expressions"

const EMPTY_NAMES: readonly string[] = []

export interface ExpressionPanelProps {
  store: Pick<AppStore, "state" | "statuses" | "owners" | "params">
  actions: AppActions
  animation: ParameterAnimation
  isDesktop: boolean
  /** Collapse the desktop panel ("Hide expressions panel"). */
  onCollapse: () => void
  collapseButtonRef?: Ref<HTMLButtonElement>
}

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
  const pendingFocus = useRef<string | null>(null)

  // Latest values for stable callbacks, so memoised rows don't re-render on every change (CR-15).
  const latest = useRef({ expressions, isDesktop, sheetExpanded: state.sheetExpanded })
  const tableContext = useRef<TableContext>({ params, viewport: state.viewport })
  useEffect(() => {
    latest.current = { expressions, isDesktop, sheetExpanded: state.sheetExpanded }
    tableContext.current = { params, viewport: state.viewport }
  })

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
    const id = pendingFocus.current
    if (id && focusInput(id)) pendingFocus.current = null
  })

  const requestFocus = useCallback(
    (id: string) => {
      if (!focusInput(id)) pendingFocus.current = id
    },
    [focusInput],
  )

  const registerInput = useCallback((id: string, el: HTMLInputElement | null) => {
    if (el) inputs.current.set(id, el)
    else inputs.current.delete(id)
  }, [])

  const deleteAt = useCallback(
    (list: readonly ExpressionItem[], index: number, target: ExpressionItem | undefined) => {
      actions.remove(list[index].id)
      announce(`Expression ${index + 1} deleted.`)
      // Focus after the re-render, so it runs after a closing menu has restored focus.
      if (target) pendingFocus.current = target.id
    },
    [actions],
  )

  const onNavigate = useCallback(
    (id: string, nav: RowNavigation) => {
      const list = latest.current.expressions
      const index = list.findIndex((e) => e.id === id)
      if (index === -1) return
      const item = list[index]
      const prev = list[index - 1]
      const next = list[index + 1]
      const trailing = list.at(-1)
      switch (nav) {
        case "up":
          if (prev) requestFocus(prev.id)
          break
        case "down":
          if (next) requestFocus(next.id)
          break
        case "enter":
          if (item.text.trim() === "" && item === trailing) break
          if (next && next === trailing) requestFocus(next.id)
          else requestFocus(actions.insertAfter(item.id))
          break
        case "backspace-empty":
          if (list.length <= 1) break
          if (item === trailing) {
            if (prev) requestFocus(prev.id)
            break
          }
          deleteAt(list, index, prev ?? next) // announced (CR-09)
          break
      }
    },
    [actions, deleteAt, requestFocus],
  )

  const onDelete = useCallback(
    (id: string) => {
      const list = latest.current.expressions
      const index = list.findIndex((e) => e.id === id)
      if (index !== -1) deleteAt(list, index, list[index + 1] ?? list[index - 1])
    },
    [deleteAt],
  )

  const onInputFocus = useCallback(
    (el: HTMLInputElement) => {
      const { isDesktop: desktop, sheetExpanded } = latest.current
      if (desktop) return
      if (!sheetExpanded) actions.setSheetExpanded(true)
      // Keep the focused input clear of the on-screen keyboard.
      requestAnimationFrame(() => el.scrollIntoView?.({ block: "nearest" }))
    },
    [actions],
  )

  const getTableContext = useCallback(() => tableContext.current, [])

  const trailing = expressions.at(-1)
  const addExpression = () => {
    if (!isDesktop) actions.setSheetExpanded(true)
    if (trailing) requestFocus(trailing.id)
  }

  const headerContent = (
    <>
      <span className="pointer-events-none relative text-sm font-semibold">{PANEL_TITLE}</span>
      <div className="relative flex items-center gap-1">
        <IconButton label="Add expression" onClick={addExpression}>
          <PlusIcon aria-hidden />
        </IconButton>
        {isDesktop && (
          <IconButton label="Hide expressions panel" onClick={onCollapse} ref={collapseButtonRef}>
            <PanelLeftCloseIcon aria-hidden />
          </IconButton>
        )}
      </div>
    </>
  )

  const list = (
    <>
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
              sliderNames={owners[item.id] ?? EMPTY_NAMES}
              parameters={state.parameters}
              playing={animation.playing}
              actions={actions}
              registerInput={registerInput}
              onNavigate={onNavigate}
              onDelete={onDelete}
              onTogglePlay={animation.toggle}
              onInputFocus={onInputFocus}
              getTableContext={getTableContext}
            />
          ))}
        </ul>
      </ScrollArea>
      {/* The placeholder already teaches on phones; save the space there (UX-03). */}
      <p className="hidden shrink-0 p-3 text-xs text-muted-foreground sm:block">{FOOTER_TIP}</p>
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
        <div className="flex h-full w-72 flex-col lg:w-96">
          <div className="flex h-12 shrink-0 items-center justify-between border-b px-3">{headerContent}</div>
          {list}
        </div>
      </aside>
    )
  }

  return (
    <BottomSheet expanded={state.sheetExpanded} onExpandedChange={actions.setSheetExpanded} header={headerContent}>
      {list}
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
  children: ReactNode
  ref?: Ref<HTMLButtonElement>
}) {
  return (
    <HintTooltip label={label}>
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
    </HintTooltip>
  )
}

const DRAG_THRESHOLD_PX = 6

/**
 * Phone bottom sheet (UX-SPEC §1.3): a fixed, non-modal panel with peek and
 * expanded snap states. The header row doubles as the drag handle (UX-03): a
 * full-size handle button sits behind the title, with the Add button on top.
 */
function BottomSheet({
  expanded,
  onExpandedChange,
  header,
  children,
}: {
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  header: ReactNode
  children: ReactNode
}) {
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const sheetRef = useRef<HTMLElement>(null)

  const maxHeight = () =>
    Math.min(window.innerHeight * EXPANDED_FRACTION, window.innerHeight - TOOLBAR_CLEARANCE_PX)

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
    setDragHeight(Math.min(maxHeight(), Math.max(44, d.startHeight + dy)))
  }
  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!d?.moved) return
    suppressClick.current = true
    const midpoint = (window.innerHeight * PEEK_FRACTION + maxHeight()) / 2
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
        expanded ? EXPANDED_CLASS : PEEK_CLASS,
      )}
      style={dragHeight !== null ? { height: dragHeight } : undefined}
    >
      <div className="relative flex h-11 shrink-0 items-center justify-between border-b px-3">
        <button
          type="button"
          aria-label="Resize expressions panel"
          aria-expanded={expanded}
          className="absolute inset-0 touch-none rounded-t-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset"
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
          <span aria-hidden className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/40" />
        </button>
        {header}
      </div>
      {children}
    </aside>
  )
}
