import { useCallback, useEffect, useRef, useState } from "react"
import { announce } from "@/lib/announce"
import { resolveParameter } from "@/state/derive"
import { advance, formatParamValue, snapToStep, type AnimationCursor } from "@/state/parameters"
import type { Parameter } from "@/state/types"

/** Full min→max sweep duration (UX-SPEC §4). */
export const SWEEP_MS = 4000
/** Reduced motion: discrete jumps every 500ms, still covering a sweep in 4s. */
export const REDUCED_STEP_MS = 500

const SEP = "\u0000"

export interface ParameterAnimation {
  playing: ReadonlySet<string>
  toggle: (name: string) => void
}

/**
 * Ping-pong slider animation via requestAnimationFrame (or a 500ms interval under
 * reduced motion). Announces start/pause, never per frame. Parameters whose slider
 * disappears (not in `ownedNames`) stop playing (CR-01).
 */
export function useParameterAnimation(
  parameters: Readonly<Record<string, Parameter>>,
  ownedNames: readonly string[],
  setValue: (name: string, value: number) => void,
  reducedMotion: boolean,
): ParameterAnimation {
  const [playing, setPlaying] = useState<ReadonlySet<string>>(() => new Set())
  const [dropped, setDropped] = useState<readonly string[]>([])
  const paramsRef = useRef(parameters)
  const cursors = useRef(new Map<string, AnimationCursor>())

  // Adjust state during render when the owned set changes (React's recommended
  // alternative to setState in an effect): stop anything whose slider has gone.
  const ownedKey = [...ownedNames].sort().join(SEP)
  const [prevOwnedKey, setPrevOwnedKey] = useState(ownedKey)
  if (prevOwnedKey !== ownedKey) {
    setPrevOwnedKey(ownedKey)
    const owned = new Set(ownedKey === "" ? [] : ownedKey.split(SEP))
    const gone = [...playing].filter((name) => !owned.has(name))
    if (gone.length > 0) {
      setPlaying(new Set([...playing].filter((name) => owned.has(name))))
      setDropped(gone)
    }
  }

  useEffect(() => {
    paramsRef.current = parameters
  }, [parameters])

  useEffect(() => {
    for (const name of dropped) {
      cursors.current.delete(name)
      const p = resolveParameter(paramsRef.current, name)
      announce(`Paused ${name} = ${formatParamValue(p.value, p.step)}`)
    }
  }, [dropped])

  useEffect(() => {
    if (playing.size === 0) return

    const tick = (fraction: number) => {
      for (const name of playing) {
        const p = resolveParameter(paramsRef.current, name)
        let cursor = cursors.current.get(name)
        // Restart from the current value if it was changed by the user meanwhile.
        if (!cursor || Math.abs(snapToStep(cursor.pos, p) - p.value) > p.step) {
          cursor = { pos: p.value, dir: cursor?.dir ?? 1 }
        }
        cursor = advance(cursor, p, fraction)
        cursors.current.set(name, cursor)
        const value = snapToStep(cursor.pos, p)
        if (value !== p.value) setValue(name, value)
      }
    }

    if (reducedMotion) {
      const id = setInterval(() => tick(REDUCED_STEP_MS / SWEEP_MS), REDUCED_STEP_MS)
      return () => clearInterval(id)
    }
    let raf = 0
    let last: number | null = null
    const loop = (now: number) => {
      if (last !== null) tick(Math.min(100, now - last) / SWEEP_MS)
      last = now
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, reducedMotion, setValue])

  const toggle = useCallback(
    (name: string) => {
      const next = new Set(playing)
      if (next.has(name)) {
        next.delete(name)
        const p = resolveParameter(paramsRef.current, name)
        announce(`Paused ${name} = ${formatParamValue(p.value, p.step)}`)
      } else {
        next.add(name)
        cursors.current.delete(name)
        announce(`Animating ${name}`)
      }
      setPlaying(next)
    },
    [playing],
  )

  return { playing, toggle }
}
