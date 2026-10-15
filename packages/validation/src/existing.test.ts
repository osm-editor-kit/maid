import { describe, expect, it } from 'bun:test'
import {
  Difference,
  Graph,
  ModelContext,
  OsmNode,
  OsmRelation,
  OsmWay,
} from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { createValidator, neighbourhoodOf, ON_DEMAND_MEMBER_CAP } from './index.ts'
import type { Rule } from './types.ts'

// Graphs are built by hand. A test rule flags every entity tagged flag=yes, so what is found is exactly what is tagged.

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
  tags: Record<string, string> = {},
): OsmRelation {
  return new OsmRelation(context, { id, members, tags })
}

function graphOf(...entities: OsmEntity[]): Graph {
  return new Graph(context, entities)
}

const flagged: Rule = {
  id: 'flagged',
  label: 'Flagged',
  validate(entity) {
    if (entity.tags.flag !== 'yes') return []
    return [
      {
        id: `flagged:${entity.id}`,
        rule: 'flagged',
        severity: 'warning',
        message: `${entity.id} is flagged`,
        entityIds: [entity.id],
        fixes: [],
      },
    ]
  },
}

/** Four flagged nodes, n1 to n4; n1 is the one the edits change in the update tests */
function flaggedNodes() {
  return graphOf(
    node('n1', 0, 0, { flag: 'yes' }),
    node('n2', 0.001, 0, { flag: 'yes' }),
    node('n3', 0.002, 0, { flag: 'yes' }),
    node('n4', 0.003, 0, { flag: 'yes' }),
  )
}

