import { describe, expect, it } from 'bun:test'
import {
  Difference,
  Graph,
  ModelContext,
  OsmNode,
  OsmWay,
  actionChangeTags,
  actionMoveNode,
} from '@osm-editor-kit/maid-model'
import type { Action, OsmEntity, OsmTags } from '@osm-editor-kit/maid-model'
import { createValidator, defaultRules } from './index.ts'
import type { GraphChange, Issue, Rule } from './types.ts'

// `prepare` makes the boxes the first update would make, in idle time. Whether it ran in full, in chunks, or not
// at all before an edit, the issues must be the ones an update alone gives.

const context = new ModelContext()

function node(id: string, lon: number, lat: number, tags: OsmTags = {}): OsmNode {
  return new OsmNode(context, { id, loc: [lon, lat], tags })
}

function way(id: string, nodes: string[], tags: OsmTags = {}): OsmWay {
  return new OsmWay(context, { id, nodes, tags })
}

function waysOf(graph: Graph): OsmWay[] {
  const ways: OsmWay[] = []
  for (const [id, entity] of graph.base.entities)
    if (entity instanceof OsmWay && !graph.local.entities.has(id)) ways.push(entity)
  for (const entity of graph.local.entities.values())
    if (entity instanceof OsmWay) ways.push(entity)
  return ways
}

function edit(graph: Graph, actions: Action[]): Graph {
  return actions.reduce<Graph>((g, action) => action(g) as Graph, new Graph(graph))
}

function rowsOf(issues: readonly Issue[]) {
  return issues.map((issue) => ({
    id: issue.id,
    rule: issue.rule,
    severity: issue.severity,
    entityIds: [...issue.entityIds].sort(),
  }))
}

function changeOf(base: Graph, head: Graph): GraphChange {
  return { base, head, changes: new Difference(base, head).changes }
}

const base = new Graph(context, [
  // the main road, and a side road that starts north of it: nothing crosses until the side road moves
  node('m0', 0, 0),
  node('m1', 0.001, 0),
  node('m2', 0.002, 0),
  node('m3', 0.003, 0),
  node('m4', 0.004, 0),
  way('wM', ['m0', 'm1', 'm2', 'm3', 'm4'], { highway: 'primary', name: 'Main' }),
  node('s0', 0.0035, 0.002),
  node('s1', 0.0035, 0.003),
  way('wS', ['s0', 's1'], { highway: 'residential', name: 'Side' }),
  // a road that nobody connected, far away
  node('d1', 0.01, 0.01),
  node('d2', 0.011, 0.01),
  way('wD', ['d1', 'd2'], { highway: 'service', name: 'Lonely' }),
] as OsmEntity[])

// the side road is moved across the main road: its box must be made again, or the crossing is missed
const moved = edit(base, [actionMoveNode('s1', [0.0035, -0.001])])
// a second edit, a tag change, after the first
const tagged = edit(moved, [actionChangeTags('wD', { highway: 'service', name: 'Lonely road' })])

/**
 * A probe rule: for the main road, the ways its box overlaps, as `waysNear` gives them. A box that was made from
 * the base and not made again after the edit would leave the moved side road out.
 */
const probe: Rule = {
  id: 'probe',
  label: 'Probe',
  validate(entity, context) {
    if (entity.id !== 'wM') return []
    return [
      {
        id: `probe:${entity.id}`,
        rule: 'probe',
        severity: 'warning',
        message: 'probe',
        entityIds: [entity.id],
        fixes: [],
        data: { near: context.waysNear(entity as OsmWay).map((way) => way.id) },
      },
    ]
  },
}

/** The ways the probe found next to the main road, after a check of the main road on its own */
function probeNear(validator: ReturnType<typeof createValidator>, head: Graph) {
  validator.checkExisting(head, ['wM'], waysOf(head))
  const found = validator.existingIssues().find((issue) => issue.rule === 'probe')
  return found?.data?.near
}

/** The issues of a validator that is given the session, as the app's first update does it */
function issuesOf(validator: ReturnType<typeof createValidator>, head: Graph) {
  validator.update(changeOf(base, head), waysOf(head), new Difference(base, head).changes)
  return rowsOf(validator.issues())
}

describe('prepare, then the first update', () => {
  it('gives the same issues as an update alone, and the crossing is among them', () => {
    const alone = issuesOf(createValidator(defaultRules), moved)
    expect(alone.some((row) => row.rule === 'crossing_ways')).toBe(true)

    const whole = createValidator(defaultRules)
    whole.prepare(base, waysOf(base))
    expect(issuesOf(whole, moved)).toEqual(alone)

    const chunks = createValidator(defaultRules)
    const ways = waysOf(base)
    for (let i = 0; i < ways.length; i += 2) chunks.prepare(base, ways.slice(i, i + 2))
    expect(issuesOf(chunks, moved)).toEqual(alone)
  })

  it('an edit before the warm-up finished gives the same issues; the rest of the warm-up does nothing', () => {
    const alone = issuesOf(createValidator(defaultRules), moved)
    const ways = waysOf(base)
    const validator = createValidator(defaultRules)
    validator.prepare(base, ways.slice(0, 2))
    expect(issuesOf(validator, moved)).toEqual(alone)
    // the idle callbacks that come after the edit: they must not change what the validator holds
    validator.prepare(base, ways.slice(2))
    validator.prepare(base, ways)
    expect(rowsOf(validator.issues())).toEqual(alone)
  })

  it('a second edit after a warmed first update gives the same issues as a fresh validator', () => {
    const validator = createValidator(defaultRules)
    validator.prepare(base, waysOf(base))
    validator.update(changeOf(base, moved), waysOf(moved), new Difference(base, moved).changes)
    validator.update(changeOf(base, tagged), waysOf(tagged), new Difference(moved, tagged).changes)
    expect(rowsOf(validator.issues())).toEqual(issuesOf(createValidator(defaultRules), tagged))
  })

  it('the boxes made by a warm-up are made again for the edited side road (the probe sees it)', () => {
    const fresh = createValidator([...defaultRules, probe])
    issuesOf(fresh, moved)
    const expected = probeNear(fresh, moved)
    expect(expected).toContain('wS')

    const warmed = createValidator([...defaultRules, probe])
    warmed.prepare(base, waysOf(base))
    issuesOf(warmed, moved)
    expect(probeNear(warmed, moved)).toEqual(expected)
  })

  it('after a reset the warm-up is not used: the next update makes the boxes again', () => {
    const validator = createValidator(defaultRules)
    validator.prepare(base, waysOf(base))
    validator.reset()
    validator.prepare(
      base,
      waysOf(moved)
        .filter((way) => way.id !== 'wS')
        .slice(0, 1),
    )
    expect(issuesOf(validator, moved)).toEqual(issuesOf(createValidator(defaultRules), moved))
  })
})
