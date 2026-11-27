import { describe, expect, test } from 'bun:test'
import type { Feature } from 'geojson'
import { centreDiff, lineCentre, lineMiddle } from './line-centre'

describe('the centre point of a line (one per way, for its centre glyph)', () => {
  test('the middle by length, and the glyph turned along the line on the screen', () => {
    // east: no turn
    const east = lineMiddle([
      [13, 52],
      [13.002, 52],
    ])!
    expect(east.at[0]).toBeCloseTo(13.001, 9)
    expect(east.at[1]).toBeCloseTo(52, 9)
    expect(east.rotate).toBe(0)
    // north: a quarter turn counter-clockwise; south: clockwise; west: half a turn
    expect(
      lineMiddle([
        [13, 52],
        [13, 52.001],
      ])!.rotate,
    ).toBe(-90)
    expect(
      lineMiddle([
        [13, 52.001],
        [13, 52],
      ])!.rotate,
    ).toBe(90)
    expect(
      Math.abs(
        lineMiddle([
          [13.001, 52],
          [13, 52],
        ])!.rotate,
      ),
    ).toBe(180)
  })

  test('the middle lies on the segment that holds half the length, in Mercator as MapLibre measures', () => {
    // a long leg east, then a short one north: the middle is on the first leg, the glyph points east
    const m = lineMiddle([
      [13, 52],
      [13.004, 52],
      [13.004, 52.0001],
    ])!
    expect(m.at[1]).toBeCloseTo(52, 9)
    expect(m.rotate).toBe(0)
    // on the screen a degree of latitude at 52° is longer than a degree of longitude: (1/cos 52°) times
    const diagonal = lineMiddle([
      [13, 52],
      [13.001, 52.001],
    ])!
    const expected = (-Math.atan2(1 / Math.cos((52 * Math.PI) / 180), 1) * 180) / Math.PI
    expect(diagonal.rotate).toBeCloseTo(expected, 0)
  })

  test('a line without length has no middle', () => {
    expect(
      lineMiddle([
        [13, 52],
        [13, 52],
      ]),
    ).toBeUndefined()
    expect(lineMiddle([[13, 52]])).toBeUndefined()
  })

  test('the centre keeps the id and the properties of its line, with the turn as br', () => {
    const line: Feature = {
      type: 'Feature',
      id: 'w1',
      properties: { id: 'w1', ow: 'with', sw: 8 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [13, 52],
          [13, 52.001],
        ],
      },
    }
    const centre = lineCentre(line)!
    expect(centre.id).toBe('w1')
    expect(centre.properties).toEqual({ id: 'w1', ow: 'with', sw: 8, br: -90 })
    expect(centre.geometry.type).toBe('Point')
    expect(
      lineCentre({ ...line, geometry: { type: 'Point', coordinates: [13, 52] } }),
    ).toBeUndefined()
  })

  test("a line source's update gives its centre source's: the removals go too, and a line without length loses its centre", () => {
    const line = (id: string, coordinates: number[][]): Feature => ({
      type: 'Feature',
      id,
      properties: { id },
      geometry: { type: 'LineString', coordinates },
    })
    const diff = centreDiff(
      [
        line('w1', [
          [13, 52],
          [13.001, 52],
        ]),
        line('w2', [
          [13, 52],
          [13, 52],
        ]),
      ],
      ['w3'],
    )
    expect(diff.add.map((f) => f.id)).toEqual(['w1'])
    expect(diff.remove).toEqual(['w3', 'w2'])
  })
})
