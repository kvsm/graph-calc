import { useId, useState } from "react"
import { PauseIcon, PlayIcon, Settings2Icon } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  commitMax,
  commitMin,
  commitStep,
  commitValue,
  formatParamValue,
  type Commit,
} from "@/state/parameters"
import type { Parameter } from "@/state/types"
import { NumberField } from "./NumberField"

interface ParameterSliderProps {
  parameter: Parameter
  playing: boolean
  /** Curve colour of the owning expression, used for the slider fill (UX-27). */
  color: string
  onChange: (patch: Partial<Omit<Parameter, "name">>) => void
  onTogglePlay: () => void
}

const boundDisplay = (v: number) => String(Number(v.toPrecision(12)))

/**
 * One slider under an expression (UX-SPEC §4), laid out as two lines (UX-07):
 *   [play] a = [value] ………… [settings]
 *          [min] ====o==== [max]        (inline min/max only at lg, UX-02)
 */
export function ParameterSlider({ parameter: p, playing, color, onChange, onTogglePlay }: ParameterSliderProps) {
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()
  const fieldId = useId()
  const name = p.name
  const valueText = formatParamValue(p.value, p.step)

  const apply = (result: Commit) => {
    if (result.ok) {
      setError(null)
      onChange(result.patch)
    } else if (result.error) {
      setError(result.error)
    }
  }

  const describedBy = error ? errorId : undefined
  const boundClass = "hidden h-7 w-14 shrink-0 px-1.5 text-xs tabular-nums lg:block pointer-coarse:h-11"

  return (
    <div className="pt-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 pointer-coarse:size-11"
          // Constant label + aria-pressed (CR-20); the icon shows play/pause.
          aria-label={`Animate ${name}`}
          aria-pressed={playing}
          onClick={onTogglePlay}
        >
          {playing ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
        </Button>
        <span aria-hidden className="shrink-0 font-mono text-sm">
          {name} =
        </span>
        <NumberField
          aria-label={`Value of ${name}`}
          className="h-8 w-16 shrink-0 text-right tabular-nums pointer-coarse:h-11 pointer-coarse:w-20"
          display={valueText}
          onCommit={(t) => apply(commitValue(p, t))}
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto size-8 shrink-0 pointer-coarse:size-11"
              aria-label={`Slider settings for ${name}`}
            >
              <Settings2Icon aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56" align="end" aria-label={`Slider settings for ${name}`}>
            <div className="grid grid-cols-[auto_1fr] items-center gap-2">
              <Label htmlFor={`${fieldId}-min`}>Min</Label>
              <NumberField
                id={`${fieldId}-min`}
                className="pointer-coarse:h-11"
                aria-describedby={describedBy}
                display={boundDisplay(p.min)}
                onCommit={(t) => apply(commitMin(p, t))}
              />
              <Label htmlFor={`${fieldId}-max`}>Max</Label>
              <NumberField
                id={`${fieldId}-max`}
                className="pointer-coarse:h-11"
                aria-describedby={describedBy}
                display={boundDisplay(p.max)}
                onCommit={(t) => apply(commitMax(p, t))}
              />
              <Label htmlFor={`${fieldId}-step`}>Step</Label>
              <NumberField
                id={`${fieldId}-step`}
                className="pointer-coarse:h-11"
                display={String(p.step)}
                onCommit={(t) => apply(commitStep(p, t))}
              />
            </div>
            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex items-center gap-2 pl-10">
        <NumberField
          aria-label={`Minimum for ${name}`}
          aria-describedby={describedBy}
          className={boundClass}
          display={boundDisplay(p.min)}
          onCommit={(t) => apply(commitMin(p, t))}
        />
        {/* shadcn Slider (UX-SPEC §4); the thumb is a 24px/44px target with a solid focus ring. */}
        <Slider
          className="min-h-6 min-w-0 flex-1 pointer-coarse:min-h-11"
          value={[p.value]}
          min={p.min}
          max={p.max}
          step={p.step}
          onValueChange={([v]) => {
            if (v !== undefined) onChange({ value: v })
          }}
          rangeStyle={{ backgroundColor: color }}
          thumbProps={{ "aria-label": name, "aria-valuetext": `${name} = ${valueText}` }}
        />
        <NumberField
          aria-label={`Maximum for ${name}`}
          aria-describedby={describedBy}
          className={boundClass}
          display={boundDisplay(p.max)}
          onCommit={(t) => apply(commitMax(p, t))}
        />
      </div>
      {error && (
        <p id={errorId} className="pt-1 pl-10 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
