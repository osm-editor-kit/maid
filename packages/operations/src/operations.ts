// The edit operations of the edit menu, as plain data and functions on the data model.
// Ported from iD's modules/operations (ISC, © iD contributors). Applicability and the order of
// checks follow iD. Left out: everything that needs the map or the viewport ("too large", "not
// visible"), hidden or not downloaded data, the localizer, presets, and iD's OSM connection.
import {
  OsmNode,
  OsmWay,
  actionCircularize,
  actionDisconnect,
  actionExtract,
  actionJoin,
  actionOrthogonalize,
  actionReverse,
  actionSplit,
  actionStraightenNodes,
  actionStraightenWay,
} from '@osm-editor-kit/maid-model'
import type {
  Action,
  DisconnectAction,
  Graph,
  OsmEntity,
  SplitAction,
} from '@osm-editor-kit/maid-model'
import type { Operation, OperationContext } from './types.ts'

/** Used when an action gives a reason code that has no sentence here */
const FALLBACK = 'This cannot be done here'

/** A sentence for a reason: one form for a single feature, a second for several */
type Sentence = string | readonly [single: string, several: string]

/** The sentence for a reason code of an action, for a selection of `count` features */
function reasonSentence(reasons: Record<string, Sentence>, code: string, count: number): string {
  const sentence = Object.hasOwn(reasons, code) ? reasons[code] : undefined
  if (sentence === undefined) return FALLBACK
  if (typeof sentence === 'string') return sentence
  return count > 1 ? sentence[1] : sentence[0]
}

/** The entities of the selection, in order. Undefined when there is no selection or an id is not in the graph. */
function resolveSelection(context: OperationContext): OsmEntity[] | undefined {
  if (context.selected.length === 0) return undefined
  const entities: OsmEntity[] = []
  for (const id of context.selected) {
    const entity = context.graph.hasEntity(id)
    if (!entity) return undefined
    entities.push(entity)
  }
  return entities
}

/** A node that belongs to at least one way (iD's "vertex") */
function isVertex(entity: OsmEntity, graph: Graph): boolean {
  return entity instanceof OsmNode && entity.geometry(graph) === 'vertex'
}

/** The ids without repeats, keeping the first occurrence */
function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

/** Why an action cannot run on this graph, or undefined when it can */
function reasonOf(action: Action, graph: Graph): string | undefined {
  return action.disabled?.(graph) || undefined
}

/** The reason that blocks every action, or undefined when at least one can run. Several different reasons: 'multiple_blockers'. */
function blockedByAll(actions: Action[], graph: Graph): string | undefined {
  const reasons: string[] = []
  for (const action of actions) {
    const reason = reasonOf(action, graph)
    if (reason === undefined) return undefined
    reasons.push(reason)
  }
  if (new Set(reasons).size > 1) return 'multiple_blockers'
  return reasons[0]
}

/** Thrown when `run` is called for a selection the operation does not apply to */
function notApplicable(operationID: string): never {
  throw new Error(`The ${operationID} operation does not apply to this selection`)
}

// Reverse

/** Lines (not areas) and nodes whose direction tags would change. iD offers nothing else. */
function reverseTargets(context: OperationContext): OsmEntity[] {
  const graph = context.graph
  return (resolveSelection(context) ?? []).filter((entity) => {
    if (entity instanceof OsmWay) return entity.geometry(graph) === 'line'
    if (entity instanceof OsmNode) return reasonOf(actionReverse(entity.id), graph) === undefined
    return false
  })
}

/**
 * Reverse: lines and directional nodes. iD's reverse operation has no disabled state: a node
 * without a direction is not offered in the first place, so `applies` is false for it.
 */
export const reverseOperation: Operation = {
  id: 'reverse',
  label: 'Reverse',
  shortcut: 'v',
  applies: (context) => reverseTargets(context).length > 0,
  disabled: () => undefined,
  run: (context) => {
    const targets = reverseTargets(context)
    const nodes = targets.filter((entity) => entity instanceof OsmNode).length
    const n = targets.length
    let annotation: string
    if (nodes === 0) {
      annotation = n === 1 ? 'Reversed a line' : `Reversed ${n} lines`
    } else if (nodes === n) {
      annotation = n === 1 ? 'Reversed a point' : `Reversed ${n} points`
    } else {
      annotation = n === 1 ? 'Reversed a feature' : `Reversed ${n} features`
    }
    return { actions: targets.map((entity) => actionReverse(entity.id)), annotation }
  },
}

