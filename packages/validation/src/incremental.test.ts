import { describe, expect, it } from 'bun:test'
import {
  Difference,
  Graph,
  ModelContext,
  OsmNode,
  OsmWay,
  actionAddEntity,
  actionChangeTags,
  actionDeleteWay,
  actionMoveNode,
} from '@osm-editor-kit/maid-model'
import type { Action, OsmEntity, OsmTags } from '@osm-editor-kit/maid-model'
import { createValidator, defaultRules } from './index.ts'
import type { GraphChange, Issue } from './types.ts'

// Incremental validation must give the same issues as a fresh validator that is given the whole
// session's difference. The session is a list of stable graphs, as the history keeps them: an edit
// adds a graph after the current one, undo and redo move along the list, and the base is the first.

const context = new ModelContext()

function node(id: string, lon: number, lat: number, tags: OsmTags = {}): OsmNode {
  return new OsmNode(context, { id, loc: [lon, lat], tags })
}

function way(id: string, nodes: string[], tags: OsmTags = {}): OsmWay {
  return new OsmWay(context, { id, nodes, tags })
}

function graphOf(...entities: OsmEntity[]): Graph {
  return new Graph(context, entities)
}

/** Every way of a graph: the base ways not overridden locally, then the local ones */
function waysOf(graph: Graph): OsmWay[] {
  const ways: OsmWay[] = []
  for (const [id, entity] of graph.base.entities)
    if (entity instanceof OsmWay && !graph.local.entities.has(id)) ways.push(entity)
  for (const entity of graph.local.entities.values())
    if (entity instanceof OsmWay) ways.push(entity)
  return ways
}

/** The ids of the entities that a graph has (deleted ones are left out) */
function idsOf(graph: Graph): string[] {
  const ids = new Set<string>()
  for (const [id, entity] of graph.base.entities) if (entity) ids.add(id)
  for (const [id, entity] of graph.local.entities) {
    if (entity) ids.add(id)
    else ids.delete(id)
  }
  return [...ids].sort()
}

/** The issues as a comparable list, in the order of `issues()`, with the entity ids sorted */
function rowsOf(issues: readonly Issue[]) {
  return issues.map((issue) => ({
    id: issue.id,
    rule: issue.rule,
    severity: issue.severity,
    message: issue.message,
    // the entities an issue names, sorted: the order of the first one depends on the run that found it
    entityIds: [...issue.entityIds].sort(),
  }))
}

// The loaded data: nothing here is changed by the session at first.
const base = graphOf(
  // the main road, with a node in the middle that a side road joins
  node('m0', 0, 0),
  node('m1', 0.001, 0),
  node('m2', 0.002, 0),
  node('m3', 0.003, 0),
  node('m4', 0.004, 0),
  way('wM', ['m0', 'm1', 'm2', 'm3', 'm4'], { highway: 'primary', name: 'Main' }),
  node('s1b', 0.002, 0.002),
  way('wS1', ['m2', 's1b'], { highway: 'residential', name: 'Side' }),
  // a road that nobody connected: other people's mistake, reported only if it is changed
  node('d1', 0.01, 0.01),
  node('d2', 0.011, 0.01),
  way('wD', ['d1', 'd2'], { highway: 'service', name: 'Lonely' }),
  // a building that roads may cross
  node('b1', 0.006, 0),
  node('b2', 0.007, 0),
  node('b3', 0.007, 0.001),
  node('b4', 0.006, 0.001),
  way('wB', ['b1', 'b2', 'b3', 'b4', 'b1'], { building: 'yes' }),
  // a footway and a point
  node('e1', 0, 0.002),
  node('e2', 0.001, 0.002),
  way('wE', ['e1', 'e2'], { highway: 'footway', name: 'Foot' }),
  node('p1', 0.0005, -0.0005, { amenity: 'bench' }),
)

/** One edit: the actions in order, applied to a copy of the graph (one undo step) */
function edit(graph: Graph, actions: Action[]): Graph {
  return actions.reduce<Graph>((g, action) => action(g) as Graph, new Graph(graph))
}

/** Creates entities, or replaces the ones with the same id */
function put(...entities: OsmEntity[]): Action[] {
  return entities.map((entity) => actionAddEntity(entity))
}

type Step =
  | { name: string; actions: (graph: Graph) => Action[] }
  | { name: string; undo: true }
  | { name: string; redo: true }

