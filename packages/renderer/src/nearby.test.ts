import { describe, expect, it } from 'bun:test'
import { EditHistory, ModelContext } from '@osm-editor-kit/maid-model'
import { OsmData } from './data'
import {
  boxesOf,
  boxOf,
  centreOfBox,
  nearbyFeatures,
  type NearbyShape,
  padBox,
  shapeOf,
} from './nearby'

// Berlin, at the latitude of the fixtures: a degree of longitude is about 68 km here, so 0.001 is about 68 m
const CENTRE: [number, number] = [13.4, 52.5]

function shape(
  partial: Partial<NearbyShape> & Pick<NearbyShape, 'kind'>,
  points: [number, number][] = [],
): NearbyShape {
  const box = boxOf(points) ?? [CENTRE[0], CENTRE[1], CENTRE[0], CENTRE[1]]
  return {
    id: 'x',
    type: 'node',
    tags: {},
    box,
    centre: centreOfBox(box),
    points: [],
    outlines: [],
    ...partial,
  }
}

const selected = shape({ kind: 'point', id: 'selected' }, [CENTRE])

/** A square around a point, `half` degrees each way */
function square(lon: number, lat: number, half: number): [number, number][] {
  return [
    [lon - half, lat - half],
    [lon + half, lat - half],
    [lon + half, lat + half],
    [lon - half, lat + half],
    [lon - half, lat - half],
  ]
}

/** An area whose box and outline are its ring */
function areaOf(tags: Record<string, string>, ring: [number, number][]): NearbyShape {
  return shape({ kind: 'area', type: 'way', tags, outlines: [ring] }, ring)
}

describe('padBox', () => {
  it('grows a box by about the distance on every side', () => {
    const [minLon, minLat, maxLon, maxLat] = padBox(
      [CENTRE[0], CENTRE[1], CENTRE[0], CENTRE[1]],
      200,
    )
    // 200 m is about 0.0018 of a degree of latitude
    expect(maxLat - CENTRE[1]).toBeCloseTo(0.0018, 4)
    expect(CENTRE[1] - minLat).toBeCloseTo(0.0018, 4)
    // and about 0.0029 of a degree of longitude at this latitude
    expect(maxLon - CENTRE[0]).toBeGreaterThan(0.0028)
    expect(CENTRE[0] - minLon).toBeGreaterThan(0.0028)
  })
})

