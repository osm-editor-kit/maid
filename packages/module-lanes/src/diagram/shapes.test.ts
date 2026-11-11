import { describe, expect, test } from 'bun:test'
import {
  buildRoadSpaceSegment,
  formatLaneSlotId,
  layoutRoadSpace,
  type RoadSpaceScene,
} from '@osm-editor-kit/osm-lane-diagram'
import { laneDiagramFixtures } from '@osm-editor-kit/osm-lane-diagram/fixtures'
import { diagramShapes, wayLineXAt } from './shapes.ts'

/** A two-way road with turn lanes, a cycle lane and sidewalks, and a plain road after it */
function sampleScene(): RoadSpaceScene {
  const current = buildRoadSpaceSegment(
    {
      highway: 'primary',
      lanes: '3',
      'lanes:forward': '2',
      'lanes:backward': '1',
      'turn:lanes:forward': 'left|through;right',
      sidewalk: 'both',
      'cycleway:right': 'lane',
    },
    { wayId: 5, role: 'current' },
  )
  const next = buildRoadSpaceSegment({ highway: 'primary', lanes: '2' }, { wayId: 6, role: 'next' })
  return layoutRoadSpace({ segments: [next, current] })
}

function fixtureScene(id: string): RoadSpaceScene {
  const fixture = laneDiagramFixtures.find((f) => f.id === id)
  if (!fixture) throw new Error(`missing fixture ${id}`)
  return layoutRoadSpace({
    segments: [...fixture.segments].reverse().map((seg) =>
      buildRoadSpaceSegment(seg.tags, {
        wayId: seg.wayId,
        role: seg.role,
        dualSibling: seg.dualSibling,
        medianHint: seg.medianHint,
      }),
    ),
  })
}

const SAMPLE_WAY = 5

