/**
 * The direction arrow of the JOSM style (`image/arrow.svg`, 9.30 by 11.16 units): an open triangle pointing right,
 * a white stroke of 1.22 units at 50 % opacity, no fill. Rasterised here at 2 px per unit so it can be tested without
 * a browser. Pure.
 */
export const ARROW_WIDTH = 20
export const ARROW_HEIGHT = 24
/**
 * The image's pixel ratio. At this ratio the image is ARROW_WIDTH / 2 = 10 logical px wide, so the layer's icon-size
 * 2.5 draws it 25 px wide, the width the JOSM rule gives it (repeat-image-width 25).
 */
export const ARROW_PIXEL_RATIO = 2

const PX_PER_UNIT = 2
/** The stroke's width in the file's units */
const STROKE_WIDTH = 1.22481
const STROKE_OPACITY = 0.5
/** The triangle's corners in the file's units: (0.612, 1.082) (0.612, 10.082) (8.113, 5.582) */
const CORNERS: [number, number][] = [
  [0.612405, 1.0815607],
  [0.612405, 10.081561],
  [8.1132559, 5.5815607],
]

function distanceToSegment(x: number, y: number, a: readonly number[], b: readonly number[]) {
  const [ax = 0, ay = 0] = a
  const [bx = 0, by = 0] = b
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
}

/** RGBA pixels of the arrow, white with the stroke's coverage and opacity; anti-aliased by the distance to the outline */
export function arrowPixels(): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(ARROW_WIDTH * ARROW_HEIGHT * 4)
  const corners = CORNERS.map(([x, y]) => [x * PX_PER_UNIT, y * PX_PER_UNIT])
  const halfStroke = (STROKE_WIDTH * PX_PER_UNIT) / 2
  for (let py = 0; py < ARROW_HEIGHT; py++) {
    for (let px = 0; px < ARROW_WIDTH; px++) {
      const x = px + 0.5
      const y = py + 0.5
      let d = Infinity
      for (let i = 0; i < corners.length; i++) {
        const a = corners[i]!
        const b = corners[(i + 1) % corners.length]!
        d = Math.min(d, distanceToSegment(x, y, a, b))
      }
      const coverage = Math.max(0, Math.min(1, 0.5 + halfStroke - d))
      const offset = (py * ARROW_WIDTH + px) * 4
      data[offset] = 255
      data[offset + 1] = 255
      data[offset + 2] = 255
      data[offset + 3] = Math.round(255 * STROKE_OPACITY * coverage)
    }
  }
  return { width: ARROW_WIDTH, height: ARROW_HEIGHT, data }
}
