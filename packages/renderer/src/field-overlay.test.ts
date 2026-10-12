import { describe, expect, test } from 'bun:test'
import type { Feature, Polygon } from 'geojson'
import {
  fieldOverlayFeatures,
  formatMetres,
  isStraightEnough,
  offsetLine,
  visiblePolyline,
  type LonLat,
  type Point2,
} from './field-overlay'

const viewport = { width: 1000, height: 800 }

describe('isStraightEnough (the fork: way_viewport_straightness.ts)', () => {
  test('a straight line across the view is straight enough', () => {
    expect(
      isStraightEnough(
        [
          [100, 100],
          [900, 100],
        ],
        viewport,
        false,
      ),
    ).toBe(true)
  })

  test('a visible part shorter than 40 px gives no indicator', () => {
    expect(
      isStraightEnough(
        [
          [100, 100],
          [130, 100],
        ],
        viewport,
        false,
      ),
    ).toBe(false)
  })

  test('a sharp bend within the view is too curved', () => {
    expect(
      isStraightEnough(
        [
          [100, 100],
          [400, 100],
          [400, 400],
        ],
        viewport,
        false,
      ),
    ).toBe(false)
  })

  test('a gentle bend under the limits stays straight enough', () => {
    // two 300 px segments with a 10 degree turn at the vertex: the chord is almost the path
    const angle = (10 * Math.PI) / 180
    const far: Point2 = [350 + 300 * Math.cos(angle), 100 + 300 * Math.sin(angle)]
    expect(isStraightEnough([[50, 100], [350, 100], far], viewport, false)).toBe(true)
  })

  test('the part outside the view does not count', () => {
    // the bend lies off screen: only the straight part is visible
    expect(
      isStraightEnough(
        [
          [100, 100],
          [900, 100],
          [1400, 100],
          [1400, 700],
        ],
        viewport,
        false,
      ),
    ).toBe(true)
  })
})

describe('visiblePolyline', () => {
  test('clips a segment that leaves the view to the part inside', () => {
    const out = visiblePolyline(
      [
        [-100, 100],
        [1100, 100],
      ],
      viewport,
      false,
    )
    expect(out).toEqual([
      [0, 100],
      [1000, 100],
    ])
  })

  test('drops a segment that lies outside', () => {
    expect(
      visiblePolyline(
        [
          [-100, -100],
          [-10, -50],
        ],
        viewport,
        false,
      ),
    ).toEqual([])
  })

  test('a closed way includes its closing segment', () => {
    const square: Point2[] = [
      [100, 100],
      [200, 100],
      [200, 200],
      [100, 200],
    ]
    expect(visiblePolyline(square, viewport, false)).toHaveLength(4)
    expect(visiblePolyline(square, viewport, true)).toHaveLength(5)
  })
})

describe('offsetLine', () => {
  test('a positive distance is left of the direction (north up)', () => {
    // travelling east, left is north: y grows
    const [a, b] = offsetLine(
      [
        [0, 0],
        [10, 0],
      ],
      2,
    )
    expect(a).toEqual([0, 2])
    expect(b).toEqual([10, 2])
  })

  test('a negative distance is right of the direction', () => {
    const [a] = offsetLine(
      [
        [0, 0],
        [10, 0],
      ],
      -2,
    )
    expect(a).toEqual([0, -2])
  })
})

describe('fieldOverlayFeatures: side', () => {
  const line: LonLat[] = [
    [13.4, 52.5],
    [13.41, 52.5],
  ]
  const project = (p: LonLat): Point2 => [(p[0] - 13.4) * 100000, (52.5 - p[1]) * 100000]
  const options = { closed: false, viewport, project }

  test('one line for a side, tagged with the side', () => {
    const features = fieldOverlayFeatures({ kind: 'side', side: 'left' }, line, options)
    expect(features.map((f) => f.properties?.state)).toEqual(['field-side'])
    expect(features[0]?.properties?.side).toBe('left')
  })

  test('both sides give two lines', () => {
    const features = fieldOverlayFeatures({ kind: 'side', side: 'both' }, line, options)
    expect(features.map((f) => f.properties?.side)).toEqual(['left', 'right'])
  })

  test('a curved way on screen gives no line', () => {
    // a right-angle corner inside the view: 500 px east, then 500 px north
    const corner: LonLat[] = [
      [13.4, 52.5],
      [13.405, 52.5],
      [13.405, 52.505],
    ]
    // the view's y grows downwards: north is up, 500 px for 0.005 degree of latitude
    const onScreen = (p: LonLat): Point2 => [(p[0] - 13.4) * 100000, 700 - (p[1] - 52.5) * 100000]
    const features = fieldOverlayFeatures({ kind: 'side', side: 'left' }, corner, {
      ...options,
      project: onScreen,
    })
    expect(features).toEqual([])
  })
})