describe('diagramShapes', () => {
  test('the scene size and one slot per lane or path rect', () => {
    const scene = sampleScene()
    const shapes = diagramShapes(scene, SAMPLE_WAY)
    expect(shapes.width).toBe(scene.widthPx)
    expect(shapes.height).toBe(scene.heightPx)
    expect(shapes.slots.map((s) => s.slotId)).toEqual(scene.slotRects.map((r) => r.slotId))
  })

  test('only the current way is interactive, the neighbour is dimmed', () => {
    const shapes = diagramShapes(sampleScene(), SAMPLE_WAY)
    const interactive = shapes.slots.filter((s) => s.interactive)
    expect(interactive.every((s) => s.wayId === 5 && s.role === 'current' && !s.dimmed)).toBe(true)
    expect(interactive.map((s) => s.slotId)).toContain(formatLaneSlotId(5, 'backward', 0))
    expect(interactive.map((s) => s.slotId)).toContain(formatLaneSlotId(5, 'forward', 1))
    const neighbour = shapes.slots.filter((s) => s.wayId === 6)
    expect(neighbour.length).toBe(2)
    expect(neighbour.every((s) => !s.interactive && s.dimmed)).toBe(true)
  })

  test('geometry is the scene rect, rounded', () => {
    const scene = sampleScene()
    const shapes = diagramShapes(scene, SAMPLE_WAY)
    const id = formatLaneSlotId(5, 'forward', 0)
    const rect = scene.slotRects.find((r) => r.slotId === id)!
    const slot = shapes.slots.find((s) => s.slotId === id)!
    expect(slot.x).toBeCloseTo(rect.x, 2)
    expect(slot.y).toBeCloseTo(rect.y, 2)
    expect(slot.width).toBeCloseTo(rect.width, 2)
    expect(slot.height).toBeCloseTo(rect.height, 2)
    expect(slot.turn).toBe('left')
    expect(slot.direction).toBe('forward')
  })

  test('lanes get a glyph inside them, sidewalks none', () => {
    const shapes = diagramShapes(sampleScene(), SAMPLE_WAY)
    for (const slot of shapes.slots) {
      if (slot.kind === 'sidewalk' || slot.kind === 'shared_path') {
        expect(slot.glyph).toBeUndefined()
        continue
      }
      expect(slot.glyph).toBeDefined()
      const g = slot.glyph!
      expect(g.cx).toBeGreaterThanOrEqual(slot.x)
      expect(g.cx).toBeLessThanOrEqual(slot.x + slot.width)
      expect(g.cy).toBeCloseTo(slot.y + slot.height / 2, 1)
      expect(g.size).toBeLessThanOrEqual(22)
    }
  })

  test('with ribbons the travel rects get no fill of their own (as sceneToSvg)', () => {
    const scene = sampleScene()
    expect(scene.ribbons.length).toBeGreaterThan(0)
    const shapes = diagramShapes(scene, SAMPLE_WAY)
    expect(shapes.ribbons).toHaveLength(scene.ribbons.length)
    expect(shapes.fills.every((f) => f.kind === 'median' || f.kind === 'sibling')).toBe(true)
  })

  test('neighbour and junction bands are veiled, the current band is not', () => {
    const scene = sampleScene()
    const shapes = diagramShapes(scene, SAMPLE_WAY)
    const current = scene.bands.find((b) => b.role === 'current')!
    expect(shapes.dimBands.length).toBe(scene.bands.filter((b) => b.dimmed).length)
    expect(shapes.dimBands.some((b) => b.y === current.y)).toBe(false)
  })

  test('the way line becomes a guide with an arrow, other lines stay lines', () => {
    const shapes = diagramShapes(sampleScene(), SAMPLE_WAY)
    expect(shapes.guides.filter((g) => !g.sibling)).toHaveLength(1)
    expect(shapes.guides[0]!.arrow).toBeDefined()
    expect(shapes.lines.some((l) => l.kind === 'kerb')).toBe(true)
    expect(shapes.lines.some((l) => l.kind === 'placement_guide')).toBe(false)
  })

  test('wayLineXAt follows the guide', () => {
    const scene = sampleScene()
    const guide = scene.polylines.find((l) => l.kind === 'placement_guide')!
    expect(wayLineXAt(scene, guide.points[0]!.y)).toBeCloseTo(guide.points[0]!.x, 5)
  })

  test('dual carriageway: medians and the other carriageway are fills, never targets', () => {
    const scene = fixtureScene('dual-carriageway-island')
    const fixture = laneDiagramFixtures.find((f) => f.id === 'dual-carriageway-island')!
    const currentWay = fixture.segments.find((s) => s.role === 'current')!.wayId
    const shapes = diagramShapes(scene, currentWay)
    expect(shapes.fills.some((f) => f.kind === 'median' || f.kind === 'sibling')).toBe(true)
    for (const slot of shapes.slots) expect(slot.kind).not.toBe('median')
    // the other carriageway shares the current band but belongs to another way
    const others = shapes.slots.filter((s) => s.role === 'current' && s.wayId !== currentWay)
    expect(others.length).toBeGreaterThan(0)
    expect(others.some((s) => s.interactive)).toBe(false)
  })

  test('every fixture: interactive slots are of the current way with unique keys, inside the scene', () => {
    for (const fixture of laneDiagramFixtures) {
      const scene = fixtureScene(fixture.id)
      const currentWay = fixture.segments.find((s) => s.role === 'current')!.wayId
      const shapes = diagramShapes(scene, currentWay)
      const keys = new Set(shapes.slots.map((s) => s.key))
      expect(keys.size).toBe(shapes.slots.length)
      for (const slot of shapes.slots.filter((s) => s.interactive)) {
        expect(slot.role).toBe('current')
        expect(slot.wayId).toBe(currentWay)
        expect(slot.x).toBeGreaterThanOrEqual(-0.01)
        expect(slot.x + slot.width).toBeLessThanOrEqual(shapes.width + 0.01)
      }
    }
  })
})
