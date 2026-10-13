import { describe, expect, it } from 'bun:test'
import { fitMiniMap } from './mini-map.ts'

const box = { width: 200, height: 100, padding: 10 }

describe('fitMiniMap', () => {
  it('has no frame without points', () => {
    expect(fitMiniMap([], box)).toBeUndefined()
    expect(fitMiniMap([[]], box)).toBeUndefined()
  })

  it('centres the bounds of the points in the box', () => {
    const frame = fitMiniMap(
      [
        [
          [10, 50],
          [10.001, 50.001],
        ],
      ],
      box,
    )!
    const [x0, y0] = frame.project([10, 50])
    const [x1, y1] = frame.project([10.001, 50.001])
    expect((x0 + x1) / 2).toBeCloseTo(100, 6)
    expect((y0 + y1) / 2).toBeCloseTo(50, 6)
  })

  it('is north up: a higher latitude is higher on the screen (smaller y)', () => {
    const frame = fitMiniMap(
      [
        [
          [0, 0],
          [0, 0.001],
        ],
      ],
      box,
    )!
    const south = frame.project([0, 0])
    const north = frame.project([0, 0.001])
    expect(north[1]).toBeLessThan(south[1])
    expect(north[0]).toBeCloseTo(south[0], 6)
  })

  it('fits the tighter span into the box, with one scale in both directions', () => {
    // 0.001 degrees east at 50 N is about 71 m; 0.001 degrees north is about 111 m: north is the tight one
    const frame = fitMiniMap(
      [
        [
          [0, 50],
          [0.001, 50.001],
        ],
      ],
      box,
    )!
    const [x0, y0] = frame.project([0, 50])
    const [x1, y1] = frame.project([0.001, 50.001])
    // the north span (111 m) fills the 80 usable units; the east span is shorter, so it does not fill the width
    expect(Math.abs(y1 - y0)).toBeCloseTo(80, 6)
    expect(Math.abs(x1 - x0)).toBeLessThan(80)
  })

  it('does not zoom in beyond the minimum span', () => {
    const frame = fitMiniMap([[[0, 0]]], box, 20)!
    // the box is 100 units high, 80 of them usable: 20 m fill them
    expect(frame.scale).toBeCloseTo(80 / 20, 6)
  })
})
