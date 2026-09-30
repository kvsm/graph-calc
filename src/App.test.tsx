import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LIVE_REGION_ID } from "@/lib/announce"
import { STORAGE_KEY } from "@/state/persistence"
import type { GraphViewProps } from "@/state/types"
import App from "./App"

const graph = vi.hoisted(() => ({ props: null as GraphViewProps | null }))

vi.mock("@/components/graph/GraphView", () => ({
  GraphView: (props: GraphViewProps) => {
    graph.props = props
    return <div data-testid="graph" />
  },
}))

/** Make matchMedia report `matches` for the given queries. */
function mockMedia(matching: string[]) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: matching.includes(query),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  )
}

const DESKTOP = "(min-width: 640px)"

beforeEach(() => {
  graph.props = null
  mockMedia([DESKTOP])
})

afterEach(() => {
  vi.restoreAllMocks()
})

const input = (n: number) => screen.getByRole("textbox", { name: `Expression ${n}` })
const liveRegion = () => document.getElementById(LIVE_REGION_ID)!

async function waitForPlots(count: number) {
  await waitFor(() => expect(graph.props?.plots).toHaveLength(count))
}

describe("App shell", () => {
  it("renders landmarks, heading, live region and the first-run state (§6, §9.10)", () => {
    render(<App />)
    expect(screen.getByRole("heading", { level: 1, name: "Graphing calculator" })).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "Expressions" })).toBeInTheDocument()
    expect(screen.getByRole("main", { name: "Graph" })).toBeInTheDocument()
    expect(screen.getByRole("list", { name: "Expression list" })).toBeInTheDocument()
    expect(input(1)).toHaveValue("y = sin(x)")
    expect(input(2)).toHaveValue("")
    expect(input(2)).toHaveAttribute("placeholder", "Type an expression, e.g. y = x^2")
    expect(input(1)).not.toHaveAttribute("placeholder")
    expect(screen.getByText("Tip: use a letter like a to make a slider.")).toBeInTheDocument()
    const region = liveRegion()
    expect(region).toHaveAttribute("aria-live", "polite")
    expect(region).toHaveAttribute("aria-atomic", "true")
  })

  it("passes plots, params, viewport and theme to GraphView", () => {
    render(<App />)
    const props = graph.props!
    expect(props.plots).toHaveLength(1)
    expect(props.plots[0]).toMatchObject({ label: "y = sin(x)", colorIndex: 0, visible: true })
    expect(props.plots[0].expression.evaluate(Math.PI / 2)).toBe(1)
    expect(props.viewport).toBeNull()
    expect(props.theme).toBe("light")
  })

  it("wires viewport changes and theme toggling", async () => {
    render(<App />)
    act(() => graph.props!.onViewportChange({ xMin: 0, xMax: 2, yMin: 0, yMax: 1 }))
    expect(graph.props!.viewport).toEqual({ xMin: 0, xMax: 2, yMin: 0, yMax: 1 })
    act(() => graph.props!.onViewportChange(null))
    expect(graph.props!.viewport).toBeNull()
    act(() => graph.props!.onToggleTheme())
    expect(graph.props!.theme).toBe("dark")
    expect(document.documentElement).toHaveClass("dark")
  })

  it("follows prefers-color-scheme initially", () => {
    mockMedia([DESKTOP, "(prefers-color-scheme: dark)"])
    render(<App />)
    expect(document.documentElement).toHaveClass("dark")
  })
})

