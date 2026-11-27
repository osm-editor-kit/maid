/**
 * The glyphs of a line's riding direction and drawing direction (docs/design/line-arrows.md, ADR 0021). Pure geometry:
 * the map's images (`direction-images.ts`), the SVG files (`direction-svg.ts`) and the UI icons draw the same paths.
 *
 * Two parts, one image per anchor:
 * - a solid chevron is the riding direction: which way traffic may use the line;
 * - a solid triangle is the drawing direction of the OSM way. It joins the chevrons on hover and selection only
 *   (`active`), and never on a road side, whose drawing direction is its centerline's.
 *
 * Colour says who: ink for all traffic, blue for bicycles only, amber where a riding direction should be tagged and is
 * not. Every part is solid with a thin edge in the opposite tone, so it reads on a road fill and on imagery.
 *
 * Coordinates are px at the large size (8 px high, the line through y = 0), every glyph points east (+x) and is
 * centred on x = 0.
 */

/** What a line's glyph says, from its tags (direction.ts ridingOf) or from TILDA (the bicycle lens) */
export type GlyphKind =
  /** one way, along the drawing direction */
  | 'with'
  /** one way, against the drawing direction (`oneway=-1`) */
  | 'against'
  /** both ways */
  | 'both'
  /** both ways, one at a time (`oneway=reversible`, `alternating`) */
  | 'reversible'
  /** one way along the line, bicycles both ways (`oneway=yes` + `oneway:bicycle=no`) */
  | 'contraflow'
  /** one way against the line, bicycles both ways (`oneway=-1` + `oneway:bicycle=no`) */
  | 'contraflow-against'
  /** one way for bicycles only, along the line (`oneway:bicycle=yes` off a cycleway) */
  | 'bike-with'
  /** one way for bicycles only, against the line (`oneway:bicycle=-1` off a cycleway) */
  | 'bike-against'
  /** the riding direction should be tagged and is not (bicycle lens) */
  | 'missing'

/** A glyph kind, or `drawn`: the drawing triangle alone (an open line no one travels, the relations map) */
export type GlyphShape = GlyphKind | 'drawn'

export const GLYPH_KINDS: readonly GlyphKind[] = [
  'with', 'against', 'both', 'reversible', 'contraflow', 'contraflow-against', 'bike-with', 'bike-against', 'missing',
] // prettier-ignore

/** `rest`: the riding direction alone. `active` (hover, selection): with the drawing triangle. */
export type GlyphState = 'rest' | 'active'

/** `ink`: dark parts with a white edge, the default. `light`: white parts with a dark edge, for dark lines. */
export type GlyphTone = 'ink' | 'light'

export const GLYPH_INK = '#1f1f1f'
export const GLYPH_WHITE = '#ffffff'
export const GLYPH_BLUE = '#1559c9'
export const GLYPH_AMBER = '#c97a00'
/** The edge under every part, in the opposite tone (px) */
export const GLYPH_EDGE = 1.3

/** Height of a glyph at the large size (px). The map scales it with the line (layers.ts glyphSize). */
export const GLYPH_HEIGHT = 8
/** The clear gap between two parts, edge to edge along the line (px) */
const GAP = 2
/** A triangle in the notch of a chevron that points the same way: the arms close in from both sides, so more room */
const NEST_GAP = 3.6

const CHEV = { width: 6.2, depth: 4, thickness: 2.2 }
const TICK = { width: 5.5 }
const DOT = { radius: 2.8 }
const HALF = GLYPH_HEIGHT / 2

type Colour = 'main' | 'blue' | 'amber'
type Part =
  | { kind: 'chev'; dir: 1 | -1; colour: Colour }
  | { kind: 'tick'; colour: Colour }
  | { kind: 'dot'; colour: Colour }

const C = (dir: 1 | -1, colour: Colour = 'main'): Part => ({ kind: 'chev', dir, colour })
const T: Part = { kind: 'tick', colour: 'main' }

