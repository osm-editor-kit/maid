/**
 * The sketches of docs/design/line-arrows.md as SVG strings (line-arrows.ts writes them, a test compares). Each case
 * is a row of cells, one per state, each a short way drawn from left to right with its glyphs. Pure.
 */
import {
  GLYPH_EDGE,
  glyphPaths,
  type GlyphShape,
  type GlyphState,
} from '../../packages/renderer/src/glyph'

type Road = 'residential' | 'cycleway' | 'footway' | 'path' | 'bike-road' | 'bike-way'
/** A glyph kind on the line, or none */
type Kind = GlyphShape | undefined
type Cell = { label: string; state: 'normal' | 'focus' | 'hover' | 'selected' }

export type LineArrowCase = {
  id: string
  road: Road
  /** The glyph the way always shows (direction.ts ridingOf); undefined for a two-way line */
  kind: Kind
  /** Bicycle lens: the kinds of the road sides, left (top) and right (bottom); undefined for no side line */
  sides?: { left?: Kind; right?: Kind }
  /** Bicycle lens: the riding direction of the way itself (its own blue line) */
  self?: Kind
}

const W = 160
const H = 44
const Y = 22
const X0 = 13
const X1 = 147
const SLOTS = [32, 80, 128]
const LABEL = 16
const GAP = 12
/** The sketch is drawn at 1.5 times map px, so the glyphs can be read on the page */
const ZOOM = 1.5

const STANDARD: Cell[] = [
  { label: 'Normal', state: 'normal' },
  { label: 'Normal, line focus', state: 'focus' },
  { label: 'Hover', state: 'hover' },
  { label: 'Selected', state: 'selected' },
]
const LENS: Cell[] = [
  { label: 'Normal', state: 'focus' },
  { label: 'Hover', state: 'hover' },
  { label: 'Selected', state: 'selected' },
]

const n = (value: number) => String(Math.round(value * 100) / 100)

function line(stroke: string, width: number, extra = '', y = Y, x0 = X0, x1 = X1) {
  // round ends unless `extra` gives its own
  const cap = extra.includes('stroke-linecap') ? '' : ' stroke-linecap="round"'
  return `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${stroke}" stroke-width="${width}"${cap}${extra}/>`
}

const THIN = new Set<Road>(['cycleway', 'footway', 'path', 'bike-way'])

function road(kind: Road) {
  switch (kind) {
    case 'residential':
      return line('#444', 10) + line('#fff', 8)
    case 'cycleway':
      return (
        line('#fff', 5, ' stroke-opacity="0.6"') +
        line('#58a9ed', 3, ' stroke-dasharray="6 6 6 18"')
      )
    case 'footway':
      return (
        line('#fff', 5, ' stroke-opacity="0.6"') +
        line('#ae8681', 3, ' stroke-dasharray="6 6 6 18"')
      )
    case 'path':
      return (
        line('#ddccaa', 5, ' stroke-opacity="0.6"') + line('#998888', 3, ' stroke-dasharray="6 6"')
      )
    case 'bike-road':
      return line('#777', 5) + line('#d9d9d9', 3.4)
    case 'bike-way':
      return line('#1d6fe0', 6)
  }
}

function glow(state: Cell['state'], width: number) {
  if (state === 'selected') return line('#f6634f', width, ' stroke-opacity="0.7"')
  if (state === 'hover') return line('#f6634f', width, ' stroke-opacity="0.3"')
  return ''
}

function vertices() {
  return [X0, X1]
    .map(
      (x) => `<circle cx="${x}" cy="${Y}" r="3.4" fill="#fff" stroke="#333" stroke-width="1.2"/>`,
    )
    .join('')
}

/** A glyph at (x, y), `scale` times its large size: each part's edge, then its fill */
function glyph(kind: GlyphShape, state: GlyphState, x: number, y: number, scale: number) {
  const paths = glyphPaths(kind, state)
  const edges = paths
    .map(
      (p) =>
        `<path d="${p.d}" fill="none" stroke="${p.edge}" stroke-width="${GLYPH_EDGE}" stroke-linejoin="round"/>`,
    )
    .join('')
  const fills = paths.map((p) => `<path d="${p.d}" fill="${p.fill}"/>`).join('')
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${scale})">${edges}${fills}</g>`
}

