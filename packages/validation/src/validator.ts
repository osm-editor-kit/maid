import { OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { DifferenceChange, Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import { boxOf, boxesOverlap, locationOf } from './geo.ts'
import type { Box, Point } from './geo.ts'
import { sharedIssues } from './shared-issues.ts'
import type { Issue, PresetLookup, Rule, RuleContext, Validator } from './types.ts'
import { createWayIndex } from './way-index.ts'

const severityRank: Record<Issue['severity'], number> = { error: 0, warning: 1 }

function compareText(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

/** What the validator reads from its editor. Both are functions: the editor's data changes while the validator lives. */
export type ValidatorOptions = {
  /** The presets, read at each run. Undefined until they are made: the rules that need them report nothing then. */
  presets?: () => PresetLookup | undefined
  /**
   * The ids of the warnings the person ignores (an issue's `id`). They are left out of `issues`, `issuesFor` and
   * `issuesForAll`, and listed by `ignoredIssues`. Errors are never ignored: an error stops the upload.
   */
  ignored?: () => ReadonlySet<string>
  /**
   * Whether the issues in existing data (the ones `checkExisting` finds, not the edits') are part of
   * `issues`, `issuesFor`, `issuesForAll` and `ignoredIssues`. Read at each call. Absent or false: only the
   * issues of the edits are, so counts, the save warnings and the Issues totals never see existing data.
   */
  showExisting?: () => boolean
}

/**
 * Creates a validator over these rules. Issues are kept per id, so the same finding from two of
 * its entities is one issue. A run (one `validate` call) looks up each way's bounding box at most
 * once, when a rule first asks for a way's neighbours.
 *
 * Two kinds of issue are kept apart. An issue is the edits' ("mine") when the edits found it: a new issue
 * that a run over what changed and its neighbours finds, or one that names a changed entity. An issue
 * that existed before a run and names no changed entity stays "existing", even when the run checks it
 * again as a neighbour of an edit (`mineOf`). `checkExisting` finds existing issues for the features the
 * person looks at. Existing issues are dropped only by a check that replaces them, or when their data changes.
 */
// The annotation makes the returned object be checked against the Validator interface
export function createValidator(rules: readonly Rule[], options: ValidatorOptions = {}): Validator {
  const issues = new Map<string, Issue>()
  // The keys (issue ids) of the issues that are existing data, not the edits'
  const existing = new Set<string>()
  // The entities the edits changed, as the validator was last told: an issue that names one of them is the edits'
  let changed: ReadonlySet<string> = new Set()
  // The boxes of the ways, kept from one update to the next (see way-index.ts)
  const wayIndex = createWayIndex()
  // The graph of the last update, and the ids that update was given: what changed since is what the index recomputes
  let lastHead: Graph | undefined
  let lastGiven: ReadonlySet<string> = new Set()
  // The graph the index was warmed on by `prepare`, when no update has run since: the first update checks the boxes
  // against it instead of making them all again (see `prepare`)
  let warmGraph: Graph | undefined
  // The issues sorted, until they change: `issuesFor` is called for every inspector render
  let sorted: Issue[] | undefined

  function remove(key: string) {
    issues.delete(key)
    existing.delete(key)
  }

  /** Drops every existing issue (the edits' issues stay). Deleting while a Set is walked is safe. */
  function clearExisting() {
    for (const key of existing) remove(key)
  }

  /** The issues that are read: the edits' ones, and the existing ones when the options show them */
  function visible(issue: Issue) {
    return options.showExisting?.() === true || !existing.has(issue.id)
  }

  function allIssues() {
    if (sorted === undefined)
      sorted = [...issues.values()].sort(
        (a, b) =>
          severityRank[a.severity] - severityRank[b.severity] ||
          compareText(a.rule, b.rule) ||
          compareText(a.id, b.id),
      )
    return sorted
  }

  /** Whether the person ignores this issue. Only a warning can be ignored. */
  function isIgnored(issue: Issue, ignored: ReadonlySet<string>) {
    return issue.severity === 'warning' && ignored.has(issue.id)
  }

  /** The issues that are shown: all but the ignored warnings, and the existing ones unless they are shown */
  function shownIssues() {
    const ignored = options.ignored?.()
    const all = allIssues()
    return all.filter((issue) => visible(issue) && !(ignored && isIgnored(issue, ignored)))
  }

  /**
   * Drops the issues that name an entity in `replaced`, or an entity that left the graph. With
   * `validated`, also the edits' issues that name no validated entity: nothing that was changed makes
   * them. Existing issues are not dropped for that: they are about data the edits do not touch.
   */
  function dropStale(graph: Graph, replaced: ReadonlySet<string>, validated?: ReadonlySet<string>) {
    for (const [key, issue] of issues) {
      const stale = issue.entityIds.some((id) => replaced.has(id) || !graph.hasEntity(id))
      const orphaned =
        validated !== undefined &&
        !existing.has(key) &&
        !issue.entityIds.some((id) => validated.has(id))
      if (stale || orphaned) remove(key)
    }
    sorted = undefined
  }

  /**
   * Keeps an issue a run found. An issue already kept stays, except that a run which finds it as the edits'
   * turns an existing one into the edits' (see `mineOf`).
   */
  function place(issue: Issue, mine: boolean) {
    if (issues.has(issue.id) && !(mine && existing.has(issue.id))) return
    issues.set(issue.id, issue)
    if (mine) existing.delete(issue.id)
    else existing.add(issue.id)
  }

  /**
   * Whether a run's issue is the edits': a new issue is (the edits' run found it), and an issue that was existing
   * before the run is only when the edits changed one of its entities. `wasExisting` is taken before the run drops
   * anything: the run drops the stale issues, which would otherwise look new when it finds them again.
   */
  function mineOf(wasExisting: ReadonlySet<string>) {
    return (issue: Issue) =>
      !wasExisting.has(issue.id) || issue.entityIds.some((id) => changed.has(id))
  }

  /** The existing issues, not the ignored ones, whatever the options show: for the quiet line of an inspector */
  function existingShown(filter: (issue: Issue) => boolean = () => true) {
    const ignored = options.ignored?.()
    return allIssues().filter(
      (issue) => existing.has(issue.id) && !(ignored && isIgnored(issue, ignored)) && filter(issue),
    )
  }

  /** A rule that gives no place gets the first point of the first entity it names, so every issue can be shown on the map */
  function withLocation(issue: Issue, graph: Graph): Issue {
    if (issue.loc) return issue
    const first = issue.entityIds[0]
    const entity = first === undefined ? undefined : graph.hasEntity(first)
    const loc = entity ? locationOf(entity, graph) : undefined
    return loc ? { ...issue, loc } : issue
  }

  /**
   * Runs the rules on `runIds`, the entities of the run's graph to check, with the neighbours of run `stamp`.
   * `mine` says whether an issue the run finds is the edits' (see `mineOf`).
   */
  function runRules(
    graph: Graph,
    validated: ReadonlySet<string>,
    runIds: readonly string[],
    stamp: number,
    mine: (issue: Issue) => boolean,
  ) {
    const context: RuleContext = {
      graph,
      validated,
      waysNear: (way) => wayIndex.near(graph, way, stamp),
      memo: new Map(),
      presets: options.presets?.(),
    }
    for (const id of runIds) {
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
        for (const reported of found) {
          const issue = withLocation(reported, graph)
          // The first entity validated wins when two runs find the same crossing
          place(issue, mine(issue))
        }
      }
    }
    sorted = undefined
  }

  function keepOnly(entityIds: Iterable<string>) {
    const keep = new Set(entityIds)
    for (const [key, issue] of issues) {
      const first = issue.entityIds[0]
      if (first === undefined || !keep.has(first)) remove(key)
    }
    sorted = undefined
  }

  /**
   * Makes the boxes of the ways whose nodes or tags differ between `previous` and `head` again, for
   * the ids that may differ. Returns the ids whose box was invalidated (the ways, and the parents of
   * changed nodes, before and after).
   */
  function invalidateChanged(previous: Graph, head: Graph, ids: Iterable<string>) {
    const invalidated = new Set<string>()
    const invalidate = (id: string) => {
      wayIndex.invalidate(id)
      invalidated.add(id)
    }
    for (const id of ids) {
      const before = previous.hasEntity(id)
      const after = head.hasEntity(id)
      if (before === after) continue
      invalidate(id)
      if (before instanceof OsmNode)
        for (const way of previous.parentWays(before)) invalidate(way.id)
      if (after instanceof OsmNode) for (const way of head.parentWays(after)) invalidate(way.id)
    }
    return invalidated
  }

  return {
    rules,

    validate(graph, entityIds, ways) {
      // a run of its own: the boxes of an earlier run are made again. Its issues are the edits' ones; the existing
      // issues of other data are kept (checkExisting replaces them)
      wayIndex.clear()
      lastHead = undefined
      warmGraph = undefined
      const targets = new Set(entityIds)
      changed = targets
      const wasExisting = new Set(existing)
      dropStale(graph, targets)
      runRules(
        graph,
        targets,
        [...targets],
        wayIndex.enter(graph, ways, targets),
        mineOf(wasExisting),
      )
    },

    update(change, ways, step) {
      const head = change.head
      changed = new Set(change.changes.keys())
      // The entities the session changed, and their neighbours: what counts as validated. Rules such
      // as disconnected_way compare with it, so it is the whole session's, not the step's.
      const validated = entitiesToValidate(change.changes, change.base, head)
      // The existing issues before this update. A neighbour of an edit is validated again, and its existing issue
      // is found again: it stays existing unless the edits changed one of its entities (`mineOf`)
      const mine = mineOf(new Set(existing))

      if (!lastHead || !step) {
        // The first update, after a reset, or without a step: everything the session changed is
        // checked again, as a run of its own over the whole session
        if (lastHead)
          invalidateChanged(lastHead, head, new Set([...lastGiven, ...change.changes.keys()]))
        // warmed by `prepare`: the boxes were made on the base, so what the session changed is made again
        else if (warmGraph) invalidateChanged(warmGraph, head, change.changes.keys())
        else wayIndex.clear()
        warmGraph = undefined
        dropStale(head, validated, validated)
        runRules(head, validated, [...validated], wayIndex.enter(head, ways, validated), mine)
      } else {
        // The step: what this commit changed, and its neighbours, are checked again
        const invalidated = invalidateChanged(lastHead, head, step.keys())
        const replaced = entitiesToValidate(step, lastHead, head)
        const stamp = wayIndex.enter(head, ways, validated)
        // A validated way next to a way the commit changed may now cross it or join it: a crossing
        // depends on the other way's tags as well as its box, so the neighbours are checked again
        for (const id of invalidated) {
          const way = head.hasEntity(id)
          if (!(way instanceof OsmWay)) continue
          for (const other of wayIndex.near(head, way, stamp))
            if (validated.has(other.id)) replaced.add(other.id)
        }
        // The validated ways of a changed relation: its tags and members decide what they are
        for (const delta of step.values())
          for (const entity of [delta.base, delta.head])
            if (entity instanceof OsmRelation)
              for (const member of entity.members)
                if (member.type === 'way' && validated.has(member.id)) replaced.add(member.id)
        dropStale(head, replaced, validated)
        runRules(
          head,
          validated,
          [...replaced].filter((id) => validated.has(id)),
          stamp,
          mine,
        )
      }

      lastHead = head
      lastGiven = new Set((step ?? change.changes).keys())
    },

    prepare(graph, ways) {
      // once an update has run, the index is the update's own: there is nothing to warm (a late chunk does nothing)
      if (lastHead) return
      // a warm-up of another graph is not the same boxes: they are made again
      if (warmGraph !== graph) {
        wayIndex.clear()
        warmGraph = graph
      }
      wayIndex.enter(graph, ways, [])
    },

    reset() {
      wayIndex.clear()
      lastHead = undefined
      warmGraph = undefined
      lastGiven = new Set()
      // the base data changed: what was found about existing data is no longer known to be right
      clearExisting()
      sorted = undefined
    },

    checkExisting(graph, entityIds, ways) {
      // the check replaces the existing issues of the last one: what is shown is what is looked at now
      clearExisting()
      const targets = new Set(entityIds)
      const stamp = wayIndex.enter(graph, ways, targets)
      // an issue on the check's features is the edits' only when the edits changed one of its entities
      runRules(graph, targets, [...targets], stamp, (issue) =>
        issue.entityIds.some((id) => changed.has(id)),
      )
    },

    keepOnly,

    issues() {
      return shownIssues()
    },

    ignoredIssues() {
      const ignored = options.ignored?.()
      if (!ignored || ignored.size === 0) return []
      return allIssues().filter((issue) => visible(issue) && isIgnored(issue, ignored))
    },

    existingIssues() {
      return existingShown()
    },

    existingIssuesFor(entityId) {
      return existingShown((issue) => issue.entityIds.includes(entityId))
    },

    issuesFor(entityId) {
      return shownIssues().filter((issue) => issue.entityIds.includes(entityId))
    },

    issuesForAll(entityIds) {
      return sharedIssues(shownIssues(), entityIds)
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
) {
  const ids = new Set<string>()
  // per graph, the parents whose own parent relations were already added
  const climbed: Record<0 | 1, Set<string>> = { 0: new Set(), 1: new Set() }

  // Adds the ways and relations that hold `entity` in `graph`, and the relations above them
  function addParentsOf(entity: OsmEntity, graph: Graph, index: 0 | 1) {
    for (const way of graph.parentWays(entity)) {
      ids.add(way.id)
      addRelationsAbove(way, graph, index)
    }
    for (const relation of graph.parentRelations(entity)) {
      ids.add(relation.id)
      addRelationsAbove(relation, graph, index)
    }
  }

  function addRelationsAbove(entity: OsmEntity, graph: Graph, index: 0 | 1) {
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
  presets?: PresetLookup,
) {
  const candidates: OsmWay[] = []
  const seen = new Set<string>()
  const addCandidate = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    const current = graph.hasEntity(id)
    if (current instanceof OsmWay) candidates.push(current)
  }
  for (const way of ways) addCandidate(way.id)
  for (const id of targets) addCandidate(id)

  const boxes = new Map<string, Box | null>()
  const boxFor = (way: OsmWay) => {
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
    presets,
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
  } satisfies RuleContext
}
