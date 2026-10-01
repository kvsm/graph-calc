import { useRef, useState, type ReactElement } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

function isFocusVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible")
  } catch {
    return true
  }
}

/**
 * Tooltip that opens on hover or keyboard focus, but not when focus is moved
 * programmatically after a click (UX-20), e.g. to "Show expressions panel".
 */
export function HintTooltip({
  label,
  side,
  children,
}: {
  label: string
  side?: "top" | "right" | "bottom" | "left"
  children: ReactElement
}) {
  const [open, setOpen] = useState(false)
  const hovered = useRef(false)

  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        if (next && !hovered.current) {
          const el = document.activeElement
          if (el && !isFocusVisible(el)) return
        }
        setOpen(next)
      }}
    >
      <TooltipTrigger
        asChild
        onPointerEnter={() => {
          hovered.current = true
        }}
        onPointerLeave={() => {
          hovered.current = false
        }}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
