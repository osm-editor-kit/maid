import { describe, expect, it } from 'bun:test'
import { withMapMinzoom } from './eli.ts'
import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  categoryLabel,
  clampBrightness,
  matchesQuery,
  parseStored,
  sortListing,
  toMapZoom,
  toOsmZoom,
  visibleAtZoom,
  type Listing,
} from './helpers.ts'

function item(overrides: Partial<Listing> & { id: string }): Listing {
  return { name: overrides.id, best: false, overlay: false, ...overrides }
}

describe('parseStored', () => {
  const fallback = { backgroundId: null }

  it('uses the defaults for nothing stored', () => {
    expect(parseStored(undefined, fallback)).toEqual({
      backgroundId: null,
      overlayIds: [],
      brightness: 1,
    })
  })

  it('keeps the default background when the stored entry has no background', () => {
    expect(parseStored({}, { backgroundId: 'Bing' }).backgroundId).toBe('Bing')
  })

  it('keeps a stored choice of none, even when the default is a background', () => {
    expect(parseStored({ backgroundId: null }, { backgroundId: 'Bing' }).backgroundId).toBeNull()
  })

  it('drops values of the wrong type and duplicate overlays', () => {
    const stored = parseStored(
      { backgroundId: 42, overlayIds: ['a', 7, 'a', 'b'], brightness: 'bright' },
      fallback,
    )
    expect(stored).toEqual({ backgroundId: null, overlayIds: ['a', 'b'], brightness: 1 })
  })

  it('clamps a stored brightness', () => {
    expect(parseStored({ brightness: 0 }, fallback).brightness).toBe(BRIGHTNESS_MIN)
    expect(parseStored({ brightness: 5 }, fallback).brightness).toBe(BRIGHTNESS_MAX)
  })

  it('treats non-object storage as nothing stored', () => {
    expect(parseStored('garbage', fallback)).toEqual({
      backgroundId: null,
      overlayIds: [],
      brightness: 1,
    })
  })
})

describe('clampBrightness', () => {
  it('keeps values between the limits and returns full brightness for NaN', () => {
    expect(clampBrightness(0.5)).toBe(0.5)
    expect(clampBrightness(-1)).toBe(BRIGHTNESS_MIN)
    expect(clampBrightness(2)).toBe(BRIGHTNESS_MAX)
    expect(clampBrightness(Number.NaN)).toBe(BRIGHTNESS_MAX)
  })
})

describe('sortListing', () => {
  it('puts the best layers first and sorts each group by name', () => {
    const sorted = sortListing([
      item({ id: 'c', name: 'Zurich' }),
      item({ id: 'b', name: 'Berlin', best: true }),
      item({ id: 'a', name: 'alpha' }),
      item({ id: 'd', name: 'Aachen', best: true }),
    ])
    expect(sorted.map((i) => i.id)).toEqual(['d', 'b', 'a', 'c'])
  })

  it('does not change the list it is given', () => {
    const input = [item({ id: 'b', name: 'b' }), item({ id: 'a', name: 'a' })]
    sortListing(input)
    expect(input.map((i) => i.id)).toEqual(['b', 'a'])
  })
})

describe('visibleAtZoom', () => {
  it('hides a layer below its minimum zoom and shows it from there on', () => {
    expect(visibleAtZoom({ minzoom: 14 }, 13.9)).toBe(false)
    expect(visibleAtZoom({ minzoom: 14 }, 14)).toBe(true)
  })

  it('shows layers without a minimum zoom at every zoom', () => {
    expect(visibleAtZoom({}, 0)).toBe(true)
  })

  it('does not hide a layer past its ELI maximum zoom, because MapLibre overzooms', () => {
    expect(visibleAtZoom({ minzoom: 0 }, 22)).toBe(true)
  })

  it('takes OSM zoom: a layer with minzoom 14 is visible at MapLibre 13, not at 12.9', () => {
    expect(visibleAtZoom({ minzoom: 14 }, toOsmZoom(13))).toBe(true)
    expect(visibleAtZoom({ minzoom: 14 }, toOsmZoom(12.9))).toBe(false)
  })

  it('shows a layer without minzoom at every MapLibre zoom', () => {
    expect(visibleAtZoom({}, toOsmZoom(-2))).toBe(true)
  })
})

describe('zoom conversion', () => {
  it('converts MapLibre zoom to OSM zoom by one level', () => {
    expect(toOsmZoom(16)).toBe(17)
    expect(toOsmZoom(13)).toBe(14)
  })

  it('round-trips in both directions', () => {
    for (const zoom of [-2, 0, 12.9, 13, 16.5, 22]) {
      expect(toMapZoom(toOsmZoom(zoom))).toBe(zoom)
      expect(toOsmZoom(toMapZoom(zoom))).toBe(zoom)
    }
  })
})

describe('withMapMinzoom', () => {
  it('turns ELI minzoom 14 (OSM) into MapLibre minzoom 13 for the style layer', () => {
    expect(withMapMinzoom({ minzoom: 14 }).minzoom).toBe(13)
  })

  it('never goes below 0', () => {
    expect(withMapMinzoom({ minzoom: 0 }).minzoom).toBe(0)
    expect(withMapMinzoom({ minzoom: 1 }).minzoom).toBe(0)
  })

  it('leaves a layer without minzoom without one', () => {
    expect(withMapMinzoom<{ minzoom?: number }>({}).minzoom).toBeUndefined()
  })
})

describe('matchesQuery', () => {
  const photo = item({ id: 'x', name: 'Bing Aerial', category: 'photo' })

  it('matches every word against the name or the category label', () => {
    expect(matchesQuery(photo, 'bing')).toBe(true)
    expect(matchesQuery(photo, 'BING aerial')).toBe(true)
    expect(matchesQuery(photo, 'aerial photo')).toBe(true)
  })

  it('needs every word to match', () => {
    expect(matchesQuery(photo, 'bing map')).toBe(false)
  })

  it('matches everything for an empty query', () => {
    expect(matchesQuery(photo, '   ')).toBe(true)
  })
})

describe('categoryLabel', () => {
  it('names known ELI categories and passes unknown ones through', () => {
    expect(categoryLabel('historicmap')).toBe('Historic map')
    expect(categoryLabel('something-new')).toBe('something-new')
    expect(categoryLabel(undefined)).toBeUndefined()
  })
})
