import { useRef, type KeyboardEvent } from "react"
import { PALETTE, paletteColor, type Theme } from "@/lib/palette"
import { cn } from "@/lib/utils"

interface ColorPickerProps {
  value: number
  theme: Theme
  /** 1-based expression number, for the accessible name. */
  index: number
  onSelect: (colorIndex: number) => void
}

/**
 * Radiogroup of palette swatches (UX-SPEC §2.5). Arrow keys / Home / End move
 * focus (roving tabindex); Enter or Space selects.
 */
export function ColorPicker({ value, theme, index, onSelect }: ColorPickerProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, current: number) => {
    const n = PALETTE.length
    let next: number | null = null
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (current + 1) % n
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (current - 1 + n) % n
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = n - 1
    if (next === null) return
    e.preventDefault()
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={`Curve colour for expression ${index}`}
      className="flex flex-wrap gap-1"
    >
      {PALETTE.map((slot, i) => {
        const checked = i === value
        return (
          <button
            key={slot.name}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={slot.name}
            tabIndex={checked ? 0 : -1}
            onClick={() => onSelect(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "flex size-8 items-center justify-center rounded-full outline-none pointer-coarse:size-11",
              "focus-visible:ring-[3px] focus-visible:ring-ring",
              checked && "ring-2 ring-foreground",
            )}
          >
            <span aria-hidden className="size-6 rounded-full" style={{ backgroundColor: paletteColor(i, theme) }} />
          </button>
        )
      })}
    </div>
  )
}
