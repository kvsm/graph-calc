import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { PALETTE } from "@/lib/palette"
import { ColorPicker } from "./ColorPicker"

describe("ColorPicker", () => {
  it("uses a roving tabindex on the checked swatch", () => {
    render(<ColorPicker value={3} theme="light" index={2} onSelect={() => {}} />)
    expect(screen.getByRole("radiogroup", { name: "Curve colour for expression 2" })).toBeInTheDocument()
    const radios = screen.getAllByRole("radio")
    expect(radios).toHaveLength(PALETTE.length)
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, -1, -1, 0, -1, -1, -1])
    expect(radios[3]).toHaveAttribute("aria-checked", "true")
  })

  it("arrow keys wrap, Home/End jump, Enter and Space select", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<ColorPicker value={0} theme="dark" index={1} onSelect={onSelect} />)
    const radios = screen.getAllByRole("radio")
    radios[0].focus()
    await user.keyboard("{ArrowLeft}")
    expect(radios[6]).toHaveFocus()
    await user.keyboard("{ArrowDown}")
    expect(radios[0]).toHaveFocus()
    await user.keyboard("{End}")
    expect(radios[6]).toHaveFocus()
    await user.keyboard("{Home}{ArrowRight}")
    expect(radios[1]).toHaveFocus()
    expect(onSelect).not.toHaveBeenCalled()
    await user.keyboard("{Enter}")
    expect(onSelect).toHaveBeenLastCalledWith(1)
    await user.keyboard("{ArrowUp} ")
    expect(onSelect).toHaveBeenLastCalledWith(0)
  })
})