// Split

const SPLIT_REASONS: Record<string, Sentence> = {
  not_eligible: "Lines can't be split at their beginning or end.",
}

type SplitPlan = { action: SplitAction; vertexIDs: string[]; wayIDs: string[] }

/** iD: one or more vertices, and nothing selected besides vertices and ways */
function splitPlan(context: OperationContext): SplitPlan | undefined {
  const entities = resolveSelection(context)
  if (!entities) return undefined
  const graph = context.graph
  const vertexIDs = entities.filter((entity) => isVertex(entity, graph)).map((entity) => entity.id)
  const wayIDs = entities.filter((entity) => entity instanceof OsmWay).map((entity) => entity.id)
  if (vertexIDs.length === 0 || vertexIDs.length + wayIDs.length !== entities.length)
    return undefined
  const action = actionSplit(vertexIDs)
  if (wayIDs.length > 0) action.limitWays(wayIDs)
  return { action, vertexIDs, wayIDs }
}

function splitAnnotation(geometries: string[], n: number): string {
  if (geometries.length === 1 && geometries[0] === 'area') {
    return n === 1 ? 'Split the edge of an area' : `Split ${n} areas`
  }
  if (geometries.length === 1 && geometries[0] === 'line') {
    return n === 1 ? 'Split a line' : `Split ${n} lines`
  }
  return n === 1 ? 'Split a feature' : `Split ${n} features`
}

/**
 * Split: divides every way that passes through the selected vertices (or only the selected ways).
 * Afterwards the vertices and the resulting ways are selected, as in iD.
 */
export const splitOperation: Operation = {
  id: 'split',
  label: 'Split',
  shortcut: 'x',
  applies: (context) => splitPlan(context) !== undefined,
  disabled: (context) => {
    const plan = splitPlan(context)
    if (!plan) return undefined
    const reason = reasonOf(plan.action, context.graph)
    return reason === undefined
      ? undefined
      : reasonSentence(SPLIT_REASONS, reason, context.selected.length)
  },
  run: (context) => {
    const { action, vertexIDs } = splitPlan(context) ?? notApplicable('split')
    const affected = action.ways(context.graph)
    const geometries = unique(affected.map((way) => way.geometry(context.graph)))
    return {
      actions: [action],
      annotation: splitAnnotation(geometries, affected.length),
      // as iD: the vertices, the ways that were split and the ways the split created
      select: (after) =>
        unique([
          ...vertexIDs,
          ...affected.map((way) => way.id),
          ...action.getCreatedWayIDs(),
        ]).filter((id) => after.hasEntity(id) !== undefined),
    }
  },
}

// Merge

const MERGE_REASONS: Record<string, Sentence> = {
  not_eligible: "These lines can't be merged.",
  not_adjacent: 'These lines do not share an end node.',
  paths_intersect: "These lines can't be merged because the result would cross itself.",
  conflicting_tags:
    "These lines can't be merged because some of their tags have conflicting values.",
  conflicting_relations:
    "These lines can't be merged because they belong to conflicting relations.",
}

/**
 * Two or more lines, joined end to end. iD's other merges (a point into a line or area, areas
 * into a multipolygon, nodes into one) are not ported: for those selections this does not apply.
 */
function mergePlan(context: OperationContext): { action: Action; ids: string[] } | undefined {
  const entities = resolveSelection(context)
  if (!entities || entities.length < 2) return undefined
  if (
    !entities.every(
      (entity) => entity instanceof OsmWay && entity.geometry(context.graph) === 'line',
    )
  ) {
    return undefined
  }
  const ids = entities.map((entity) => entity.id)
  return { action: actionJoin(ids), ids }
}

/** Merge: joins lines that share their end nodes. Afterwards the surviving line is selected. */
export const mergeOperation: Operation = {
  id: 'merge',
  label: 'Merge',
  shortcut: 'c',
  applies: (context) => mergePlan(context) !== undefined,
  disabled: (context) => {
    const plan = mergePlan(context)
    if (!plan) return undefined
    const reason = reasonOf(plan.action, context.graph)
    return reason === undefined ? undefined : reasonSentence(MERGE_REASONS, reason, plan.ids.length)
  },
  run: (context) => {
    const { action, ids } = mergePlan(context) ?? notApplicable('merge')
    return {
      actions: [action],
      annotation: `Merged ${ids.length} lines`,
      select: (after) => {
        const survivors = ids.filter((id) => after.hasEntity(id) !== undefined)
        // as iD: when several survive, prefer the ones with tags of their own
        const tagged = survivors.filter((id) => after.hasEntity(id)?.hasInterestingTags() === true)
        return tagged.length > 0 && survivors.length > 1 ? tagged : survivors
      },
    }
  },
}