describe('nearbyFeatures', () => {
  it('finds a point within the distance, with its distance in metres', () => {
    const node = shape({ kind: 'point', id: 'n1', tags: { 'addr:street': 'Hauptstraße' } }, [
      [CENTRE[0] + 0.001, CENTRE[1]],
    ])
    const [found] = nearbyFeatures(selected, [node])
    expect(found?.tags['addr:street']).toBe('Hauptstraße')
    // 0.001 of longitude at 52.5 degrees is about 68 m
    expect(found?.distanceMetres).toBeGreaterThan(66)
    expect(found?.distanceMetres).toBeLessThan(70)
    expect(found?.encloses).toBe(false)
    expect(found?.inEnclosingBuilding).toBe(false)
  })

  it('leaves out a point beyond the distance, and an area whose centre is beyond it that does not enclose the feature', () => {
    const far = shape({ kind: 'point', tags: { place: 'village', name: 'Far' } }, [
      [CENTRE[0] + 0.01, CENTRE[1]],
    ])
    const beside = areaOf({ landuse: 'grass' }, square(CENTRE[0] + 0.01, CENTRE[1], 0.001))
    expect(nearbyFeatures(selected, [far, beside])).toEqual([])
  })

  it('measures a line to its nearest point', () => {
    const road = shape(
      {
        kind: 'line',
        type: 'way',
        tags: { highway: 'residential', name: 'Weg' },
        points: [
          [CENTRE[0] + 0.001, CENTRE[1] - 0.01],
          [CENTRE[0] + 0.001, CENTRE[1] + 0.01],
        ],
      },
      [
        [CENTRE[0] + 0.001, CENTRE[1] - 0.01],
        [CENTRE[0] + 0.001, CENTRE[1] + 0.01],
      ],
    )
    const [found] = nearbyFeatures(selected, [road])
    // the nearest point is straight across: the same 68 m as the point
    expect(found?.distanceMetres).toBeGreaterThan(66)
    expect(found?.distanceMetres).toBeLessThan(70)
  })

  it('says an area encloses the feature when all four corners of its extent are inside the area', () => {
    const building = areaOf(
      { building: 'yes', 'addr:housenumber': '5' },
      square(CENTRE[0], CENTRE[1], 0.001),
    )
    const [found] = nearbyFeatures(selected, [building])
    expect(found?.encloses).toBe(true)
    expect(found?.tags['addr:housenumber']).toBe('5')
  })

  it('says a point is in an enclosing building only when that building is a building that encloses the feature', () => {
    // the building and a park both enclose the feature; the park is larger and holds a point outside the building
    const building = areaOf({ building: 'yes' }, square(CENTRE[0], CENTRE[1], 0.001))
    const park = areaOf({ leisure: 'park' }, square(CENTRE[0], CENTRE[1], 0.002))
    const inside = shape({ kind: 'point', tags: { 'addr:housenumber': '7' } }, [
      [CENTRE[0] + 0.0005, CENTRE[1]],
    ])
    const outside = shape({ kind: 'point', tags: { 'addr:housenumber': '9' } }, [
      [CENTRE[0] + 0.002, CENTRE[1]],
    ])
    const inPark = shape({ kind: 'point', tags: { 'addr:housenumber': '11' } }, [
      [CENTRE[0] + 0.0015, CENTRE[1]],
    ])
    const found = nearbyFeatures(selected, [building, park, inside, outside, inPark])
    const flag = (housenumber: string) =>
      found.find((f) => f.tags['addr:housenumber'] === housenumber)?.inEnclosingBuilding
    expect(flag('7')).toBe(true)
    expect(flag('9')).toBe(false)
    // inside the park that encloses the feature, but not in a building: no
    expect(flag('11')).toBe(false)
  })
})

describe('boxesOf and shapeOf (the graph)', () => {
  it('reads a building as an area, and a multipolygon of closed ways as an area too', () => {
    const context = new ModelContext()
    const data = new OsmData(context, new EditHistory(context))
    data.merge([
      { type: 'node', id: 1, lat: 52.5, lon: 13.4 },
      { type: 'node', id: 2, lat: 52.5, lon: 13.401 },
      { type: 'node', id: 3, lat: 52.501, lon: 13.401 },
      { type: 'node', id: 4, lat: 52.501, lon: 13.4 },
      {
        type: 'way',
        id: 10,
        nodes: [1, 2, 3, 4, 1],
        tags: { building: 'yes', 'addr:street': 'Weg' },
      },
      { type: 'way', id: 11, nodes: [1, 2], tags: { highway: 'service' } },
      // a point inside the building, not one of its nodes
      { type: 'node', id: 5, lat: 52.5005, lon: 13.4005, tags: { 'addr:housenumber': '3' } },
    ])
    const graph = data.history.staging.graph
    const boxes = boxesOf(graph)
    expect(boxes.map((entry) => entry.id).sort()).toEqual([
      'n1',
      'n2',
      'n3',
      'n4',
      'n5',
      'w10',
      'w11',
    ])
    const way = graph.hasEntity('w10')
    expect(way && shapeOf(graph, 'w10', way)?.kind).toBe('area')
    const line = graph.hasEntity('w11')
    expect(line && shapeOf(graph, 'w11', line)?.kind).toBe('line')
    const point = graph.hasEntity('n5')
    const building = way && shapeOf(graph, 'w10', way)
    const selected = point && shapeOf(graph, 'n5', point)
    expect(selected && building).toBeTruthy()
    const [found] = nearbyFeatures(selected!, [building!])
    // a point's corners are the point itself, which is inside the building
    expect(found?.encloses).toBe(true)
    expect(found?.tags['addr:street']).toBe('Weg')
  })
})
