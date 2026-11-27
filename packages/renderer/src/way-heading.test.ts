import { describe, expect, test } from 'bun:test'
import { visibleHeading } from './way-heading'

const view = { width: 100, height: 100 }

describe('visibleHeading', () => {
  test('a line drawn upwards on screen is 0, to the right 90, down 180, to the left 270', () => {
    expect(
      visibleHeading(
        [
          [50, 90],
          [50, 10],
        ],
        view,
        false,
      ),
    ).toBeCloseTo(0)
    expect(
      visibleHeading(
        [
          [10, 50],
          [90, 50],
        ],
        view,
        false,
      ),
    ).toBeCloseTo(90)
    expect(
      visibleHeading(
        [
          [50, 10],
          [50, 90],
        ],
        view,
        false,
      ),
    ).toBeCloseTo(180)
    expect(
      visibleHeading(
        [
          [90, 50],
          [10, 50],
        ],
        view,
        false,
      ),
    ).toBeCloseTo(270)
  })

  test('a diagonal up and to the right is 45', () => {
    expect(
      visibleHeading(
        [
          [10, 90],
          [90, 10],
        ],
        view,
        false,
      ),
    ).toBeCloseTo(45)
  })

  test('only the part inside the view counts', () => {
    // far off screen the way runs to the right; in the view it runs upwards
    const way: [number, number][] = [
      [-5000, 300],
      [50, 300],
      [50, -50],
    ]
    expect(visibleHeading(way, view, false)).toBeCloseTo(0)
  })

  test('nothing in view: undefined', () => {
    expect(
      visibleHeading(
        [
          [200, 200],
          [300, 300],
        ],
        view,
        false,
      ),
    ).toBeUndefined()
    expect(visibleHeading([[10, 10]], view, false)).toBeUndefined()
  })

  test('the longer visible stretch weighs more', () => {
    // 60 px to the right, then 20 px up: mostly to the right
    const heading = visibleHeading(
      [
        [20, 80],
        [80, 80],
        [80, 60],
      ],
      view,
      false,
    )!
    expect(heading).toBeGreaterThan(60)
    expect(heading).toBeLessThan(90)
  })

  test('a U turn: the longest visible segment decides', () => {
    // up 70, right 10, down 60: the sum is short against the length
    const heading = visibleHeading(
      [
        [40, 90],
        [40, 20],
        [50, 20],
        [50, 80],
      ],
      view,
      false,
    )!
    expect(heading).toBeCloseTo(0)
  })
})
