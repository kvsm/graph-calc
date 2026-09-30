import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LIVE_REGION_ID } from "@/lib/announce"
import { parseExpression } from "@/lib/math"
import { spanX, type Viewport } from "@/lib/viewport"
import type { PlotItem, Theme } from "@/state/types"
import { EMPTY_GRAPH_HINT, GRAPH_WRAPPER_LABEL, GraphView } from "./GraphView"

function plot(id: string, text: string, extra: Partial<PlotItem> = {}): PlotItem {
  const r = parseExpression(text)
  if (!r.ok) throw new Error(`bad test expression ${text}`)
  return { id, label: text, colorIndex: 0, visible: true, expression: r.expression, ...extra }
}

class FakeResizeObserver {
  private cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb
  }
  observe() {
    this.cb([{ contentRect: { width: 800, height: 600 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver)
  const ctx = new Proxy({}, { get: (t: Record<string, unknown>, p: string) => (p in t ? t[p] : () => {}) })
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

interface HarnessProps {
  plots?: PlotItem[]
  initial?: Viewport | null
  theme?: Theme
  onChange?: (v: Viewport | null) => void
  onToggleTheme?: () => void
}

function Harness({ plots = [plot("a", "y = x")], initial = null, theme = "light", onChange, onToggleTheme }: HarnessProps) {
  const [vp, setVp] = useState<Viewport | null>(initial)
  return (
    <>
      <div id={LIVE_REGION_ID} aria-live="polite" />
      <GraphView
        plots={plots}
        params={{}}
        viewport={vp}
        onViewportChange={(v) => {
          onChange?.(v)
          setVp(v)
        }}
        theme={theme}
        onToggleTheme={onToggleTheme ?? (() => {})}
      />
    </>
  )
}

const canvas = () => screen.getByTestId("graph-canvas")
const wrapper = () => screen.getByRole("group", { name: GRAPH_WRAPPER_LABEL })
const last = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[fn.mock.calls.length - 1][0] as Viewport | null

describe("GraphView accessibility", () => {
  it("labels the canvas with the expressions and visible ranges", () => {
    render(<Harness plots={[plot("a", "y = sin(x)"), plot("b", "y = x^2"), plot("c", "y = 5", { visible: false })]} />)
    const c = canvas()
    expect(c).toHaveAttribute("role", "img")
    expect(c).toHaveAccessibleName(
      "Graph of 2 expressions: y = sin(x), y = x^2. x from -10 to 10, y from -7.5 to 7.5.",
    )
  })

  it("has a focusable, labelled wrapper described by the live region", () => {
    render(<Harness />)
    const w = wrapper()
    expect(w).toHaveAttribute("tabindex", "0")
    expect(w).toHaveAttribute("aria-describedby", LIVE_REGION_ID)
    expect(w).not.toHaveAttribute("role", "application")
  })

  it("renders the toolbar with the §10 names in order", () => {
    render(<Harness />)
    const bar = screen.getByRole("toolbar", { name: "Graph controls" })
    expect(bar).toHaveAttribute("aria-orientation", "vertical")
    const names = within(bar)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"))
    expect(names).toEqual(["Zoom in", "Zoom out", "Reset view", "Switch to dark theme", "Keyboard shortcuts"])
  })

  it("shows the empty hint only with no expressions", () => {
    const { unmount } = render(<Harness plots={[]} />)
    expect(screen.getByText(EMPTY_GRAPH_HINT)).toBeInTheDocument()
    expect(canvas()).toHaveAccessibleName(/^Graph with no expressions\./)
    unmount()
    render(<Harness />)
    expect(screen.queryByText(EMPTY_GRAPH_HINT)).toBeNull()
  })
})

describe("GraphView toolbar", () => {
  it("zooms around the centre, announces, and resets to null", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await user.click(screen.getByRole("button", { name: "Zoom in" }))
    expect(spanX(last(onChange)!)).toBeCloseTo(10)
    expect(last(onChange)!.xMin).toBeCloseTo(-5)
    await user.click(screen.getByRole("button", { name: "Zoom out" }))
    expect(spanX(last(onChange)!)).toBeCloseTo(20)
    await user.click(screen.getByRole("button", { name: "Reset view" }))
    expect(last(onChange)).toBeNull()
  })

  it("disables zoom in at the 1e-6 span limit", () => {
    render(<Harness initial={{ xMin: 0, xMax: 1e-6, yMin: 0, yMax: 0.75e-6 }} />)
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeEnabled()
  })

  it("toggles theme with the right label", async () => {
    const user = userEvent.setup()
    const onToggleTheme = vi.fn()
    render(<Harness theme="dark" onToggleTheme={onToggleTheme} />)
    await user.click(screen.getByRole("button", { name: "Switch to light theme" }))
    expect(onToggleTheme).toHaveBeenCalledTimes(1)
  })

  it("opens the keyboard shortcuts dialog", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("button", { name: "Keyboard shortcuts" }))
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" })
    expect(within(dialog).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Key", "Action"])
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("button", { name: "Keyboard shortcuts" })).toHaveFocus()
  })

  it("moves focus through the toolbar with arrow keys", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    screen.getByRole("button", { name: "Zoom in" }).focus()
    await user.keyboard("{ArrowDown}")
    expect(screen.getByRole("button", { name: "Zoom out" })).toHaveFocus()
    await user.keyboard("{ArrowUp}{ArrowUp}")
    expect(screen.getByRole("button", { name: "Keyboard shortcuts" })).toHaveFocus()
  })
})

