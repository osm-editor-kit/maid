/**
 * The pure helpers of the colour swatches in the "Add a layer" form: which swatch a colour is,
 * where the arrow keys go, and the plain-words name of a palette colour. No React.
 */
import { m } from './messages.ts'

/** The name of each palette colour, read when it is shown (the language is set at mount) */
const NAMES: Record<string, () => string> = {
  '#d6007a': () => m.data_layers_colour_magenta(),
  '#00a6c7': () => m.data_layers_colour_cyan(),
  '#7bc31a': () => m.data_layers_colour_lime(),
  '#ff7a00': () => m.data_layers_colour_orange(),
  '#7c4dff': () => m.data_layers_colour_violet(),
}

/** The index of a colour in the palette (case does not matter), or -1 when it is a custom colour */
export function swatchIndex(color: string, palette: readonly string[]) {
  return palette.indexOf(color.toLowerCase())
}

/**
 * The swatch an arrow key moves to: right and down go forward, left and up back, both wrap around.
 * Undefined for any other key, so the caller leaves the key alone.
 */
export function stepIndex(current: number, count: number, key: string) {
  if (count < 1) return undefined
  const step =
    key === 'ArrowRight' || key === 'ArrowDown'
      ? 1
      : key === 'ArrowLeft' || key === 'ArrowUp'
        ? -1
        : 0
  if (step === 0) return undefined
  return (((current + step) % count) + count) % count
}

/** The name of a palette colour for a screen reader; any other colour is named by its hex value */
export function colourName(color: string) {
  const hex = color.toLowerCase()
  return NAMES[hex]?.() ?? hex
}
