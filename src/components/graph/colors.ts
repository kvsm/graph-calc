import type { Theme } from "@/lib/palette"

/** Graph chrome colours (UX-SPEC §8.2), read from CSS variables at draw time. */
export interface GraphColors {
  bg: string
  grid: string
  gridMajor: string
  axis: string
}

/** Used when the CSS variables are missing (e.g. in tests or before styles load). */
export const FALLBACK_COLORS: Record<Theme, GraphColors> = {
  light: { bg: "#FFFFFF", grid: "#F0F0F0", gridMajor: "#E5E5E5", axis: "#525252" },
  dark: { bg: "#0A0A0A", grid: "#1A1A1A", gridMajor: "#262626", axis: "#A3A3A3" },
}

const VARS: Record<keyof GraphColors, string> = {
  bg: "--graph-bg",
  grid: "--graph-grid",
  gridMajor: "--graph-grid-major",
  axis: "--graph-axis",
}

/** Anything with getPropertyValue, so this can be tested without a real CSSStyleDeclaration. */
export interface StyleSource {
  getPropertyValue(name: string): string
}

export function resolveGraphColors(style: StyleSource | null, theme: Theme): GraphColors {
  const fallback = FALLBACK_COLORS[theme]
  const out = { ...fallback }
  if (!style) return out
  for (const key of Object.keys(VARS) as (keyof GraphColors)[]) {
    const value = style.getPropertyValue(VARS[key]).trim()
    if (value) out[key] = value
  }
  return out
}

/** Read the graph colours for `el` (inherits the theme class from <html>). */
export function readGraphColors(el: Element | null, theme: Theme): GraphColors {
  let style: StyleSource | null = null
  try {
    if (el && typeof getComputedStyle === "function") style = getComputedStyle(el)
  } catch {
    style = null
  }
  return resolveGraphColors(style, theme)
}
