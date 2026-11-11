/**
 * The lane diagram's scene (osm-lane-diagram's `layoutRoadSpace`) turned into what LaneDiagram draws, in the order it
 * draws it. Pure: no colours (those are CSS classes in LaneDiagram), only geometry taken from the scene as it is, and
 * the decisions sceneToSvg makes (which slot rects get a fill of their own, where a glyph sits).
 */
import type {
  RoadSpaceDirection,
  RoadSpaceScene,
  RoadSpaceSegmentRole,
  ScenePolyline,
  SceneSlotRect,
  SceneSlotRectKind,
} from '@osm-editor-kit/osm-lane-diagram'

type Point = { x: number; y: number }

/** A fill: a polygon when `points` is set, else the rect */
export type FillShape = {
  key: string
  kind: SceneSlotRectKind | 'sibling'
  medianHint?: 'verge' | 'crossing'
  x: number
  y: number
  width: number
  height: number
  points?: string
}

export type RibbonShape = {
  key: string
  kind: SceneSlotRectKind | 'sibling'
  points: string
}

export type LineShape = {
  key: string
  kind: ScenePolyline['kind']
  dashed: boolean
  points: string
}

/** The selected way's line with its arrow (OSM forward = up), or the dimmer one over the other carriageway */
export type GuideShape = {
  key: string
  sibling: boolean
  points: string
  /** The arrow head as polyline points; absent when the direction is unknown */
  arrow?: string
}

/** A lane or path of the cross-section: the target of hover and choice when `interactive` */
export type SlotShape = {
  key: string
  slotId: string
  wayId: number
  role: RoadSpaceSegmentRole
  kind: SceneSlotRectKind
  direction: RoadSpaceDirection
  turn?: string
  /** Of the selected way (role `current` and its way id, not the other carriageway's): can be hovered and chosen */
  interactive: boolean
  dimmed: boolean
  x: number
  y: number
  width: number
  height: number
  points?: string
  /** Where the turn or direction arrow goes, absent for paths and lanes too small for one */
  glyph?: { cx: number; cy: number; size: number }
}

export type DiagramShapes = {
  width: number
  height: number
  plates: string[]
  junctions: { y: number; height: number }[]
  boundaries: LineShape[]
  /** Continuous lanes over several bands: the main fill */
  ribbons: RibbonShape[]
  /** Slot rects that need a fill of their own (no ribbons, a sibling carriageway, a median) */
  fills: FillShape[]
  medians: { points: string; medianHint: 'verge' | 'crossing' }[]
  lines: LineShape[]
  guides: GuideShape[]
  /** Bands of the neighbours (and junction gaps) that are drawn dimmed */
  dimBands: { y: number; height: number }[]
  slots: SlotShape[]
}

/** Kinds that carry traffic and get a turn or direction arrow */
const GLYPH_KINDS = new Set<SceneSlotRectKind>(['motor', 'bus', 'cycle', 'both_ways'])
/** Smallest glyph worth drawing, and the largest */
const MIN_GLYPH_PX = 6
const MAX_GLYPH_PX = 22
/** How far a glyph moves aside when the way line runs through the lane's middle (as the street space editor) */
const WAY_LINE_CLEARANCE_PX = 15

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function pointsAttr(points: readonly Point[]): string {
  return points.map((p) => `${round2(p.x)},${round2(p.y)}`).join(' ')
}

/** x of the selected way's line at height `y` (the line can bend between bands) */
export function wayLineXAt(scene: RoadSpaceScene, y: number): number | undefined {
  const points = scene.polylines.find((l) => l.kind === 'placement_guide')?.points
  if (!points || points.length === 0) return undefined
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const top = Math.min(a.y, b.y)
    const bottom = Math.max(a.y, b.y)
    if (y >= top && y <= bottom) {
      return b.y === a.y ? a.x : a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y)
    }
  }
  return points[0]!.x
}

/** A slot rect that is a lane or path (not a median, the other carriageway's placeholder or a taper fill) */
function isSlot(rect: SceneSlotRect): boolean {
  return rect.kind !== 'median' && rect.label !== 'sibling' && rect.label !== 'step_fill'
}

function glyphOf(scene: RoadSpaceScene, rect: SceneSlotRect, dimmed: boolean): SlotShape['glyph'] {
  if (!GLYPH_KINDS.has(rect.kind)) return undefined
  const size = Math.min(MAX_GLYPH_PX, Math.min(rect.width, rect.height) * 0.42)
  if (size < MIN_GLYPH_PX) return undefined
  const cy = rect.y + rect.height / 2
  const centre = rect.x + rect.width / 2
  const lineX = dimmed ? undefined : wayLineXAt(scene, cy)
  let cx = centre
  if (
    lineX !== undefined &&
    Math.abs(centre - lineX) < WAY_LINE_CLEARANCE_PX &&
    rect.width >= WAY_LINE_CLEARANCE_PX * 3
  ) {
    const roomRight = rect.x + rect.width - lineX
    const roomLeft = lineX - rect.x
    cx = roomRight >= roomLeft ? lineX + WAY_LINE_CLEARANCE_PX : lineX - WAY_LINE_CLEARANCE_PX
  }
  return { cx: round2(cx), cy: round2(cy), size: round2(size) }
}

