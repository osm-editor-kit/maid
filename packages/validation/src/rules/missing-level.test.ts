import { describe, expect, it } from 'bun:test'
import { Graph } from '@osm-editor-kit/maid-model'
import { graphOf, node, validateChanged, way } from '../id-test-helpers.ts'
import { missingLevel } from './missing-level.ts'

const station = { railway: 'station', station: 'subway', layer: '-3', name: 'Hauptbahnhof' }

describe('missing_level', () => {
  it('flags the U-Bahn station with layer=-3 and no level, and offers level=-3', () => {
    const graph = graphOf(node('n-1', 4, 4, station))
    const issues = validateChanged(missingLevel, graph, ['n-1'])
    expect(issues.map((issue) => [issue.message, issue.severity])).toEqual([
      ['Hauptbahnhof has layer=-3 but no level', 'warning'],
    ])
    const fix = issues[0]?.fixes[0]
    expect(fix?.label).toBe('Set level=-3')
    // applied as the editor does, on a head copy of the graph
    const after = (fix?.actions(new Graph(graph)) ?? []).reduce<Graph>(
      (head, action) => action(head),
      new Graph(graph),
    )
    expect(after.entity('n-1').tags).toEqual({ ...station, level: '-3' })
  })

  it('leaves a feature with a level alone, and layer=0', () => {
    const graph = graphOf(
      node('n-1', 4, 4, { ...station, level: '-2' }),
      node('n-2', 5, 5, { ...station, layer: '0' }),
    )
    expect(validateChanged(missingLevel, graph, ['n-1', 'n-2'])).toHaveLength(0)
  })

  it('leaves roads, buildings and an untagged corner alone, flags a shop', () => {
    const graph = graphOf(
      node('n-1', 0, 0, { layer: '-1' }),
      node('n-2', 0, 1),
      node('n-3', 1, 1),
      way('w-1', ['n-2', 'n-3'], { highway: 'service', layer: '-1' }),
      way('w-2', ['n-2', 'n-3', 'n-2'], { building: 'yes', layer: '1' }),
      way('w-3', ['n-2', 'n-3', 'n-2'], { shop: 'bakery', layer: '-1' }),
    )
    expect(
      validateChanged(missingLevel, graph, ['n-1', 'w-1', 'w-2', 'w-3']).map(
        (issue) => issue.entityIds[0],
      ),
    ).toEqual(['w-3'])
  })
})
