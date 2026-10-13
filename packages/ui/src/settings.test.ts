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
async function load(state: unknown, version = 4) {
  entries.set(KEY, JSON.stringify({ state, version }))
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

  it('version 3 favourites, with one of seven fixed keys each, are numbered in their order', async () => {
    const state = await load(
      {
        ...good,
        favourites: [
          { presetId: 'amenity/bench', geometry: 'point', key: '9' },
          { presetId: 'highway/residential', geometry: 'line', key: '4' },
        ],
      },
      3,
    )
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

  it('a version 2 value, without favourites, loads with the defaults for what it lacks', async () => {
    const state = await load({ theme: 'light', sizes: { 'dock-height': 200 }, shown: {} }, 2)
    expect(state.theme).toBe('light')
    expect(state.sizes).toEqual({ 'dock-height': 200 })
    expect(state.favourites).toEqual([])
  })
})
