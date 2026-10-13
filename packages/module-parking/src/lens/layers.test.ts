import { describe, expect, test } from 'bun:test'
import { arrowPixels, ARROW_HEIGHT, ARROW_WIDTH } from './arrow-image.ts'
import { areaCategory, CATEGORIES, hasSideTags, sideCategory } from './categories.ts'
import { PARKING_LAYERS, SIDE_CASING_WIDTH, SIDE_WIDTH, sideOffset } from './layers.ts'
import { parkingLens } from './parking-lens.ts'
import { connectParkingSides, getParkingSides, type LensSource } from './side-state.ts'

/**
 * The colours of Styles_euvm_parking_import.mapcss, by the name the file uses. Copied here on purpose: the file is
 * not in this repository, and the tests must run without it.
 */
const JOSM_COLOURS: Record<string, string> = {
  black: '#000000',
  lightcyan: '#e0ffff',
  '#cd7f32': '#cd7f32',
  red: '#ff0000',
  lightskyblue: '#87cefa',
  dodgerblue: '#1e90ff',
  chartreuse: '#7fff00',
}

const layersJson = JSON.stringify(PARKING_LAYERS)
const rulesJson = JSON.stringify(parkingLens.rules)

describe('colours', () => {
  test('every colour of the JOSM file is a category colour, and it is in the layers', () => {
    const coloured = new Set(Object.values(CATEGORIES).map((c) => c.colour))
    for (const [name, hex] of Object.entries(JOSM_COLOURS)) {
      expect(coloured.has(hex)).toBe(true)
      expect(layersJson).toContain(hex)
      expect(name.length).toBeGreaterThan(0)
    }
  })

  test("the JOSM categories carry the file colours; Maid's own categories are marked as such", () => {
    for (const category of Object.values(CATEGORIES)) {
      if (category.source === 'josm') {
        expect(Object.values(JOSM_COLOURS)).toContain(category.colour)
      } else {
        expect(Object.values(JOSM_COLOURS)).not.toContain(category.colour)
      }
    }
  })

  test('the lens rules use the same colours as the layers', () => {
    for (const rule of parkingLens.rules) {
      if (rule.color !== undefined) expect(rulesJson).toContain(rule.color)
    }
    expect(parkingLens.rules.filter((r) => r.label !== undefined).map((r) => r.label)).toEqual([
      'Warnings',
      'Loading zone',
      'Charging',
      'Disabled parking',
      'No stopping or no parking',
      'Restricted',
      'Paid parking',
      'Time limit',
      'Free parking',
      // legend only: the side lines' categories that no other rule names
      'Parked, no further tags',
      'No parking on this side',
      'Not mapped (dashed)',
    ])
  })
})

describe('layers', () => {
  test('ids are unique and every layer starts at the load zoom or later', () => {
    const ids = PARKING_LAYERS.map((layer) => layer.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const layer of PARKING_LAYERS) expect(layer.minzoom).toBeGreaterThanOrEqual(15)
  })

  test('the side lines are offset to the right (positive) and to the left (negative), casing and dashed ones too', () => {
    const offset = (id: string) =>
      PARKING_LAYERS.find((layer) => layer.id === id)?.paint?.['line-offset']
    for (const suffix of ['-casing', '', '-dashed']) {
      expect(JSON.stringify(offset(`parking-sides-right${suffix}`))).not.toContain('-')
      expect(JSON.stringify(offset(`parking-sides-left${suffix}`))).toContain('-')
    }
    expect(offset('parking-sides-left')).toEqual(sideOffset(-1))
  })

  test('a side line is outside the road as the editor draws it, from the load zoom on', () => {
    // the stops of the offset and of the line width, as [zoom, px] pairs
    const stops = (expression: readonly unknown[]) => {
      const numbers = expression.slice(3) as number[]
      return numbers.flatMap((zoom, i) => (i % 2 === 0 ? [[zoom, numbers[i + 1]!] as const] : []))
    }
    const width = new Map(stops(SIDE_CASING_WIDTH))
    // half of a residential road with its casing, in px at every zoom (iD's look: 10 px)
    const ROAD_HALF = 5
    for (const [zoom, offset] of stops(sideOffset(1))) {
      const half = (width.get(zoom) ?? 12) / 2
      expect(offset - half, `zoom ${zoom}`).toBeGreaterThanOrEqual(ROAD_HALF - 2)
      expect(offset, `zoom ${zoom}`).toBeGreaterThan(ROAD_HALF)
    }
    expect(stops(sideOffset(1))[0]![0]).toBe(15)
  })

  test('a casing lies under each side line, and it is wider', () => {
    const ids = PARKING_LAYERS.map((layer) => layer.id)
    for (const side of ['left', 'right']) {
      expect(ids.indexOf(`parking-sides-${side}-casing`)).toBeLessThan(
        ids.indexOf(`parking-sides-${side}`),
      )
    }
    expect(SIDE_CASING_WIDTH[4]).toBeGreaterThan(SIDE_WIDTH[4] as number)
  })

  test('parking without further tags is not a grey: its colour differs clearly from the no-parking and gap greys', () => {
    const saturation = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
      return Math.max(r!, g!, b!) - Math.min(r!, g!, b!)
    }
    expect(saturation(CATEGORIES.parked.colour)).toBeGreaterThan(100)
    expect(saturation(CATEGORIES.no_parking_side.colour)).toBe(0)
    expect(saturation(CATEGORIES.not_mapped.colour)).toBe(0)
  })

  test('the areas: a warnings strip is 6 px, the others 3 px; the obstacle halo steps 2.5 / 5 / 10', () => {
    const area = PARKING_LAYERS.find((layer) => layer.id === 'parking-areas-right')
    expect(JSON.stringify(area?.paint?.['line-width'])).toContain('warnings')
    const halo = PARKING_LAYERS.find((layer) => layer.id === 'parking-obstacle-ways')
    expect(halo?.paint?.['line-width']).toEqual(['step', ['zoom'], 2.5, 20, 5, 21, 10])
  })

  test('the arrow layer draws the image on lines, every 100 px, 25 px wide', () => {
    const arrows = PARKING_LAYERS.find((layer) => layer.id === 'parking-direction-arrows')
    expect(arrows?.type).toBe('symbol')
    expect(arrows?.layout).toMatchObject({
      'symbol-placement': 'line',
      'symbol-spacing': 100,
      'icon-size': 2.5,
    })
    expect((ARROW_WIDTH / 2) * 2.5).toBe(25)
  })
})

