/**
 * The graph: a DPR-aware Canvas 2D plot with pan/zoom/trace (UX-SPEC §5, §8, §9)
 * plus the toolbar (§1.2). All viewport changes go through `onViewportChange`;
 * the view is never stored here.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { announce, LIVE_REGION_ID } from "@/lib/announce"
import type { Segment } from "@/lib/math"
import { paletteColor } from "@/lib/palette"
import {
  canZoom,
  formatPoint,
  panByFraction,
  panByPixels,
  resizeViewport,
  toScreenX,
  toScreenY,
  wheelZoomFactor,
  zoomAt,
  zoomCenter,
  type Size,
  type Vec2,
  type Viewport,
} from "@/lib/viewport"
import type { GraphViewProps, PlotItem } from "@/state/types"
import { readGraphColors } from "./colors"
import { CURVE_WIDTH, drawGraph, TRACED_CURVE_WIDTH } from "./draw"
import {
  exceedsSlop,
  HOLD_MS,
  isDoubleTap,
  pinchViewport,
  wheelDeltaPixels,
  type Tap,
} from "./gestures"
import { GraphToolbar } from "./GraphToolbar"
import { graphKeyAction } from "./keyboard"
import { graphAriaLabel, traceAnnouncement, truncate, viewAnnouncement } from "./label"
import { effectiveViewport } from "./layout"
import { createSampleCache } from "./sampleCache"
import { ShortcutsDialog } from "./ShortcutsDialog"
import { tooltipPosition } from "./tooltip"
import { cycleId, findTraceStart, keepInView, nearestCurvePoint, safeEval, stepTraceX } from "./trace"

export const GRAPH_WRAPPER_LABEL = "Graph. Arrow keys pan, plus and minus zoom, T traces."
export const EMPTY_GRAPH_HINT = "Add an expression to see it graphed."

type TraceSource = "hover" | "keyboard" | "touch"
interface TraceState {
  id: string
  x: number
  source: TraceSource
}

interface SampledCurve {
  id: string
  colorIndex: number
  segments: Segment[]
}

type GestureMode = "idle" | "pending" | "pan" | "pinch" | "touchTrace"
interface GestureState {
  pointers: Map<number, Vec2>
  mode: GestureMode
  start: Vec2
  last: Vec2
  holdTimer: ReturnType<typeof setTimeout> | null
  lastTap: Tap | null
  lastPointerType: string
}

const raf: (cb: () => void) => number =
  typeof requestAnimationFrame === "function"
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(cb, 16) as unknown as number
const cancelRaf: (id: number) => void =
  typeof cancelAnimationFrame === "function" ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id)

const initialDpr = () => (typeof window !== "undefined" && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1)

const evaluator = (plot: PlotItem, params: Record<string, number>) => (x: number) =>
  plot.expression.evaluate(x, params)

export function GraphView({ plots, params, viewport, onViewportChange, theme, onToggleTheme }: GraphViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [dpr, setDpr] = useState(initialDpr)
  const [trace, setTrace] = useState<TraceState | null>(null)
  const [dragging, setDragging] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  // Radix returns focus to a DialogTrigger; we open from two places, so remember the opener.
  const helpReturnFocus = useRef<HTMLElement | null>(null)
  const openHelp = useCallback(() => {
    helpReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setHelpOpen(true)
  }, [])

  const hasSize = size.width > 0 && size.height > 0
  const vp = useMemo(() => effectiveViewport(viewport, size), [viewport, size])
  const visible = useMemo(() => plots.filter((p) => p.visible), [plots])

  // Re-sample a curve only when its expression, its parameter values, the view or
  // the size change. `plots` is a new array on every keystroke, so cache per plot id.
  const sampleCache = useMemo(() => createSampleCache(), [])
  const curves = useMemo<SampledCurve[]>(() => {
    if (!hasSize) return []
    sampleCache.prune(visible.map((p) => p.id))
    return sampleCache.stabilize(
      visible.map((p) => ({
        id: p.id,
        colorIndex: p.colorIndex,
        segments: sampleCache.get(p.id, p.expression, params, vp, size),
      })),
    )
  }, [sampleCache, visible, params, vp, size, hasSize])

  // The traced point, re-evaluated so it follows slider changes.
  const traced = useMemo(() => {
    if (!trace) return null
    const index = visible.findIndex((p) => p.id === trace.id)
    if (index < 0) return null
    const plot = visible[index]
    return { plot, index, x: trace.x, y: safeEval(evaluator(plot, params), trace.x), source: trace.source }
  }, [trace, visible, params])

  // Latest values for imperative handlers (pointer listeners, ResizeObserver).
  const latest = useRef({ vp, size, curves, trace, viewport, onViewportChange, visible, params })
  useLayoutEffect(() => {
    latest.current = { vp, size, curves, trace, viewport, onViewportChange, visible, params }
  })

  const emit = useCallback((next: Viewport) => {
    latest.current.vp = next
    latest.current.onViewportChange(next)
  }, [])

  // ---- Size & device pixel ratio ------------------------------------------------
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const apply = (width: number, height: number) => {
      const prev = latest.current.size
      if (prev.width === width && prev.height === height) return
      const next = { width, height }
      // Keep the scale and centre when the canvas resizes (e.g. panel collapse).
      if (latest.current.viewport && prev.width > 0 && prev.height > 0 && width > 0 && height > 0) {
        emit(resizeViewport(latest.current.vp, prev, next))
      }
      latest.current.size = next
      setSize(next)
    }
    if (typeof ResizeObserver === "undefined") {
      const r = el.getBoundingClientRect()
      apply(r.width, r.height)
      return
    }
    const ro = new ResizeObserver((entries) => {
      const r = entries[entries.length - 1]?.contentRect
      if (r) apply(r.width, r.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [emit])

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`)
    const onChange = () => setDpr(initialDpr())
    mq.addEventListener?.("change", onChange)
    return () => mq.removeEventListener?.("change", onChange)
  }, [dpr])

  // ---- Drawing (one rAF per change) --------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !hasSize) return
    const id = raf(() => {
      const bw = Math.max(1, Math.round(size.width * dpr))
      const bh = Math.max(1, Math.round(size.height * dpr))
      if (canvas.width !== bw) canvas.width = bw
      if (canvas.height !== bh) canvas.height = bh
      let ctx: CanvasRenderingContext2D | null = null
      try {
        ctx = canvas.getContext("2d")
      } catch {
        ctx = null
      }
      if (!ctx) return
      drawGraph(ctx, {
        size,
        dpr,
        viewport: vp,
        // Read at draw time (after the app has applied the theme class).
        colors: readGraphColors(canvas, theme),
        curves: curves.map((c) => ({
          color: paletteColor(c.colorIndex, theme),
          segments: c.segments,
          width: traced?.plot.id === c.id ? TRACED_CURVE_WIDTH : CURVE_WIDTH,
        })),
        marker: traced ? { x: traced.x, y: traced.y, color: paletteColor(traced.plot.colorIndex, theme) } : null,
      })
    })
    return () => cancelRaf(id)
  }, [curves, vp, size, dpr, theme, traced, hasSize])

  // ---- Pointer, wheel and touch gestures ----------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const g: GestureState = {
      pointers: new Map(),
      mode: "idle",
      start: { x: 0, y: 0 },
      last: { x: 0, y: 0 },
      holdTimer: null,
      lastTap: null,
      lastPointerType: "mouse",
    }
    const local = (e: MouseEvent): Vec2 => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const clearHold = () => {
      if (g.holdTimer !== null) clearTimeout(g.holdTimer)
      g.holdTimer = null
    }
    const setTraceIfChanged = (next: TraceState | null) =>
      setTrace((cur) =>
        cur === next || (cur && next && cur.id === next.id && cur.x === next.x && cur.source === next.source)
          ? cur
          : next,
      )
    const traceAt = (pt: Vec2, source: TraceSource) => {
      const { curves, vp, size, trace, visible, params } = latest.current
      const hit = nearestCurvePoint(curves, vp, size, pt)
      if (hit) {
        setTraceIfChanged({ id: hit.id, x: hit.x, source })
        if (source === "touch") {
          const plot = visible.find((p) => p.id === hit.id)
          if (plot) announce(traceAnnouncement(plot.label, hit.x, safeEval(evaluator(plot, params), hit.x)))
        }
      } else if (trace?.source === source) {
        setTraceIfChanged(null)
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        // Not supported (e.g. jsdom) — gestures still work while over the canvas.
      }
      const pt = local(e)
      g.pointers.set(e.pointerId, pt)
      g.lastPointerType = e.pointerType
      const cur = latest.current.trace
      if (g.pointers.size === 2) {
        clearHold()
        g.mode = "pinch"
        if (cur?.source === "touch") setTrace(null)
        setDragging(true)
        return
      }
      if (g.pointers.size > 2) return
      g.start = pt
      g.last = pt
      if (e.pointerType === "touch") {
        if (cur?.source === "touch") setTrace(null)
        g.mode = "pending"
        g.holdTimer = setTimeout(() => {
          g.holdTimer = null
          if (g.mode !== "pending") return
          g.mode = "touchTrace"
          traceAt(g.last, "touch")
        }, HOLD_MS)
      } else {
        g.mode = "pan"
        if (cur?.source === "hover") setTrace(null)
        setDragging(true)
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      const pt = local(e)
      const prev = g.pointers.get(e.pointerId)
      if (!prev) {
        if (e.pointerType !== "touch" && g.mode === "idle" && latest.current.trace?.source !== "keyboard") {
          traceAt(pt, "hover")
        }
        return
      }
      const { vp, size } = latest.current
      if (g.mode === "pinch") {
        const ids = Array.from(g.pointers.keys()).slice(0, 2)
        if (ids.length === 2 && ids.includes(e.pointerId)) {
          const before = ids.map((id) => (id === e.pointerId ? prev : g.pointers.get(id)!)) as [Vec2, Vec2]
          g.pointers.set(e.pointerId, pt)
          const after = ids.map((id) => g.pointers.get(id)!) as [Vec2, Vec2]
          emit(pinchViewport(vp, size, before, after))
        }
        return
      }
      g.pointers.set(e.pointerId, pt)
      if (g.mode === "pending" && exceedsSlop(g.start, pt)) {
        clearHold()
        g.mode = "pan"
        setDragging(true)
      }
      if (g.mode === "pan") {
        const dx = pt.x - g.last.x
        const dy = pt.y - g.last.y
        if (dx !== 0 || dy !== 0) emit(panByPixels(vp, size, dx, dy))
        g.last = pt
      } else if (g.mode === "touchTrace") {
        g.last = pt
        traceAt(pt, "touch")
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      const pt = g.pointers.get(e.pointerId)
      if (!pt) return
      g.pointers.delete(e.pointerId)
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      if (g.mode === "pinch") {
        if (g.pointers.size === 1) {
          g.mode = "pan"
          g.last = Array.from(g.pointers.values())[0]
          return
        }
        if (g.pointers.size >= 2) return
      }
      if (g.pointers.size > 0) return
      if (e.type === "pointerup" && e.pointerType === "touch" && g.mode === "pending") {
        const tap: Tap = { time: performance.now(), x: pt.x, y: pt.y }
        if (isDoubleTap(g.lastTap, tap)) {
          g.lastTap = null
          const { vp, size } = latest.current
          const next = zoomAt(vp, size, pt, 2)
          if (next !== vp) emit(next)
        } else {
          g.lastTap = tap
        }
      }
      clearHold()
      g.mode = "idle"
      setDragging(false)
    }

    const onPointerLeave = () => {
      if (g.mode === "idle" && latest.current.trace?.source === "hover") setTrace(null)
    }

    const onDoubleClick = (e: MouseEvent) => {
      if (g.lastPointerType === "touch") return
      const { vp, size } = latest.current
      const next = zoomAt(vp, size, local(e), 2)
      if (next !== vp) emit(next)
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { vp, size } = latest.current
      if (!(size.width > 0 && size.height > 0)) return
      const dy = wheelDeltaPixels(e.deltaY, e.deltaMode, size.height)
      if (dy === 0) return
      const next = zoomAt(vp, size, local(e), wheelZoomFactor(dy))
      if (next !== vp) emit(next)
    }

    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointercancel", onPointerUp)
    canvas.addEventListener("pointerleave", onPointerLeave)
    canvas.addEventListener("dblclick", onDoubleClick)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      clearHold()
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointercancel", onPointerUp)
      canvas.removeEventListener("pointerleave", onPointerLeave)
      canvas.removeEventListener("dblclick", onDoubleClick)
      canvas.removeEventListener("wheel", onWheel)
    }
  }, [emit])

  // ---- View commands (keyboard + toolbar) ---------------------------------------
  const zoomBy = useCallback(
    (factor: number) => {
      const next = zoomCenter(vp, factor)
      if (next === vp) return
      emit(next)
      announce(viewAnnouncement(factor > 1 ? "zoomIn" : "zoomOut", next))
    },
    [vp, emit],
  )
  const resetView = useCallback(() => {
    latest.current.onViewportChange(null)
    announce(viewAnnouncement("reset", vp))
  }, [vp])

  const keyboardTracing = traced !== null && traced.source === "keyboard"

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const action = graphKeyAction(e, keyboardTracing)
    if (!action) return
    e.preventDefault()
    switch (action.type) {
      case "pan": {
        const next = panByFraction(vp, action.fx, action.fy)
        emit(next)
        announce(viewAnnouncement(action.direction, next))
        return
      }
      case "zoom":
        zoomBy(action.factor)
        return
      case "reset":
        resetView()
        return
      case "help":
        openHelp()
        return
      case "exitTrace":
        setTrace(null)
        announce("Trace off.")
        return
      case "toggleTrace": {
        if (keyboardTracing) {
          setTrace(null)
          announce("Trace off.")
          return
        }
        // First visible curve with anything to trace in the visible x-range (normally visible[0]).
        for (const plot of hasSize ? visible : []) {
          const f = evaluator(plot, params)
          const start = findTraceStart(f, vp, size)
          if (!start) continue
          if (start.viewport !== vp) emit(start.viewport)
          setTrace({ id: plot.id, x: start.x, source: "keyboard" })
          announce(traceAnnouncement(plot.label, start.x, safeEval(f, start.x)))
          return
        }
        announce("Nothing to trace in view.")
        return
      }
      case "traceStep": {
        if (!traced) return
        const x = stepTraceX(traced.x, vp, size, action.pixels)
        const y = safeEval(evaluator(traced.plot, params), x)
        const next = keepInView(vp, { x, y })
        if (next !== vp) emit(next)
        setTrace({ id: traced.plot.id, x, source: "keyboard" })
        announce(traceAnnouncement(traced.plot.label, x, y))
        return
      }
      case "traceCurve": {
        if (!traced) return
        const ids = visible.map((p) => p.id)
        const id = cycleId(ids, traced.plot.id, action.dir)
        const index = id === null ? -1 : ids.indexOf(id)
        if (index < 0) return
        const plot = visible[index]
        const y = safeEval(evaluator(plot, params), traced.x)
        const next = keepInView(vp, { x: traced.x, y })
        if (next !== vp) emit(next)
        setTrace({ id: plot.id, x: traced.x, source: "keyboard" })
        announce(traceAnnouncement(plot.label, traced.x, y, { index, count: ids.length }))
        return
      }
    }
  }

  // ---- Trace tooltip placement ----------------------------------------------------
  const anchor: Vec2 | null =
    traced && hasSize
      ? {
          x: toScreenX(vp, size, traced.x),
          y: Number.isFinite(traced.y) ? toScreenY(vp, size, traced.y) : size.height / 2,
        }
      : null
  const anchorInside =
    anchor !== null && anchor.x >= 0 && anchor.x <= size.width && anchor.y >= 0 && anchor.y <= size.height
  useLayoutEffect(() => {
    const el = tipRef.current
    if (!el || !anchor) return
    const pos = tooltipPosition(anchor, { width: el.offsetWidth, height: el.offsetHeight }, size)
    el.style.left = `${pos.left}px`
    el.style.top = `${pos.top}px`
  })

  const ariaLabel = useMemo(() => graphAriaLabel(visible.map((p) => p.label), vp), [visible, vp])

  return (
    <div className="relative size-full overflow-hidden" data-slot="graph">
      {/* The focusable wrapper takes keyboard commands (UX-SPEC §5.2, §9.1). It is a labelled
          group rather than role="application", which the spec rules out. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above */}
      <div
        ref={wrapperRef}
        role="group"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard-operable graph surface
        tabIndex={0}
        aria-label={GRAPH_WRAPPER_LABEL}
        aria-describedby={LIVE_REGION_ID}
        onKeyDown={onKeyDown}
        className="absolute inset-0 outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={ariaLabel}
          data-testid="graph-canvas"
          className={`block size-full touch-none select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        />
        {traced && anchorInside && anchor && (
          <div
            ref={tipRef}
            aria-hidden="true"
            data-testid="trace-tooltip"
            className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md"
            style={{ left: anchor.x + 12, top: anchor.y - 12 }}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ backgroundColor: paletteColor(traced.plot.colorIndex, theme) }}
              />
              <span>{truncate(traced.plot.label)}</span>
            </div>
            <div className="font-mono tabular-nums">{formatPoint(traced.x, traced.y)}</div>
          </div>
        )}
        {plots.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
            {EMPTY_GRAPH_HINT}
          </p>
        )}
      </div>
      <GraphToolbar
        canZoomIn={canZoom(vp, 2)}
        canZoomOut={canZoom(vp, 0.5)}
        onZoomIn={() => zoomBy(2)}
        onZoomOut={() => zoomBy(0.5)}
        onReset={resetView}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onShowShortcuts={openHelp}
      />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} returnFocusRef={helpReturnFocus} />
    </div>
  )
}