describe("GraphView keyboard", () => {
  it("pans, zooms and resets from the focused graph", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    wrapper().focus()
    await user.keyboard("{ArrowRight}")
    expect(last(onChange)!.xMin).toBeCloseTo(-8)
    await user.keyboard("{Shift>}{ArrowUp}{/Shift}")
    expect(last(onChange)!.yMin).toBeCloseTo(0)
    await user.keyboard("+")
    expect(spanX(last(onChange)!)).toBeCloseTo(10)
    await user.keyboard("-")
    expect(spanX(last(onChange)!)).toBeCloseTo(20)
    await user.keyboard("0")
    expect(last(onChange)).toBeNull()
  })

  it("announces keyboard zoom in the live region", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    wrapper().focus()
    await user.keyboard("+")
    await waitFor(() =>
      expect(document.getElementById(LIVE_REGION_ID)).toHaveTextContent("Zoomed in. x from -5 to 5."),
    )
  })

  it("traces with T, steps along the curve, switches curves and exits", async () => {
    const user = userEvent.setup()
    render(<Harness plots={[plot("a", "y = x"), plot("b", "y = 2x + 1", { colorIndex: 1 })]} />)
    wrapper().focus()
    await user.keyboard("t")
    let tip = screen.getByTestId("trace-tooltip")
    expect(tip).toHaveTextContent("y = x")
    expect(tip).toHaveTextContent("(0, 0)")
    await user.keyboard("{ArrowRight}")
    expect(screen.getByTestId("trace-tooltip")).toHaveTextContent("(0.025, 0.025)")
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}")
    expect(screen.getByTestId("trace-tooltip")).toHaveTextContent("(-0.225, -0.225)")
    await user.keyboard("]")
    tip = screen.getByTestId("trace-tooltip")
    expect(tip).toHaveTextContent("y = 2x + 1")
    expect(tip).toHaveTextContent("(-0.225, 0.55)")
    await user.keyboard("[[")
    expect(screen.getByTestId("trace-tooltip")).toHaveTextContent("y = x")
    await user.keyboard("{Escape}")
    expect(screen.queryByTestId("trace-tooltip")).toBeNull()
  })

  it("pans the view to keep the trace point visible", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} initial={{ xMin: -0.1, xMax: 0.1, yMin: -0.075, yMax: 0.075 }} />)
    wrapper().focus()
    await user.keyboard("t")
    // 1px = 0.00025; 10px steps; after 40 presses x = 0.1 which is past the right margin.
    for (let i = 0; i < 40; i++) await user.keyboard("{Shift>}{ArrowRight}{/Shift}")
    const vp = last(onChange)!
    expect(vp.xMax).toBeGreaterThan(0.1)
    expect(spanX(vp)).toBeCloseTo(0.2)
  })

  it("shows undefined for points outside the domain", async () => {
    const user = userEvent.setup()
    render(<Harness plots={[plot("a", "y = sqrt(x - 100)")]} />)
    wrapper().focus()
    await user.keyboard("t")
    expect(screen.getByTestId("trace-tooltip")).toHaveTextContent("(0, undefined)")
  })

  it("does not handle Tab, so focus leaves the graph while tracing", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    wrapper().focus()
    await user.keyboard("t")
    await user.tab()
    expect(wrapper()).not.toHaveFocus()
  })

  it("opens shortcuts with ?", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    wrapper().focus()
    await user.keyboard("?")
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument()
  })
})

