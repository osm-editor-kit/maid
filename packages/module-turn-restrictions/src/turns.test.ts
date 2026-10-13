import { describe, expect, it } from 'bun:test'
import {
  Graph,
  osmIntersection,
  type Action,
  type Intersection,
  type Turn,
} from '@osm-editor-kit/maid-model'
import { crossing } from './fixtures.ts'
import { cycleTurn, turnKindOf, turnStateOf } from './turns.ts'

const { context, graph: start } = crossing()

function intersectionOf(graph: Graph): Intersection {
  const result = osmIntersection(context, graph, 'c', 30)
  if (!result) throw new Error('the crossing has no intersection')
  return result
}

/** The actions on a new staging graph of the given one (the model's actions do not run on a base graph) */
function apply(actions: readonly Action[], graph: Graph): Graph {
  return actions.reduce((current, action) => action(current), new Graph(graph))
}

function turnTo(intersection: Intersection, from: string, to: string): Turn {
  const turn = intersection.turns(from, 0).find((candidate) => candidate.to.way === to)
  if (!turn) throw new Error(`no turn ${from} -> ${to}`)
  return turn
}

describe('turnStateOf', () => {
  it('is allowed without a restriction, restricted for no, only for only', () => {
    const i = intersectionOf(start)
    const turn = turnTo(i, 'wn', 'ws')
    expect(turnStateOf(turn)).toBe('allowed')
    expect(turnStateOf({ ...turn, no: true })).toBe('restricted')
    expect(turnStateOf({ ...turn, only: true })).toBe('only')
  })
})

describe('turnKindOf', () => {
  it('drops the no and only prefix and names nothing else', () => {
    expect(turnKindOf('no_left_turn')).toBe('left_turn')
    expect(turnKindOf('only_u_turn')).toBe('u_turn')
    expect(turnKindOf('no_straight_on')).toBe('straight_on')
    expect(turnKindOf('no_exit')).toBeUndefined()
  })
})

describe('cycleTurn', () => {
  it('allowed -> restricted adds a no restriction for the turn, and the undo text says added', () => {
    const i = intersectionOf(start)
    const step = cycleTurn(i, turnTo(i, 'wn', 'ws'), 'wn', [])
    expect(step).not.toBeNull()
    expect(step!.annotation).toBe('added')
    const after = intersectionOf(apply(step!.actions, start))
    const turn = turnTo(after, 'wn', 'ws')
    expect(turnStateOf(turn)).toBe('restricted')
    expect(turn.restrictionID).toBeDefined()
  })

  it('restricted -> only removes the other direct restrictions from the FROM way via the same node, and remembers them', () => {
    const first = intersectionOf(start)
    const noSouth = cycleTurn(first, turnTo(first, 'wn', 'ws'), 'wn', [])!
    const g1 = apply(noSouth.actions, start)
    const second = intersectionOf(g1)
    const noEast = cycleTurn(second, turnTo(second, 'wn', 'we'), 'wn', [])!
    const g2 = apply(noEast.actions, g1)

    const third = intersectionOf(g2)
    const onlyEast = cycleTurn(third, turnTo(third, 'wn', 'we'), 'wn', [])!
    expect(onlyEast.annotation).toBe('added')
    // as in iD, the ONLY turn itself is in the list too: the restore step leaves it out (next test)
    expect(onlyEast.removed.map((turn) => turn.to.way)).toEqual(['we', 'ws'])
    const g3 = apply(onlyEast.actions, g2)

    const fourth = intersectionOf(g3)
    expect(turnStateOf(turnTo(fourth, 'wn', 'we'))).toBe('only')
    // the other paths are now indirectly restricted (iD: "Only" implies "No" for the rest)
    const south = turnTo(fourth, 'wn', 'ws')
    expect(turnStateOf(south)).toBe('restricted')
    expect(south.direct).toBe(false)
  })

  it('only -> allowed deletes the ONLY turn and restores the direct restrictions it had removed', () => {
    const first = intersectionOf(start)
    const noSouth = cycleTurn(first, turnTo(first, 'wn', 'ws'), 'wn', [])!
    const g1 = apply(noSouth.actions, start)
    const second = intersectionOf(g1)
    const noEast = cycleTurn(second, turnTo(second, 'wn', 'we'), 'wn', [])!
    const g2 = apply(noEast.actions, g1)
    const third = intersectionOf(g2)
    const onlyEast = cycleTurn(third, turnTo(third, 'wn', 'we'), 'wn', [])!
    const g3 = apply(onlyEast.actions, g2)

    const fourth = intersectionOf(g3)
    const back = cycleTurn(fourth, turnTo(fourth, 'wn', 'we'), 'wn', onlyEast.removed)!
    expect(back.annotation).toBe('deleted')
    expect(back.removed).toEqual([])
    const g4 = apply(back.actions, g3)

    const fifth = intersectionOf(g4)
    expect(turnStateOf(turnTo(fifth, 'wn', 'we'))).toBe('allowed')
    expect(turnStateOf(turnTo(fifth, 'wn', 'ws'))).toBe('restricted')
  })

  it('only -> allowed without remembered turns only deletes the turn', () => {
    const first = intersectionOf(start)
    const noEast = cycleTurn(first, turnTo(first, 'wn', 'we'), 'wn', [])!
    const g1 = apply(noEast.actions, start)
    const second = intersectionOf(g1)
    const onlyEast = cycleTurn(second, turnTo(second, 'wn', 'we'), 'wn', [])!
    const g2 = apply(onlyEast.actions, g1)
    const third = intersectionOf(g2)
    const back = cycleTurn(third, turnTo(third, 'wn', 'we'), 'wn', [])!
    const g3 = apply(back.actions, g2)
    expect(turnStateOf(turnTo(intersectionOf(g3), 'wn', 'we'))).toBe('allowed')
  })

  it('does not change an indirect restriction (no direct flag)', () => {
    const i = intersectionOf(start)
    const turn = turnTo(i, 'wn', 'ws')
    expect(
      cycleTurn(i, { ...turn, restrictionID: 'r1', direct: undefined, no: true }, 'wn', []),
    ).toBeNull()
  })
})