const scripted: Step[] = [
  {
    name: 'add a road that crosses the main road without a shared node',
    actions: () =>
      put(
        node('r1', 0.0035, -0.002),
        node('r2', 0.0035, 0.002),
        way('wR1', ['r1', 'r2'], { highway: 'residential', name: 'Cross' }),
      ),
  },
  {
    name: 'move the north end of the crossing road',
    actions: () => [actionMoveNode('r2', [0.0035, 0.0025])],
  },
  {
    name: 'change the crossing road to a service road',
    actions: () => [actionChangeTags('wR1', { highway: 'service', name: 'Cross' })],
  },
  {
    name: 'add a road across the building (the building is not changed)',
    actions: () =>
      put(
        node('q1', 0.0065, -0.0005),
        node('q2', 0.0065, 0.0015),
        way('wR2', ['q1', 'q2'], { highway: 'residential' }),
      ),
  },
  { name: 'undo the building crossing', undo: true },
  { name: 'redo the building crossing', redo: true },
  {
    name: 'fix the crossing: a node on the main road that the crossing road uses',
    actions: () =>
      put(
        node('x', 0.0035, 0),
        way('wM', ['m0', 'm1', 'm2', 'm3', 'x', 'm4'], { highway: 'primary', name: 'Main' }),
        way('wR1', ['r1', 'x', 'r2'], { highway: 'service', name: 'Cross' }),
      ),
  },
  {
    name: 'move the shared node a little east',
    actions: () => [actionMoveNode('x', [0.00352, 0])],
  },
  { name: 'move a node of the main road', actions: () => [actionMoveNode('m1', [0.0011, 0.0001])] },
  {
    name: 'change the side road (not changed before) to a primary road',
    actions: () => [actionChangeTags('wS1', { highway: 'primary', name: 'Side' })],
  },
  { name: 'delete the road across the building', actions: () => [actionDeleteWay('wR2')] },
  { name: 'undo the deletion', undo: true },
  { name: 'undo the side road change', undo: true },
  { name: 'redo the side road change', redo: true },
  { name: 'redo the deletion', redo: true },
  {
    name: 'add an untagged line (a missing tag)',
    actions: () => put(node('u1', 0.03, 0.03), node('u2', 0.031, 0.03), way('wU', ['u1', 'u2'])),
  },
  {
    name: 'add a footway that nobody connects',
    actions: () =>
      put(
        node('g1', 0.02, 0.02),
        node('g2', 0.021, 0.02),
        way('wG', ['g1', 'g2'], { highway: 'footway' }),
      ),
  },
  {
    name: 'join the lonely road to the new footway: an island of two, the lonely road is not changed',
    actions: () => put(way('wD', ['d2', 'g1'], { highway: 'service', name: 'Lonely' })),
  },
  {
    name: 'move the far end of the lonely road',
    actions: () => [actionMoveNode('d1', [0.0105, 0.0105])],
  },
  { name: 'undo the move', undo: true },
  { name: 'redo the move', redo: true },
  { name: 'undo the move again', undo: true },
  { name: 'undo the lonely road join', undo: true },
  { name: 'redo the lonely road join', redo: true },
  {
    name: 'tag the untagged line: the earlier missing tag is fixed',
    actions: () => [actionChangeTags('wU', { highway: 'track' })],
  },
  {
    name: 'a footway through the corner of the building',
    actions: () =>
      put(
        node('f1', 0.0055, 0.0005),
        node('f2', 0.0075, 0.0005),
        way('wF', ['f1', 'f2'], { highway: 'footway' }),
      ),
  },
  {
    name: 'change the building to a parking',
    actions: () => [actionChangeTags('wB', { amenity: 'parking' })],
  },
  {
    name: 'change the bench to a waste basket',
    actions: () => [actionChangeTags('p1', { amenity: 'waste_basket' })],
  },
  { name: 'delete the footway through the parking', actions: () => [actionDeleteWay('wF')] },
  { name: 'undo the deletion of the footway', undo: true },
  { name: 'undo the parking', undo: true },
  { name: 'undo the bench', undo: true },
  { name: 'redo the bench', redo: true },
  { name: 'redo the parking', redo: true },
]

/**
 * A seeded walk of more edits, so the session also covers combinations the script does not name.
 * The ids come from the graph after the script; each edit checks the entity exists when it runs.
 */
