import { describe, expect, it } from "vitest"
import { sheetHeight } from "./sheet"

describe("sheetHeight (UX-04, CR-05)", () => {
  it("peeks at 35% of the viewport", () => {
    expect(sheetHeight(false, 800)).toBe(280)
  })

  it("expands to 85% but keeps 72px clear for the phone toolbar", () => {
    expect(sheetHeight(true, 400)).toBe(328) // 400 - 72 < 340
    expect(sheetHeight(true, 812)).toBe(690) // 85% of 812 = 690.2 < 740
  })

  it("is 0 for an unknown viewport height", () => {
    expect(sheetHeight(true, 0)).toBe(0)
  })
})
