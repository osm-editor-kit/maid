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
      occurrence: 0,
      roleChoices: {},
    })
    rerouteActions.click(A)
    rerouteActions.stop()
    expect(readReroute().relationId).toBeUndefined()
    expect(readReroute().start).toBeUndefined()
  })

  test('the first click is the start, the next the end, and a click after that moves the end', () => {
    rerouteActions.begin('r1')
    rerouteActions.click(A)
    expect(readReroute().start).toEqual(A)
    expect(readReroute().end).toBeUndefined()
    rerouteActions.click(B)
    expect(readReroute().end).toEqual(B)
    rerouteActions.click(C)
    expect(readReroute().start).toEqual(A)
    expect(readReroute().end).toEqual(C)
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
