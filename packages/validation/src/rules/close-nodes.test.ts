import { describe, expect, it } from 'bun:test'
import { Graph, type OsmWay } from '@osm-editor-kit/maid-model'
import { graphOf, node, uniqueById, validateChanged, way } from '../id-test-helpers.ts'
import { closeNodes } from './close-nodes.ts'

// metres → degrees around Berlin (52.5° N)
const mLat = 1 / 111_320
const mLon = 1 / (111_320 * Math.cos((52.5 * Math.PI) / 180))
const at = (id: string, x: number, y: number, tags: Record<string, string> = {}) =>
  node(id, 13.4 + x * mLon, 52.5 + y * mLat, tags)

/** A 10 x 15 m outline with p and q `step` metres apart on its top edge */
function outline(step: number, tags: Record<string, string>, pTags: Record<string, string> = {}) {
  return graphOf(
    at('n-1', 0, 15),
    at('n-2', 5, 15, pTags),
    at('n-3', 5, 15 + step),
    at('n-4', 10, 15 + step),
    at('n-5', 10, 0),
    at('n-6', 0, 0),
    way('w-1', ['n-1', 'n-2', 'n-3', 'n-4', 'n-5', 'n-6', 'n-1'], tags),
  )
}

describe('close_nodes', () => {
  it('flags two points of a building 3 cm apart, under the way, with a merge fix', () => {
    const graph = outline(0.03, { building: 'house' })
    const issues = uniqueById(validateChanged(closeNodes, graph, ['w-1', 'n-2', 'n-3']))
    expect(issues.map((issue) => [issue.message, issue.entityIds])).toEqual([
      ['Two points of the building are very close together (3 cm)', ['w-1', 'n-2', 'n-3']],
    ])
    const fix = issues[0]?.fixes[0]
    expect(fix?.label).toBe('Merge these points')
    const after = (fix?.actions(new Graph(graph)) ?? []).reduce<Graph>(
      (head, action) => action(head),
      new Graph(graph),
    )
    expect((after.entity('w-1') as OsmWay).nodes).toHaveLength(6)
  })

  it('uses iD thresholds: 5 cm for a building, 20 cm for other features, none for a boundary', () => {
    expect(validateChanged(closeNodes, outline(0.08, { building: 'yes' }), ['w-1'])).toHaveLength(0)
    expect(validateChanged(closeNodes, outline(0.08, { landuse: 'grass' }), ['w-1'])).toHaveLength(
      1,
    )
    expect(validateChanged(closeNodes, outline(0.25, { landuse: 'grass' }), ['w-1'])).toHaveLength(
      0,
    )
    expect(
      validateChanged(closeNodes, outline(0.001, { boundary: 'administrative' }), ['w-1']),
    ).toHaveLength(0)
  })

  it('leaves two points with tags alone, but not one', () => {
    const both = graphOf(
      at('n-1', 0, 15),
      at('n-2', 5, 15, { entrance: 'yes' }),
      at('n-3', 5, 15.01, { entrance: 'service' }),
      at('n-4', 10, 15.01),
      at('n-5', 10, 0),
      at('n-6', 0, 0),
      way('w-1', ['n-1', 'n-2', 'n-3', 'n-4', 'n-5', 'n-6', 'n-1'], { building: 'yes' }),
    )
    expect(validateChanged(closeNodes, both, ['w-1'])).toHaveLength(0)
    const one = outline(0.01, { building: 'yes' }, { entrance: 'yes' })
    expect(validateChanged(closeNodes, one, ['w-1'])).toHaveLength(1)
  })

  it('leaves a very small way alone', () => {
    const graph = graphOf(
      at('n-1', 0, 0),
      at('n-2', 0.5, 0),
      at('n-3', 0.5, 0.01),
      at('n-4', 0, 0.5),
      way('w-1', ['n-1', 'n-2', 'n-3', 'n-4', 'n-1'], { building: 'yes' }),
    )
    expect(validateChanged(closeNodes, graph, ['w-1'])).toHaveLength(0)
  })
})
