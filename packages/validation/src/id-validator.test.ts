// Adopted from iD test/spec/core/validator.js (ISC, © iD contributors), at commit 0194f3926.
// validate() is synchronous in Maid, so iD's "returns a promise" test is n/a.
import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { createValidator, defaultRules } from './index.ts'
import type { Rule } from './types.ts'

// Same coordinates and data as iD's spec (lon, lat near the equator).
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

function wayIn(graph: Graph, id: string): OsmWay {
  const entity = graph.entity(id)
  if (!(entity instanceof OsmWay)) throw new Error(`${id} is not a way`)
  return entity
}

/** Validates the changed ids of a graph with these rules, and returns the validator to ask for issues */
function validateWith(rules: readonly Rule[], graph: Graph, ids: string[], ways: OsmWay[]) {
  const validator = createValidator(rules)
  validator.validate(graph, ids, ways)
  return validator
}

describe('iD.coreValidator', () => {
  it('has no issues on init', () => {
    expect(createValidator(defaultRules).issues()).toEqual([])
  })

  it('removes validation issue when highway is no longer disconnected', () => {
    // A way which is disconnected from the rest of the map
    const before = graphOf(
      node('n-1', 4, 4),
      node('n-2', 4, 5),
      way('w-1', ['n-1', 'n-2'], { highway: 'unclassified' }),
    )
    const first = validateWith(defaultRules, before, ['w-1', 'n-1', 'n-2'], [wayIn(before, 'w-1')])
    expect(first.issues()).toHaveLength(1)

    // A new way with an entrance node simulates the connection with the rest of the map
    const after = graphOf(
      node('n-1', 4, 4),
      node('n-2', 4, 5),
      node('n-3', 4, 6, { entrance: 'yes' }),
      way('w-1', ['n-1', 'n-2'], { highway: 'unclassified' }),
      way('w-2', ['n-2', 'n-3'], { highway: 'unclassified' }),
    )
    const second = validateWith(
      defaultRules,
      after,
      ['w-1', 'w-2', 'n-3'],
      [wayIn(after, 'w-1'), wayIn(after, 'w-2')],
    )
    expect(second.issues()).toHaveLength(0)
  })

  // needs F-core-9: the app passes only the entities with a head in the difference, so a way that a deletion
  // leaves disconnected (w-1 here) is not checked
  it.todo('add validation issue when highway becomes disconnected', () => {})

  it('removes validation issue when untagged way becomes part of a boundary relation', () => {
    const n1 = node('n-1', 4, 4)
    const n2 = node('n-2', 4, 5)
    const n3 = node('n-3', 4, 6)
    const w1 = way('w-1', ['n-1', 'n-2'], { description: 'foo' })
    const w2 = way('w-2', ['n-2', 'n-3'], {})
    const r = relation('r-1', [{ id: 'w-2', type: 'way', role: '' }], { type: 'boundary' })
    const before = graphOf(n1, n2, n3, w1, w2, r)

    // There should be a validation error about the untagged way
    const first = validateWith(defaultRules, before, ['w-1', 'w-2', 'r-1'], [w1, w2])
    expect(first.issues()).toHaveLength(1)

    // Add the way to the relation
    const r2 = relation(
      'r-1',
      [
        { id: 'w-2', type: 'way', role: '' },
        { id: 'w-1', type: 'way', role: '' },
      ],
      { type: 'boundary' },
    )
    const after = graphOf(n1, n2, n3, w1, w2, r2)
    const second = validateWith(defaultRules, after, ['w-1', 'r-1'], [w1, w2])
    expect(second.issues()).toHaveLength(0)
  })

  it('add validation issue when untagged way is removed from boundary relation', () => {
    // A way is "untagged", but part of a larger (boundary) relation
    const n1 = node('n-1', 4, 4)
    const n2 = node('n-2', 4, 5)
    const w1 = way('w-1', ['n-1', 'n-2'], { description: 'foo' })
    const r = relation('r-1', [{ id: 'w-1', type: 'way', role: '' }], { type: 'boundary' })
    const before = graphOf(n1, n2, w1, r)

    const first = validateWith(defaultRules, before, ['w-1', 'r-1'], [w1])
    expect(first.issues()).toHaveLength(0)

    // Delete the relation
    const after = graphOf(n1, n2, w1)
    const second = validateWith(defaultRules, after, ['r-1', 'w-1'], [w1])
    expect(second.issues()).toHaveLength(1)
  })
})