describe('mine and existing issues', () => {
  it('shows the existing issues of other data only when they are shown, and never counts them when quiet', () => {
    const graph = flaggedNodes()
    let shown = false
    const validator = createValidator([flagged], { showExisting: () => shown })
    validator.validate(graph, ['n1'], [])
    validator.checkExisting(graph, ['n2', 'n3'], [])

    // quiet: the edits' issue only, in every total
    expect(validator.issues().map((issue) => issue.id)).toEqual(['flagged:n1'])
    expect(validator.issuesFor('n2')).toEqual([])
    expect(validator.issuesForAll(['n2', 'n3'])).toEqual([])
    expect(validator.ignoredIssues()).toEqual([])
    // the quiet line still has them
    expect(validator.existingIssues().map((issue) => issue.id)).toEqual([
      'flagged:n2',
      'flagged:n3',
    ])
    expect(validator.existingIssuesFor('n2').map((issue) => issue.id)).toEqual(['flagged:n2'])
    expect(validator.existingIssuesFor('n1')).toEqual([])

    // shown: the same issues as the edits', in every read
    shown = true
    expect(validator.issues().map((issue) => issue.id)).toEqual([
      'flagged:n1',
      'flagged:n2',
      'flagged:n3',
    ])
    expect(validator.issuesFor('n2').map((issue) => issue.id)).toEqual(['flagged:n2'])
    expect(validator.issuesForAll(['n2', 'n3']).length).toBe(2)
  })

  it('keeps an issue that names an edited feature as the edits, even when a check finds it', () => {
    const graph = flaggedNodes()
    const validator = createValidator([flagged], { showExisting: () => false })
    validator.validate(graph, ['n1'], [])
    validator.checkExisting(graph, ['n1', 'n4'], [])
    expect(validator.existingIssuesFor('n1')).toEqual([])
    expect(validator.existingIssues().map((issue) => issue.id)).toEqual(['flagged:n4'])
    expect(validator.issues().map((issue) => issue.id)).toEqual(['flagged:n1'])
  })

  it('turns an existing issue into the edits one when the edits find it', () => {
    const graph = flaggedNodes()
    const validator = createValidator([flagged], { showExisting: () => false })
    validator.checkExisting(graph, ['n2'], [])
    expect(validator.existingIssuesFor('n2').length).toBe(1)
    validator.validate(graph, ['n2'], [])
    expect(validator.existingIssuesFor('n2')).toEqual([])
    expect(validator.issues().map((issue) => issue.id)).toEqual(['flagged:n2'])
  })

  it('makes its own issues in an update, and keeps the existing ones of other data', () => {
    const base = graphOf(node('n1', 0, 0), node('n2', 0.001, 0, { flag: 'yes' }))
    // the head is the base with the edit on top, as the editor makes it (a copy, then a replaced node)
    const head = new Graph(base).replace(node('n1', 0, 0, { flag: 'yes' }))
    const validator = createValidator([flagged], { showExisting: () => false })
    const changes = new Difference(base, head).changes
    // n2 is loaded and not edited: found by the check on demand
    validator.checkExisting(head, ['n2'], [])
    validator.update({ base, head, changes }, [])
    expect(validator.issues().map((issue) => issue.id)).toEqual(['flagged:n1'])
    expect(validator.existingIssues().map((issue) => issue.id)).toEqual(['flagged:n2'])
  })

  it('keeps an existing issue on an unchanged neighbour existing when an edit next to it is checked', () => {
    // w2 is flagged in the loaded data; w1 shares n2 with it and is edited (a tag, not a flag). w2 is validated again
    // by that edit, but nothing about w2 changed: its issue stays existing (both paths of update)
    const base = graphOf(
      node('n1', 0, 0),
      node('n2', 0.001, 0),
      node('n3', 0.002, 0),
      way('w1', ['n1', 'n2']),
      way('w2', ['n2', 'n3'], { flag: 'yes' }),
    )
    const head = new Graph(base).replace(way('w1', ['n1', 'n2'], { name: 'edited' }))
    const changes = new Difference(base, head).changes
    const validator = createValidator([flagged], { showExisting: () => false })
    validator.checkExisting(head, ['w2'], [])
    expect(validator.existingIssues().map((issue) => issue.id)).toEqual(['flagged:w2'])
    // the first update: no earlier head, so the whole session is checked
    validator.update({ base, head, changes }, [])
    expect(validator.existingIssues().map((issue) => issue.id)).toEqual(['flagged:w2'])
    expect(validator.issues()).toEqual([])
  })

  it('keeps an existing issue on an unchanged neighbour existing in a step after an earlier update', () => {
    const base = graphOf(
      node('n1', 0, 0),
      node('n2', 0.001, 0),
      node('n3', 0.002, 0),
      way('w1', ['n1', 'n2']),
      way('w2', ['n2', 'n3'], { flag: 'yes' }),
    )
    const start = new Graph(base)
    const head = new Graph(base).replace(way('w1', ['n1', 'n2'], { name: 'edited' }))
    const changes = new Difference(base, head).changes
    const validator = createValidator([flagged], { showExisting: () => false })
    // an update with nothing changed sets the earlier head the next step is compared with
    validator.update({ base, head: start, changes: new Map() }, [], new Map())
    validator.checkExisting(head, ['w2'], [])
    validator.update({ base, head, changes }, [], changes)
    expect(validator.existingIssues().map((issue) => issue.id)).toEqual(['flagged:w2'])
    expect(validator.issues()).toEqual([])
  })

  it("keeps a new issue that an edit makes on a neighbour as the edits' one", () => {
    // w2 is crowded: flagged once another way is next to it. The edit adds w1 next to it, so w2's issue is new
    const crowded: Rule = {
      id: 'crowded',
      label: 'Crowded',
      validate(entity, context) {
        if (!(entity instanceof OsmWay) || entity.tags.crowded !== 'yes') return []
        if (context.waysNear(entity).length === 0) return []
        return [
          {
            id: `crowded:${entity.id}`,
            rule: 'crowded',
            severity: 'warning',
            message: `${entity.id} has a neighbour`,
            entityIds: [entity.id],
            fixes: [],
          },
        ]
      },
    }
    const w2 = way('w2', ['n1', 'n2'], { crowded: 'yes' })
    const base = graphOf(node('n1', 0, 0), node('n2', 0.001, 0), node('n3', 0.002, 0), w2)
    const w1 = way('w1', ['n2', 'n3'])
    const head = new Graph(base).replace(w1)
    const changes = new Difference(base, head).changes
    const validator = createValidator([crowded], { showExisting: () => false })
    validator.update({ base, head, changes }, [w2, w1])
    expect(validator.issues().map((issue) => issue.id)).toEqual(['crowded:w2'])
    expect(validator.existingIssues()).toEqual([])
  })

  it('a validator without the option, as the save path has, counts the edits only', () => {
    const graph = flaggedNodes()
    const validator = createValidator([flagged])
    validator.validate(graph, ['n1'], [])
    validator.checkExisting(graph, ['n2'], [])
    expect(validator.issues().map((issue) => issue.id)).toEqual(['flagged:n1'])
    expect(validator.ignoredIssues()).toEqual([])
  })

  it('a check replaces the existing issues of the last check', () => {
    const graph = flaggedNodes()
    const validator = createValidator([flagged])
    validator.checkExisting(graph, ['n1', 'n2'], [])
    validator.checkExisting(graph, ['n3'], [])
    expect(validator.existingIssues().map((issue) => issue.id)).toEqual(['flagged:n3'])
  })

  it('leaves out an ignored existing issue, as it leaves out an ignored issue of the edits', () => {
    const graph = flaggedNodes()
    const ignored = new Set(['flagged:n2'])
    const validator = createValidator([flagged], {
      showExisting: () => true,
      ignored: () => ignored,
    })
    validator.checkExisting(graph, ['n2', 'n3'], [])
    expect(validator.existingIssues().map((issue) => issue.id)).toEqual(['flagged:n3'])
    expect(validator.issuesFor('n2')).toEqual([])
    // the list to show again has it, since existing data is shown
    expect(validator.ignoredIssues().map((issue) => issue.id)).toEqual(['flagged:n2'])
  })

  it('counts the ignored issues of existing data only when they are shown', () => {
    const graph = flaggedNodes()
    let shown = false
    const validator = createValidator([flagged], {
      showExisting: () => shown,
      ignored: () => new Set(['flagged:n2']),
    })
    validator.checkExisting(graph, ['n2'], [])
    expect(validator.ignoredIssues()).toEqual([])
    shown = true
    expect(validator.ignoredIssues().map((issue) => issue.id)).toEqual(['flagged:n2'])
  })

  it('reset forgets the existing issues, and keeps the edits', () => {
    const graph = flaggedNodes()
    const validator = createValidator([flagged], { showExisting: () => true })
    validator.validate(graph, ['n1'], [])
    validator.checkExisting(graph, ['n2'], [])
    validator.reset()
    expect(validator.existingIssues()).toEqual([])
    expect(validator.issues().map((issue) => issue.id)).toEqual(['flagged:n1'])
  })
})