describe('the arrow image', () => {
  test('an open triangle, white, at most half opaque, with ink on its outline and none inside', () => {
    const image = arrowPixels()
    expect(image.width).toBe(ARROW_WIDTH)
    expect(image.height).toBe(ARROW_HEIGHT)
    const alpha = (x: number, y: number) => image.data[(y * ARROW_WIDTH + x) * 4 + 3]!
    let max = 0
    for (let i = 3; i < image.data.length; i += 4) max = Math.max(max, image.data[i]!)
    expect(max).toBeGreaterThan(0)
    expect(max).toBeLessThanOrEqual(128)
    // the left edge (x about 1.2 px) is inked, the middle of the triangle is not
    expect(alpha(1, 12)).toBeGreaterThan(0)
    expect(alpha(8, 12)).toBe(0)
  })
})

describe('categories', () => {
  test('areas follow the file: no stopping and loading zone before restricted; fee=no is free', () => {
    expect(areaCategory({ amenity: 'parking', restriction: 'no_stopping' })).toBe('no_stopping')
    expect(areaCategory({ amenity: 'parking', restriction: 'loading_only' })).toBe('loading_only')
    expect(areaCategory({ amenity: 'parking', restriction: 'loading_only @ (Mo-Fr)' })).toBe(
      'restricted',
    )
    expect(
      areaCategory({ amenity: 'parking', 'restriction:conditional': 'loading_only @ (Mo-Fr)' }),
    ).toBe('loading_only')
    expect(areaCategory({ amenity: 'parking', access: 'yes' })).toBeUndefined()
    expect(areaCategory({ amenity: 'parking', access: 'private' })).toBe('restricted')
    expect(areaCategory({ amenity: 'parking', fee: 'no' })).toBe('free')
    expect(areaCategory({ amenity: 'parking', warnings: 'yes', fee: 'no' })).toBe('warnings')
  })

  test('a side reads its own key, else both; a side with only `both` is mapped too', () => {
    expect(sideCategory({ 'parking:both': 'lane', 'parking:left:fee': 'no' }, 'left')).toBe('free')
    expect(
      sideCategory({ 'parking:both': 'lane', 'parking:left:fee': 'no' }, 'right'),
    ).toBeUndefined()
    expect(hasSideTags({ 'parking:both': 'lane' }, 'right')).toBe(true)
    expect(hasSideTags({ 'parking:right:fee': 'no' }, 'left')).toBe(false)
  })
})

describe('the lens', () => {
  test('a parking lens for lines and areas, dimming the rest, roads kept as they are', () => {
    expect(parkingLens.id).toBe('parking')
    expect(parkingLens.rest).toBe('dim')
    expect(parkingLens.geometry).toEqual(['line', 'area'])
    expect(parkingLens.rules.at(-1)).toEqual({ match: { highway: true }, opacity: 1 })
  })
})

describe('connectParkingSides', () => {
  test('the sides are shown while the parking lens is active, and hidden when it is not', () => {
    let activeId: string | null = null
    const listeners = new Set<() => void>()
    const source: LensSource = {
      getState: () => ({ activeId }),
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    }
    const emit = (next: string | null) => {
      activeId = next
      for (const listener of listeners) listener()
    }
    const stop = connectParkingSides(source, { showMissing: true })
    expect(getParkingSides()).toEqual({ shown: false, showMissing: true })
    emit('parking')
    expect(getParkingSides()).toEqual({ shown: true, showMissing: true })
    emit('surface')
    expect(getParkingSides().shown).toBe(false)
    emit('parking')
    stop()
    expect(getParkingSides().shown).toBe(false)
    expect(listeners.size).toBe(0)
  })
})
