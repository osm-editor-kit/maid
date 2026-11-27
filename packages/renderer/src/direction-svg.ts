/**
 * The direction glyphs as standalone SVG: the same paths the map draws as canvas images (glyph.ts), for the UI
 * (`DirectionIcon`: the one-way options of the TILDA checklist), the design page (docs/design/line-arrows.md) and
 * projects that take the files over as they are (`assets/direction/*.svg`, written by
 * `tools/renderer/direction-svgs.ts`). Pure, so a test can check the files.
 *
 * Every glyph points east: the way's drawing direction runs left to right. Colours are fixed (no CSS variables).
 */
import { GLYPH_EDGE, GLYPH_KINDS, glyphPaths, type GlyphShape, type GlyphState } from './glyph'

/** A shape and its state: `with` is the active glyph (with the drawing triangle), `with-rest` the riding direction alone */
export type DirectionShape = GlyphShape | `${GlyphShape}-rest`

/** Every file in assets/direction: each kind active and at rest, and the drawing triangle alone */
export const DIRECTION_SHAPES: readonly DirectionShape[] = [
  ...GLYPH_KINDS.flatMap((kind): DirectionShape[] => [kind, `${kind}-rest`]),
  'drawn',
]

/** The side of the square viewBox: the widest glyph (about 22 px) with room for its edge */
export const DIRECTION_VIEWBOX = 24

/** One painted path: `fill` and `stroke` are fixed colours, 'none' for no paint */
export type DirectionPart = {
  d: string
  fill: string
  stroke: string
  strokeWidth: number
}

function parse(shape: DirectionShape): { kind: GlyphShape; state: GlyphState } {
  return shape.endsWith('-rest')
    ? { kind: shape.slice(0, -'-rest'.length) as GlyphShape, state: 'rest' }
    : { kind: shape as GlyphShape, state: 'active' }
}

/** The painted paths of a shape in the viewBox, bottom to top: every part's edge, then every part's fill */
export function directionParts(shape: DirectionShape): DirectionPart[] {
  const { kind, state } = parse(shape)
  const centre = DIRECTION_VIEWBOX / 2
  const paths = glyphPaths(kind, state).map((path) => ({
    ...path,
    // glyph.ts draws round 0, 0: move the path to the middle of the box
    d: moved(path.d, centre),
  }))
  return [
    ...paths.map((path) => ({
      d: path.d,
      fill: 'none',
      stroke: path.edge,
      strokeWidth: GLYPH_EDGE,
    })),
    ...paths.map((path) => ({ d: path.d, fill: path.fill, stroke: 'none', strokeWidth: 0 })),
  ]
}

/** A path of absolute M and L commands, and the relative arcs of a dot, moved by `by` in x and y */
function moved(d: string, by: number) {
  return d.replace(/([ML])(-?[\d.]+) (-?[\d.]+)/g, (_, command: string, x: string, y: string) => {
    const round = (value: number) => String(Math.round(value * 100) / 100)
    return `${command}${round(Number(x) + by)} ${round(Number(y) + by)}`
  })
}

const KIND_MEANING: Record<GlyphShape, string> = {
  with: 'One way, along the way’s drawing direction',
  against: 'One way, against the way’s drawing direction (oneway=-1)',
  both: 'Both directions',
  reversible: 'Both directions, one at a time (reversible, alternating)',
  contraflow: 'One way along the drawing direction, bicycles both ways',
  'contraflow-against': 'One way against the drawing direction, bicycles both ways',
  'bike-with': 'One way for bicycles, along the drawing direction',
  'bike-against': 'One way for bicycles, against the drawing direction',
  missing: 'Riding direction not tagged',
  drawn: 'The way’s drawing direction',
}

/** What a shape means, for the title of its file and for the README */
export function directionMeaning(shape: DirectionShape) {
  const { kind, state } = parse(shape)
  const meaning = KIND_MEANING[kind]
  if (kind === 'drawn') return meaning
  return state === 'rest' ? `${meaning}; at rest` : `${meaning}; with the drawing direction`
}

/** The SVG file of a shape: self-contained, with a viewBox and fixed colours, pointing east */
export function directionSvg(shape: DirectionShape): string {
  const paths = directionParts(shape)
    .map(
      (part) =>
        `<path d="${part.d}" fill="${part.fill}" stroke="${part.stroke}" stroke-width="${part.strokeWidth}" stroke-linejoin="round"/>`,
    )
    .join('')
  const size = DIRECTION_VIEWBOX
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><title>${directionMeaning(shape)}</title>${paths}</svg>\n`
}