describe('neighbourhoodOf', () => {
  // n1 - n2 - n3 along two ways; r1 holds w1 and n3, r2 holds r1
  const graph = graphOf(
    node('n1', 0, 0),
    node('n2', 0.001, 0),
    node('n3', 0.002, 0),
    way('w1', ['n1', 'n2']),
    way('w2', ['n2', 'n3']),
    relation('r1', [
      { id: 'w1', type: 'way', role: 'outer' },
      { id: 'n3', type: 'node', role: '' },
      { id: 'w9', type: 'way', role: '' },
    ]),
    relation('r2', [{ id: 'r1', type: 'relation', role: '' }]),
  )

  it('takes the feature, its ways, and the relations of it and of those ways', () => {
    const { ids, omittedMembers } = neighbourhoodOf(graph, 'n1')
    expect(ids[0]).toBe('n1')
    expect(new Set(ids)).toEqual(new Set(['n1', 'w1', 'r1']))
    expect(omittedMembers).toBe(0)
  })

  it('takes the loaded members of a relation and leaves out the ones that are not loaded', () => {
    const { ids, omittedMembers } = neighbourhoodOf(graph, 'r1')
    expect(new Set(ids)).toEqual(new Set(['r1', 'w1', 'n3', 'r2']))
    expect(ids).not.toContain('w9')
    expect(omittedMembers).toBe(0)
  })

  it('names nothing for a feature the graph does not hold', () => {
    expect(neighbourhoodOf(graph, 'w404')).toEqual({ ids: [], omittedMembers: 0 })
  })

  it('caps the members of a relation at the first 500, and says how many were left out', () => {
    expect(ON_DEMAND_MEMBER_CAP).toBe(500)
    const members = Array.from({ length: 600 }, (_, index) => `m${index + 1}`)
    const big = graphOf(
      ...members.map((id, index) => node(id, index * 0.0001, 0)),
      relation(
        'rBig',
        members.map((id) => ({ id, type: 'node' as const, role: '' })),
      ),
    )
    const { ids, omittedMembers } = neighbourhoodOf(big, 'rBig')
    expect(ids.length).toBe(1 + ON_DEMAND_MEMBER_CAP)
    expect(ids).toContain('m500')
    expect(ids).not.toContain('m501')
    expect(omittedMembers).toBe(100)
  })
})
