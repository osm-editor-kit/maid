import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { parkingCollection, type GraphEntity, type GraphLike } from './collect.ts'
import { parkingAreaFeature, parkingSideFeatures, type ParkingWay } from './features.ts'
import { PARKING_LAYERS } from './layers.ts'

const NORTH: [number, number][] = [
  [13.4, 52.5],
  [13.4, 52.501],
]
const way = (
  tags: Record<string, string>,
  coordinates: [number, number][] = NORTH,
): ParkingWay => ({
  id: 'w1',
  tags,
  coordinates,
})

describe('parkingSideFeatures', () => {
  test('one line per side, on the centre line, with the side as a property', () => {
    const features = parkingSideFeatures(
      way({ highway: 'residential', 'parking:left': 'lane', 'parking:right': 'street_side' }),
    )
    expect(features.map((f) => f.properties.side)).toEqual(['left', 'right'])
    expect(features[0]!.geometry).toEqual({ type: 'LineString', coordinates: NORTH })
    expect(features[1]!.properties.position).toBe('street_side')
    expect(features[0]!.properties.wayId).toBe('w1')
  })

  test('`parking:both` gives a feature per real side, and a side key wins over it', () => {
    const features = parkingSideFeatures(way({ 'parking:both': 'lane', 'parking:left:fee': 'yes' }))
    expect(features.map((f) => f.properties.side)).toEqual(['left', 'right'])
    expect(features[0]!.properties.position).toBe('lane')
    expect(features[0]!.properties.fee).toBe('yes')
    expect(features[1]!.properties.fee).toBeUndefined()
  })

  test('a road without parking tags gives no feature', () => {
    expect(parkingSideFeatures(way({ highway: 'residential' }))).toEqual([])
  })

  test('position `no` is a side with its own category, not missing', () => {
    const [feature] = parkingSideFeatures(way({ 'parking:left': 'no' }))
    expect(feature!.properties.position).toBe('no')
    expect(feature!.properties.category).toBe('no_parking_side')
    expect(feature!.properties.dashed).toBe(false)
  })

  test('the properties of a side: restriction, conditional, orientation, markings, informal', () => {
    const [feature] = parkingSideFeatures(
      way({
        'parking:right': 'lane',
        'parking:right:orientation': 'parallel',
        'parking:right:restriction:conditional': 'no_parking @ (Mo-Fr 08:00-18:00)',
        'parking:right:markings': 'yes',
        'parking:right:informal': 'yes',
      }),
    )
    expect(feature!.properties).toMatchObject({
      side: 'right',
      position: 'lane',
      orientation: 'parallel',
      restrictionConditional: true,
      markings: 'yes',
      informal: 'yes',
      dashed: true,
    })
    expect(feature!.properties.restriction).toBeUndefined()
  })

  test('the category follows the JOSM order: no stopping before restricted, restricted before paid', () => {
    const cat = (tags: Record<string, string>) =>
      parkingSideFeatures(way({ 'parking:left': 'lane', ...tags }))[0]!.properties.category
    expect(cat({ 'parking:left:restriction': 'no_parking' })).toBe('no_stopping')
    expect(cat({ 'parking:left:restriction': 'private' })).toBe('restricted')
    expect(cat({ 'parking:left:fee': 'yes' })).toBe('paid')
    expect(cat({ 'parking:left:fee': 'no' })).toBe('free')
    expect(cat({ 'parking:left:maxstay': '2 hours' })).toBe('time_limit')
    expect(cat({})).toBe('parked')
  })

  test('showMissing: a mapped side is unchanged, an unmapped side of a listed road is a dashed grey line', () => {
    const features = parkingSideFeatures(way({ highway: 'residential', 'parking:left': 'lane' }), {
      showMissing: true,
    })
    expect(
      features.map((f) => [f.properties.side, f.properties.category, f.properties.dashed]),
    ).toEqual([
      ['left', 'parked', false],
      ['right', 'not_mapped', true],
    ])
  })

  test('showMissing: a road that is not a parking road class gives nothing for its missing sides', () => {
    expect(parkingSideFeatures(way({ highway: 'footway' }), { showMissing: true })).toEqual([])
    expect(parkingSideFeatures(way({ highway: 'residential' }))).toEqual([])
  })

  test('the offset sign: MapLibre offsets a positive value to the right; a north-running way has its right side to the east', () => {
    // the direction of the way, and its right-hand normal in (east, north): for a direction (dx, dy) it is (dy, -dx)
    const [dx, dy] = [NORTH[1]![0] - NORTH[0]![0], NORTH[1]![1] - NORTH[0]![1]]
    const right = [dy, -dx]
    expect(Math.sign(dx)).toBe(0)
    expect(right[0]).toBeGreaterThan(0)
    expect(Math.abs(right[1]!)).toBe(0)
    // the layers carry the sign: the right side positive, the left side negative
    const offsetOf = (id: string) =>
      JSON.stringify(PARKING_LAYERS.find((layer) => layer.id === id)?.paint?.['line-offset'])
    expect(offsetOf('parking-sides-right')).toContain(',15,6,')
    expect(offsetOf('parking-sides-left')).toContain(',15,-6,')
    expect(offsetOf('parking-sides-right-dashed')).not.toContain('-')
  })
})