// Straighten

const STRAIGHTEN_REASONS: Record<string, Sentence> = {
  too_bendy: [
    'This line bends too much to be straightened.',
    'These lines bend too much to be straightened.',
  ],
  straight_enough: [
    'This is already as straight as it can be.',
    'These are already as straight as they can be.',
  ],
}

/**
 * iD's rule for ways: none is closed, the selected ways form one chain (two free ends in total),
 * and the chain has more than two nodes. A selected node pair must lie on the chain.
 */
function straightenableWays(ways: OsmWay[], nodes: OsmNode[]): boolean {
  if (ways.some((way) => way.isClosed())) return false
  const starts: string[] = []
  const ends: string[] = []
  for (const way of ways) {
    const first = way.first()
    const last = way.last()
    if (first === undefined || last === undefined) return false
    starts.push(first)
    ends.push(last)
  }
  const once = (ids: string[]) => ids.filter((id) => ids.indexOf(id) === ids.lastIndexOf(id))
  const startsOnce = once(starts)
  const endsOnce = once(ends)
  const freeEnds =
    startsOnce.filter((id) => !endsOnce.includes(id)).length +
    endsOnce.filter((id) => !startsOnce.includes(id)).length
  if (freeEnds !== 2) return false
  const wayNodes = unique(ways.flatMap((way) => way.nodes))
  if (wayNodes.length <= 2) return false
  return nodes.length !== 2 || nodes.every((node) => wayNodes.includes(node.id))
}

type StraightenPlan = { action: Action; kind: 'point' | 'line'; count: number }

/** iD: three or more nodes (points), or ways with nothing or exactly two nodes selected (lines) */
function straightenPlan(context: OperationContext): StraightenPlan | undefined {
  const entities = resolveSelection(context)
  if (!entities) return undefined
  const nodes = entities.filter((entity): entity is OsmNode => entity instanceof OsmNode)
  const ways = entities.filter((entity): entity is OsmWay => entity instanceof OsmWay)
  if (nodes.length + ways.length !== entities.length) return undefined
  if (ways.length === 0 && nodes.length > 2) {
    return {
      action: actionStraightenNodes(nodes.map((node) => node.id)),
      kind: 'point',
      count: nodes.length,
    }
  }
  if (
    ways.length > 0 &&
    (nodes.length === 0 || nodes.length === 2) &&
    straightenableWays(ways, nodes)
  ) {
    return { action: actionStraightenWay([...context.selected]), kind: 'line', count: ways.length }
  }
  return undefined
}

/** Straighten: removes the bends of lines, or puts groups of points in a row */
export const straightenOperation: Operation = {
  id: 'straighten',
  label: 'Straighten',
  shortcut: 's',
  applies: (context) => straightenPlan(context) !== undefined,
  disabled: (context) => {
    const plan = straightenPlan(context)
    if (!plan) return undefined
    const reason = reasonOf(plan.action, context.graph)
    return reason === undefined ? undefined : reasonSentence(STRAIGHTEN_REASONS, reason, plan.count)
  },
  run: (context) => {
    const plan = straightenPlan(context) ?? notApplicable('straighten')
    const n = plan.count
    let annotation: string
    if (plan.kind === 'point') {
      annotation = n === 1 ? 'Straightened a point' : `Straightened ${n} points`
    } else {
      annotation = n === 1 ? 'Straightened a line' : `Straightened ${n} lines`
    }
    return { actions: [plan.action], annotation }
  },
}

// Square

const SQUARE_REASONS: Record<string, Sentence> = {
  end_vertex: [
    "This can't be squared because it is an endpoint.",
    "These can't be squared because they are endpoints.",
  ],
  square_enough: [
    "This can't be made more square than it already is.",
    "These can't be made more square than they already are.",
  ],
  not_squarish: [
    "This can't be made square because it is not squarish.",
    "These can't be made square because they are not squarish.",
  ],
  multiple_blockers: "These can't be squared for multiple reasons.",
}

type SquareTarget = { corner: boolean; action: Action }

/**
 * iD: each selected entity is either a way with more than two nodes (its whole outline is squared)
 * or a vertex on exactly one way (that corner is squared). Corners and whole features are not mixed.
 */
