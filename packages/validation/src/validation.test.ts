import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { Action, OsmEntity } from '@osm-editor-kit/maid-model'
import {
  createValidator,
  crossingWays,
  defaultRules,
  disconnectedWay,
  missingTag,
} from './index.ts'
import type { Fix, Issue, Rule } from './types.ts'

// Graphs are built by hand. Coordinates are [lon, lat] near the equator, so degrees behave like
// the map's units. The expectations below are worked out from these coordinates, not from the code.

const context = new ModelContext()

function node(id: string, lon: number, lat: number, tags: Record<string, string> = {}): OsmNode {
  return new OsmNode(context, { id, loc: [lon, lat], tags })
}

function way(id: string, nodes: string[], tags: Record<string, string> = {}): OsmWay {
  return new OsmWay(context, { id, nodes, tags })
}

function relation(
  id: string,
  members: { id: string; type: 'node' | 'way' | 'relation'; role: string }[],
  tags: Record<string, string>,
): OsmRelation {
  return new OsmRelation(context, { id, members, tags })
}

function graphOf(...entities: OsmEntity[]): Graph {
  return new Graph(context, entities)
}

/** Validates with these rules and returns the validator, so the test can ask what it found */
function validateWith(rules: readonly Rule[], graph: Graph, ids: string[], ways: OsmWay[]) {
  const validator = createValidator(rules)
  validator.validate(graph, ids, ways)
  return validator
}

function wayIn(graph: Graph, id: string): OsmWay {
  const entity = graph.entity(id)
  if (!(entity instanceof OsmWay)) throw new Error(`${id} is not a way`)
  return entity
}

function fixOf(issue: Issue, index = 0): Fix {
  const fix = issue.fixes[index]
  if (!fix) throw new Error(`${issue.id} has no fix ${index}`)
  return fix
}

/** Applies the actions of a fix as the editor does: one undo step, on a head copy of the base graph */
function applyFix(base: Graph, fix: Fix): Graph {
  const actions: Action[] = fix.actions(new Graph(base))
  return actions.reduce<Graph>((graph, action) => action(graph), new Graph(base))
}

describe('missing_tag', () => {
  const rules = [missingTag]

  it('reports an untagged standalone point', () => {
    const graph = graphOf(node('n1', 13.4, 52.5))
    const issues = validateWith(rules, graph, ['n1'], []).issues()
    expect(issues.map((issue) => issue.message)).toEqual(['This point has no tags'])
    expect(issues[0]?.loc).toEqual([13.4, 52.5])
  })

  it('reports an untagged line', () => {
    const graph = graphOf(node('n1', 0, 0), node('n2', 1, 0), way('w1', ['n1', 'n2']))
    const issues = validateWith(rules, graph, ['w1'], [wayIn(graph, 'w1')]).issues()
    expect(issues.map((issue) => issue.message)).toEqual(['This line has no tags'])
  })

  it('reports a line that has only a source tag', () => {
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 1, 0),
      way('w1', ['n1', 'n2'], { source: 'survey' }),
    )
    const issues = validateWith(rules, graph, ['w1'], [wayIn(graph, 'w1')]).issues()
    expect(issues.map((issue) => issue.message)).toEqual(['This line has no descriptive tags'])
  })

  it('reports a relation without a type', () => {
    const graph = graphOf(relation('r1', [], { landuse: 'forest' }))
    const issues = validateWith(rules, graph, ['r1'], []).issues()
    expect(issues.map((issue) => issue.message)).toEqual(['This relation has no type'])
  })

  it('reports a relation that has a name but no type', () => {
    // Rapid: a name is an attribute, not a description, so the relation has no descriptive tags
    const graph = graphOf(relation('r1', [], { name: 'Forest' }))
    expect(validateWith(rules, graph, ['r1'], []).issues()).toHaveLength(1)
  })

  it('does not report an untagged vertex of a tagged way', () => {
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 1, 0),
      way('w1', ['n1', 'n2'], { highway: 'residential' }),
    )
    expect(validateWith(rules, graph, ['n1'], []).issues()).toEqual([])
  })

  it('does not report a tagged point', () => {
    const graph = graphOf(node('n1', 0, 0, { amenity: 'bench' }))
    expect(validateWith(rules, graph, ['n1'], []).issues()).toEqual([])
  })

  it('does not report an untagged way that is a member of a multipolygon', () => {
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 1, 0),
      node('n3', 1, 1),
      way('w1', ['n1', 'n2', 'n3', 'n1']),
      relation('r1', [{ id: 'w1', type: 'way', role: 'outer' }], {
        type: 'multipolygon',
        building: 'yes',
      }),
    )
    expect(validateWith(rules, graph, ['w1'], [wayIn(graph, 'w1')]).issues()).toEqual([])
  })

  it('reports a road with the vague highway=road', () => {
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 1, 0),
      way('w1', ['n1', 'n2'], { highway: 'road' }),
    )
    const issues = validateWith(rules, graph, ['w1'], [wayIn(graph, 'w1')]).issues()
    expect(issues.map((issue) => issue.message)).toEqual(['This road has no specific highway type'])
  })

  it('offers to delete the feature, and the delete removes it', () => {
    const graph = graphOf(node('n1', 0, 0))
    const issue = validateWith(rules, graph, ['n1'], []).issues()[0]
    if (!issue) throw new Error('expected an issue')
    expect(issue.fixes.map((fix) => fix.label)).toEqual(['Delete this feature'])
    expect(applyFix(graph, fixOf(issue)).hasEntity('n1')).toBeUndefined()
  })
})

