import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { parseExpression, type ExpressionError } from "@/lib/math"
import { ErrorText, errorToSpeech } from "./ErrorText"

function errorFor(input: string): ExpressionError {
  const r = parseExpression(input)
  if (r.ok) throw new Error(`expected ${input} to fail`)
  return r.error
}

/** What a screen reader gets: text content minus aria-hidden nodes. */
function spokenText(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove())
  return clone.textContent!.replace(/\s+/g, " ").trim()
}

describe("ErrorText", () => {
  it("renders tokens as code without quotes", () => {
    const { container } = render(<ErrorText error={errorFor("foo(x)")} />)
    expect(container.textContent).toBe(
      "Unknown function foo. Try sin, cos, tan, sqrt, abs, ln, log or exp.",
    )
    const codes = Array.from(container.querySelectorAll("code")).map((c) => c.textContent)
    expect(codes).toEqual(["foo", "sin", "cos", "tan", "sqrt", "abs", "ln", "log", "exp"])
    expect(container.querySelector("code")).toHaveClass("font-mono", "bg-muted", "rounded")
  })

  it("hides the symbol from screen readers and adds its spoken name", () => {
    const { container } = render(<ErrorText error={errorFor("2 +")} />)
    const code = container.querySelector("code")!
    expect(code.querySelector('[aria-hidden="true"]')!.textContent).toBe("+")
    expect(code.querySelector(".sr-only")!.textContent).toBe("plus sign")
    expect(spokenText(container)).toBe("Expression ends unexpectedly after plus sign.")
  })

  it("does not repeat a spoken name that the text already says", () => {
    const { container } = render(<ErrorText error={errorFor("sin(")} />)
    expect(container.textContent).toBe("Missing closing bracket ).")
    expect(container.querySelector(".sr-only")).toBeNull()
    expect(spokenText(container)).toBe("Missing closing bracket .")
  })

  it("reads the symbol in the unbalanced-bracket message", () => {
    const { container } = render(<ErrorText error={errorFor("sin(x))")} />)
    expect(spokenText(container)).toBe(
      "Unexpected closing bracket - there are more closing brackets than opening ones.",
    )
  })

  it("falls back to the plain message when there are no parts", () => {
    const { container } = render(<ErrorText error={{ message: "Something odd." }} className="x" />)
    expect(container.textContent).toBe("Something odd.")
    expect(container.firstElementChild).toHaveClass("x")
  })
})

describe("errorToSpeech", () => {
  it.each([
    ["sin(", "Missing closing bracket."],
    ["sin(x))", "Unexpected closing bracket - there are more closing brackets than opening ones."],
    ["y =", "Nothing after equals sign. Type an expression, e.g. y = 2x + 1."],
    ["2 +", "Expression ends unexpectedly after plus sign."],
    ["2 ** x", "Use caret for powers, e.g. 2^x."],
    ["SIN(x)", "Unknown function SIN. Did you mean sin?"],
    ["e = 5", "e is a constant (about 2.718), so it can't be set. Use another letter for a slider, e.g. a."],
    ["x $ 2", "Couldn't understand this expression. Check for typos near symbol $."],
  ])("%s -> %s", (input, speech) => {
    expect(errorToSpeech(errorFor(input))).toBe(speech)
  })

  it("uses the message when there are no parts", () => {
    expect(errorToSpeech({ message: "Plain." })).toBe("Plain.")
  })
})
