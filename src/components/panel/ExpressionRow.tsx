import { memo, useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { AlertCircleIcon, MoreVerticalIcon, PaletteIcon, TableIcon, Trash2Icon } from "lucide-react"
import { announce } from "@/lib/announce"
import { paletteColor, type Theme } from "@/lib/palette"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Toggle } from "@/components/ui/toggle"
import type { AppActions } from "@/hooks/useAppStore"
import { resolveParameter } from "@/state/derive"
import type { ExpressionItem, ExpressionStatus, Parameter } from "@/state/types"
import { ErrorText, errorToSpeech } from "@/components/ErrorText"
import { ColorPicker } from "./ColorPicker"
import { HintTooltip } from "./HintTooltip"
import { ParameterSlider } from "./ParameterSlider"
import { TableOfValuesDialog, type TableContext } from "./TableOfValuesDialog"

/** Error line appears after this long without typing (UX-SPEC §3). */
export const ERROR_DELAY_MS = 600
export const PLACEHOLDER = "e.g. y = x^2"

export type RowNavigation = "enter" | "backspace-empty" | "up" | "down"

export interface ExpressionRowProps {
  item: ExpressionItem
  /** 1-based position. */
  index: number
  status: ExpressionStatus
  /** The always-present empty last row. */
  isTrailing: boolean
  theme: Theme
  /** Parameters whose slider this row shows (sorted). */
  sliderNames: readonly string[]
  parameters: Readonly<Record<string, Parameter>>
  playing: ReadonlySet<string>
  actions: AppActions
  registerInput: (id: string, el: HTMLInputElement | null) => void
  onNavigate: (id: string, nav: RowNavigation) => void
  onDelete: (id: string) => void
  onTogglePlay: (name: string) => void
  onInputFocus: (el: HTMLInputElement) => void
  getTableContext: () => TableContext
}