describe('fieldOverlayFeatures: width band', () => {
  // 0.001 degree of latitude is about 111 m; the line runs north, so "left" is west
  const line: LonLat[] = [
    [13.4, 52.5],
    [13.4, 52.501],
  ]
  const project = (): Point2 => [0, 0]
  const options = { closed: false, viewport, project }

  function ringOf(feature: Feature | undefined): LonLat[] {
    const polygon = feature?.geometry as Polygon | undefined
    return (polygon?.coordinates[0] ?? []) as LonLat[]
  }

  /** Metres between two lon/lat points at this latitude */
  function metresApart(a: LonLat, b: LonLat) {
    const dy = (b[1] - a[1]) * 111195
    const dx = (b[0] - a[0]) * 111195 * Math.cos((52.5 * Math.PI) / 180)
    return Math.hypot(dx, dy)
  }

  test('a centred band is as wide as the metres given, on the ground', () => {
    const features = fieldOverlayFeatures({ kind: 'width', metres: 10 }, line, options)
    const ring = ringOf(features.find((f) => f.properties?.id === 'field-band-way'))
    // across a northward way the band runs east-west: its extent is the width, centred on the way
    const xs = ring.map((p) => p[0])
    expect(metresApart([Math.min(...xs), 52.5], [Math.max(...xs), 52.5])).toBeCloseTo(10, 0)
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(13.4, 6)
  })

  test('a side band starts at the road edge and lies on that side', () => {
    const features = fieldOverlayFeatures(
      { kind: 'width', metres: 2, side: 'left', offsetMetres: 4 },
      line,
      options,
    )
    const ring = ringOf(features.find((f) => f.properties?.id === 'field-band-left'))
    // left of a northward way is west: every point is west of the way, between 4 and 6 m away
    const offsets = ring.map((p) => metresApart([13.4, 52.5], [p[0], 52.5]))
    expect(Math.min(...offsets)).toBeGreaterThan(3.9)
    expect(Math.max(...offsets)).toBeLessThan(6.1)
    expect(ring.every((p) => p[0] < 13.4)).toBe(true)
  })

  test('both sides give one band each, and a label on each', () => {
    const features = fieldOverlayFeatures(
      { kind: 'width', metres: 1.5, side: 'both', offsetMetres: 3 },
      line,
      options,
    )
    expect(features.filter((f) => f.properties?.state === 'field-band')).toHaveLength(2)
    expect(features.filter((f) => f.properties?.state === 'field-label')).toHaveLength(2)
  })

  test('the label is the width unless one is given', () => {
    const [, label] = fieldOverlayFeatures({ kind: 'width', metres: 3.5 }, line, options)
    expect(label?.properties?.label).toBe('3.5 m')
    const [, named] = fieldOverlayFeatures(
      { kind: 'width', metres: 3.5, label: 'custom' },
      line,
      options,
    )
    expect(named?.properties?.label).toBe('custom')
  })

  test('no width or a line with one point gives nothing', () => {
    expect(fieldOverlayFeatures({ kind: 'width', metres: 0 }, line, options)).toEqual([])
    expect(fieldOverlayFeatures({ kind: 'width', metres: 2 }, [line[0]!], options)).toEqual([])
  })
})

describe('formatMetres', () => {
  test('rounds to centimetres and drops trailing zeros', () => {
    expect(formatMetres(3.5)).toBe('3.5 m')
    expect(formatMetres(2)).toBe('2 m')
    expect(formatMetres(1.234)).toBe('1.23 m')
  })
})