/** The glyphs of a way: at rest its own kind (or the two-way glyph in line focus), active with the triangle */
function glyphs(kind: Kind, state: Cell['state'], y: number, scale: number, slots = SLOTS) {
  const active = state === 'hover' || state === 'selected'
  const shown: Kind = kind ?? (active || state === 'focus' ? 'both' : undefined)
  if (shown === undefined) return ''
  // a two-way line at rest in line focus: half as often (layers.ts line-two-way)
  const at = kind === undefined && !active ? slots.filter((_, i) => i % 2 === 0) : slots
  return at.map((x) => glyph(shown, active ? 'active' : 'rest', x, y, scale)).join('')
}

function cell(item: LineArrowCase, state: Cell['state']) {
  const lens = item.sides !== undefined || item.self !== undefined
  const thin = THIN.has(item.road)
  let body = glow(state, item.sides ? 30 : 20) + road(item.road)
  if (item.sides) {
    for (const [kind, dy] of [
      [item.sides.left, -9],
      [item.sides.right, 9],
    ] as const) {
      if (kind === undefined) continue
      body += line('#1d6fe0', 4.4, ' stroke-linecap="butt"', Y + dy, X0 + 4, X1 - 4)
      // a road side has no drawing triangle: it is always the rest glyph (ADR 0017)
      body += [36, 92, 124].map((x) => glyph(kind, 'rest', x, Y + dy, 0.65)).join('')
    }
  }
  const own = lens ? (item.self ?? item.kind) : item.kind
  body += glyphs(own, lens && state === 'focus' ? 'focus' : state, Y, thin || lens ? 0.65 : 0.75)
  if (state === 'hover' || state === 'selected') body += vertices()
  return body
}

/** The SVG of a case: its cells side by side, each with its label */
export function lineArrowSvg(item: LineArrowCase): string {
  const lens = item.sides !== undefined || item.self !== undefined
  const cells = lens ? LENS : STANDARD
  const width = cells.length * W + (cells.length - 1) * GAP
  const height = LABEL + H
  const parts = cells.map((c, i) => {
    const x = i * (W + GAP)
    return (
      `<text x="${x}" y="11" font-family="system-ui, sans-serif" font-size="10" fill="#555">${c.label}</text>` +
      `<g transform="translate(${x} ${LABEL})"><rect width="${W}" height="${H}" rx="4" fill="#ecebe6"/>${cell(item, c.state)}</g>`
    )
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${n(width * ZOOM)}" height="${n(height * ZOOM)}">${parts.join('')}</svg>\n`
}

/** The cases of the design page, in its order */
export const lineArrowCases: LineArrowCase[] = [
  { id: 'two-way', road: 'residential', kind: undefined },
  { id: 'oneway', road: 'residential', kind: 'with' },
  { id: 'oneway-against', road: 'residential', kind: 'against' },
  { id: 'reversible', road: 'residential', kind: 'reversible' },
  { id: 'oneway-cancelled', road: 'residential', kind: 'both' },
  { id: 'contraflow', road: 'residential', kind: 'contraflow' },
  { id: 'footway-oneway', road: 'footway', kind: 'with' },
  { id: 'bike-only', road: 'path', kind: 'bike-with' },
  { id: 'cycleway-oneway', road: 'cycleway', kind: 'with' },
  {
    id: 'lens-lanes',
    road: 'bike-road',
    kind: undefined,
    sides: { left: 'against', right: 'with' },
  },
  { id: 'lens-contraflow-lane', road: 'bike-road', kind: 'contraflow', sides: { left: 'against' } },
  {
    id: 'lens-tracks',
    road: 'bike-road',
    kind: undefined,
    sides: { left: 'missing', right: 'with' },
  },
  { id: 'lens-way-two-way', road: 'bike-way', kind: 'both', self: 'both' },
  { id: 'lens-way-missing', road: 'bike-way', kind: 'missing', self: 'missing' },
  { id: 'lens-way-against', road: 'bike-way', kind: 'against', self: 'against' },
]