describe('parkingAreaFeature', () => {
  const square: [number, number][] = [
    [13.4, 52.5],
    [13.4, 52.501],
    [13.401, 52.501],
    [13.401, 52.5],
    [13.4, 52.5],
  ]
  test('a clockwise ring has its strip on the right (the inside), an anticlockwise one on the left', () => {
    const clockwise = parkingAreaFeature({
      id: 'a1',
      tags: { amenity: 'parking', fee: 'no' },
      coordinates: square,
    })
    expect(clockwise[0]!.properties.strip).toBe('right')
    expect(clockwise[0]!.properties.category).toBe('free')
    const reversed = [...square].reverse()
    const anti = parkingAreaFeature({
      id: 'a2',
      tags: { amenity: 'parking', fee: 'no' },
      coordinates: reversed,
    })
    expect(anti[0]!.properties.strip).toBe('left')
  })

  test('no feature for an open line, an area without a rule, or another amenity', () => {
    expect(
      parkingAreaFeature({
        id: 'x',
        tags: { amenity: 'parking', fee: 'no' },
        coordinates: square.slice(0, 3),
      }),
    ).toEqual([])
    expect(
      parkingAreaFeature({ id: 'x', tags: { amenity: 'parking' }, coordinates: square }),
    ).toEqual([])
    expect(
      parkingAreaFeature({ id: 'x', tags: { amenity: 'bench', fee: 'no' }, coordinates: square }),
    ).toEqual([])
  })
})

