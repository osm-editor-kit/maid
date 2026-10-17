// Merge (C), as iD's modules/operations/merge.js: the first of four actions that is not disabled, in iD's order:
// join (lines), merge (points into one line or area), merge polygon (closed areas into a multipolygon) and merge
// nodes (points). Ported from iD (ISC, © iD contributors). The actions are the model's; this file picks one, says why
// it cannot run, and names what is selected afterwards. Overlapping and touching areas are not refused, as in iD.
import {
  OsmNode,
  OsmRelation,
  OsmWay,
  actionJoin,
  actionMerge,
  actionMergeNodes,
  actionMergePolygon,
} from '@osm-editor-kit/maid-model'
import type { Action, Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import type { Operation, OperationContext } from './types.ts'

/** Used when an action gives a reason code that has no sentence here */
const FALLBACK = 'This cannot be done here'

/** iD's sentences for operations.merge (data/core.yaml). A reason with no sentence here reads FALLBACK. */
const MERGE_REASONS: Record<string, string> = {
  not_eligible: "These features can't be merged.",
  not_adjacent: "These features can't be merged because their endpoints aren't connected.",
  paths_intersect:
    "These features can't be merged because the resulting path would intersect itself.",
  conflicting_tags:
    "These features can't be merged because some of their tags have conflicting values.",
  conflicting_relations:
    "These features can't be merged because they belong to conflicting relations.",
  incomplete_relation:
    "These features can't be merged because at least one hasn't been fully downloaded.",
  relation: "These features can't be merged because they have conflicting relation roles.",
  // iD names the preset of the relation ("Turn Restriction", id-tagging-schema's name for type=restriction)
  restriction:
    'These features can\'t be merged because it would damage a "Turn Restriction" relation.',
}

/** One of the four actions, with the kind it is and the ids it works on (in the order selected) */
type Candidate = {
  kind: 'join' | 'merge' | 'polygon' | 'nodes'
  action: Action
  ids: string[]
}

/** The entities of the selection, in order. Undefined when there is no selection or an id is not in the graph. */
function resolveSelection(context: OperationContext) {
  if (context.selected.length === 0) return undefined
  const entities: OsmEntity[] = []
  for (const id of context.selected) {
    const entity = context.graph.hasEntity(id)
    if (!entity) return undefined
    entities.push(entity)
  }
  return entities
}

/** Why an action cannot run on this graph, or undefined when it can */
function reasonOf(action: Action, graph: Graph) {
  return action.disabled?.(graph) || undefined
}

/** The actions that the selection has the shape for, in iD's order. A shape check, not the action's own reasons. */
function candidatesOf(entities: OsmEntity[], graph: Graph): Candidate[] {
  const ids = entities.map((entity) => entity.id)
  const ways = entities.filter((entity): entity is OsmWay => entity instanceof OsmWay)
  const nodes = entities.filter((entity): entity is OsmNode => entity instanceof OsmNode)
  const relations = entities.filter(
    (entity): entity is OsmRelation => entity instanceof OsmRelation,
  )
  const candidates: Candidate[] = []

  // join: two or more lines (a closed way without area tags is a line too)
  if (ways.length === entities.length && ways.every((way) => way.geometry(graph) === 'line')) {
    candidates.push({ kind: 'join', action: actionJoin(ids), ids })
  }

  // merge: points into the one way that is an area or a line
  const points = nodes.filter((node) => node.geometry(graph) === 'point')
  if (
    relations.length === 0 &&
    ways.length === 1 &&
    points.length >= 1 &&
    points.length === nodes.length &&
    points.length + 1 === entities.length
  ) {
    candidates.push({ kind: 'merge', action: actionMerge(ids), ids })
  }

  // merge polygon: closed ways and multipolygon relations
  if (
    entities.length >= 2 &&
    entities.every(
      (entity) =>
        (entity instanceof OsmWay && entity.isClosed()) ||
        (entity instanceof OsmRelation && entity.isMultipolygon()),
    )
  ) {
    candidates.push({ kind: 'polygon', action: actionMergePolygon(ids), ids })
  }

  // merge nodes: two or more points
  if (entities.length >= 2 && nodes.length === entities.length) {
    candidates.push({ kind: 'nodes', action: actionMergeNodes(ids), ids })
  }

  return candidates
}

/**
 * The action Merge runs for this selection, as iD's `getAction`: the first candidate that is not disabled; else the
 * first whose reason is not `not_eligible` (that reason is the one to show); else the first candidate.
 */
function mergePlan(context: OperationContext): Candidate | undefined {
  const entities = resolveSelection(context)
  if (!entities || entities.length < 2) return undefined
  const candidates = candidatesOf(entities, context.graph)
  if (candidates.length === 0) return undefined
  const graph = context.graph
  const enabled = candidates.find((candidate) => reasonOf(candidate.action, graph) === undefined)
  if (enabled) return enabled
  const interesting = candidates.find(
    (candidate) => reasonOf(candidate.action, graph) !== 'not_eligible',
  )
  return interesting ?? candidates[0]
}

/** Merge: joins lines, merges points into a line or an area, makes a multipolygon of areas, or merges points. */
export const mergeOperation: Operation = {
  id: 'merge',
  label: 'Merge',
  shortcut: 'c',
  applies: (context) => mergePlan(context) !== undefined,
  disabled: (context) => {
    const plan = mergePlan(context)
    if (!plan) return undefined
    const reason = reasonOf(plan.action, context.graph)
    if (reason === undefined) return undefined
    return Object.hasOwn(MERGE_REASONS, reason) ? MERGE_REASONS[reason] : FALLBACK
  },
  run: (context) => {
    const plan = mergePlan(context)
    if (!plan) throw new Error('The merge operation does not apply to this selection')
    const { ids, kind } = plan
    return {
      actions: [plan.action],
      annotation: kind === 'join' ? `Merged ${ids.length} lines` : `Merged ${ids.length} features.`,
      // as iD: the selected features that still exist; when several do, only those with tags of their own
      select: (after) => {
        const survivors = ids.filter((id) => after.hasEntity(id) !== undefined)
        const tagged = survivors.filter((id) => after.hasEntity(id)?.hasInterestingTags() === true)
        return tagged.length > 0 && survivors.length > 1 ? tagged : survivors
      },
    }
  },
}
