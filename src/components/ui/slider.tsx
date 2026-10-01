import * as React from "react"
import { cn } from "cn"
import { Slider as SliderPrimitive } from "radix-ui"

type ThumbProps = Omit<React.ComponentProps<typeof SliderPrimitive.Thumb>, "children">

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  thumbProps,
  rangeStyle,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  /** Extra props for every thumb, e.g. aria-label / aria-valuetext (local addition). */
  thumbProps?: ThumbProps
  /** Inline style for the filled range, e.g. a curve colour (local addition). */
  rangeStyle?: React.CSSProperties
}) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative grow overflow-hidden rounded-full bg-muted data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute bg-primary select-none data-horizontal:h-full data-vertical:w-full"
          style={rangeStyle}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        // Local change: the thumb is a transparent 24px target (44px on coarse
        // pointers, WCAG 2.5.8) with the visible 12px dot drawn inside it, and a
        // solid focus ring (the 50%-alpha ring alone is ~2:1).
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          {...thumbProps}
          className={cn(
            "group/thumb flex size-6 shrink-0 items-center justify-center rounded-full outline-none select-none disabled:pointer-events-none disabled:opacity-50 pointer-coarse:size-11",
            thumbProps?.className
          )}
        >
          <span
            aria-hidden
            className="block size-3 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] group-hover/thumb:ring-3 group-focus-visible/thumb:ring-3 group-focus-visible/thumb:ring-ring group-active/thumb:ring-3"
          />
        </SliderPrimitive.Thumb>
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
