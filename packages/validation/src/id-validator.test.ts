// Adopted from iD test/spec/core/validator.js (ISC, © iD contributors), at commit 0194f3926.
// validate() is synchronous in Maid, so iD's "returns a promise" test is n/a.
import { describe, expect, it } from 'bun:test'
import {
  Difference,
  Graph,
  ModelContext,
  OsmNode,
  OsmRelation,
  OsmWay,
  actionDeleteWay,
  actionMoveNode,
} from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { createValidator, defaultRules } from './index.ts'
import type { GraphChange, Rule } from './types.ts'
import { entitiesToValidate } from './validator.ts'

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

/** The whole difference from `base` to `head`, as the history gives it to the validator */
function changeFrom(base: Graph, head: Graph): GraphChange {
  return { base, head, changes: new Difference(base, head).changes }
}

/** The ways of a graph with these ids (the ones that exist in it) */
function waysWhich(graph: Graph, ids: string[]): OsmWay[] {
  return ids.flatMap((id) => {
    const entity = graph.hasEntity(id)
    return entity instanceof OsmWay ? [entity] : []
  })
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

  it('add validation issue when highway becomes disconnected', () => {
    // Add a way which is connected to another way with an entrance node to simulate connection with rest of map
    const n1 = node('n-1', 4, 4)
    const n2 = node('n-2', 4, 5)
    const w1 = way('w-1', ['n-1', 'n-2'], { highway: 'unclassified' })
    const n3 = node('n-3', 4, 6, { entrance: 'yes' })
    const w2 = way('w-2', ['n-2', 'n-3'], { highway: 'unclassified' })
    const base = graphOf(n1, n2, w1, n3, w2)
    const validator = createValidator(defaultRules)

    // Should be no errors
    validator.update(changeFrom(base, base), waysWhich(base, ['w-1', 'w-2']))
    expect(validator.issues()).toHaveLength(0)

    // delete second way -> first way becomes disconnected from the rest of the map. w-1 is not changed,
    // so only the neighbours of the deletion make it checked again
    const head = actionDeleteWay('w-2')(new Graph(base))
    validator.update(changeFrom(base, head), waysWhich(head, ['w-1']))
    // Should produce disconnected way error
    const issues = validator.issues()
    expect(issues).toHaveLength(1)
    expect(issues[0]!.rule).toBe('disconnected_way')
    expect(issues[0]!.entityIds).toContain('w-1')
  })

  it('removes the issue of a way that is deleted', () => {
    const n1 = node('n-1', 4, 4)
    const n2 = node('n-2', 4, 5)
    const w1 = way('w-1', ['n-1', 'n-2'])
    const base = graphOf(n1, n2, w1)
    const validator = createValidator(defaultRules)

    // Tagging the way makes it an unconnected road
    const tagged = new Graph(base).replace(w1.mergeTags({ highway: 'unclassified' }))
    validator.update(changeFrom(base, tagged), waysWhich(tagged, ['w-1']))
    expect(validator.issues()).toHaveLength(1)

    // Deleting it again: nothing is left to report
    const deleted = actionDeleteWay('w-1')(new Graph(base))
    validator.update(changeFrom(base, deleted), [])
    expect(validator.issues()).toHaveLength(0)
  })

  it('removes validation issue when highway is no longer disconnected after an edit elsewhere', () => {
    // A road without a link to the rest of the map has an issue, which an edit elsewhere (a way that
    // connects it to an entrance) takes away. The road itself is not changed by that edit.
    const n1 = node('n-1', 4, 4)
    const n2 = node('n-2', 4, 5)
    const n3 = node('n-3', 4, 6, { entrance: 'yes' })
    const w1 = way('w-1', ['n-1', 'n-2'])
    const base = graphOf(n1, n2, n3, w1)
    const validator = createValidator(defaultRules)

    const tagged = new Graph(base).replace(w1.mergeTags({ highway: 'unclassified' }))
    validator.update(changeFrom(base, tagged), waysWhich(tagged, ['w-1']))
    expect(validator.issues()).toHaveLength(1)

    const connected = new Graph(tagged).replace(
      way('w-2', ['n-2', 'n-3'], { highway: 'unclassified' }),
    )
    validator.update(changeFrom(base, connected), waysWhich(connected, ['w-1', 'w-2']))
    expect(validator.issues()).toHaveLength(0)
  })

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

// Maid's own tests of the collection that decides what is checked again after a difference. iD has no
// such function: its validator collects the same ids inside validate() (core/validator.js).
describe('entitiesToValidate', () => {
  // w-1 and w-2 share n-2; w-2 and w-3 share n-3; w-far is apart from the others
  function sceneEntities(): OsmEntity[] {
    return [
      node('n-1', 4, 4),
      node('n-2', 4, 5),
      node('n-3', 4, 6),
      node('n-4', 4, 7),
      node('n-5', 10, 10),
      node('n-6', 10, 11),
      way('w-1', ['n-1', 'n-2'], { highway: 'unclassified' }),
      way('w-2', ['n-2', 'n-3'], { highway: 'unclassified' }),
      way('w-3', ['n-3', 'n-4'], { highway: 'unclassified' }),
      way('w-far', ['n-5', 'n-6'], { highway: 'unclassified' }),
    ]
  }

  const scene = (): Graph => graphOf(...sceneEntities())

  function checked(base: Graph, head: Graph): Set<string> {
    return entitiesToValidate(new Difference(base, head).changes, base, head)
  }

  it('is empty when nothing changed', () => {
    const base = scene()
    expect(checked(base, base)).toEqual(new Set())
  })

  it('includes the ways that shared a node with a deleted way', () => {
    const base = scene()
    const head = actionDeleteWay('w-2')(new Graph(base))
    const ids = checked(base, head)
    expect(ids).toContain('w-2') // the deleted way: the validator drops its issues
    expect(ids).toContain('w-1') // shares n-2
    expect(ids).toContain('w-3') // shares n-3
    expect(ids).not.toContain('w-far')
  })

  it('includes the ways that used a deleted node', () => {
    const base = scene()
    const head = new Graph(base).remove(base.entity('n-2'))
    const ids = checked(base, head)
    expect(ids).toContain('n-2')
    expect(ids).toContain('w-1')
    expect(ids).toContain('w-2')
    expect(ids).not.toContain('w-far')
  })

  it('includes a relation whose member was deleted, when the deletion changes the relation', () => {
    const base = graphOf(
      ...sceneEntities(),
      relation('r-1', [{ id: 'w-far', type: 'way', role: '' }], { type: 'boundary' }),
    )
    const head = actionDeleteWay('w-far')(new Graph(base))
    const ids = checked(base, head)
    expect(ids).toContain('w-far')
    expect(ids).toContain('r-1')
  })

  it('includes a relation that still lists a deleted member, when the relation is not changed', () => {
    const base = graphOf(
      ...sceneEntities(),
      relation('r-1', [{ id: 'w-far', type: 'way', role: '' }], { type: 'boundary' }),
    )
    const head = new Graph(base).remove(base.entity('w-far'))
    const ids = checked(base, head)
    expect(ids).toContain('w-far')
    expect(ids).toContain('r-1')
  })

  it('includes the ways of a moved node, and the relations above them', () => {
    const base = graphOf(
      ...sceneEntities(),
      relation('r-1', [{ id: 'w-1', type: 'way', role: '' }], { type: 'boundary' }),
    )
    const head = actionMoveNode('n-2', [4.5, 5])(new Graph(base))
    const ids = checked(base, head)
    expect(ids).toContain('n-2')
    expect(ids).toContain('w-1')
    expect(ids).toContain('w-2')
    expect(ids).toContain('r-1')
    expect(ids).not.toContain('w-3') // no node of w-3 moved
    expect(ids).not.toContain('w-far')
  })

  it('includes the members a modified relation gained or lost, and not the ones it kept', () => {
    const base = graphOf(
      ...sceneEntities(),
      relation(
        'r-1',
        [
          { id: 'w-1', type: 'way', role: '' },
          { id: 'w-3', type: 'way', role: '' },
        ],
        { type: 'boundary' },
      ),
    )
    const r1 = base.entity('r-1') as OsmRelation
    const head = new Graph(base).replace(
      r1.update({ members: [r1.members[0]!, { id: 'w-far', type: 'way', role: '' }] }),
    )
    const ids = checked(base, head)
    expect(ids).toContain('r-1')
    expect(ids).toContain('w-3') // lost
    expect(ids).toContain('w-far') // gained
    expect(ids).not.toContain('w-1') // kept
  })

  it('includes the ways a created way connects to, and the nodes it gained', () => {
    const base = scene()
    const head = new Graph(base).replace(way('w-new', ['n-4', 'n-5'], { highway: 'path' }))
    const ids = checked(base, head)
    expect(ids).toContain('w-new')
    expect(ids).toContain('n-4')
    expect(ids).toContain('n-5')
    expect(ids).toContain('w-3') // shares n-4
    expect(ids).toContain('w-far') // shares n-5
    expect(ids).not.toContain('w-1')
  })
})
