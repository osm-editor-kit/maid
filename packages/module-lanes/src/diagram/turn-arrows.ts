/**
 * Turn and direction arrows of the lane diagram as SVG path data. Pure and deterministic.
 *
 * Every path is drawn in a unit box centred on 0,0 (x and y from -0.5 to 0.5) for a lane that travels up the page,
 * as the diagram shows the selected way (OSM forward = up). The caller places it with `glyphTransform`, which scales
 * it and turns it by 180° for a backward lane, so left stays counterclockwise of the travel direction.
 */
import type { RoadSpaceDirection } from '@osm-editor-kit/osm-lane-diagram'

/** The `turn:lanes` values the diagram draws; `none` and an empty entry draw nothing */
export const TURN_TOKENS = [
  'through',
  'left',
  'right',
  'slight_left',
  'slight_right',
  'sharp_left',
  'sharp_right',
  'merge_to_left',
  'merge_to_right',
  'reverse',
  'none',
] as const

export type TurnToken = (typeof TURN_TOKENS)[number]

export type TurnArrows = {
  /** One path per drawn token, in the order of the value */
  paths: { token: TurnToken; d: string }[]
  /** Tokens of the value that are not turn values (drawn as nothing) */
  unknown: string[]
}

const STEM_BOTTOM = 0.5
const TOP = -0.5
/** Length of the bent part of a turn arrow, from the stem's end */
const ARM = 0.45
/** Arrow head: length of each side and its angle against the shaft */
const HEAD = 0.2
const HEAD_ANGLE = Math.PI / 6

/** Rounded to 3 places, without `-0` */
function r(n: number): string {
  const v = Math.round(n * 1000) / 1000
  return String(Object.is(v, -0) ? 0 : v)
}

type Point = { x: number; y: number }

/** Two head strokes at `tip` for a shaft arriving from `from` */
function head(from: Point, tip: Point): string {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x)
  const side = (a: number) => ({
    x: tip.x - HEAD * Math.cos(a),
    y: tip.y - HEAD * Math.sin(a),
  })
  // the upper side first (then the left one), so mirror images give mirrored paths
  const [a, b] = [side(angle + HEAD_ANGLE), side(angle - HEAD_ANGLE)].toSorted(
    (p, q) => p.y - q.y || p.x - q.x,
  ) as [Point, Point]
  return `M${r(a.x)} ${r(a.y)}L${r(tip.x)} ${r(tip.y)}L${r(b.x)} ${r(b.y)}`
}

/**
 * A stem from the bottom to the middle, then an arm at `degrees` from straight up: negative bends to the left
 * (counterclockwise), positive to the right.
 */
function bent(degrees: number): string {
  const rad = (degrees * Math.PI) / 180
  const knee = { x: 0, y: 0 }
  const tip = { x: ARM * Math.sin(rad), y: -ARM * Math.cos(rad) }
  return `M0 ${r(STEM_BOTTOM)}L${r(knee.x)} ${r(knee.y)}L${r(tip.x)} ${r(tip.y)}${head(knee, tip)}`
}

function through(): string {
  return `M0 ${r(STEM_BOTTOM)}L0 ${r(TOP)}${head({ x: 0, y: 0 }, { x: 0, y: TOP })}`
}

/** Starts on one side of the lane and ends on the other, pointing up: `side` -1 = to the left */
function merge(side: -1 | 1): string {
  const x0 = -side * 0.22
  const x1 = side * 0.22
  return `M${r(x0)} ${r(STEM_BOTTOM)}L${r(x0)} 0.1C${r(x0)} -0.15 ${r(x1)} -0.15 ${r(x1)} -0.35L${r(x1)} ${r(TOP)}${head({ x: x1, y: 0 }, { x: x1, y: TOP })}`
}

/** A U-turn to the left (right-hand traffic), ending pointing down */
function reverse(): string {
  const x0 = 0.18
  const x1 = -0.18
  const end = { x: x1, y: 0.3 }
  return `M${r(x0)} ${r(STEM_BOTTOM)}L${r(x0)} -0.2A0.18 0.18 0 0 0 ${r(x1)} -0.2L${r(end.x)} ${r(end.y)}${head({ x: x1, y: -0.2 }, end)}`
}

function pathOf(token: TurnToken): string | undefined {
  switch (token) {
    case 'through':
      return through()
    case 'left':
      return bent(-90)
    case 'right':
      return bent(90)
    case 'slight_left':
      return bent(-45)
    case 'slight_right':
      return bent(45)
    case 'sharp_left':
      return bent(-135)
    case 'sharp_right':
      return bent(135)
    case 'merge_to_left':
      return merge(-1)
    case 'merge_to_right':
      return merge(1)
    case 'reverse':
      return reverse()
    case 'none':
      return undefined
  }
}

function isTurnToken(value: string): value is TurnToken {
  return (TURN_TOKENS as readonly string[]).includes(value)
}

/** The tokens of one lane's turn value (`left;through` → left, through), trimmed, empty ones dropped */
export function turnTokens(turn: string | undefined): string[] {
  if (turn === undefined) return []
  return turn
    .split(';')
    .map((t) => t.trim())
    .filter((t) => t !== '')
}

/** The paths of one lane's turn value; tokens repeated in the value are drawn once */
export function turnArrowPaths(turn: string | undefined): TurnArrows {
  const paths: TurnArrows['paths'] = []
  const unknown: string[] = []
  const seen = new Set<string>()
  for (const token of turnTokens(turn)) {
    if (seen.has(token)) continue
    seen.add(token)
    if (!isTurnToken(token)) {
      unknown.push(token)
      continue
    }
    const d = pathOf(token)
    if (d !== undefined) paths.push({ token, d })
  }
  return { paths, unknown }
}

/**
 * The direction of travel of a lane without a turn value: a straight arrow (turned for backward by
 * `glyphTransform`), or a double-headed one for a lane used both ways. Nothing for `none`.
 */
export function directionArrowPath(direction: RoadSpaceDirection): string | undefined {
  if (direction === 'none') return undefined
  if (direction === 'both_ways') {
    return `M0 ${r(STEM_BOTTOM)}L0 ${r(TOP)}${head({ x: 0, y: 0 }, { x: 0, y: TOP })}${head({ x: 0, y: 0 }, { x: 0, y: STEM_BOTTOM })}`
  }
  return through()
}

/**
 * The SVG transform that puts a unit-box glyph at `cx`,`cy` with side `size`: turned by 180° for a backward lane
 * (glyphs are drawn for travel upwards).
 */
export function glyphTransform(
  cx: number,
  cy: number,
  size: number,
  direction: RoadSpaceDirection,
): string {
  const turn = direction === 'backward' ? ' rotate(180)' : ''
  return `translate(${r(cx)} ${r(cy)}) scale(${r(size)})${turn}`
}
