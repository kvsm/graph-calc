import { useId, useState } from "react"
import { PauseIcon, PlayIcon, Settings2Icon } from "lucide-react"
import { Slider as SliderPrimitive } from "radix-ui"
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
  onChange: (patch: Partial<Omit<Parameter, "name">>) => void
  onTogglePlay: () => void
}

/** One slider row under an expression (UX-SPEC §4). */
export function ParameterSlider({ parameter: p, playing, onChange, onTogglePlay }: ParameterSliderProps) {
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

  const boundDisplay = (v: number) => String(Number(v.toPrecision(12)))
  const describedBy = error ? errorId : undefined

  return (
    <div className="pt-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 pointer-coarse:size-11"
          aria-label={playing ? `Pause ${name}` : `Animate ${name}`}
          aria-pressed={playing}
          onClick={onTogglePlay}
        >
          {playing ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
        </Button>
        <span aria-hidden className="font-mono text-sm">
          {name} =
        </span>
        <NumberField
          aria-label={`Value of ${name}`}
          className="h-8 w-16 text-right tabular-nums"
          display={valueText}
          onCommit={(t) => apply(commitValue(p, t))}
        />
        <div className="flex min-w-40 flex-1 items-center gap-2">
          <NumberField
            aria-label={`Minimum for ${name}`}
            aria-describedby={describedBy}
            className="hidden h-7 w-12 px-1 text-xs sm:block"
            display={boundDisplay(p.min)}
            onCommit={(t) => apply(commitMin(p, t))}
          />
          <SliderPrimitive.Root
            className="relative flex min-h-6 min-w-24 flex-1 touch-none items-center select-none pointer-coarse:min-h-11"
            value={[p.value]}
            min={p.min}
            max={p.max}
            step={p.step}
            onValueChange={([v]) => {
              if (v !== undefined) onChange({ value: v })
            }}
          >
            <SliderPrimitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-muted">
              <SliderPrimitive.Range className="absolute h-full bg-primary" />
            </SliderPrimitive.Track>
            {/* The thumb element is the (transparent) target: 24px, 44px on coarse pointers
                (WCAG 2.5.8); the visible 16px dot is drawn inside it. */}
            <SliderPrimitive.Thumb
              aria-label={name}
              aria-valuetext={`${name} = ${valueText}`}
              className="group/thumb flex size-6 shrink-0 items-center justify-center rounded-full outline-none pointer-coarse:size-11"
            >
              <span
                aria-hidden
                className="block size-4 rounded-full border border-ring bg-white ring-ring/50 motion-safe:transition-[box-shadow] group-hover/thumb:ring-3 group-focus-visible/thumb:ring-3"
              />
            </SliderPrimitive.Thumb>
          </SliderPrimitive.Root>
          <NumberField
            aria-label={`Maximum for ${name}`}
            aria-describedby={describedBy}
            className="hidden h-7 w-12 px-1 text-xs sm:block"
            display={boundDisplay(p.max)}
            onCommit={(t) => apply(commitMax(p, t))}
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 pointer-coarse:size-11"
              aria-label={`Slider settings for ${name}`}
            >
              <Settings2Icon aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56" align="end">
            <div className="grid grid-cols-[auto_1fr] items-center gap-2">
              <Label htmlFor={`${fieldId}-min`}>Min</Label>
              <NumberField
                id={`${fieldId}-min`}
                aria-describedby={describedBy}
                display={boundDisplay(p.min)}
                onCommit={(t) => apply(commitMin(p, t))}
              />
              <Label htmlFor={`${fieldId}-max`}>Max</Label>
              <NumberField
                id={`${fieldId}-max`}
                aria-describedby={describedBy}
                display={boundDisplay(p.max)}
                onCommit={(t) => apply(commitMax(p, t))}
              />
              <Label htmlFor={`${fieldId}-step`}>Step</Label>
              <NumberField
                id={`${fieldId}-step`}
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
      {error && (
        <p id={errorId} className="pt-1 pl-10 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
