import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ErrorBoundary } from "./ErrorBoundary"

function Boom(): never {
  throw new Error("boom")
}

describe("ErrorBoundary (CR-02)", () => {
  it("renders children normally", () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText("fine")).toBeInTheDocument()
  })

  it("shows a recovery screen with a Reset app button instead of a blank page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const onReset = vi.fn()
    render(
      <ErrorBoundary onReset={onReset}>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole("button", { name: "Reset app" }))
    expect(onReset).toHaveBeenCalledOnce()
    vi.restoreAllMocks()
  })
})