/** The arrow head on the middle of a vertical guide line, pointing up or down */
function guideArrow(points: readonly Point[], up: boolean, headPx: number): string | undefined {
  if (points.length === 0) return undefined
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = xs.reduce((a, b) => a + b, 0) / xs.length
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2
  const sign = up ? 1 : -1
  return pointsAttr([
    { x: x - headPx, y: midY + sign * headPx * 0.2 },
    { x, y: midY - sign * headPx },
    { x: x + headPx, y: midY + sign * headPx * 0.2 },
  ])
}

/** `currentWayId`: the selected way's number; slots of other ways in its band (a dual carriageway's other half) do not react */
export function diagramShapes(scene: RoadSpaceScene, currentWayId: number): DiagramShapes {
  const ribbonsCoverTravel = scene.ribbons.length > 0
  const plates = (
    scene.carriagewayPlates ?? (scene.carriagewayPlate ? [scene.carriagewayPlate] : [])
  ).map((plate) => pointsAttr(plate.points))

  const lineOf = (line: ScenePolyline, i: number): LineShape => ({
    key: `${line.id}#${i}`,
    kind: line.kind,
    dashed: line.style === 'dashed',
    points: pointsAttr(line.points),
  })
  const boundaries: LineShape[] = []
  const lines: LineShape[] = []
  const guides: GuideShape[] = []
  scene.polylines.forEach((line, i) => {
    if (line.kind === 'segment_boundary') boundaries.push(lineOf(line, i))
    else if (line.kind === 'placement_guide') {
      guides.push({
        key: `${line.id}#${i}`,
        sibling: false,
        points: pointsAttr(line.points),
        arrow: guideArrow(line.points, true, 7),
      })
    } else if (line.kind === 'sibling_placement_guide') {
      guides.push({
        key: `${line.id}#${i}`,
        sibling: true,
        points: pointsAttr(line.points),
        arrow:
          line.forward === undefined
            ? undefined
            : guideArrow(line.points, line.forward === 'up', 5),
      })
    } else lines.push(lineOf(line, i))
  })

  const ribbons: RibbonShape[] = scene.ribbons.map((ribbon, i) => ({
    key: `${ribbon.id}#${i}`,
    kind: ribbon.label === 'sibling' ? 'sibling' : ribbon.kind,
    points: pointsAttr(ribbon.points),
  }))

  const fills: FillShape[] = []
  const slots: SlotShape[] = []
  scene.slotRects.forEach((rect, i) => {
    const key = `${rect.slotId}#${i}`
    const geometry = {
      x: round2(rect.x),
      y: round2(rect.y),
      width: round2(rect.width),
      height: round2(rect.height),
      points: rect.points && rect.points.length >= 3 ? pointsAttr(rect.points) : undefined,
    }
    // as sceneToSvg: with ribbons the travel rects have no fill of their own, only siblings and medians do
    if (rect.kind === 'median') {
      fills.push({ key, kind: 'median', medianHint: rect.medianHint ?? 'verge', ...geometry })
    } else if (rect.label === 'sibling') {
      fills.push({ key, kind: 'sibling', ...geometry })
    } else if (!ribbonsCoverTravel) {
      fills.push({ key, kind: rect.kind, ...geometry })
    }
    if (!isSlot(rect)) return
    const dimmed = rect.role !== 'current' || rect.dimmed === true
    slots.push({
      key,
      slotId: rect.slotId,
      wayId: rect.wayId,
      role: rect.role,
      kind: rect.kind,
      direction: rect.direction,
      turn: rect.turn,
      interactive: rect.role === 'current' && rect.wayId === currentWayId,
      dimmed,
      ...geometry,
      glyph: glyphOf(scene, rect, dimmed),
    })
  })

  return {
    width: round2(scene.widthPx),
    height: round2(scene.heightPx),
    plates,
    junctions: (scene.junctions ?? []).map((j) => ({ y: round2(j.y), height: round2(j.height) })),
    boundaries,
    ribbons,
    fills,
    medians: (scene.medianOpenings ?? []).map((m) => ({
      points: pointsAttr(m.points),
      medianHint: m.medianHint,
    })),
    lines,
    guides,
    dimBands: scene.bands
      .filter((b) => b.dimmed)
      .map((b) => ({ y: round2(b.y), height: round2(b.height) })),
    slots,
  }
}