function squareTargets(context: OperationContext): SquareTarget[] | undefined {
  const entities = resolveSelection(context)
  if (!entities) return undefined
  const graph = context.graph
  const targets: SquareTarget[] = []
  for (const entity of entities) {
    if (entity instanceof OsmWay && unique(entity.nodes).length > 2) {
      targets.push({ corner: false, action: actionOrthogonalize(entity.id) })
    } else if (isVertex(entity, graph)) {
      const parents = graph.parentWays(entity)
      const parent = parents.length === 1 ? parents[0] : undefined
      if (!parent) return undefined
      targets.push({ corner: true, action: actionOrthogonalize(parent.id, entity.id) })
    } else {
      return undefined
    }
  }
  if (new Set(targets.map((target) => target.corner)).size > 1) return undefined
  return targets
}

/** Square: makes the corners of a closed way (or of a line) right angles, or one corner */
export const squareOperation: Operation = {
  id: 'square',
  label: 'Square',
  shortcut: 'q',
  applies: (context) => squareTargets(context) !== undefined,
  disabled: (context) => {
    const targets = squareTargets(context)
    if (!targets) return undefined
    const code = blockedByAll(
      targets.map((target) => target.action),
      context.graph,
    )
    return code === undefined
      ? undefined
      : reasonSentence(SQUARE_REASONS, code, context.selected.length)
  },
  run: (context) => {
    const targets = squareTargets(context) ?? notApplicable('square')
    // as iD: each action runs on the graph left by the ones before, and is left out when disabled there
    let graph = context.graph.snapshot()
    const actions: Action[] = []
    for (const target of targets) {
      if (reasonOf(target.action, graph) !== undefined) continue
      actions.push(target.action)
      graph = target.action(graph)
    }
    const n = actions.length
    const corner = targets.some((target) => target.corner)
    let annotation: string
    if (corner) {
      annotation = n === 1 ? 'Squared a corner' : `Squared ${n} corners`
    } else {
      annotation =
        n === 1 ? 'Squared the corners of a feature' : `Squared the corners of ${n} features`
    }
    return { actions, annotation }
  },
}

// Make round

const CIRCULARIZE_REASONS: Record<string, Sentence> = {
  not_closed: [
    "This can't be made round because it is not a loop.",
    "These can't be made round because they are not loops.",
  ],
  already_circular: [
    "This can't be made more round than it already is.",
    "These can't be made more round than they already are.",
  ],
  multiple_blockers: "These can't be made round for multiple reasons.",
}

/**
 * iD: every selected entity is a way with at least two nodes. Not ported: iD first joins
 * unclosed ways into loops; here an unclosed way is disabled ("not a loop") instead.
 */
function circularizeTargets(context: OperationContext): Action[] | undefined {
  const entities = resolveSelection(context)
  if (!entities) return undefined
  if (!entities.every((entity) => entity instanceof OsmWay && unique(entity.nodes).length > 1))
    return undefined
  return entities.map((entity) => actionCircularize(entity.id))
}

/** Make round: turns a closed way into a circle */
export const circularizeOperation: Operation = {
  id: 'circularize',
  label: 'Make round',
  shortcut: 'o',
  applies: (context) => circularizeTargets(context) !== undefined,
  disabled: (context) => {
    const actions = circularizeTargets(context)
    if (!actions) return undefined
    const code = blockedByAll(actions, context.graph)
    return code === undefined
      ? undefined
      : reasonSentence(CIRCULARIZE_REASONS, code, actions.length)
  },
  run: (context) => {
    const actions = circularizeTargets(context) ?? notApplicable('circularize')
    let graph = context.graph.snapshot()
    const enabled: Action[] = []
    for (const action of actions) {
      if (reasonOf(action, graph) !== undefined) continue
      enabled.push(action)
      graph = action(graph)
    }
    const n = enabled.length
    return {
      actions: enabled,
      annotation: n === 1 ? 'Made a feature circular' : `Made ${n} features circular`,
    }
  },
}

// Disconnect

const DISCONNECT_REASONS: Record<string, Sentence> = {
  not_connected: "There aren't enough lines or areas here to disconnect.",
  relation: "This can't be disconnected because it connects members of a relation.",
}

type DisconnectPlan = { actions: DisconnectAction[]; fromEachOther: boolean }

