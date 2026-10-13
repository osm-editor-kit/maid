import { describe, expect, test } from 'bun:test'
import { dragTurn, TURN_SPEED } from './turn'

const CENTRE = { x: 100, y: 100 }

describe('dragTurn: the map follows the pointer around the centre of the view', () => {
  test('a move clockwise around the centre turns the map clockwise (a lower bearing)', () => {
    // right of the centre, moving down: clockwise on the screen
    expect(dragTurn({ x: 150, y: 100 }, { x: 150, y: 110 }, CENTRE)).toBeCloseTo(-3, 6)
    // upper right, moving right: clockwise
    expect(dragTurn({ x: 150, y: 50 }, { x: 160, y: 50 }, CENTRE)).toBeCloseTo(-3, 6)
  })

  test('a move counter-clockwise turns the map counter-clockwise (a higher bearing)', () => {
    // lower right, moving right: counter-clockwise
    expect(dragTurn({ x: 140, y: 150 }, { x: 150, y: 150 }, CENTRE)).toBeCloseTo(3, 6)
    // right of the centre, moving up: counter-clockwise
    expect(dragTurn({ x: 150, y: 100 }, { x: 150, y: 90 }, CENTRE)).toBeCloseTo(3, 6)
  })

  test('no move is no turn', () => {
    expect(dragTurn({ x: 150, y: 150 }, { x: 150, y: 150 }, CENTRE)).toBe(0)
  })

  test('the speed is Rapid’s 0.3 degrees per pixel', () => {
    expect(TURN_SPEED).toBe(0.3)
    expect(dragTurn({ x: 140, y: 150 }, { x: 150, y: 150 }, CENTRE)).toBeCloseTo(10 * 0.3, 6)
  })
})