describe('disconnected_way', () => {
  const rules = [disconnectedWay]

  it('reports a lone residential road', () => {
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 1, 0),
      way('w1', ['n1', 'n2'], { highway: 'residential', name: 'Hauptstraße' }),
    )
    const issues = validateWith(rules, graph, ['w1'], [wayIn(graph, 'w1')]).issues()
    expect(issues.map((issue) => issue.message)).toEqual([
      'Hauptstraße is not connected to other roads',
    ])
    expect(issues[0]?.fixes.map((fix) => fix.label)).toEqual(['Delete this feature'])
  })

  it('reports two roads that connect to each other and to nothing else, with no fix', () => {
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 1, 0),
      node('n3', 2, 0),
      way('w1', ['n1', 'n2'], { highway: 'residential' }),
      way('w2', ['n2', 'n3'], { highway: 'residential' }),
    )
    const ways = [wayIn(graph, 'w1'), wayIn(graph, 'w2')]
    const issues = validateWith(rules, graph, ['w1', 'w2'], ways).issues()
    expect(issues).toHaveLength(1)
    expect(issues[0]?.entityIds).toEqual(['w1', 'w2'])
    expect(issues[0]?.message).toBe('This road is not connected to other roads')
    expect(issues[0]?.fixes).toEqual([])
  })

  it('is not reported when a road that is not validated connects to it', () => {
    // The network is the whole graph: w2 is loaded and shares n2, so w1 is connected. Only the
    // ids passed to validate decide what gets checked.
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 1, 0),
      node('n3', 2, 0),
      way('w1', ['n1', 'n2'], { highway: 'residential' }),
      way('w2', ['n2', 'n3'], { highway: 'residential' }),
    )
    expect(
      validateWith(rules, graph, ['w1'], [wayIn(graph, 'w1'), wayIn(graph, 'w2')]).issues(),
    ).toEqual([])
  })

  it('is not reported when the island reaches a road that is not validated', () => {
    // w1 and w2 are validated, w3 is not: the island w1-w2 reaches w3 through n3, so it is connected
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 1, 0),
      node('n3', 2, 0),
      node('n4', 3, 0),
      way('w1', ['n1', 'n2'], { highway: 'residential' }),
      way('w2', ['n2', 'n3'], { highway: 'residential' }),
      way('w3', ['n3', 'n4'], { highway: 'residential' }),
    )
    const ways = [wayIn(graph, 'w1'), wayIn(graph, 'w2'), wayIn(graph, 'w3')]
    expect(validateWith(rules, graph, ['w1', 'w2'], ways).issues()).toEqual([])
  })

  it('is not reported for a footway that reaches an entrance', () => {
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 1, 0, { entrance: 'yes' }),
      way('w1', ['n1', 'n2'], { highway: 'footway' }),
    )
    expect(validateWith(rules, graph, ['w1'], [wayIn(graph, 'w1')]).issues()).toEqual([])
  })

  it('is reported for a footway that only reaches an entrance marked no', () => {
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 1, 0, { entrance: 'no' }),
      way('w1', ['n1', 'n2'], { highway: 'footway' }),
    )
    expect(validateWith(rules, graph, ['w1'], [wayIn(graph, 'w1')]).issues()).toHaveLength(1)
  })
})

