import { useState, type ComponentProps } from "react"
import { Input } from "@/components/ui/input"

interface NumberFieldProps extends Omit<ComponentProps<"input">, "value" | "onChange" | "defaultValue"> {
  /** Formatted value shown while not editing. */
  display: string
  /** Called with the typed text on blur / Enter. Return false to revert. */
  onCommit: (text: string) => boolean | void
}

/**
 * Text input for numbers that edits a local draft and commits on blur or Enter,
 * so partial input like "-" or "1." never reaches the store.
 */
export function NumberField({ display, onCommit, onKeyDown, onFocus, onBlur, ...props }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft !== null && draft !== display) onCommit(draft)
    setDraft(null)
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      {...props}
      value={draft ?? display}
      onFocus={(e) => {
        setDraft(display)
        onFocus?.(e)
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        commit()
        onBlur?.(e)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          commit()
          // Keep editing: re-seed the draft from the committed value on next render.
          setDraft(null)
        } else if (e.key === "Escape") {
          setDraft(null)
        }
        onKeyDown?.(e)
      }}
    />
  )
}
