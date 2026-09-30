import type { RefObject } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SHORTCUTS } from "./keyboard"

export function ShortcutsDialog({
  open,
  onOpenChange,
  returnFocusRef,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Element to refocus on close (the toolbar button or the graph). */
  returnFocusRef?: RefObject<HTMLElement | null>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[80dvh] overflow-y-auto sm:max-w-md"
        onCloseAutoFocus={(e) => {
          const el = returnFocusRef?.current
          if (el && el.isConnected) {
            e.preventDefault()
            el.focus()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>These keys work when the graph has focus.</DialogDescription>
        </DialogHeader>
        <Table>
          <caption className="sr-only">Graph keyboard shortcuts</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Key</TableHead>
              <TableHead scope="col">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SHORTCUTS.map((s) => (
              <TableRow key={s.keys.join(" ") + s.action}>
                <TableCell className="whitespace-nowrap">
                  {s.keys.map((k, i) => (
                    <span key={k + i}>
                      {i > 0 && (s.join === "or" ? <span className="px-1 text-muted-foreground">or</span> : " ")}
                      <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
                    </span>
                  ))}
                </TableCell>
                <TableCell className="whitespace-normal">{s.action}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  )
}
