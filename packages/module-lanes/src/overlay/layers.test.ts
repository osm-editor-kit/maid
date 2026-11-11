import { describe, expect, test } from 'bun:test'
import { laneBands } from './lane-bands.ts'
import {
  bandFeatures,
  EMPTY_BANDS,
  LANES_LAYERS,
  LANES_MIN_ZOOM,
  LANES_SOURCE,
  metresToPx,
  pxPerMetreAt16,
} from './layers.ts'

const LINE: [number, number][] = [
  [13.4, 52.5],
  [13.4, 52.501],
]
const TWO_WAY = {
  highway: 'secondary',
  lanes: '2',
  'lanes:forward': '1',
  'lanes:backward': '1',
}
const bands = laneBands(9, TWO_WAY)

describe('bandFeatures', () => {
  test('the way line once per band, with the band in its properties', () => {
    const { features } = bandFeatures(bands, LINE, { hovered: null, chosen: null })
    expect(features).toHaveLength(2)
    expect(features[0]!.geometry.coordinates).toEqual(LINE)
    expect(features.map((f) => f.properties.slotId)).toEqual([
      'way/9/lane/backward/0',
      'way/9/lane/forward/0',
    ])
    expect(features.map((f) => f.properties.offsetMetres)).toEqual([-1.5, 1.5])
    expect(features.every((f) => f.properties.focus === 'none')).toBe(true)
    expect(features[0]!.properties.pxPerMetre16).toBeCloseTo(pxPerMetreAt16(52.5005))
  })

  test('the focus of laneFocus: chosen wins over hovered on the same band', () => {
    const focus = (hovered: string | null, chosen: string | null) =>
      bandFeatures(bands, LINE, { hovered, chosen }).features.map((f) => f.properties.focus)
    expect(focus('way/9/lane/forward/0', null)).toEqual(['none', 'hovered'])
    expect(focus('way/9/lane/forward/0', 'way/9/lane/backward/0')).toEqual(['chosen', 'hovered'])
    expect(focus('way/9/lane/forward/0', 'way/9/lane/forward/0')).toEqual(['none', 'chosen'])
    // a lane of another way marks nothing
    expect(focus('way/8/lane/forward/0', null)).toEqual(['none', 'none'])
  })

  test('no band without a line or without lanes', () => {
    expect(bandFeatures(bands, [LINE[0]!], { hovered: null, chosen: null })).toBe(EMPTY_BANDS)
    expect(bandFeatures([], LINE, { hovered: null, chosen: null })).toBe(EMPTY_BANDS)
  })
})

describe('metres to pixels', () => {
  test('pixels per metre at zoom 16: 512 px world, Web Mercator', () => {
    expect(pxPerMetreAt16(0)).toBeCloseTo((512 * 2 ** 16) / 40_075_016.686)
    // twice as many at 60°, where a metre on the ground is twice as long on the map
    expect(pxPerMetreAt16(60)).toBeCloseTo(2 * pxPerMetreAt16(0))
    // about 5.4 px per metre at zoom 18 in Berlin, as the parking sides' 13 px for 2.4 m
    expect(pxPerMetreAt16(52.5) * 4).toBeCloseTo(5.5, 1)
  })

  test('an exponential curve of base 2 between zoom 16 and 24, the stops 256 times apart', () => {
    const expression = metresToPx('offsetMetres', 2, 1) as unknown[]
    expect(expression.slice(0, 4)).toEqual(['interpolate', ['exponential', 2], ['zoom'], 16])
    expect(expression[5]).toBe(24)
    const at16 = ['*', ['get', 'offsetMetres'], ['get', 'pxPerMetre16']]
    expect(expression[4]).toEqual(['max', 1, ['+', at16, 2]])
    expect(expression[6]).toEqual(['max', 1, ['+', ['*', at16, 256], 2]])
    // without a minimum the zoom curve is still the outermost expression
    expect((metresToPx('widthMetres') as unknown[])[0]).toBe('interpolate')
  })
})

describe('LANES_LAYERS', () => {
  test('line layers prefixed maid-lanes-, from zoom 17, the source prefixed too', () => {
    expect(LANES_SOURCE.startsWith('maid-lanes-')).toBe(true)
    expect(LANES_MIN_ZOOM).toBe(17)
    for (const layer of LANES_LAYERS) {
      expect(layer.id.startsWith('maid-lanes-')).toBe(true)
      expect(layer.type).toBe('line')
      expect(layer.minzoom).toBe(LANES_MIN_ZOOM)
      expect(layer.paint['line-offset']).toEqual(metresToPx('offsetMetres'))
    }
    expect(new Set(LANES_LAYERS.map((layer) => layer.id)).size).toBe(LANES_LAYERS.length)
  })

  test('the chosen outline is under the bands and wider than them', () => {
    const [outline, band] = LANES_LAYERS
    expect(outline!.filter).toEqual(['==', ['get', 'focus'], 'chosen'])
    expect(outline!.paint['line-width']).toEqual(metresToPx('widthMetres', 4))
    expect(band!.filter).toBeUndefined()
    const colours = JSON.stringify(band!.paint['line-color'])
    for (const value of ['hovered', 'chosen', 'bus', 'bicycle', 'other'])
      expect(colours).toContain(value)
  })
})
