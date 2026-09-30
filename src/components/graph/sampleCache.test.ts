import { describe, expect, it, vi } from "vitest"
import { parseExpression, sampleFunction, type CompiledExpression } from "@/lib/math"
import { defaultViewport, panByFraction } from "@/lib/viewport"
import { createSampleCache } from "./sampleCache"

const expr = (text: string): CompiledExpression => {
  const r = parseExpression(text)
  if (!r.ok) throw new Error(text)
  return r.expression
}
const size = { width: 400, height: 300 }
const vp = defaultViewport(size)

describe("createSampleCache", () => {
  it("re-uses segments when nothing relevant changed", () => {
    const sampler = vi.fn(sampleFunction)
    const cache = createSampleCache(sampler)
    const e = expr("y = a*x")
    const s1 = cache.get("1", e, { a: 2 }, vp, size)
    // New params object and viewport object with the same values, unrelated param changed.
    const s2 = cache.get("1", e, { a: 2, b: 7 }, { ...vp }, { ...size })
    expect(s2).toBe(s1)
    expect(sampler).toHaveBeenCalledTimes(1)
  })

  it("re-samples on a new expression object, a used param value, the viewport or the size", () => {
    const sampler = vi.fn(sampleFunction)
    const cache = createSampleCache(sampler)
    const e = expr("y = a*x")
    cache.get("1", e, { a: 2 }, vp, size)
    cache.get("1", e, { a: 3 }, vp, size)
    expect(sampler).toHaveBeenCalledTimes(2)
    cache.get("1", e, { a: 3 }, panByFraction(vp, 0.1, 0), size)
    expect(sampler).toHaveBeenCalledTimes(3)
    cache.get("1", e, { a: 3 }, panByFraction(vp, 0.1, 0), { width: 500, height: 300 })
    expect(sampler).toHaveBeenCalledTimes(4)
    cache.get("1", expr("y = a*x"), { a: 3 }, panByFraction(vp, 0.1, 0), { width: 500, height: 300 })
    expect(sampler).toHaveBeenCalledTimes(5)
  })

  it("caches per plot id and prunes removed ids", () => {
    const sampler = vi.fn(sampleFunction)
    const cache = createSampleCache(sampler)
    const e = expr("y = x")
    cache.get("1", e, {}, vp, size)
    cache.get("2", e, {}, vp, size)
    expect(sampler).toHaveBeenCalledTimes(2)
    cache.prune(["2"])
    cache.get("2", e, {}, vp, size)
    expect(sampler).toHaveBeenCalledTimes(2)
    cache.get("1", e, {}, vp, size)
    expect(sampler).toHaveBeenCalledTimes(3)
  })

  it("stabilize returns the previous array when every curve is unchanged", () => {
    const cache = createSampleCache()
    const segs = cache.get("1", expr("y = x"), {}, vp, size)
    const a = cache.stabilize([{ id: "1", colorIndex: 0, segments: segs }])
    expect(cache.stabilize([{ id: "1", colorIndex: 0, segments: segs }])).toBe(a)
    const recoloured = cache.stabilize([{ id: "1", colorIndex: 2, segments: segs }])
    expect(recoloured).not.toBe(a)
    expect(recoloured[0].colorIndex).toBe(2)
  })
})