describe("expression input (§2–§3)", () => {
  it("typing into the trailing row creates an expression and a new empty row, then plots it", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(input(2), "x^2")
    expect(input(3)).toHaveValue("")
    expect(input(3)).toHaveAttribute("placeholder")
    expect(input(2)).not.toHaveAttribute("placeholder")
    await waitForPlots(2)
    expect(graph.props!.plots[1]).toMatchObject({ label: "x^2", colorIndex: 1 })
  })

  it("keeps the last valid plot while the text is invalid", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(input(1), " +")
    await new Promise((r) => setTimeout(r, 200))
    expect(graph.props!.plots).toHaveLength(1)
    expect(graph.props!.plots[0].label).toBe("y = sin(x)")
  })

  it("shows the §3.1 error after a pause, with aria-invalid and aria-describedby", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.clear(input(1))
    await user.type(input(1), "sin(")
    // Not immediately (no flashing while typing)…
    expect(input(1)).not.toHaveAttribute("aria-invalid")
    // …but after 600ms of no typing.
    const error = await screen.findByText("Missing closing bracket ).", {}, { timeout: 1500 })
    expect(input(1)).toHaveAttribute("aria-invalid", "true")
    expect(input(1)).toHaveAttribute("aria-describedby", error.closest("p")!.id)
    expect(error.closest("p")!.id).toMatch(/^expr-.+-error$/)
  })

  it("shows the error immediately on blur and announces it", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.clear(input(1))
    await user.type(input(1), "foo(x)")
    await user.tab()
    expect(
      screen.getByText('Unknown function "foo". Try sin, cos, tan, sqrt, abs, ln, log or exp.'),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(liveRegion()).toHaveTextContent(
        'Expression 1: Unknown function "foo". Try sin, cos, tan, sqrt, abs, ln, log or exp.',
      ),
    )
  })

  it("clears the error as soon as the text becomes valid", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.clear(input(1))
    await user.type(input(1), "2 +")
    await user.tab()
    expect(screen.getByText("Expression ends unexpectedly after +.")).toBeInTheDocument()
    await user.type(input(1), " 1")
    expect(screen.queryByText("Expression ends unexpectedly after +.")).not.toBeInTheDocument()
    expect(input(1)).not.toHaveAttribute("aria-invalid")
  })

  it("Enter focuses the trailing row, or inserts a row below", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(input(1))
    await user.keyboard("{Enter}")
    expect(input(2)).toHaveFocus()
    await user.type(input(2), "x")
    // Now rows: sin, x, "" — Enter on row 1 inserts a new row directly below it.
    await user.click(input(1))
    await user.keyboard("{Enter}")
    expect(input(2)).toHaveValue("")
    expect(input(2)).toHaveFocus()
    expect(input(3)).toHaveValue("x")
  })

  it("Up/Down move between inputs", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(input(1))
    await user.keyboard("{ArrowDown}")
    expect(input(2)).toHaveFocus()
    await user.keyboard("{ArrowUp}")
    expect(input(1)).toHaveFocus()
  })

  it("Backspace on an empty non-only row deletes it and focuses the end of the previous input", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(input(2), "x")
    await user.click(input(1))
    await user.keyboard("{Enter}") // inserts an empty row 2
    expect(input(2)).toHaveValue("")
    await user.keyboard("{Backspace}")
    expect(input(1)).toHaveFocus()
    expect((input(1) as HTMLInputElement).selectionStart).toBe("y = sin(x)".length)
    expect(input(2)).toHaveValue("x")
  })

  it("Escape moves focus to the row's swatch toggle", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(input(1))
    await user.keyboard("{Escape}")
    expect(screen.getByRole("button", { name: "Show expression 1" })).toHaveFocus()
  })
})

describe("row controls", () => {
  it("swatch toggle hides and shows the curve (aria-pressed)", async () => {
    const user = userEvent.setup()
    render(<App />)
    const swatch = screen.getByRole("button", { name: "Show expression 1" })
    expect(swatch).toHaveAttribute("aria-pressed", "true")
    await user.click(swatch)
    expect(swatch).toHaveAttribute("aria-pressed", "false")
    expect(graph.props!.plots[0].visible).toBe(false)
  })

  it("overflow menu offers Colour…, Table of values and Delete", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole("button", { name: "More options for expression 1" }))
    const menu = await screen.findByRole("menu")
    expect(within(menu).getAllByRole("menuitem").map((m) => m.textContent)).toEqual([
      "Colour…",
      "Table of values",
      "Delete",
    ])
  })

  it("Colour… opens a radiogroup of 7 colours and changes the colour", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole("button", { name: "More options for expression 1" }))
    await user.click(await screen.findByRole("menuitem", { name: "Colour…" }))
    const group = await screen.findByRole("radiogroup", { name: "Curve colour for expression 1" })
    const radios = within(group).getAllByRole("radio")
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([
      "Blue",
      "Vermillion",
      "Green",
      "Magenta",
      "Orange",
      "Violet",
      "Grey",
    ])
    await waitFor(() => expect(radios[0]).toHaveFocus())
    await user.keyboard("{ArrowRight}{ArrowRight}{Enter}")
    expect(graph.props!.plots[0].colorIndex).toBe(2)
    await waitFor(() => expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole("button", { name: "More options for expression 1" })).toHaveFocus())
  })

  it("Delete removes the row, announces it and focuses the next input", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(input(2), "x^2")
    await user.click(screen.getByRole("button", { name: "More options for expression 1" }))
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }))
    expect(input(1)).toHaveValue("x^2")
    await waitFor(() => expect(input(1)).toHaveFocus())
    await waitFor(() => expect(liveRegion()).toHaveTextContent("Expression 1 deleted."))
  })

  it("deleting everything leaves only the empty row and no plots (GraphView shows the hint)", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole("button", { name: "More options for expression 1" }))
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }))
    await waitForPlots(0)
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
    expect(input(1)).toHaveAttribute("placeholder", "Type an expression, e.g. y = x^2")
  })

  it("Add expression focuses the trailing empty row", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole("button", { name: "Add expression" }))
    expect(input(2)).toHaveFocus()
  })
})

