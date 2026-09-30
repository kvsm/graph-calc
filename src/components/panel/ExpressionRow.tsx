import { useEffect, useRef, useState, type KeyboardEvent } from "react"
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ExpressionItem, ExpressionStatus, Parameter, Viewport } from "@/state/types"
import { ColorPicker } from "./ColorPicker"
import { ParameterSlider } from "./ParameterSlider"
import { TableOfValuesDialog } from "./TableOfValuesDialog"

/** Error line appears after this long without typing (UX-SPEC §3). */
export const ERROR_DELAY_MS = 600
export const PLACEHOLDER = "Type an expression, e.g. y = x^2"

export type RowNavigation = "enter" | "backspace-empty" | "up" | "down"

export interface ExpressionRowProps {
  item: ExpressionItem
  /** 1-based position. */
  index: number
  status: ExpressionStatus
  /** The always-present empty last row. */
  isTrailing: boolean
  theme: Theme
  sliders: Parameter[]
  playing: ReadonlySet<string>
  params: Record<string, number>
  viewport: Viewport | null
  registerInput: (id: string, el: HTMLInputElement | null) => void
  onTextChange: (text: string) => void
  onNavigate: (nav: RowNavigation) => void
  onVisibleChange: (visible: boolean) => void
  onColorChange: (colorIndex: number) => void
  onDelete: () => void
  onParameterChange: (name: string, patch: Partial<Omit<Parameter, "name">>) => void
  onTogglePlay: (name: string) => void
  onInputFocus?: (el: HTMLInputElement) => void
}

export function ExpressionRow({
  item,
  index,
  status,
  isTrailing,
  theme,
  sliders,
  playing,
  params,
  viewport,
  registerInput,
  onTextChange,
  onNavigate,
  onVisibleChange,
  onColorChange,
  onDelete,
  onParameterChange,
  onTogglePlay,
  onInputFocus,
}: ExpressionRowProps) {
  const [errorShown, setErrorShown] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const [tableOpen, setTableOpen] = useState(false)
  const swatchRef = useRef<HTMLButtonElement>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  /** Set when a menu item opens a popover/dialog so the menu doesn't steal focus back. */
  const suppressMenuFocus = useRef(false)

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
    if (error) announce(`Expression ${index}: ${error.message}`)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "Enter":
        e.preventDefault()
        setErrorShown(true)
        onNavigate("enter")
        break
      case "Backspace":
        if (e.currentTarget.value === "") {
          e.preventDefault()
          onNavigate("backspace-empty")
        }
        break
      case "ArrowUp":
        e.preventDefault()
        onNavigate("up")
        break
      case "ArrowDown":
        e.preventDefault()
        onNavigate("down")
        break
      case "Escape":
        e.preventDefault()
        swatchRef.current?.focus()
        break
    }
  }

  return (
    <li className="flex items-start gap-2 px-2 py-2 hover:bg-muted/50 focus-within:bg-muted/50">
      <Popover open={colorOpen} onOpenChange={setColorOpen}>
        <PopoverAnchor asChild>
          <div className="shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle
                  ref={swatchRef}
                  pressed={item.visible}
                  onPressedChange={onVisibleChange}
                  aria-label={`Show expression ${index}`}
                  className="size-9 min-w-0 rounded-full p-0 aria-pressed:bg-transparent data-[state=on]:bg-transparent pointer-coarse:size-11"
                >
                  <Swatch color={color} visible={item.visible} />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>{item.visible ? "Hide" : "Show"}</TooltipContent>
            </Tooltip>
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-auto"
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
          <h2 className="text-sm font-medium">Curve colour</h2>
          <ColorPicker
            value={item.colorIndex}
            theme={theme}
            index={index}
            onSelect={(i) => {
              onColorChange(i)
              setColorOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>

      <span
        aria-hidden
        className="flex h-9 w-5 shrink-0 items-center justify-end text-xs text-muted-foreground tabular-nums pointer-coarse:h-11"
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
              onTextChange(e.target.value)
            }}
            onKeyDown={onKeyDown}
            onBlur={revealError}
            onFocus={(e) => onInputFocus?.(e.currentTarget)}
            aria-label={`Expression ${index}`}
            aria-invalid={showError || undefined}
            aria-describedby={showError ? errorId : undefined}
            placeholder={isTrailing ? PLACEHOLDER : undefined}
            className="h-9 font-mono text-sm pointer-coarse:h-11"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            inputMode="text"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={menuTriggerRef}
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 pointer-coarse:size-11"
                aria-label={`More options for expression ${index}`}
              >
                <MoreVerticalIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(e) => {
                if (suppressMenuFocus.current) {
                  suppressMenuFocus.current = false
                  e.preventDefault()
                }
              }}
            >
              <DropdownMenuItem
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
                variant="destructive"
                disabled={isTrailing}
                onSelect={() => {
                  suppressMenuFocus.current = true
                  onDelete()
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
            <span>{error.message}</span>
          </p>
        )}

        {sliders.map((p) => (
          <ParameterSlider
            key={p.name}
            parameter={p}
            playing={playing.has(p.name)}
            onChange={(patch) => onParameterChange(p.name, patch)}
            onTogglePlay={() => onTogglePlay(p.name)}
          />
        ))}
      </div>

      {status.compiled && (
        <TableOfValuesDialog
          open={tableOpen}
          onOpenChange={setTableOpen}
          expression={status.compiled}
          params={params}
          viewport={viewport}
          returnFocusTo={() => menuTriggerRef.current}
        />
      )}
    </li>
  )
}

/** Filled circle when visible; hollow ring with a slash when hidden (not colour alone). */
function Swatch({ color, visible }: { color: string; visible: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("relative block size-6 rounded-full border-2", !visible && "bg-transparent")}
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
