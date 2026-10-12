/**
 * The pure helpers of the colour swatches in the "Add a layer" form: which swatch a colour is,
 * where the arrow keys go, and the plain-words name of a palette colour. No React.
 */

const NAMES: Record<string, string> = {
  '#d6007a': 'Magenta',
  '#00a6c7': 'Cyan',
  '#7bc31a': 'Lime',
  '#ff7a00': 'Orange',
  '#7c4dff': 'Violet',
}

/** The index of a colour in the palette (case does not matter), or -1 when it is a custom colour */
export function swatchIndex(color: string, palette: readonly string[]): number {
  return palette.indexOf(color.toLowerCase())
}

/**
 * The swatch an arrow key moves to: right and down go forward, left and up back, both wrap around.
 * Undefined for any other key, so the caller leaves the key alone.
 */
export function stepIndex(current: number, count: number, key: string): number | undefined {
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
export function colourName(color: string): string {
  const hex = color.toLowerCase()
  return NAMES[hex] ?? hex
}
