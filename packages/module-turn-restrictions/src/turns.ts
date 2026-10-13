/**
 * What a click on a turn writes. Ported from iD's `modules/ui/fields/restrictions.js` (`click`): a turn cycles
 * allowed -> no -> only -> allowed. Headless: it returns the actions and what to remember; the component performs them.
 */
import {
  actionRestrictTurn,
  actionUnrestrictTurn,
  osmInferRestriction,
  type Action,
  type Intersection,
  type Turn,
} from '@osm-editor-kit/maid-model'

export type TurnState = 'allowed' | 'restricted' | 'only'

/** The turn kinds the diagram names: iD's restriction types without their `no_` / `only_` prefix */
export type TurnKind = 'left_turn' | 'right_turn' | 'u_turn' | 'straight_on'

const TURN_KINDS: readonly TurnKind[] = ['left_turn', 'right_turn', 'u_turn', 'straight_on']

/** A direct restriction that an ONLY restriction removed; it comes back when the ONLY turn is clicked again */
export type RemovedTurn = Turn & { restrictionType: string }

export type CycleResult = {
  actions: Action[]
  /** 'added' or 'deleted': the undo text the component shows */
  annotation: 'added' | 'deleted'
  /** The removed direct restrictions to remember for the next click on this turn */
  removed: RemovedTurn[]
}

/** A plain copy of a turn: the model's turns are class instances, and a spread would lose their class */
function copyOf(turn: Turn): Turn {
  return {
    key: turn.key,
    path: turn.path,
    from: turn.from,
    via: turn.via,
    to: turn.to,
    u: turn.u,
    restrictionID: turn.restrictionID,
    no: turn.no,
    only: turn.only,
    direct: turn.direct,
  }
}

/** The state of a turn: a turn with a `no` restriction is restricted, with an `only` one only, else allowed */
export function turnStateOf(turn: Turn): TurnState {
  if (turn.no) return 'restricted'
  if (turn.only) return 'only'
  return 'allowed'
}

/** The turn kind of an inferred restriction type, e.g. `no_left_turn` -> `left_turn`; undefined for anything else */
export function turnKindOf(restrictionType: string): TurnKind | undefined {
  const kind = restrictionType.replace(/^(no|only)_/, '')
  return TURN_KINDS.find((known) => known === kind)
}

/**
 * The next state of a turn after a click, with the actions that make it. `removed` is what the last ONLY click took
 * away from this FROM way (the previous `CycleResult.removed`). Null when the turn cannot be edited: an indirect
 * restriction (`direct` is not set) is changed through the direct one next to it, as in iD.
 */
export function cycleTurn(
  intersection: Intersection,
  turn: Turn,
  fromWayID: EntityID,
  removed: readonly RemovedTurn[],
): CycleResult | null {
  const graph = intersection.graph
  const restrictionType = osmInferRestriction(graph, turn)

  // restricted (no) -> only: the ONLY turn excludes every other direct restriction from the FROM way towards the VIA
  if (turn.restrictionID && !turn.only) {
    if (!turn.direct) return null
    const onlyTurn: Turn = { ...copyOf(turn), only: true }
    const extraActions: Action[] = []
    const removedNow: RemovedTurn[] = []
    const seen = new Set<string>()
    for (const other of intersection.turns(fromWayID, 2)) {
      if (other.restrictionID && seen.has(other.restrictionID)) continue // not twice (iD #4968, #4928)
      if (other.direct && other.path[1] === turn.path[1]) {
        if (other.restrictionID) seen.add(other.restrictionID)
        removedNow.push({ ...copyOf(other), restrictionType: osmInferRestriction(graph, other) })
        extraActions.push(actionUnrestrictTurn(other))
      }
    }
    return {
      actions: [
        ...intersection.actions,
        ...extraActions,
        actionRestrictTurn(onlyTurn, restrictionType.replace(/^no/, 'only')),
      ],
      annotation: 'added',
      removed: removedNow,
    }
  }

  // only -> allowed: the turn goes, and the direct restrictions that the ONLY turn took away come back
  if (turn.restrictionID) {
    if (!turn.direct) return null
    // a remembered turn whose roads are gone since (an undo of the split that made them) is not brought back
    const restore = removed
      .filter((other) => other.key !== turn.key)
      .filter((other) => other.path.every((id) => graph.hasEntity(id) !== undefined))
      .map((other) => actionRestrictTurn(other, other.restrictionType))
    return {
      actions: [...intersection.actions, ...restore, actionUnrestrictTurn(turn)],
      annotation: 'deleted',
      removed: [],
    }
  }

  // allowed -> restricted
  return {
    actions: [...intersection.actions, actionRestrictTurn(turn, restrictionType)],
    annotation: 'added',
    removed: [...removed],
  }
}