describe('crossing_ways', () => {
  const rules = [crossingWays]

  /** Two roads forming an X with no shared node: they cross at (1, 1) */
  function crossingRoads(tagsA: Record<string, string> = {}, tagsB: Record<string, string> = {}) {
    return graphOf(
      node('a1', 0, 0),
      node('a2', 2, 2),
      node('b1', 0, 2),
      node('b2', 2, 0),
      way('w1', ['a1', 'a2'], { highway: 'residential', name: 'Hauptstraße', ...tagsA }),
      way('w2', ['b1', 'b2'], { highway: 'residential', name: 'Nebenweg', ...tagsB }),
    )
  }

  it('reports two roads that cross without a shared node, at the intersection', () => {
    const graph = crossingRoads()
    const issues = validateWith(
      rules,
      graph,
      ['w1'],
      [wayIn(graph, 'w1'), wayIn(graph, 'w2')],
    ).issues()
    expect(issues).toHaveLength(1)
    const issue = issues[0]
    if (!issue) throw new Error('expected an issue')
    expect(issue.message).toBe('Hauptstraße crosses Nebenweg without a junction')
    expect(issue.entityIds).toEqual(['w1', 'w2'])
    expect(issue.loc?.[0]).toBeCloseTo(1, 7)
    expect(issue.loc?.[1]).toBeCloseTo(1, 7)
    expect(issue.fixes.map((fix) => fix.label)).toEqual(['Connect the features'])
  })

  it('reports no crossing when the two roads share the node at the crossing', () => {
    const graph = graphOf(
      node('a1', 0, 0),
      node('c', 1, 1),
      node('a2', 2, 2),
      node('b1', 0, 2),
      node('b2', 2, 0),
      way('w1', ['a1', 'c', 'a2'], { highway: 'residential' }),
      way('w2', ['b1', 'c', 'b2'], { highway: 'residential' }),
    )
    const ways = [wayIn(graph, 'w1'), wayIn(graph, 'w2')]
    expect(validateWith(rules, graph, ['w1', 'w2'], ways).issues()).toEqual([])
  })

  it('reports no crossing for a bridge on another layer', () => {
    const graph = crossingRoads({ bridge: 'yes', layer: '1' })
    expect(
      validateWith(rules, graph, ['w1'], [wayIn(graph, 'w1'), wayIn(graph, 'w2')]).issues(),
    ).toEqual([])
  })

  it('reports a road that crosses a building, without a connect fix', () => {
    // The square is closed: its first node is listed again at the end. The road crosses its left
    // edge (x = 1.5) at y = 1.5.
    const graph = graphOf(
      node('a1', 0, 0),
      node('a2', 2, 2),
      node('b1', 1.5, 0.5),
      node('b2', 3, 0.5),
      node('b3', 3, 3),
      node('b4', 1.5, 3),
      way('w1', ['a1', 'a2'], { highway: 'residential', name: 'Hauptstraße' }),
      way('w2', ['b1', 'b2', 'b3', 'b4', 'b1'], { building: 'yes' }),
    )
    const issues = validateWith(
      rules,
      graph,
      ['w1'],
      [wayIn(graph, 'w1'), wayIn(graph, 'w2')],
    ).issues()
    expect(issues).toHaveLength(1)
    const issue = issues[0]
    if (!issue) throw new Error('expected an issue')
    expect(issue.message).toBe('Hauptstraße crosses a building without a junction')
    expect(issue.entityIds).toEqual(['w1', 'w2'])
    expect(issue.loc?.[0]).toBeCloseTo(1.5, 7)
    expect(issue.loc?.[1]).toBeCloseTo(1.5, 7)
    expect(issue.fixes).toEqual([])
  })

  it('connects the two roads with one shared node, and then reports nothing', () => {
    const base = crossingRoads()
    const issue = validateWith(
      rules,
      base,
      ['w1'],
      [wayIn(base, 'w1'), wayIn(base, 'w2')],
    ).issues()[0]
    if (!issue) throw new Error('expected an issue')

    const after = applyFix(base, fixOf(issue))
    const w1 = wayIn(after, 'w1')
    const w2 = wayIn(after, 'w2')
    expect(w1.nodes).toHaveLength(3)
    expect(w2.nodes).toHaveLength(3)

    const shared = w1.nodes[1]
    expect(shared).toBeDefined()
    expect(w2.nodes[1]).toBe(shared)
    const junction = shared ? after.entity(shared) : undefined
    expect(junction).toBeInstanceOf(OsmNode)
    if (junction instanceof OsmNode) {
      expect(junction.loc?.[0]).toBeCloseTo(1, 7)
      expect(junction.loc?.[1]).toBeCloseTo(1, 7)
    }

    expect(validateWith(rules, after, ['w1', 'w2'], [w1, w2]).issues()).toEqual([])
  })
})