function ExpressionRowImpl({
  item,
  index,
  status,
  isTrailing,
  theme,
  sliderNames,
  parameters,
  playing,
  actions,
  registerInput,
  onNavigate,
  onDelete,
  onTogglePlay,
  onInputFocus,
  getTableContext,
}: ExpressionRowProps) {
  const [errorShown, setErrorShown] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const [tableOpen, setTableOpen] = useState(false)
  const swatchRef = useRef<HTMLButtonElement>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  /** Set when a menu item opens a popover/dialog so the menu doesn't steal focus back. */
  const suppressMenuFocus = useRef(false)
  /** The last error message announced for this row: announce each error once (CR-10). */
  const lastAnnounced = useRef<string | null>(null)
  const colorHeadingId = useId()

  // Show the error only after typing pauses (or immediately on blur / Enter).
  useEffect(() => {
    const t = setTimeout(() => setErrorShown(true), ERROR_DELAY_MS)
    return () => clearTimeout(t)
  }, [item.text])

  const error = status.error
  const showError = errorShown && error !== null
  const errorId = `expr-${item.id}-error`
  const color = paletteColor(item.colorIndex, theme)
  const canTable = status.compiled !== null && error === null && item.text.trim() !== ""

  const revealError = () => {
    setErrorShown(true)
    if (error && lastAnnounced.current !== error.message) {
      lastAnnounced.current = error.message
      announce(`Expression ${index}: ${errorToSpeech(error)}`)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "Enter":
        e.preventDefault()
        revealError()
        onNavigate(item.id, "enter")
        break
      case "Backspace":
        if (e.currentTarget.value === "") {
          e.preventDefault()
          onNavigate(item.id, "backspace-empty")
        }
        break
      case "ArrowUp":
        e.preventDefault()
        onNavigate(item.id, "up")
        break
      case "ArrowDown":
        e.preventDefault()
        onNavigate(item.id, "down")
        break
      case "Escape":
        e.preventDefault()
        swatchRef.current?.focus()
        break
    }
  }

  const swatch = (
    <Toggle
      ref={swatchRef}
      pressed={item.visible}
      onPressedChange={(visible) => actions.setVisible(item.id, visible)}
      disabled={isTrailing}
      aria-label={`Show expression ${index}`}
      className={cn(
        "size-9 min-w-0 rounded-full p-0 aria-pressed:bg-transparent data-[state=on]:bg-transparent pointer-coarse:size-11",
        // Solid ring: the 50%-alpha default is only ~2:1 (CR-06).
        "focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-100",
      )}
    >
      <Swatch color={color} visible={item.visible} placeholder={isTrailing} />
    </Toggle>
  )

  return (
    <li className="flex items-start gap-2 px-2 py-2 hover:bg-muted/50 focus-within:bg-muted/50">
      <Popover open={colorOpen} onOpenChange={setColorOpen}>
        <PopoverAnchor asChild>
          <div className="shrink-0">
            {isTrailing ? swatch : <HintTooltip label={item.visible ? "Hide" : "Show"}>{swatch}</HintTooltip>}
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-auto"
          aria-labelledby={colorHeadingId}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            const checked = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[aria-checked="true"]')
            checked?.focus()
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            menuTriggerRef.current?.focus()
          }}
        >
          <h2 id={colorHeadingId} className="text-sm font-medium">
            Curve colour
          </h2>
          <ColorPicker
            value={item.colorIndex}
            theme={theme}
            index={index}
            onSelect={(i) => {
              actions.setColor(item.id, i)
              setColorOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>

      <span
        aria-hidden
        className="-ml-1 flex h-9 w-4 shrink-0 items-center justify-end text-xs text-muted-foreground tabular-nums max-sm:hidden pointer-coarse:h-11"
      >
        {index}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <Input
            ref={(el) => registerInput(item.id, el)}
            value={item.text}
            onChange={(e) => {
              setErrorShown(false)
              lastAnnounced.current = null
              actions.setText(item.id, e.target.value)
            }}
            onKeyDown={onKeyDown}
            onBlur={revealError}
            onFocus={(e) => onInputFocus(e.currentTarget)}
            aria-label={`Expression ${index}`}
            aria-invalid={showError || undefined}
            aria-describedby={showError ? errorId : undefined}
            placeholder={isTrailing ? PLACEHOLDER : undefined}
            className={cn("h-9 font-mono text-sm pointer-coarse:h-11", !item.visible && "text-muted-foreground")}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            inputMode="text"
          />
          {/* Non-modal so the rest of the page isn't aria-hidden while focus is in the menu (CR-14). */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                ref={menuTriggerRef}
                type="button"
                variant="ghost"
                size="icon"
                className={cn("size-9 shrink-0 pointer-coarse:size-11", isTrailing && "invisible")}
                aria-label={`More options for expression ${index}`}
              >
                <MoreVerticalIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-48"
              onCloseAutoFocus={(e) => {
                if (suppressMenuFocus.current) {
                  suppressMenuFocus.current = false
                  e.preventDefault()
                }
              }}
            >
              <DropdownMenuItem
                className="whitespace-nowrap"
                onSelect={() => {
                  suppressMenuFocus.current = true
                  // Open after the menu has closed so the two layers don't fight over focus.
                  setTimeout(() => setColorOpen(true), 0)
                }}
              >
                <PaletteIcon aria-hidden />
                Colour…
              </DropdownMenuItem>
              <DropdownMenuItem
                className="whitespace-nowrap"
                disabled={!canTable}
                onSelect={() => {
                  suppressMenuFocus.current = true
                  setTimeout(() => setTableOpen(true), 0)
                }}
              >
                <TableIcon aria-hidden />
                Table of values
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="whitespace-nowrap"
                variant="destructive"
                disabled={isTrailing}
                onSelect={() => {
                  suppressMenuFocus.current = true
                  onDelete(item.id)
                }}
              >
                <Trash2Icon aria-hidden />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {showError && (
          <p id={errorId} className="flex gap-1 pt-1 text-xs text-destructive">
            <AlertCircleIcon aria-hidden className="mt-px size-3.5 shrink-0" />
            <ErrorText error={error} />
          </p>
        )}

        {sliderNames.map((name) => (
          <ParameterSlider
            key={name}
            parameter={resolveParameter(parameters, name)}
            playing={playing.has(name)}
            color={color}
            onChange={(patch) => actions.setParameter(name, patch)}
            onTogglePlay={() => onTogglePlay(name)}
          />
        ))}
      </div>

      {status.compiled && (
        <TableOfValuesDialog
          open={tableOpen}
          onOpenChange={setTableOpen}
          expression={status.compiled}
          getContext={getTableContext}
          returnFocusTo={() => menuTriggerRef.current}
        />
      )}
    </li>
  )
}

function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i])
}

/**
 * Rows re-render only when something they show changes (CR-15): not on pan,
 * and during slider animation only the row owning the animated slider.
 */
function rowPropsEqual(prev: ExpressionRowProps, next: ExpressionRowProps): boolean {
  for (const key of Object.keys(next) as (keyof ExpressionRowProps)[]) {
    if (key === "parameters" || key === "status" || key === "sliderNames") continue
    if (prev[key] !== next[key]) return false
  }
  if (prev.status.compiled !== next.status.compiled || prev.status.error !== next.status.error) return false
  if (!sameNames(prev.sliderNames, next.sliderNames)) return false
  return next.sliderNames.every((n) => prev.parameters[n] === next.parameters[n])
}

export const ExpressionRow = memo(ExpressionRowImpl, rowPropsEqual)

/**
 * Filled circle when visible; hollow ring with a slash when hidden (not colour alone).
 * The trailing empty row gets a dashed neutral ring (UX-11).
 */
function Swatch({ color, visible, placeholder }: { color: string; visible: boolean; placeholder: boolean }) {
  if (placeholder) {
    return <span aria-hidden className="block size-6 rounded-full border-2 border-dashed border-muted-foreground/40" />
  }
  return (
    <span
      aria-hidden
      className="relative block size-6 rounded-full border-2"
      style={{ borderColor: color, backgroundColor: visible ? color : "transparent" }}
    >
      {!visible && (
        <span
          className="absolute top-1/2 left-1/2 h-0.5 w-7 -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
    </span>
  )
}
