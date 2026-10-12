import { OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { DifferenceChange, Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import { boxOf, boxesOverlap } from './geo.ts'
import type { Box, Point } from './geo.ts'
import type { GraphChange, Issue, Rule, RuleContext, Validator } from './types.ts'
import { createWayIndex } from './way-index.ts'

const severityRank: Record<Issue['severity'], number> = { error: 0, warning: 1 }

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Creates a validator over these rules. Issues are kept per id, so the same finding from two of
 * its entities is one issue. A run (one `validate` call) looks up each way's bounding box at most
 * once, when a rule first asks for a way's neighbours.
 */
export function createValidator(rules: readonly Rule[]): Validator {
  const issues = new Map<string, Issue>()
  // The boxes of the ways, kept from one update to the next (see way-index.ts)
  const wayIndex = createWayIndex()
  // The graph of the last update and the ids it changed: what changed since then is what the index recomputes
  let lastHead: Graph | undefined
  let lastChanged: ReadonlySet<string> = new Set()

  function allIssues(): Issue[] {
    return [...issues.values()].sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        compareText(a.rule, b.rule) ||
        compareText(a.id, b.id),
    )
  }

  function validateWith(graph: Graph, entityIds: Iterable<string>, ways: Iterable<OsmWay>): void {
    const targets = new Set(entityIds)

    // Drop what the validated entities had, and whatever names an entity that left the graph
    for (const [key, issue] of issues) {
      const stale = issue.entityIds.some((id) => targets.has(id) || !graph.hasEntity(id))
      if (stale) issues.delete(key)
    }

    const stamp = wayIndex.enter(graph, ways, targets)
    const context: RuleContext = {
      graph,
      validated: targets,
      waysNear: (way) => wayIndex.near(graph, way, stamp),
      memo: new Map(),
    }
    for (const id of targets) {
      const entity = graph.hasEntity(id)
      if (!entity) continue
      for (const rule of rules) {
        let found: Issue[]
        try {
          found = rule.validate(entity, context)
        } catch {
          // One broken rule must not stop the others: it reports nothing for this entity
          continue
        }
        for (const issue of found) {
          // The first entity validated wins when two runs find the same crossing
          if (!issues.has(issue.id)) issues.set(issue.id, issue)
        }
      }
    }
  }

  function keepOnly(entityIds: Iterable<string>): void {
    const keep = new Set(entityIds)
    for (const [key, issue] of issues) {
      const first = issue.entityIds[0]
      if (first === undefined || !keep.has(first)) issues.delete(key)
    }
  }

  /** Boxes of the ways whose nodes or tags differ between the last update's graph and this one */
  function invalidateChanged(previous: Graph, change: GraphChange): void {
    for (const id of new Set([...lastChanged, ...change.changes.keys()])) {
      const before = previous.hasEntity(id)
      const after = change.head.hasEntity(id)
      if (before === after) continue
      wayIndex.invalidate(id)
      if (before instanceof OsmNode)
        for (const way of previous.parentWays(before)) wayIndex.invalidate(way.id)
      if (after instanceof OsmNode)
        for (const way of change.head.parentWays(after)) wayIndex.invalidate(way.id)
    }
  }

  return {
    rules,

    validate(graph, entityIds, ways) {
      // a run of its own: nothing is kept from an earlier one
      wayIndex.clear()
      lastHead = undefined
      validateWith(graph, entityIds, ways)
    },

    update(change, ways) {
      const checked = entitiesToValidate(change.changes, change.base, change.head)
      keepOnly(checked)
      if (lastHead) invalidateChanged(lastHead, change)
      else wayIndex.clear()
      validateWith(change.head, checked, ways)
      lastHead = change.head
      lastChanged = new Set(change.changes.keys())
    },

    reset() {
      wayIndex.clear()
      lastHead = undefined
      lastChanged = new Set()
    },

    keepOnly,

    issues() {
      return allIssues()
    },

    issuesFor(entityId) {
      return allIssues().filter((issue) => issue.entityIds.includes(entityId))
    },
  }
}

/**
 * The ids that a difference makes necessary to check again, as iD's validator collects them
 * (`validate()` in iD's core/validator.js). The changed entities come first, then:
 * - the nodes that a changed way gained or lost, and the ways that use any node of a changed way, in
 *   both graphs: a deleted way leaves its neighbours disconnected, and a way that gains a node
 *   changes the way that had the node before;
 * - the parent ways and relations of every changed entity, in both graphs: a moved node changes its
 *   ways, and a deleted node or way was part of parents that may not have changed;
 * - the relations above those parents, as a multipolygon follows its outer ways;
 * - the members that a modified relation gained or lost, and all members of a created or deleted one.
 *
 * `changes` is the whole difference from the base, so what is no longer changed is not in it.
 * Deleted ids are included: the validator drops their issues and checks nothing for them.
 */
export function entitiesToValidate(
  changes: ReadonlyMap<string, DifferenceChange>,
  base: Graph,
  head: Graph,
): Set<string> {
  const ids = new Set<string>()
  // per graph, the parents whose own parent relations were already added
  const climbed: Record<0 | 1, Set<string>> = { 0: new Set(), 1: new Set() }

  // Adds the ways and relations that hold `entity` in `graph`, and the relations above them
  function addParentsOf(entity: OsmEntity, graph: Graph, index: 0 | 1): void {
    for (const way of graph.parentWays(entity)) {
      ids.add(way.id)
      addRelationsAbove(way, graph, index)
    }
    for (const relation of graph.parentRelations(entity)) {
      ids.add(relation.id)
      addRelationsAbove(relation, graph, index)
    }
  }

  function addRelationsAbove(entity: OsmEntity, graph: Graph, index: 0 | 1): void {
    if (climbed[index].has(entity.id)) return
    climbed[index].add(entity.id)
    for (const relation of graph.parentRelations(entity)) {
      ids.add(relation.id)
      addRelationsAbove(relation, graph, index)
    }
  }

  for (const [id, change] of changes) {
    ids.add(id)
    const { base: before, head: after } = change
    const entity = after ?? before
    if (!entity) continue

    if (before) addParentsOf(before, base, 0)
    if (after) addParentsOf(after, head, 1)

    if (entity instanceof OsmWay) {
      const beforeNodes = before instanceof OsmWay ? before.nodes : []
      const afterNodes = after instanceof OsmWay ? after.nodes : []
      const beforeSet = new Set(beforeNodes)
      const afterSet = new Set(afterNodes)
      // a node that the way gained or lost is checked too (iD's complete())
      for (const nodeId of [...beforeSet, ...afterSet]) {
        if (beforeSet.has(nodeId) && afterSet.has(nodeId)) continue
        ids.add(nodeId)
      }
      // the ways that use a node of this way, before and after the change
      for (const nodeId of new Set([...beforeNodes, ...afterNodes])) {
        const inBase = base.hasEntity(nodeId)
        if (inBase) addParentsOf(inBase, base, 0)
        const inHead = head.hasEntity(nodeId)
        if (inHead) addParentsOf(inHead, head, 1)
      }
    }

    if (entity instanceof OsmRelation) {
      const beforeMembers = new Set(
        before instanceof OsmRelation ? before.members.map((m) => m.id) : [],
      )
      const afterMembers = new Set(
        after instanceof OsmRelation ? after.members.map((m) => m.id) : [],
      )
      // a modified relation: the members it gained or lost. A created or deleted one: all of them
      const changed =
        before && after
          ? [...beforeMembers, ...afterMembers].filter(
              (memberId) => beforeMembers.has(memberId) !== afterMembers.has(memberId),
            )
          : [...beforeMembers, ...afterMembers]
      for (const memberId of changed) ids.add(memberId)
    }
  }

  return ids
}

/**
 * The context of one run: the neighbour lookup over the given ways plus the validated ways (as they
 * are in the graph), and the validated ids themselves.
 */
export function runContext(
  graph: Graph,
  ways: Iterable<OsmWay>,
  targets: ReadonlySet<string>,
): RuleContext {
  const candidates: OsmWay[] = []
  const seen = new Set<string>()
  const addCandidate = (id: string): void => {
    if (seen.has(id)) return
    seen.add(id)
    const current = graph.hasEntity(id)
    if (current instanceof OsmWay) candidates.push(current)
  }
  for (const way of ways) addCandidate(way.id)
  for (const id of targets) addCandidate(id)

  const boxes = new Map<string, Box | null>()
  const boxFor = (way: OsmWay): Box | undefined => {
    let box = boxes.get(way.id)
    if (box === undefined) {
      const points: Point[] = []
      for (const nodeId of way.nodes) {
        const node = graph.hasEntity(nodeId)
        const loc = node instanceof OsmNode ? node.loc : undefined
        if (loc) points.push([loc[0], loc[1]])
      }
      box = boxOf(points) ?? null
      boxes.set(way.id, box)
    }
    return box ?? undefined
  }

  return {
    graph,
    validated: targets,
    memo: new Map(),
    waysNear(way) {
      const box = boxFor(way)
      if (!box) return []
      const near: OsmWay[] = []
      for (const candidate of candidates) {
        if (candidate.id === way.id) continue
        const other = boxFor(candidate)
        if (other && boxesOverlap(box, other)) near.push(candidate)
      }
      return near
    },
  }
}