describe('parkingCollection', () => {
  test('reads the graph: local entries replace base entries, deleted ones are skipped, nodes give coordinates', () => {
    const nodes = new Map<string, GraphEntity>([
      ['n1', { id: 'n1', tags: {}, loc: [13.4, 52.5] }],
      ['n2', { id: 'n2', tags: {}, loc: [13.4, 52.501] }],
      ['n3', { id: 'n3', tags: { 'obstacle:parking': 'yes' }, loc: [13.41, 52.5] }],
    ])
    const base = new Map<string, GraphEntity | undefined>([
      ...nodes,
      ['w1', { id: 'w1', tags: { highway: 'residential' }, nodes: ['n1', 'n2'] }],
      [
        'w2',
        { id: 'w2', tags: { highway: 'residential', 'parking:left': 'lane' }, nodes: ['n1', 'n2'] },
      ],
    ])
    const local = new Map<string, GraphEntity | undefined>([
      [
        'w2',
        {
          id: 'w2',
          tags: { highway: 'residential', 'parking:right': 'lane' },
          nodes: ['n1', 'n2'],
        },
      ],
      ['w3', undefined],
    ])
    const graphOf = (edits: Map<string, GraphEntity | undefined>): GraphLike => {
      const hasEntity = (id: string) => (edits.has(id) ? edits.get(id) : base.get(id))
      return {
        base: { entities: base },
        local: { entities: edits },
        hasEntity,
        parentWays: (node) =>
          ['w1', 'w2'].flatMap((id) => {
            const way = hasEntity(id)
            return way?.nodes?.includes(node.id) ? [way] : []
          }),
      }
    }
    const kindsOf = (collection: { features: { properties: unknown }[] }) =>
      collection.features.map((f) => {
        const p = f.properties as { kind: string; side?: string; wayId: string }
        return `${p.wayId} ${p.kind === 'side' ? `side:${p.side}` : p.kind}`
      })
    const graph = graphOf(local)
    const collection = parkingCollection(graph)
    // w1 and w2 are residential (arrows); w2 has its parking on the right now, not the left (the local entry wins)
    expect(kindsOf(collection)).toEqual([
      'n3 obstacle-node',
      'w1 arrow',
      'w2 side:right',
      'w2 arrow',
    ])
    // a second call with the same entities gives the same collection: the map source is not set again
    expect(parkingCollection(graph)).toBe(collection)

    // an edit that touches no parking feature gives the same collection too
    const unrelated = new Map(local).set('n9', {
      id: 'n9',
      tags: { amenity: 'bench' },
      loc: [1, 1],
    })
    expect(parkingCollection(graphOf(unrelated))).toBe(collection)

    // a moved node rebuilds the ways that use it, from the node's new place
    const moved = new Map(local).set('n1', { id: 'n1', tags: {}, loc: [13.39, 52.5] })
    const after = parkingCollection(graphOf(moved))
    expect(after).not.toBe(collection)
    expect(kindsOf(after).sort()).toEqual(
      ['n3 obstacle-node', 'w1 arrow', 'w2 side:right', 'w2 arrow'].sort(),
    )
    for (const feature of after.features.slice(1)) {
      expect((feature.geometry as { coordinates: number[][] }).coordinates[0]).toEqual([
        13.39, 52.5,
      ])
    }
    // a deleted way loses its features
    const deleted = new Map(local).set('w2', undefined)
    expect(kindsOf(parkingCollection(graphOf(deleted)))).toEqual(['n3 obstacle-node', 'w1 arrow'])
  })

  test('what a later load adds to the base is read, without reading the rest again', () => {
    const base = new Map<string, GraphEntity | undefined>([
      ['n1', { id: 'n1', tags: {}, loc: [13.4, 52.5] }],
      ['n2', { id: 'n2', tags: {}, loc: [13.4, 52.501] }],
      ['w1', { id: 'w1', tags: { highway: 'residential' }, nodes: ['n1', 'n2'] }],
    ])
    const graph: GraphLike = {
      base: { entities: base },
      local: { entities: new Map() },
      hasEntity: (id) => base.get(id),
      parentWays: () => [],
    }
    expect(parkingCollection(graph).features).toHaveLength(1)
    base.set('n3', { id: 'n3', tags: { 'obstacle:parking': 'yes' }, loc: [13.41, 52.5] })
    expect(parkingCollection(graph).features).toHaveLength(2)
  })
})

type Element = {
  type: string
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  tags?: Record<string, string>
}

describe('the dense fixture', () => {
  test('parkingWayFeatures over every highway way: time per 1,000 ways is logged', () => {
    const file = new URL('../../../../fixtures/dense.json.gz', import.meta.url)
    const { elements } = JSON.parse(gunzipSync(readFileSync(file)).toString()) as {
      elements: Element[]
    }
    const locs = new Map<number, [number, number]>()
    for (const el of elements)
      if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined)
        locs.set(el.id, [el.lon, el.lat])
    const ways: ParkingWay[] = []
    for (const el of elements) {
      if (el.type !== 'way' || el.tags?.highway === undefined) continue
      const coordinates: [number, number][] = []
      for (const id of el.nodes ?? []) {
        const loc = locs.get(id)
        if (loc) coordinates.push(loc)
      }
      ways.push({ id: `w${el.id}`, tags: el.tags, coordinates })
    }
    const start = performance.now()
    let features = 0
    for (const w of ways) features += parkingSideFeatures(w, { showMissing: true }).length
    const ms = performance.now() - start
    console.log(
      `dense: ${ways.length} highway ways, ${features} side features, ${ms.toFixed(2)} ms (${((ms / ways.length) * 1000).toFixed(2)} ms per 1,000 ways)`,
    )
    expect(ways.length).toBeGreaterThan(1000)
    expect(features).toBeGreaterThan(0)
  })
})
