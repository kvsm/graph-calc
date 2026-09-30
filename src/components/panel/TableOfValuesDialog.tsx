import { useId, useMemo, useState } from "react"
import type { CompiledExpression } from "@/lib/math"
import { formatNumber } from "@/lib/viewport"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { parseNumber } from "@/state/parameters"
import type { Viewport } from "@/state/types"
import { NumberField } from "./NumberField"
import { tableDefaults, tableXs } from "./tableValues"

interface TableOfValuesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expression: CompiledExpression
  params: Record<string, number>
  viewport: Viewport | null
  /** Where focus returns on close (the row's overflow trigger). */
  returnFocusTo: () => HTMLElement | null
}

export function TableOfValuesDialog({
  open,
  onOpenChange,
  expression,
  params,
  viewport,
  returnFocusTo,
}: TableOfValuesDialogProps) {
  const label = expression.source.trim()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[80dvh] flex-col sm:max-w-md"
        onCloseAutoFocus={(e) => {
          const target = returnFocusTo()
          if (target) {
            e.preventDefault()
            target.focus()
          }
        }}
      >
        <DialogTitle className="pr-8 break-words">Table of values: {label}</DialogTitle>
        <DialogDescription className="sr-only">
          Values of {label} for 21 values of x. Change Start and Step to move the table.
        </DialogDescription>
        {open && <TableBodyContent label={label} expression={expression} params={params} viewport={viewport} />}
      </DialogContent>
    </Dialog>
  )
}

function TableBodyContent({
  label,
  expression,
  params,
  viewport,
}: {
  label: string
  expression: CompiledExpression
  params: Record<string, number>
  viewport: Viewport | null
}) {
  const [defaults] = useState(() => tableDefaults(viewport))
  const [start, setStart] = useState(defaults.start)
  const [step, setStep] = useState(defaults.step)
  const id = useId()

  const rows = useMemo(
    () => tableXs(start, step).map((x) => ({ x, y: expression.evaluate(x, params) })),
    [start, step, expression, params],
  )

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor={`${id}-start`}>Start</Label>
          <NumberField
            id={`${id}-start`}
            className="w-24 tabular-nums"
            display={String(start)}
            onCommit={(t) => {
              const v = parseNumber(t)
              if (v !== null) setStart(v)
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`${id}-step`}>Step</Label>
          <NumberField
            id={`${id}-step`}
            className="w-24 tabular-nums"
            display={String(step)}
            onCommit={(t) => {
              const v = parseNumber(t)
              if (v !== null && v > 0) setStep(v)
            }}
          />
        </div>
      </div>
      {/* Scrollable region must be keyboard-focusable (axe scrollable-region-focusable). */}
      <div
        className="min-h-0 flex-1 overflow-y-auto rounded-md border"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="region"
        aria-label={`Values of ${label}`}
      >
        <Table>
          <TableCaption className="sr-only">
            Values of {label} from x = {formatNumber(start, 10)} in steps of {formatNumber(step, 10)}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="text-right">
                x
              </TableHead>
              <TableHead scope="col" className="text-right">
                y
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ x, y }, i) => (
              <TableRow key={i}>
                <TableCell className="text-right font-mono tabular-nums">{formatNumber(x, 10)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatNumber(y)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
