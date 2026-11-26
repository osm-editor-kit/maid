/**
 * The direction markers as standalone SVG: the same shapes the map draws as canvas images (`direction-images.ts`),
 * for the one-way options of the TILDA checklist and for projects that take the files over as they are
 * (`assets/direction/*.svg`, written by `tools/renderer/direction-svgs.ts`). Pure, so a test can check the files.
 *
 * The geometry is the map's, in map px, moved to the middle of a square box. Every shape points east: the way's
 * drawing direction runs left to right. Colours are fixed (no CSS variables), as in the map's line arrows.
 */
import { HOOK_REACH } from './direction'

export type DirectionShape = 'forward' | 'both' | 'reversed' | 'drawn'

export const DIRECTION_SHAPES: readonly DirectionShape[] = ['forward', 'both', 'reversed', 'drawn']

/** The side of the square viewBox: the 12 px wide map arrows with room for their outline */
export const DIRECTION_VIEWBOX = 16

/** The outline of the line arrows (`direction-images.ts` `lineArrowImage`) */
export const DIRECTION_OUTLINE = '#1c1c1c'
export const DIRECTION_FILL = '#fff'
/** The selected way's arrow has a thin dark outline: 0.5 units of a path scaled 1.2, so 0.6 px (`selectedArrowImage`) */
const DRAWN_OUTLINE = '#333'

/** One painted path: `fill` and `stroke` are fixed colours, 'none' for no paint */
export type DirectionPart = {
  d: string
  fill: string
  stroke: string
  strokeWidth: number
}

/** Length of a line arrow along the line, in px (`direction-images.ts` HOOK_WIDTH) */
const WIDTH = 12
/** Half the height of an arrowhead and its length */
const HEAD_HALF = 2.4
const HEAD_LENGTH = 4
/** Where the arrow's box starts in the viewBox, so that outline and all sit in the middle */
const LEFT = 2
/** The line of a straight arrow; the hook sits lower because it grows upwards from its line */
const MIDDLE = DIRECTION_VIEWBOX / 2
const HOOK_LINE = 11

/** Numbers with at most 2 decimals and no trailing zeros, so the files stay short and stable */
const n = (value: number) => String(Math.round(value * 100) / 100)

/** The straight arrow, with `both` one head at each end (`drawStraight`) */
function straight(both: boolean): { line: string; heads: string } {
  const right = LEFT + WIDTH
  const line = `M${n(both ? LEFT + 3 : LEFT + 0.5)} ${MIDDLE}H${n(right - 3)}`
  const head = (tip: number, base: number) =>
    `M${n(tip)} ${MIDDLE}L${n(base)} ${n(MIDDLE - HEAD_HALF)}V${n(MIDDLE + HEAD_HALF)}z`
  const heads = head(right, right - HEAD_LENGTH) + (both ? head(LEFT, LEFT + HEAD_LENGTH) : '')
  return { line, heads }
}

/**
 * The hook (`drawHook`): a stroke along the line in its drawing direction, a half turn upwards and back with the
 * arrowhead pointing against the line. It turns up so the hook sits to the left of the drawing direction.
 */
function hook(): { line: string; heads: string } {
  const r = (HOOK_REACH - 1.5) / 2
  const turn = LEFT + WIDTH - r - 1
  const back = HOOK_LINE - 2 * r
  const headX = LEFT + 4.5
  const line = `M${n(LEFT + 0.5)} ${HOOK_LINE}H${n(turn)}A${n(r)} ${n(r)} 0 0 0 ${n(turn)} ${n(back)}H${n(headX)}`
  const heads = `M${LEFT} ${n(back)}L${n(headX + 0.5)} ${n(back - HEAD_HALF)}V${n(back + HEAD_HALF)}z`
  return { line, heads }
}

/**
 * iD's selection arrow (`ARROW_D` of `direction-images.ts`, a 10 x 5 box) at the map's 1.2 scale, moved to the middle:
 * 12 x 6 px.
 */
const DRAWN_D = 'M9.2 8.6H2V7.4h7.2L8 5l6 3-6 3z'

/** The painted paths of a shape, bottom to top: the outline first, then the white arrow on it */
export function directionParts(shape: DirectionShape): DirectionPart[] {
  if (shape === 'drawn') {
    return [{ d: DRAWN_D, fill: DIRECTION_FILL, stroke: DRAWN_OUTLINE, strokeWidth: 0.6 }]
  }
  const { line, heads } = shape === 'reversed' ? hook() : straight(shape === 'both')
  return [
    { d: line, fill: 'none', stroke: DIRECTION_OUTLINE, strokeWidth: 3.2 },
    { d: heads, fill: DIRECTION_OUTLINE, stroke: DIRECTION_OUTLINE, strokeWidth: 1.6 },
    { d: line, fill: 'none', stroke: DIRECTION_FILL, strokeWidth: 1.6 },
    { d: heads, fill: DIRECTION_FILL, stroke: DIRECTION_FILL, strokeWidth: 0.1 },
  ]
}

/** What each shape means, for the title of the file and for the README */
export const DIRECTION_MEANING: Record<DirectionShape, string> = {
  forward: 'One way, along the way’s drawing direction',
  both: 'Both directions',
  reversed: 'One way, against the way’s drawing direction (drawn this way, ridden that way)',
  drawn: 'The way’s drawing direction',
}

/** The SVG file of a shape: self-contained, with a viewBox and fixed colours, pointing east */
export function directionSvg(shape: DirectionShape): string {
  const paths = directionParts(shape)
    .map(
      (part) =>
        `<path d="${part.d}" fill="${part.fill}" stroke="${part.stroke}" stroke-width="${part.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('')
  const size = DIRECTION_VIEWBOX
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><title>${DIRECTION_MEANING[shape]}</title>${paths}</svg>\n`
}
