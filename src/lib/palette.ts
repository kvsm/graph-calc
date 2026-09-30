// Curve palette — UX-SPEC §8.1. Expressions store the slot index, not the hex.
export interface PaletteColor {
  name: string
  light: string
  dark: string
}

export const PALETTE: readonly PaletteColor[] = [
  { name: "Blue", light: "#0072B2", dark: "#56B4E9" },
  { name: "Vermillion", light: "#D55E00", dark: "#F07A3A" },
  { name: "Green", light: "#007A5A", dark: "#2FC4A0" },
  { name: "Magenta", light: "#B8528E", dark: "#CC79A7" },
  { name: "Orange", light: "#A66A00", dark: "#E69F00" },
  { name: "Violet", light: "#6A3D9A", dark: "#B39DFF" },
  { name: "Grey", light: "#3D3D3D", dark: "#E0E0E0" },
]

export type Theme = "light" | "dark"

export function paletteColor(index: number, theme: Theme): string {
  const slot = PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length]
  return theme === "dark" ? slot.dark : slot.light
}
