import { describe, expect, test } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmWay, type SchemaLookup } from '@osm-editor-kit/maid-model'
import { at, graphOf, relation, square } from '../cut/test-graph.ts'
import { roomTargetOf } from './target.ts'

/**
 * A graph whose schema also lists building:part as an area key. The shared test graph (cut/test-graph.ts) lists only
 * building and leisure, so a closed building:part way there is not an area and the cut refuses it as `not_area`.
 */
function partGraph(tags: Record<string, string>): Graph {
  const context = new ModelContext()
  context.systems.schema = {
    getScope: () => ({
      variables: new Map(),
      rulesets: new Map(),
      areaKeys: { building: {}, 'building:part': {}, leisure: {} },
    }),
    removeLifecyclePrefix: (key: string) => key,
    matchTags: () => null,
  } as unknown as SchemaLookup
  const corners = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ] as const
  const nodes = corners.map(([x, y], i) => new OsmNode(context, { id: `n${i}`, loc: at(x!, y!) }))
  const outline = new OsmWay(context, { id: 'w1', nodes: ['n0', 'n1', 'n2', 'n3', 'n0'], tags })
  return new Graph(context, [...nodes, outline])
}

describe('roomTargetOf', () => {
  test('one selected building gives its way', () => {
    expect(roomTargetOf(graphOf(...square()), ['w1'])).toEqual({ wayId: 'w1' })
  })

  test('building:part=yes counts as a building too', () => {
    expect(roomTargetOf(partGraph({ 'building:part': 'yes' }), ['w1'])).toEqual({ wayId: 'w1' })
  })

  test('nothing selected gives select', () => {
    expect(roomTargetOf(graphOf(...square()), [])).toEqual({ select: true })
  })

  test('two selected gives select', () => {
    expect(roomTargetOf(graphOf(...square()), ['w1', 'n0'])).toEqual({ select: true })
  })

  test('a selected node gives select, even when a building is in the graph', () => {
    expect(roomTargetOf(graphOf(...square()), ['n0'])).toEqual({ select: true })
  })

  test('a closed way that is not a building (landuse=grass) gives select', () => {
    expect(roomTargetOf(graphOf(...square({ landuse: 'grass' })), ['w1'])).toEqual({ select: true })
  })

  test('building=no gives select', () => {
    expect(roomTargetOf(graphOf(...square({ building: 'no' })), ['w1'])).toEqual({ select: true })
  })

  test('a multipolygon tagged building=yes gives its outer way', () => {
    const graph = graphOf(
      ...square({}),
      relation('r1', { type: 'multipolygon', building: 'yes' }, [
        { id: 'w1', type: 'way', role: 'outer' },
      ]),
    )
    expect(roomTargetOf(graph, ['r1'])).toEqual({ wayId: 'w1' })
  })

  test('a multipolygon without a building tag gives select', () => {
    const graph = graphOf(
      ...square({}),
      relation('r1', { type: 'multipolygon', landuse: 'grass' }, [
        { id: 'w1', type: 'way', role: 'outer' },
      ]),
    )
    expect(roomTargetOf(graph, ['r1'])).toEqual({ select: true })
  })
})