describe("table of values (§7)", () => {
  it("opens a titled dialog with a captioned 21-row table and returns focus on close", async () => {
    const user = userEvent.setup()
    render(<App />)
    const trigger = screen.getByRole("button", { name: "More options for expression 1" })
    await user.click(trigger)
    await user.click(await screen.findByRole("menuitem", { name: "Table of values" }))
    const dialog = await screen.findByRole("dialog", { name: "Table of values: y = sin(x)" })
    const table = within(dialog).getByRole("table")
    expect(table.querySelector("caption")).toHaveClass("sr-only")
    const headers = within(table).getAllByRole("columnheader")
    expect(headers.map((h) => [h.textContent, h.getAttribute("scope")])).toEqual([
      ["x", "col"],
      ["y", "col"],
    ])
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows).toHaveLength(21)
    // Default start = round(xMin) = -10, step = 1 → x = 0 is row 11 with sin(0) = 0.
    expect(within(rows[0]).getAllByRole("cell").map((c) => c.textContent)).toEqual(["-10", "0.544"])
    expect(within(rows[10]).getAllByRole("cell").map((c) => c.textContent)).toEqual(["0", "0"])
    expect(within(dialog).getByLabelText("Start")).toHaveValue("-10")
    expect(within(dialog).getByLabelText("Step")).toHaveValue("1")

    await user.click(within(dialog).getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("shows undefined for gaps and updates when Start/Step change", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.clear(input(1))
    await user.type(input(1), "sqrt(x)")
    await waitFor(() => expect(graph.props!.plots[0].label).toBe("sqrt(x)"))
    await user.click(screen.getByRole("button", { name: "More options for expression 1" }))
    await user.click(await screen.findByRole("menuitem", { name: "Table of values" }))
    const dialog = await screen.findByRole("dialog")
    const firstRowCells = () => within(within(dialog).getAllByRole("row")[1]).getAllByRole("cell")
    expect(firstRowCells()[1]).toHaveTextContent("undefined")
    const start = within(dialog).getByLabelText("Start")
    await user.clear(start)
    await user.type(start, "4{Enter}")
    expect(firstRowCells().map((c) => c.textContent)).toEqual(["4", "2"])
  })

  it("is disabled for invalid or empty expressions", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole("button", { name: "More options for expression 2" }))
    expect(await screen.findByRole("menuitem", { name: "Table of values" })).toHaveAttribute("data-disabled")
  })
})

