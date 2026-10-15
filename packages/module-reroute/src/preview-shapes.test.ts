import { describe, expect, test } from 'bun:test'
import { OsmRelation, type Graph } from '@osm-editor-kit/maid-model'
import { previewShapes } from './preview-shapes.ts'
import { previewReroute } from './route.ts'
import { graphOf, node, relation, way } from './test-graph.ts'

// the same network as route.test.ts: a road and a cycleway joined at both ends
function graphWithRoute(): Graph {
  const nodes = Array.from({ length: 7 }, (_, i) => node(`n${i}`, 13.4 + i * 0.001, 52.5))
  const cycleNodes = [
    node('c1', 13.4025, 52.5002),
    node('c2', 13.4035, 52.5002),
    node('c3', 13.4045, 52.5002),
  ]
  const road = way('R', ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6'], { highway: 'residential' })
  const cycleway = way('C', ['n2', 'c1', 'c2', 'c3', 'n5'], { highway: 'cycleway' })
  const rel = relation('Rel', [{ id: 'R', type: 'way', role: '' }], {
    type: 'route',
    route: 'bicycle',
  })
  return graphOf([...nodes, ...cycleNodes, road, cycleway, rel])
}

describe('the preview on the map', () => {
  test('the stretch, the new path, the split points and the two handles are each a feature of their kind', () => {
    const graph = graphWithRoute()
    const rel = graph.hasEntity('Rel') as OsmRelation
    const preview = previewReroute(graph, rel, {
      start: { lon: 13.4015, lat: 52.5 },
      end: { lon: 13.4055, lat: 52.5 },
      occurrence: 0,
      roleChoices: {},
    })
    expect(preview).toBeDefined()
    if (!preview) return
    const collection = previewShapes(graph, preview)
    const kinds = collection.features.map((feature) => feature.properties.kind)
    expect(kinds.filter((kind) => kind === 'old')).toHaveLength(1)
    expect(kinds.filter((kind) => kind === 'new').length).toBeGreaterThanOrEqual(2)
    expect(kinds.filter((kind) => kind === 'split')).toHaveLength(2)
    const handles = collection.features.filter((feature) => feature.properties.kind === 'handle')
    expect(handles.map((feature) => feature.properties.handle)).toEqual(['start', 'end'])
    expect(handles.every((feature) => feature.properties.snapped === true)).toBe(true)
  })

  test('with no points there is nothing to draw', () => {
    const graph = graphWithRoute()
    const rel = graph.hasEntity('Rel') as OsmRelation
    const preview = previewReroute(graph, rel, { occurrence: 0, roleChoices: {} })
    expect(preview && previewShapes(graph, preview).features).toEqual([])
  })
})
