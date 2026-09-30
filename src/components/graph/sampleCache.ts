/**
 * Per-plot cache of sampled segments. `plots` is a new array on every keystroke,
 * so re-sample a curve only when its expression object, the values of the
 * parameters it uses, the viewport or the canvas size actually change.
 */
import { sampleFunction, type CompiledExpression, type Segment } from "@/lib/math"
import type { Size, Viewport } from "@/lib/viewport"
import { extendToDomainEdges } from "./edges"

interface Entry {
  expression: CompiledExpression
  paramValues: number[]
  vp: Viewport
  width: number
  height: number
  segments: Segment[]
}

export type Sampler = typeof sampleFunction

const sameVp = (a: Viewport, b: Viewport) =>
  a === b || (a.xMin === b.xMin && a.xMax === b.xMax && a.yMin === b.yMin && a.yMax === b.yMax)

const sameValues = (a: number[], b: number[]) =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]))

export interface SampleCache {
  /** Segments for one plot, from cache when nothing relevant changed. */
  get(
    id: string,
    expression: CompiledExpression,
    params: Readonly<Record<string, number>>,
    vp: Viewport,
    size: Size,
  ): Segment[]
  /** Forget plots not in `keep` (deleted or hidden). */
  prune(keep: Iterable<string>): void
  /**
   * Return the previous array if every curve is unchanged (same id, colour and
   * segments), so downstream effects don't redraw for an unrelated keystroke.
   */
  stabilize<T extends { id: string; colorIndex: number; segments: Segment[] }>(next: T[]): T[]
}

export function createSampleCache(sampler: Sampler = sampleFunction): SampleCache {
  const entries = new Map<string, Entry>()
  let last: unknown[] | null = null
  return {
    get(id, expression, params, vp, size) {
      const paramValues = expression.parameters.map((p) => params[p])
      const hit = entries.get(id)
      if (
        hit &&
        hit.expression === expression &&
        hit.width === size.width &&
        hit.height === size.height &&
        sameVp(hit.vp, vp) &&
        sameValues(hit.paramValues, paramValues)
      ) {
        return hit.segments
      }
      const f = (x: number) => expression.evaluate(x, params)
      const sampled = sampler(f, {
        xMin: vp.xMin,
        xMax: vp.xMax,
        yMin: vp.yMin,
        yMax: vp.yMax,
        pixelWidth: size.width,
        pixelHeight: size.height,
      })
      const segments = extendToDomainEdges(f, sampled, (vp.xMax - vp.xMin) / Math.max(1, size.width))
      entries.set(id, { expression, paramValues, vp, width: size.width, height: size.height, segments })
      return segments
    },
    stabilize(next) {
      const prev = last as typeof next | null
      if (
        prev &&
        prev.length === next.length &&
        prev.every((c, i) => c.id === next[i].id && c.colorIndex === next[i].colorIndex && c.segments === next[i].segments)
      ) {
        return prev
      }
      last = next
      return next
    },
    prune(keep) {
      const ids = new Set(keep)
      for (const id of entries.keys()) if (!ids.has(id)) entries.delete(id)
    },
  }
}