describe("sliders (§4)", () => {
  async function renderWithSlider() {
    const user = userEvent.setup()
    render(<App />)
    await user.clear(input(1))
    await user.type(input(1), "a*sin(x)")
    const slider = await screen.findByRole("slider", { name: "a" })
    return { user, slider }
  }

  it("creates a slider with the defaults and accessible names", async () => {
    const { slider } = await renderWithSlider()
    expect(slider).toHaveAttribute("aria-valuenow", "1")
    expect(slider).toHaveAttribute("aria-valuemin", "-10")
    expect(slider).toHaveAttribute("aria-valuemax", "10")
    expect(slider).toHaveAttribute("aria-valuetext", "a = 1.0")
    expect(screen.getByRole("textbox", { name: "Value of a" })).toHaveValue("1.0")
    expect(screen.getByRole("textbox", { name: "Minimum for a" })).toHaveValue("-10")
    expect(screen.getByRole("textbox", { name: "Maximum for a" })).toHaveValue("10")
    expect(screen.getByRole("button", { name: "Animate a" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: "Slider settings for a" })).toBeInTheDocument()
    expect(graph.props!.params).toEqual({ a: 1 })
  })

  it("keyboard on the slider changes the value by one step and updates params", async () => {
    const { user, slider } = await renderWithSlider()
    slider.focus()
    await user.keyboard("{ArrowRight}")
    expect(slider).toHaveAttribute("aria-valuetext", "a = 1.1")
    expect(graph.props!.params.a).toBeCloseTo(1.1)
  })

  it("typing a value outside the bounds extends the bound", async () => {
    const { user } = await renderWithSlider()
    const value = screen.getByRole("textbox", { name: "Value of a" })
    await user.clear(value)
    await user.type(value, "25{Enter}")
    expect(screen.getByRole("textbox", { name: "Maximum for a" })).toHaveValue("25")
    expect(graph.props!.params.a).toBe(25)
  })

  it("rejects min >= max with an inline message and reverts", async () => {
    const { user } = await renderWithSlider()
    const min = screen.getByRole("textbox", { name: "Minimum for a" })
    await user.clear(min)
    await user.type(min, "20")
    await user.tab()
    expect(screen.getByText("Min must be less than max")).toBeInTheDocument()
    expect(min).toHaveValue("-10")
  })

  it("play toggles to Pause and announces", async () => {
    const { user } = await renderWithSlider()
    await user.click(screen.getByRole("button", { name: "Animate a" }))
    const pause = screen.getByRole("button", { name: "Pause a" })
    expect(pause).toHaveAttribute("aria-pressed", "true")
    await waitFor(() => expect(liveRegion()).toHaveTextContent("Animating a"))
    // The value moves while playing.
    await waitFor(() => expect(graph.props!.params.a).not.toBe(1), { timeout: 1500 })
    await user.click(pause)
    expect(screen.getByRole("button", { name: "Animate a" })).toBeInTheDocument()
    await waitFor(() => expect(liveRegion()).toHaveTextContent(/^Paused a = -?\d+\.\d$/), { timeout: 1500 })
  })

  it("shares one slider between expressions using the same name", async () => {
    const { user } = await renderWithSlider()
    await user.type(input(2), "a x")
    await waitForPlots(2)
    expect(screen.getAllByRole("slider", { name: "a" })).toHaveLength(1)
  })
})

describe("panel collapse and persistence", () => {
  it("collapses to a floating Show button, removes the panel from the tab order, and restores", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole("button", { name: "Hide expressions panel" }))
    const show = await screen.findByRole("button", { name: "Show expressions panel" })
    const aside = document.querySelector("aside")!
    expect(aside).toHaveAttribute("inert")
    await waitFor(() => expect(show).toHaveFocus())
    await user.click(show)
    expect(aside).not.toHaveAttribute("inert")
    expect(screen.queryByRole("button", { name: "Show expressions panel" })).not.toBeInTheDocument()
  })

  it("persists expressions and panel state across reloads", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)
    await user.type(input(2), "x^3")
    await user.click(screen.getByRole("button", { name: "Hide expressions panel" }))
    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toContain("x^3"))
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).panelCollapsed).toBe(true))
    unmount()
    render(<App />)
    expect(screen.getByRole("button", { name: "Show expressions panel" })).toBeInTheDocument()
    expect(screen.getAllByRole("textbox", { hidden: true }).map((i) => (i as HTMLInputElement).value)).toEqual([
      "y = sin(x)",
      "x^3",
      "",
    ])
  })
})

describe("phone layout (§1.3)", () => {
  it("renders a bottom sheet with a resize handle that toggles on click", async () => {
    mockMedia([])
    const user = userEvent.setup()
    render(<App />)
    const handle = screen.getByRole("button", { name: "Resize expressions panel" })
    expect(handle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("button", { name: "Hide expressions panel" })).not.toBeInTheDocument()
    await user.click(handle)
    expect(handle).toHaveAttribute("aria-expanded", "true")
    await user.keyboard("{Enter}")
    expect(handle).toHaveAttribute("aria-expanded", "false")
  })

  it("auto-expands the sheet when an input is focused", async () => {
    mockMedia([])
    const user = userEvent.setup()
    render(<App />)
    await user.click(input(1))
    expect(screen.getByRole("button", { name: "Resize expressions panel" })).toHaveAttribute("aria-expanded", "true")
  })
})
