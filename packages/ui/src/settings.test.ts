import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { useSettings, type Settings } from './settings.ts'

// The store reads and writes localStorage under `maid:settings` (version 4). Each test puts a value
// there, as an earlier visit would have, and loads it through zustand's own rehydrate.

const KEY = 'maid:settings'
const entries = new Map<string, string>()
const fake = {
  getItem: (name: string) => entries.get(name) ?? null,
  setItem: (name: string, value: string) => void entries.set(name, value),
  removeItem: (name: string) => void entries.delete(name),
}
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true })
})

afterAll(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

// typed as the settings, so that the geometries and keys are checked as literals
const good: Settings = {
  theme: 'dark',
  sizes: { 'sidebar-width': 320, 'dock-height': 240 },
  shown: { filters: 'buildings' },
  favourites: [
    { presetId: 'amenity/bench', geometry: 'point', number: '1' },
    { presetId: 'highway/residential', geometry: 'line', number: '2' },
  ],
}

/** Stores the value as a version 4 record and loads it, as a new visit does */
async function load(state: unknown) {
  // a page load starts without a position or a chosen language: the earlier test's value must not carry over
  useSettings.setState({ lastView: undefined, lang: undefined })
  entries.set(KEY, JSON.stringify({ state, version: 4 }))
  await useSettings.persist.rehydrate()
  return useSettings.getState()
}

describe('settings store', () => {
  it('a good stored value loads, and a change is written back in the same shape', async () => {
    const state = await load(good)
    expect(state.theme).toBe('dark')
    expect(state.sizes).toEqual(good.sizes)
    expect(state.shown).toEqual(good.shown)
    expect(state.favourites).toEqual(good.favourites)

    state.setTheme('light')
    const written = JSON.parse(entries.get(KEY) ?? 'null')
    expect(written).toEqual({ state: { ...good, theme: 'light' }, version: 4 })
  })

  it('an unknown theme falls back to system, and the favourites are kept', async () => {
    const state = await load({ ...good, theme: 'purple' })
    expect(state.theme).toBe('system')
    expect(state.favourites).toEqual(good.favourites)
  })

  it('a wrong type in each field falls back to that field only', async () => {
    const state = await load({
      theme: 1,
      sizes: { 'sidebar-width': 'wide' },
      shown: { filters: 3 },
      favourites: good.favourites,
    })
    expect(state.theme).toBe('system')
    expect(state.sizes).toEqual({})
    expect(state.shown).toEqual({})
    expect(state.favourites).toEqual(good.favourites)
  })

  it('a broken sizes does not drop the favourites', async () => {
    const state = await load({ ...good, sizes: 'big' })
    expect(state.sizes).toEqual({})
    expect(state.favourites).toEqual(good.favourites)
  })

  it('a favourite that does not fit is left out, the others are kept', async () => {
    const state = await load({
      ...good,
      favourites: [
        { presetId: 'amenity/bench', geometry: 'point', number: '1' },
        { presetId: 'amenity/bench', geometry: 'point', number: '01' },
        { presetId: 'amenity/bench', geometry: 'road', number: '6' },
        { presetId: 7, geometry: 'line', number: '6' },
        'amenity/bench',
        { presetId: 'highway/residential', geometry: 'line', number: '2' },
      ],
    })
    expect(state.favourites).toEqual(good.favourites)
  })

  it('favourites that are not a list give no favourites', async () => {
    const state = await load({ ...good, favourites: { presetId: 'amenity/bench' } })
    expect(state.favourites).toEqual([])
  })

  it('a missing field gets its default and the others are kept', async () => {
    const state = await load({ theme: 'dark' })
    expect(state.theme).toBe('dark')
    expect(state.sizes).toEqual({})
    expect(state.shown).toEqual({})
    expect(state.favourites).toEqual([])
  })

  it('a stored value that is not an object gives every default', async () => {
    for (const stored of ['oops', null, [1, 2], 42]) {
      const state = await load(stored)
      expect(state.theme).toBe('system')
      expect(state.sizes).toEqual({})
      expect(state.shown).toEqual({})
      expect(state.favourites).toEqual([])
    }
  })
})

describe('the last map position', () => {
  it('a stored position loads, and a new one is written in the same shape', async () => {
    const state = await load({ ...good, lastView: { lng: 13.4, lat: 52.5, zoom: 17.25 } })
    expect(state.lastView).toEqual({ lng: 13.4, lat: 52.5, zoom: 17.25 })

    state.setLastView({ lng: 13.5, lat: 52.6, zoom: 18 })
    const written = JSON.parse(entries.get(KEY) ?? 'null')
    expect(written.state.lastView).toEqual({ lng: 13.5, lat: 52.6, zoom: 18 })
    expect(written.version).toBe(4)
  })

  it('a value stored before the position existed loads without one', async () => {
    const state = await load(good)
    expect(state.lastView).toBeUndefined()
    expect(state.shown).toEqual(good.shown)
  })

  it('a position that does not fit is dropped, and the other fields are kept', async () => {
    for (const lastView of [
      { lng: 13.4, lat: 95, zoom: 17 },
      { lng: 200, lat: 52, zoom: 17 },
      { lng: 13.4, lat: 52 },
      { lng: '13.4', lat: 52, zoom: 17 },
      'Berlin',
    ]) {
      const state = await load({ ...good, lastView })
      expect(state.lastView).toBeUndefined()
      expect(state.favourites).toEqual(good.favourites)
      expect(state.shown).toEqual(good.shown)
    }
  })

  it('the turn is kept with the position; a turn that does not fit is dropped and the position kept', async () => {
    const turned = await load({
      ...good,
      lastView: { lng: 13.4, lat: 52.5, zoom: 17, bearing: -37.5 },
    })
    expect(turned.lastView).toEqual({ lng: 13.4, lat: 52.5, zoom: 17, bearing: -37.5 })

    const bad = await load({ ...good, lastView: { lng: 13.4, lat: 52.5, zoom: 17, bearing: 400 } })
    expect(bad.lastView).toEqual({ lng: 13.4, lat: 52.5, zoom: 17 })
    expect(bad.lastView?.bearing).toBeUndefined()
  })
})

describe('the chosen language', () => {
  it('a stored language loads, and a new choice is written in the same shape', async () => {
    const state = await load({ ...good, lang: 'de' })
    expect(state.lang).toBe('de')

    state.setLang('fr')
    const written = JSON.parse(entries.get(KEY) ?? 'null')
    expect(written.state.lang).toBe('fr')
    expect(written.version).toBe(4)
  })

  it('a value stored before the choice existed loads without one, and the rest is kept', async () => {
    const state = await load(good)
    expect(state.lang).toBeUndefined()
    expect(state.favourites).toEqual(good.favourites)
  })

  it("a language that is not one of Maid's is dropped, and the other fields are kept", async () => {
    for (const lang of ['it', 'DE', '', 3, null]) {
      const state = await load({ ...good, lang })
      expect(state.lang).toBeUndefined()
      expect(state.favourites).toEqual(good.favourites)
      expect(state.shown).toEqual(good.shown)
    }
  })
})
