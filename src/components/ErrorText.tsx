/**
 * Renders an expression error per UX-SPEC §3.1: tokens as <code>, single-symbol
 * tokens with a hidden spoken name (")" is read as "closing bracket"). A spoken
 * name that only repeats the words before it ("Missing closing bracket )") is
 * not read twice.
 */
import { Fragment } from "react"
import { isRedundantSpoken, isToken, partsToSpeech, type ErrorPart, type ExpressionError } from "@/lib/math"

/** Anything with a plain-text message and, ideally, structured parts. */
export type RenderableError = Pick<ExpressionError, "message"> & { parts?: ErrorPart[] }

const partsOf = (error: RenderableError): ErrorPart[] =>
  error.parts && error.parts.length > 0 ? error.parts : [{ text: error.message }]

export const TOKEN_CLASS = "rounded bg-muted px-1 font-mono text-[0.95em]"

export function ErrorText({ error, className }: { error: RenderableError; className?: string }) {
  const parts = partsOf(error)
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (!isToken(p)) return <Fragment key={i}>{p.text}</Fragment>
        if (!p.spoken) {
          return (
            <code key={i} className={TOKEN_CLASS}>
              {p.code}
            </code>
          )
        }
        return (
          <code key={i} className={TOKEN_CLASS}>
            <span aria-hidden="true">{p.code}</span>
            {!isRedundantSpoken(parts, i) && <span className="sr-only">{p.spoken}</span>}
          </code>
        )
      })}
    </span>
  )
}

/**
 * Spoken form for the live region (§9.2), e.g. "Missing closing bracket.".
 * Prefix it yourself: `Expression 2: ${errorToSpeech(error)}`.
 */
// eslint-disable-next-line react-refresh/only-export-components -- small pure helper that belongs with ErrorText
export function errorToSpeech(error: RenderableError): string {
  return partsToSpeech(partsOf(error))
}