describe('validator', () => {
  it('lists issues for an entity, and keepOnly drops those whose first entity is not kept', () => {
    const graph = graphOf(
      node('a1', 0, 0),
      node('a2', 2, 2),
      node('b1', 0, 2),
      node('b2', 2, 0),
      way('w1', ['a1', 'a2'], { highway: 'residential' }),
      way('w2', ['b1', 'b2'], { highway: 'residential' }),
    )
    const validator = validateWith(
      [crossingWays],
      graph,
      ['w1'],
      [wayIn(graph, 'w1'), wayIn(graph, 'w2')],
    )
    expect(validator.issuesFor('w2')).toHaveLength(1)
    expect(validator.issuesFor('a1')).toEqual([])
    // several features: the issues that involve any of them, once each
    expect(validator.issuesForAll(['a1', 'w2'])).toHaveLength(1)
    expect(validator.issuesForAll(['a1'])).toEqual([])

    validator.keepOnly(['w2'])
    expect(validator.issues()).toEqual([])

    validator.validate(graph, ['w1'], [wayIn(graph, 'w2')])
    validator.keepOnly(['w1'])
    expect(validator.issues()).toHaveLength(1)
  })

  it('drops the issues of an entity that left the graph', () => {
    const base = graphOf(
      node('a1', 0, 0),
      node('a2', 2, 2),
      node('b1', 0, 2),
      node('b2', 2, 0),
      way('w1', ['a1', 'a2'], { highway: 'residential' }),
      way('w2', ['b1', 'b2'], { highway: 'residential' }),
    )
    const validator = validateWith(
      [crossingWays],
      base,
      ['w1'],
      [wayIn(base, 'w1'), wayIn(base, 'w2')],
    )
    expect(validator.issues()).toHaveLength(1)

    // w1 is deleted: the graph no longer holds it
    const without = graphOf(
      node('b1', 0, 2),
      node('b2', 2, 0),
      way('w2', ['b1', 'b2'], { highway: 'residential' }),
    )
    validator.validate(without, ['w1'], [wayIn(without, 'w2')])
    expect(validator.issues()).toEqual([])
  })

  it('does not stop the other rules when one rule throws', () => {
    const broken: Rule = {
      id: 'broken',
      label: 'Broken',
      validate() {
        throw new Error('boom')
      },
    }
    const graph = graphOf(node('n1', 0, 0))
    const issues = validateWith([broken, missingTag], graph, ['n1'], []).issues()
    expect(issues.map((issue) => issue.rule)).toEqual(['missing_tag'])
  })

  it('finds the same crossing from either way as one issue with the same id', () => {
    const graph = graphOf(
      node('a1', 0, 0),
      node('a2', 2, 2),
      node('b1', 0, 2),
      node('b2', 2, 0),
      way('w1', ['a1', 'a2'], { highway: 'residential' }),
      way('w2', ['b1', 'b2'], { highway: 'residential' }),
    )
    const ways = [wayIn(graph, 'w1'), wayIn(graph, 'w2')]

    const both = validateWith([crossingWays], graph, ['w1', 'w2'], ways)
    expect(both.issues()).toHaveLength(1)

    const fromFirst = validateWith([crossingWays], graph, ['w1'], ways).issues()[0]
    const fromSecond = validateWith([crossingWays], graph, ['w2'], ways).issues()[0]
    expect(fromFirst?.id).toBeDefined()
    expect(fromSecond?.id).toBe(fromFirst?.id ?? '')
  })
})

describe('speed', () => {
  it('validates 5 ways against 5,000 short ways in well under a second', () => {
    // A grid of 5,000 short residential ways that do not touch or cross
    const entities: OsmEntity[] = []
    const ways: OsmWay[] = []
    for (let k = 0; k < 5000; k++) {
      const lon = (k % 100) * 0.001
      const lat = Math.floor(k / 100) * 0.001
      const a = `n${2 * k + 1}`
      const b = `n${2 * k + 2}`
      const w = way(`w${k + 1}`, [a, b], { highway: 'residential' })
      entities.push(node(a, lon, lat), node(b, lon + 0.0004, lat), w)
      ways.push(w)
    }
    const graph = graphOf(...entities)
    const validator = createValidator(defaultRules)

    const start = performance.now()
    validator.validate(
      graph,
      ways.slice(0, 5).map((w) => w.id),
      ways,
    )
    const ms = performance.now() - start

    console.log(`validate: 5 ways against 5,000 ways took ${ms.toFixed(2)} ms`)
    expect(ms).toBeLessThan(1000)
    expect(validator.issues()).toHaveLength(5)
  })
})