/**
 * iD: vertices (with or without ways): the selected ways, or all ways, are separated at each
 * vertex. Only ways: the ways are separated from each other where they share a node, otherwise
 * from everything they touch. Anything else in the selection: not offered.
 */
function disconnectPlan(context: OperationContext): DisconnectPlan | undefined {
  const entities = resolveSelection(context)
  if (!entities) return undefined
  const graph = context.graph
  const ways: OsmWay[] = []
  const vertexIDs: string[] = []
  for (const entity of entities) {
    if (entity instanceof OsmWay) {
      ways.push(entity)
    } else if (isVertex(entity, graph)) {
      vertexIDs.push(entity.id)
    } else {
      return undefined
    }
  }

  if (vertexIDs.length > 0) {
    // with ways selected too, each of them must pass through one of the selected vertices
    if (ways.some((way) => !vertexIDs.some((vertexID) => way.nodes.includes(vertexID))))
      return undefined
    const actions = vertexIDs.map((vertexID) => {
      const action = actionDisconnect(vertexID)
      if (ways.length > 0) {
        action.limitWays(ways.filter((way) => way.nodes.includes(vertexID)).map((way) => way.id))
      }
      return action
    })
    return { actions, fromEachOther: false }
  }

  const wayIDs = ways.map((way) => way.id)
  const shared: DisconnectAction[] = []
  const unshared: DisconnectAction[] = []
  for (const nodeID of unique(ways.flatMap((way) => way.nodes))) {
    if (!graph.hasEntity(nodeID)) continue
    const action = actionDisconnect(nodeID).limitWays(wayIDs)
    if (reasonOf(action, graph) === 'not_connected') continue
    const count = ways.filter((way) => way.nodes.includes(nodeID)).length
    if (count > 1) {
      shared.push(action)
    } else {
      unshared.push(action)
    }
  }
  if (shared.length > 0) return { actions: shared, fromEachOther: true }
  if (unshared.length > 0) return { actions: unshared, fromEachOther: false }
  return undefined
}

/** Disconnect: separates lines and areas that share a node */
export const disconnectOperation: Operation = {
  id: 'disconnect',
  label: 'Disconnect',
  shortcut: 'd',
  applies: (context) => disconnectPlan(context) !== undefined,
  disabled: (context) => {
    const plan = disconnectPlan(context)
    if (!plan) return undefined
    for (const action of plan.actions) {
      const reason = reasonOf(action, context.graph)
      if (reason !== undefined)
        return reasonSentence(DISCONNECT_REASONS, reason, context.selected.length)
    }
    return undefined
  },
  run: (context) => {
    const plan = disconnectPlan(context) ?? notApplicable('disconnect')
    return {
      actions: plan.actions,
      annotation: plan.fromEachOther
        ? 'Disconnected features from each other'
        : 'Disconnected features',
    }
  },
}

// Extract

/**
 * iD: a vertex with interesting tags, or an area with interesting tags. iD also requires that the
 * preset of the feature allows points; there are no presets here, so every area with tags is offered.
 */
function extractTargets(context: OperationContext): OsmEntity[] | undefined {
  const entities = resolveSelection(context)
  if (!entities) return undefined
  const graph = context.graph
  const ok = entities.every((entity) => {
    if (!entity.hasInterestingTags()) return false
    if (entity instanceof OsmNode) return graph.parentWays(entity).length > 0
    if (entity instanceof OsmWay) return entity.geometry(graph) === 'area'
    return false
  })
  return ok ? entities : undefined
}

/**
 * Extract: pulls a point out of a vertex or an area. The new point is selected. iD's extract has
 * no reason codes that survive without the map (its disabled states are about the viewport).
 */
export const extractOperation: Operation = {
  id: 'extract',
  label: 'Extract',
  shortcut: 'e',
  applies: (context) => extractTargets(context) !== undefined,
  disabled: () => undefined,
  run: (context) => {
    const targets = extractTargets(context) ?? notApplicable('extract')
    const actions = targets.map((entity) => actionExtract(entity.id))
    const n = actions.length
    return {
      actions,
      annotation: n === 1 ? 'Extracted a point' : `Extracted ${n} points`,
      select: () =>
        actions.map((action) => action.getExtractedNodeID()).filter((id) => id !== undefined),
    }
  },
}

/** The operations in the order of iD's edit menu */
export const defaultOperations: Operation[] = [
  reverseOperation,
  splitOperation,
  mergeOperation,
  straightenOperation,
  squareOperation,
  circularizeOperation,
  disconnectOperation,
  extractOperation,
]
