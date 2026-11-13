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

  test('begun on a way, the way is the selection and its ends are the points', () => {
    rerouteActions.beginOnWay({ relationId: 'r1', wayId: 'w1', anchor: 4, start: A, end: C })
    expect(readReroute()).toMatchObject({
      relationId: 'r1',
      selected: 'w1',
      anchor: 4,
      start: A,
      end: C,
    })
  })

  test('via points go in route order, move by their handle, and Backspace takes the last one out', () => {
    const D = { lon: 13.405, lat: 52.501 }
    const E = { lon: 13.415, lat: 52.501 }
    rerouteActions.beginOnWay({ relationId: 'r1', wayId: 'w1', anchor: 0, start: A, end: C })
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
