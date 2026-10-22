import { describe, expect, it } from 'bun:test'
import { extrusionOf, LEVEL_HEIGHT, ROOM_HEIGHT, SLAB_HEIGHT, type WayLike } from './extrusion.ts'

/** Node locations by id: a square of four corners, and the closed way around it */
const LOCATIONS: Record<string, [number, number]> = {
  a: [13.4, 52.5],
  b: [13.41, 52.5],
  c: [13.41, 52.51],
  d: [13.4, 52.51],
  // two nodes 20 m apart, due east, at latitude 52.5 (one degree of longitude is about 67.8 km there)
  s1: [13.4, 52.5],
  s2: [13.4002951, 52.5],
}
const locationOf = (id: string) => LOCATIONS[id]

/** A way over the square with the given tags (closed by default) */
function square(tags: Record<string, string>, nodes = ['a', 'b', 'c', 'd', 'a']): WayLike {
  return { nodes, tags }
}

const room = (level?: string): WayLike =>
  square(level === undefined ? { indoor: 'room' } : { indoor: 'room', level })

describe('extrusionOf', () => {
  it('extrudes a room once per level it is on, from the level base to 3 m above it', () => {
    const { features } = extrusionOf([room('-1;0')], locationOf, null)

    expect(features.map((f) => f.properties)).toEqual([
      // lifted by one level: level -1 stands on the ground
      { base: 0, top: ROOM_HEIGHT, kind: 'room', chosen: true },
      { base: 4, top: 4 + ROOM_HEIGHT, kind: 'room', chosen: true },
    ])
  })

  it('draws a corridor as a thin floor slab of 0.3 m, and an area the same way', () => {
    const corridor = square({ indoor: 'corridor', level: '1' })
    const area = square({ indoor: 'area', level: '1' })
    const { features } = extrusionOf([corridor, area], locationOf, null)

    expect(features).toHaveLength(2)
    for (const feature of features) {
      expect(feature.properties.kind).toBe('floor')
      expect(feature.properties.base).toBe(4)
      expect(feature.properties.top).toBeCloseTo(4 + SLAB_HEIGHT, 10)
    }
  })

  it('makes one shaft from the lowest level to the top of the highest for an elevator', () => {
    const lift = square({ highway: 'elevator', level: '-2;-1;0' })
    const { features } = extrusionOf([lift], locationOf, null)

    expect(features).toHaveLength(1)
    expect(features[0]?.properties).toEqual({ base: 0, top: 12, kind: 'elevator', chosen: true })
  })

  it('marks a shaft chosen when it serves the chosen level, and not when it does not', () => {
    const lift = square({ highway: 'elevator', level: '-2;-1;0' })
    expect(extrusionOf([lift], locationOf, 0).features[0]?.properties.chosen).toBe(true)
    expect(extrusionOf([lift], locationOf, 1).features[0]?.properties.chosen).toBe(false)
  })

  it('marks a room chosen only on the chosen level, and every room chosen when no level is chosen', () => {
    const { features: onZero } = extrusionOf([room('-1;0')], locationOf, 0)
    expect(onZero.map((f) => f.properties.chosen)).toEqual([false, true])

    const { features: none } = extrusionOf([room('-1;0')], locationOf, null)
    expect(none.map((f) => f.properties.chosen)).toEqual([true, true])
  })

  it('draws a room tagged as stairs as stairs', () => {
    const stairs = square({ indoor: 'room', stairs: 'yes', level: '0' })
    const { features } = extrusionOf([stairs], locationOf, null)
    expect(features[0]?.properties.kind).toBe('stairs')
  })

  it('leaves out a room without a level', () => {
    expect(extrusionOf([room()], locationOf, null).features).toEqual([])
  })

  it('leaves out an open way', () => {
    const open = square({ indoor: 'room', level: '0' }, ['a', 'b', 'c', 'd'])
    expect(extrusionOf([open], locationOf, null).features).toEqual([])
  })

  it('leaves out a way with a node that has no location', () => {
    const unknown = square({ indoor: 'room', level: '0' }, ['a', 'b', 'c', 'missing', 'a'])
    expect(extrusionOf([unknown], locationOf, null).features).toEqual([])
  })

  it('leaves out a way that is not indoor', () => {
    const building = square({ building: 'yes', level: '0' })
    expect(extrusionOf([building], locationOf, null).features).toEqual([])
  })

  it('builds the polygon from the node locations in order, with the closing node', () => {
    const { features } = extrusionOf([room('0')], locationOf, null)
    expect(features[0]?.geometry).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [13.4, 52.5],
          [13.41, 52.5],
          [13.41, 52.51],
          [13.4, 52.51],
          [13.4, 52.5],
        ],
      ],
    })
  })

  it('cuts through the building at the chosen level: the levels above it are left out', () => {
    const shaft = square({ highway: 'elevator', level: '-1;0;1' })
    const { features } = extrusionOf([room('-1;0;1'), shaft], locationOf, 0)
    expect(
      features.map((feature) => [
        feature.properties.kind,
        feature.properties.base,
        feature.properties.top,
      ]),
    ).toEqual([
      ['room', 0, ROOM_HEIGHT],
      ['room', 4, 4 + ROOM_HEIGHT],
      ['elevator', 0, 8],
    ])
  })

  it('cuts a flight of steps into 8 slices whose tops rise from the lower level to the upper one', () => {
    const steps: WayLike = {
      nodes: ['s1', 's2'],
      tags: { highway: 'steps', level: '0;1', incline: 'up' },
    }
    const { features } = extrusionOf([steps], locationOf, null)

    expect(features).toHaveLength(8)
    for (const feature of features) {
      expect(feature.properties.kind).toBe('stairs')
      expect(feature.properties.base).toBe(0)
    }
    const tops = features.map((feature) => feature.properties.top)
    for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeGreaterThan(tops[i - 1] ?? Infinity)
    expect(tops[tops.length - 1]).toBeCloseTo(LEVEL_HEIGHT, 10)
  })

  it('climbs the other way for a flight with incline=down: the tops fall', () => {
    const steps: WayLike = {
      nodes: ['s1', 's2'],
      tags: { highway: 'steps', level: '0;1', incline: 'down' },
    }
    const { features } = extrusionOf([steps], locationOf, null)

    expect(features).toHaveLength(8)
    const tops = features.map((feature) => feature.properties.top)
    for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeLessThan(tops[i - 1] ?? -Infinity)
    expect(tops[0]).toBeCloseTo(LEVEL_HEIGHT, 10)
  })

  it('draws a stairwell on levels -1 and 0 as one block from ground to the top of level 0 and its room', () => {
    const stairs = square({ indoor: 'room', stairs: 'yes', level: '-1;0' })
    const { features } = extrusionOf([stairs], locationOf, null)

    expect(features).toHaveLength(1)
    expect(features[0]?.properties).toEqual({
      base: 0,
      top: LEVEL_HEIGHT + ROOM_HEIGHT,
      kind: 'stairs',
      chosen: true,
    })
  })

  it('adds nothing for a flight of steps on one level', () => {
    const steps: WayLike = { nodes: ['s1', 's2'], tags: { highway: 'steps', level: '0' } }
    expect(extrusionOf([steps], locationOf, null).features).toEqual([])
  })

  it('keeps a flight of steps from 0 to 1 when level 0 is chosen', () => {
    const steps: WayLike = { nodes: ['s1', 's2'], tags: { highway: 'steps', level: '0;1' } }
    const { features } = extrusionOf([steps], locationOf, 0)

    expect(features).toHaveLength(8)
    for (const feature of features) expect(feature.properties.chosen).toBe(true)
  })
})
