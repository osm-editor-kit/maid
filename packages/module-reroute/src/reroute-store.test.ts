import { beforeEach, describe, expect, test } from 'bun:test'
import { readReroute, rerouteActions } from './reroute-store.ts'

const A = { lon: 13.4, lat: 52.5 }
const B = { lon: 13.41, lat: 52.5 }
const C = { lon: 13.42, lat: 52.5 }

beforeEach(() => rerouteActions.stop())

describe('the reroute state', () => {
  test('nothing is under way until begin, and a click without a reroute changes nothing', () => {
    expect(readReroute().relationId).toBeUndefined()
    rerouteActions.click(A)
    expect(readReroute().start).toBeUndefined()
  })

  test('begin clears everything for the relation; stop clears it again', () => {
    rerouteActions.begin('r1')
    expect(readReroute()).toEqual({
      relationId: 'r1',
      start: undefined,
      end: undefined,
      vias: [],
      anchor: undefined,
      selected: 'r1',
      occurrence: 0,
      roleChoices: {},
      commitAsked: 0,
      lastChange: undefined,
      failure: undefined,
    })
    rerouteActions.click(A)
    rerouteActions.stop()
    expect(readReroute().relationId).toBeUndefined()
    expect(readReroute().start).toBeUndefined()
  })

  test('the first click is the start, the next the end, and a click after that adds a via point', () => {
    rerouteActions.begin('r1')
    rerouteActions.click(A)
    expect(readReroute().start).toEqual(A)
    expect(readReroute().end).toBeUndefined()
    rerouteActions.click(C)
    expect(readReroute().end).toEqual(C)
    rerouteActions.click(B)
    expect(readReroute().start).toEqual(A)
    expect(readReroute().end).toEqual(C)
    expect(readReroute().vias).toEqual([B])
  })

  test('the route mode: an edit, a drop, the written change, and a new edit forgets it', () => {
    rerouteActions.beginRoute('r1', 'w1')
    expect(readReroute()).toMatchObject({ relationId: 'r1', selected: 'w1', start: undefined })
    rerouteActions.edit({ start: { ...A, member: 2 }, end: { ...C, member: 5 }, via: B, anchor: 3 })
    expect(readReroute()).toMatchObject({
      start: { member: 2 },
      end: { member: 5 },
      vias: [B],
      anchor: 3,
    })
    rerouteActions.moveVia('via-0', C)
    expect(readReroute().vias).toEqual([C])
    rerouteActions.drop()
    expect(readReroute().commitAsked).toBe(1)
    rerouteActions.applied({ removed: ['w2'], added: ['w9'] })
    expect(readReroute()).toMatchObject({
      start: undefined,
      vias: [],
      lastChange: { added: ['w9'] },
    })
    rerouteActions.failed('route-changed')
    expect(readReroute().failure).toBe('route-changed')
    rerouteActions.edit({ start: A, end: C, via: B, anchor: 0 })
    expect(readReroute()).toMatchObject({
      lastChange: undefined,
      failure: undefined,
      relationId: 'r1',
    })
    rerouteActions.discard()
    expect(readReroute()).toMatchObject({ start: undefined, relationId: 'r1' })
  })

  test('via points go in route order, move by their handle, and Backspace takes the last one out', () => {
    const D = { lon: 13.405, lat: 52.501 }
    const E = { lon: 13.415, lat: 52.501 }
    rerouteActions.begin('r1')
    rerouteActions.click(A)
    rerouteActions.click(C)
    rerouteActions.click(E)
    rerouteActions.click(D)
    expect(readReroute().vias).toEqual([D, E])
    rerouteActions.moveVia('via-1', B)
    expect(readReroute().vias).toEqual([D, B])
    rerouteActions.addVia(0, E)
    expect(readReroute().vias).toEqual([E, D, B])
    rerouteActions.removeVia()
    expect(readReroute().vias).toEqual([E, D])
    rerouteActions.removeVia(0)
    expect(readReroute().vias).toEqual([D])
  })

  test('a dragged handle moves its point and leaves the other one', () => {
    rerouteActions.begin('r1')
    rerouteActions.click(A)
    rerouteActions.click(B)
    rerouteActions.moveVia('start', C)
    expect(readReroute().start).toEqual(C)
    expect(readReroute().end).toEqual(B)
    rerouteActions.moveVia('end', A)
    expect(readReroute().end).toEqual(A)
  })

  test('the role answers belong to one route: a moved point clears them, and the occurrence does not', () => {
    rerouteActions.begin('r1')
    rerouteActions.click(A)
    rerouteActions.click(B)
    rerouteActions.setRoleChoice(2, 'forward')
    rerouteActions.setOccurrence(1)
    expect(readReroute().roleChoices).toEqual({ 2: 'forward' })
    expect(readReroute().occurrence).toBe(1)

    // the occurrence changes the stretch, not the route's segments: the answers stay
    expect(readReroute().roleChoices).toEqual({ 2: 'forward' })

    rerouteActions.moveVia('end', C)
    expect(readReroute().roleChoices).toEqual({})
    expect(readReroute().occurrence).toBe(0)
  })

  test('a role answer for one segment does not change the others', () => {
    rerouteActions.begin('r1')
    rerouteActions.setRoleChoice(0, 'forward')
    rerouteActions.setRoleChoice(3, '')
    expect(readReroute().roleChoices).toEqual({ 0: 'forward', 3: '' })
  })
})