/** The parts of each glyph, left to right, when active. The rest state is the same without the triangle. */
const PARTS: Record<GlyphShape, Part[]> = {
  drawn: [T],
  with: [T, C(1)],
  against: [T, C(-1)],
  both: [C(-1), T, C(1)],
  reversible: [T, C(1), C(-1)],
  contraflow: [T, C(1), C(-1, 'blue')],
  'contraflow-against': [T, C(-1), C(1, 'blue')],
  'bike-with': [T, C(1, 'blue')],
  'bike-against': [T, C(-1, 'blue')],
  missing: [T, { kind: 'dot', colour: 'amber' }],
}

/** Numbers with at most 2 decimals, so the SVG files stay short and stable */
const n = (value: number) => String(Math.round(value * 100) / 100)

function width(part: Part) {
  if (part.kind === 'chev') return CHEV.width
  if (part.kind === 'tick') return TICK.width
  return 2 * DOT.radius
}

/** The path of a part whose box starts at `left` */
function path(part: Part, left: number) {
  if (part.kind === 'tick') {
    return `M${n(left)} ${-HALF}L${n(left + TICK.width)} 0L${n(left)} ${HALF}Z`
  }
  if (part.kind === 'dot') {
    const r = DOT.radius
    return `M${n(left)} 0a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`
  }
  // in its box: the tip at one end, the arms reaching back `depth`, each `thickness` thick along the line
  const { width: w, depth, thickness: t } = CHEV
  const east = [
    [w - depth, -HALF], [w, 0], [w - depth, HALF], [w - depth - t, HALF], [w - t, 0], [w - depth - t, -HALF],
  ] // prettier-ignore
  const points = part.dir === 1 ? east : east.map(([x, y]) => [w - x!, y!])
  return `M${points.map(([x, y]) => `${n(left + x!)} ${n(y!)}`).join('L')}Z`
}

/** Where the notch of an east chevron is, from the left of its box */
const NOTCH = CHEV.width - CHEV.thickness

/** The left edge of each part and the glyph's width: GAP between parts, a triangle nested in a chevron's notch */
function layout(parts: readonly Part[]) {
  const lefts: number[] = []
  let x = 0
  parts.forEach((part, i) => {
    const previous = parts[i - 1]
    let left = previous === undefined ? 0 : x + GAP
    // the triangle's tip (x) stays NEST_GAP before the notch of a chevron pointing the same way
    if (previous?.kind === 'tick' && part.kind === 'chev' && part.dir === 1)
      left = x + NEST_GAP - NOTCH
    lefts.push(left)
    x = left + width(part)
  })
  return { lefts, width: x }
}

export type GlyphPath = { d: string; fill: string; edge: string }

function colourOf(colour: Colour, tone: GlyphTone) {
  if (colour === 'blue') return GLYPH_BLUE
  if (colour === 'amber') return GLYPH_AMBER
  return tone === 'light' ? GLYPH_WHITE : GLYPH_INK
}

/** The parts of a glyph in its state, before they are laid out */
function partsOf(kind: GlyphShape, state: GlyphState) {
  const parts = PARTS[kind]
  return state === 'active' ? parts : parts.filter((part) => part.kind !== 'tick')
}

/**
 * The painted paths of a glyph, centred on x = 0, in px at the large size. Parts are laid out left to right with GAP
 * between them; a triangle before a chevron that points east sits in its notch, NEST_GAP from it. Paint each path's
 * edge (a stroke GLYPH_EDGE wide, round joins) under its fill.
 */
export function glyphPaths(
  kind: GlyphShape,
  state: GlyphState,
  tone: GlyphTone = 'ink',
): GlyphPath[] {
  const parts = partsOf(kind, state)
  const { lefts, width: total } = layout(parts)
  const shift = -total / 2
  const edge = tone === 'light' ? GLYPH_INK : GLYPH_WHITE
  return parts.map((part, i) => ({
    d: path(part, lefts[i]! + shift),
    fill: colourOf(part.colour, tone),
    edge: part.colour === 'main' ? edge : GLYPH_WHITE,
  }))
}

/** The width of a glyph at the large size (px) */
export function glyphWidth(kind: GlyphShape, state: GlyphState) {
  return layout(partsOf(kind, state)).width
}
