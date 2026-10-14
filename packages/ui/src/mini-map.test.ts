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

  it('turns with the bearing like a map: at 90 east is up and north is left', () => {
    const turned = fitMiniMap(
      [
        [
          [0, 50],
          [0.001, 50],
          [0, 50.001],
        ],
      ],
      box,
      20,
      90,
    )!
    const origin = turned.project([0, 50])
    const east = turned.project([0.001, 50])
    const north = turned.project([0, 50.001])
    // east is now straight up from the origin: higher on the screen, same x
    expect(east[1]).toBeLessThan(origin[1])
    expect(east[0]).toBeCloseTo(origin[0], 6)
    // north is now to the left of the origin: smaller x, same y
    expect(north[0]).toBeLessThan(origin[0])
    expect(north[1]).toBeCloseTo(origin[1], 6)
  })

  it('a bearing of 0 is the north-up frame', () => {
    const line = [
      [0, 50],
      [0.001, 50.001],
    ] as const
    const plain = fitMiniMap([line], box)!
    const zero = fitMiniMap([line], box, 20, 0)!
    expect(zero.project([0.001, 50.001])[0]).toBeCloseTo(plain.project([0.001, 50.001])[0], 9)
    expect(zero.project([0.001, 50.001])[1]).toBeCloseTo(plain.project([0.001, 50.001])[1], 9)
  })

  it('fits the turned points into the box', () => {
    const turned = fitMiniMap(
      [
        [
          [0, 50],
          [0.001, 50.001],
        ],
      ],
      box,
      20,
      45,
    )!
    for (const point of [
      [0, 50],
      [0.001, 50.001],
    ] as const) {
      const [x, y] = turned.project(point)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(box.width)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(box.height)
    }
  })

  it('does not zoom in beyond the minimum span', () => {
    const frame = fitMiniMap([[[0, 0]]], box, 20)!
    // the box is 100 units high, 80 of them usable: 20 m fill them
    expect(frame.scale).toBeCloseTo(80 / 20, 6)
  })
})

describe('fitMiniMap around a point', () => {
  // 0.001 degrees of latitude is about 111 m; 0.001 degrees of longitude at 50 N is about 71 m
  const north = [0, 50.001] as const
  const junction = [0, 50] as const

  it('puts the point at the middle of the box, however lopsided the lines are', () => {
    const frame = fitMiniMap([[junction, north]], box, 20, 0, junction)!
    const [x, y] = frame.project(junction)
    expect(x).toBeCloseTo(100, 6)
    expect(y).toBeCloseTo(50, 6)
  })

  it('fills the box on the side with the farthest point: the north road reaches the top padding', () => {
    // half the height above the junction is 50 - 10 = 40 units, so 111 m fill 80 units of the 2 x 40
    const frame = fitMiniMap([[junction, north]], box, 20, 0, junction)!
    const [, top] = frame.project(north)
    expect(top).toBeCloseTo(10, 6)
  })

  it('keeps the junction centred when the lines reach one side only', () => {
    const eastOnly = [
      [0, 50],
      [0.001, 50],
    ] as const
    const frame = fitMiniMap([eastOnly], box, 20, 0, junction)!
    const [x] = frame.project(junction)
    expect(x).toBeCloseTo(100, 6)
  })

  it('does not blow up a tiny junction: the half-span is at least half of minSpan', () => {
    const tiny = [
      [0, 50],
      [0, 50.00001],
    ] as const
    const frame = fitMiniMap([tiny], box, 24, 0, junction)!
    // half of 24 m, so 12 m fill the 40 units of half the height: at most 40 / 12 units per metre
    expect(frame.scale).toBeCloseTo(40 / 12, 6)
  })

  it('turns with the bearing like the bounding box fit does', () => {
    const turned = fitMiniMap([[junction, north]], box, 20, 90, junction)!
    const origin = turned.project(junction)
    const up = turned.project(north)
    // at 90 the north road points to the left of the junction, at the same height
    expect(up[0]).toBeLessThan(origin[0])
    expect(up[1]).toBeCloseTo(origin[1], 6)
  })
})