describe("GraphView pointer", () => {
  it("zooms around the cursor on wheel and prevents page scroll", () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const ev = new WheelEvent("wheel", { deltaY: -100, clientX: 600, clientY: 300, cancelable: true, bubbles: true })
    act(() => {
      canvas().dispatchEvent(ev)
    })
    expect(ev.defaultPrevented).toBe(true)
    const vp = last(onChange)!
    expect(spanX(vp)).toBeLessThan(20)
    // World x under the cursor (x = 5) stays at the same screen position (600px of 800).
    expect(vp.xMin + (600 / 800) * spanX(vp)).toBeCloseTo(5)
  })

  it("pans on mouse drag", () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const c = canvas()
    fireEvent.pointerDown(c, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(c, { pointerId: 1, pointerType: "mouse", buttons: 1, clientX: 140, clientY: 80 })
    fireEvent.pointerUp(c, { pointerId: 1, pointerType: "mouse", clientX: 140, clientY: 80 })
    const vp = last(onChange)!
    expect(vp.xMin).toBeCloseTo(-11)
    expect(vp.yMin).toBeCloseTo(-7.5 - 0.5)
  })

  it("zooms in x2 on double-click", () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.doubleClick(canvas(), { clientX: 400, clientY: 300 })
    expect(spanX(last(onChange)!)).toBeCloseTo(10)
  })

  it("shows a hover trace near a curve and hides it away from curves", () => {
    render(<Harness />)
    const c = canvas()
    // y = x passes through screen (440, 260) for x = 1.
    fireEvent.pointerMove(c, { pointerId: 1, pointerType: "mouse", clientX: 445, clientY: 262 })
    expect(screen.getByTestId("trace-tooltip")).toHaveTextContent("y = x")
    fireEvent.pointerMove(c, { pointerId: 1, pointerType: "mouse", clientX: 700, clientY: 500 })
    expect(screen.queryByTestId("trace-tooltip")).toBeNull()
  })

  it("pinch-zooms with two touch pointers", () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const c = canvas()
    fireEvent.pointerDown(c, { pointerId: 1, pointerType: "touch", clientX: 300, clientY: 300 })
    fireEvent.pointerDown(c, { pointerId: 2, pointerType: "touch", clientX: 500, clientY: 300 })
    fireEvent.pointerMove(c, { pointerId: 2, pointerType: "touch", clientX: 700, clientY: 300 })
    const vp = last(onChange)!
    // Distance 200 -> 400 zooms x2 around the new midpoint.
    expect(spanX(vp)).toBeCloseTo(10)
    fireEvent.pointerUp(c, { pointerId: 1, pointerType: "touch" })
    fireEvent.pointerUp(c, { pointerId: 2, pointerType: "touch" })
  })

  it("enters trace mode on touch press-and-hold", () => {
    vi.useFakeTimers()
    try {
      const onChange = vi.fn()
      render(<Harness onChange={onChange} />)
      const c = canvas()
      fireEvent.pointerDown(c, { pointerId: 1, pointerType: "touch", clientX: 440, clientY: 260 })
      act(() => {
        vi.advanceTimersByTime(350)
      })
      expect(screen.getByTestId("trace-tooltip")).toHaveTextContent("(1, 1)")
      fireEvent.pointerMove(c, { pointerId: 1, pointerType: "touch", clientX: 480, clientY: 220 })
      expect(screen.getByTestId("trace-tooltip")).toHaveTextContent("(2, 2)")
      expect(onChange).not.toHaveBeenCalled() // traced, not panned
      fireEvent.pointerUp(c, { pointerId: 1, pointerType: "touch" })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("GraphView sampling", () => {
  function counted(text: string) {
    const r = parseExpression(text)
    if (!r.ok) throw new Error(text)
    const evaluate = vi.fn(r.expression.evaluate)
    return { expression: { ...r.expression, evaluate }, evaluate }
  }
  const props = (plots: PlotItem[], params: Record<string, number> = {}) => ({
    plots,
    params,
    viewport: null,
    onViewportChange: () => {},
    theme: "light" as const,
    onToggleTheme: () => {},
  })

  it("does not re-sample when plots is a new array with unchanged curves", () => {
    const a = counted("y = x^2")
    const make = (extra: Partial<PlotItem> = {}): PlotItem => ({
      id: "a",
      label: "y = x^2",
      colorIndex: 0,
      visible: true,
      expression: a.expression,
      ...extra,
    })
    const { rerender } = render(<GraphView {...props([make()], { k: 1 })} />)
    const after = a.evaluate.mock.calls.length
    expect(after).toBeGreaterThan(0)
    // New arrays / objects every keystroke, including a new params object with an unrelated change.
    rerender(<GraphView {...props([make()], { k: 2 })} />)
    rerender(<GraphView {...props([make(), make({ id: "hidden", visible: false })], { k: 3 })} />)
    // Colour change repaints without sampling.
    rerender(<GraphView {...props([make({ colorIndex: 3 })], { k: 3 })} />)
    expect(a.evaluate.mock.calls.length).toBe(after)

    // A new expression object re-samples.
    const b = counted("y = x^2")
    rerender(<GraphView {...props([make({ expression: b.expression })])} />)
    expect(b.evaluate.mock.calls.length).toBeGreaterThan(0)
  })

  it("re-samples when a parameter the curve uses changes", () => {
    const a = counted("y = a*x")
    const p: PlotItem = { id: "a", label: "y = a*x", colorIndex: 0, visible: true, expression: a.expression }
    const { rerender } = render(<GraphView {...props([p], { a: 1 })} />)
    const after = a.evaluate.mock.calls.length
    rerender(<GraphView {...props([{ ...p }], { a: 1 })} />)
    expect(a.evaluate.mock.calls.length).toBe(after)
    rerender(<GraphView {...props([{ ...p }], { a: 2 })} />)
    expect(a.evaluate.mock.calls.length).toBeGreaterThan(after)
  })
})