function walk(count: number, seed: number, graph: Graph): Step[] {
  const ids = idsOf(graph)
  const nodeIds = ids.filter((id) => graph.hasEntity(id) instanceof OsmNode)
  const wayIds = ids.filter((id) => graph.hasEntity(id) instanceof OsmWay)
  const steps: Step[] = []
  let state = seed
  const next = (n: number): number => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state % n
  }
  const pick = (list: string[]): string => list[next(list.length)]!
  let counter = 0
  for (let i = 0; i < count; i++) {
    const roll = next(10)
    if (roll < 2) {
      steps.push({ name: `walk ${i}: undo`, undo: true })
    } else if (roll < 3) {
      steps.push({ name: `walk ${i}: redo`, redo: true })
    } else if (roll < 5) {
      counter++
      const a = `k${counter}`
      const b = `l${counter}`
      const lon = 0.0045 + (counter % 7) * 0.00004
      const lat = 0.0025 + (counter % 5) * 0.0001
      steps.push({
        name: `walk ${i}: a new road`,
        actions: () =>
          put(
            node(a, lon, lat),
            node(b, lon, -0.0015),
            way(`wK${counter}`, [a, b], { highway: 'residential' }),
          ),
      })
    } else if (roll < 7) {
      const target = pick(nodeIds)
      const dx = (next(11) - 5) * 0.00002
      const dy = (next(11) - 5) * 0.00002
      steps.push({
        name: `walk ${i}: move ${target}`,
        actions: (g) => {
          const entity = g.hasEntity(target)
          if (!(entity instanceof OsmNode) || !entity.loc) return []
          return [actionMoveNode(target, [entity.loc[0] + dx, entity.loc[1] + dy])]
        },
      })
    } else if (roll < 8) {
      const target = pick(wayIds)
      const value = ['residential', 'service', 'footway', 'primary', 'track'][next(5)]!
      steps.push({
        name: `walk ${i}: tags of ${target}`,
        actions: (g) => (g.hasEntity(target) ? [actionChangeTags(target, { highway: value })] : []),
      })
    } else {
      const target = pick(wayIds)
      steps.push({
        name: `walk ${i}: delete ${target}`,
        actions: (g) => (g.hasEntity(target) ? [actionDeleteWay(target)] : []),
      })
    }
  }
  return steps
}

/**
 * Plays the steps as the history does: each edit is a new stable graph after the current one, and undo
 * and redo move along the list (an edit after an undo drops the redo part).
 */
function play(steps: Step[]): { name: string; prev: Graph; graph: Graph }[] {
  let states: Graph[] = [base]
  let at = 0
  const out: { name: string; prev: Graph; graph: Graph }[] = []
  for (const step of steps) {
    const prev = states[at]!
    if ('undo' in step) {
      if (at > 0) at--
    } else if ('redo' in step) {
      if (at < states.length - 1) at++
    } else {
      const graph = edit(prev, step.actions(prev))
      states = [...states.slice(0, at + 1), graph]
      at++
    }
    out.push({ name: step.name, prev, graph: states[at]! })
  }
  return out
}

/** The whole session: the scripted steps, then 40 seeded ones */
function sessionSteps() {
  const scriptedRun = play(scripted)
  const finalGraph = scriptedRun[scriptedRun.length - 1]!.graph
  return play([...scripted, ...walk(40, 20261013, finalGraph)])
}

/** The difference of the whole session, as the history gives it: from the base to the head */
function sessionChange(head: Graph): GraphChange {
  return { base, head, changes: new Difference(base, head).changes }
}

/**
 * The incremental path as the editor runs it: one validator for the whole session. Each commit gives
 * the whole session's difference, the step's changes, and the way list, which is read once (when the
 * first change comes) and then changed by each step's difference, as the editor does.
 */
function incrementalPath() {
  const validator = createValidator(defaultRules)
  let ways: Map<string, OsmWay> | undefined
  return {
    validator,
    commit(prev: Graph, graph: Graph): void {
      const step = new Difference(prev, graph).changes
      if (ways) {
        for (const id of step.keys()) {
          const entity = graph.hasEntity(id)
          if (entity instanceof OsmWay) ways.set(id, entity)
          else ways.delete(id)
        }
      } else if (step.size > 0) {
        ways = new Map(waysOf(graph).map((way) => [way.id, way]))
      }
      validator.update(sessionChange(graph), ways?.values() ?? [], step)
    },
  }
}

/** The oracle: a fresh validator given the whole session's difference and the way list of the graph */
function freshIssues(graph: Graph) {
  const fresh = createValidator(defaultRules)
  fresh.update(sessionChange(graph), waysOf(graph))
  return fresh.issues()
}

describe('incremental validation equals a fresh validation of the whole session', () => {
  it('has at least 40 steps, and the session reports several kinds of issue', () => {
    const steps = sessionSteps()
    expect(steps.length).toBeGreaterThanOrEqual(40)
    const path = incrementalPath()
    const kinds = new Set<string>()
    let stepsWithIssues = 0
    for (const { prev, graph } of steps) {
      path.commit(prev, graph)
      const issues = path.validator.issues()
      if (issues.length > 0) stepsWithIssues++
      for (const issue of issues) kinds.add(issue.rule)
    }
    expect(stepsWithIssues).toBeGreaterThan(20)
    expect([...kinds].sort()).toEqual(
      expect.arrayContaining(['crossing_ways', 'disconnected_way', 'missing_tag']),
    )
  })

  it('after every step, the same issues as a fresh validator given the whole session', () => {
    const steps = sessionSteps()
    const path = incrementalPath()
    steps.forEach(({ prev, graph, name }, index) => {
      path.commit(prev, graph)
      // ids, rules, severities, messages and the entities each issue names, in the order of `issues()`
      expect({ step: `${index}: ${name}`, issues: rowsOf(path.validator.issues()) }).toEqual({
        step: `${index}: ${name}`,
        issues: rowsOf(freshIssues(graph)),
      })
    })
  })
})
