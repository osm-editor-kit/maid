import { afterEach, describe, expect, it } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { createImageryStore } from './imagery-store.ts'
import { drawnShown } from './ImageryLayers.tsx'
import { customValue, NONE } from './url.ts'

const KEY = 'maid:imagery'
const A = 'https://tiles.example.org/a/{z}/{x}/{y}.png'
const B = 'https://tiles.example.org/b/{z}/{x}/{y}.png'

/**
 * A stand-in for localStorage, given to the store through the global the module storage reads.
 * Bun has no localStorage, so the tests put one in place and remove it again.
 */
function useStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  const storage = {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value)
    },
    removeItem: (key: string) => {
      items.delete(key)
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })
  return storage
}

/** The stored value as an object: the whole `{ state, version }` zustand writes */
function stored(items: Map<string, string>) {
  const value = items.get(KEY)
  return value === undefined ? undefined : JSON.parse(value)
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('custom backgrounds in the store', () => {
  it('adds one, keyed by its template, and returns the value it is chosen as', () => {
    const storage = useStorage()
    const store = createImageryStore(null)
    const result = store.getState().actions.addCustom('  Alpha  ', A)
    expect(result).toEqual({ ok: true, value: customValue(A) })
    expect(store.getState().custom).toEqual([{ name: 'Alpha', template: A }])
    expect(stored(storage.items)?.state).toMatchObject({
      custom: [{ name: 'Alpha', template: A }],
    })
  })

  it('does not save a template twice', () => {
    useStorage()
    const store = createImageryStore(null)
    store.getState().actions.addCustom('Alpha', A)
    const again = store.getState().actions.addCustom('Other name', `${A}\n`)
    expect(again).toEqual({ ok: true, value: customValue(A) })
    expect(store.getState().custom).toEqual([{ name: 'Alpha', template: A }])
  })

  it('refuses a template that does not work, and saves nothing', () => {
    useStorage()
    const store = createImageryStore(null)
    const result = store
      .getState()
      .actions.addCustom('Bad', 'ftp://tiles.example.org/{z}/{x}/{y}.png')
    expect(result).toEqual({
      ok: false,
      reason: 'The template must start with https:// or http://.',
    })
    expect(store.getState().custom).toEqual([])
  })

  it('renames an entry and keeps the stored choice on it', () => {
    useStorage()
    const store = createImageryStore(null)
    store.getState().actions.addCustom('Alpha', A)
    store.getState().actions.rememberBackground(customValue(A))
    expect(store.getState().actions.editCustom(A, 'Renamed', A)).toEqual({
      ok: true,
      value: customValue(A),
    })
    expect(store.getState().custom).toEqual([{ name: 'Renamed', template: A }])
    expect(store.getState().background).toBe(customValue(A))
  })

  it('edits the template of an entry, and the stored choice follows it', () => {
    useStorage()
    const store = createImageryStore(null)
    store.getState().actions.addCustom('Alpha', A)
    store.getState().actions.rememberBackground(customValue(A))
    const result = store.getState().actions.editCustom(A, 'Alpha', B)
    expect(result).toEqual({ ok: true, value: customValue(B) })
    expect(store.getState().custom).toEqual([{ name: 'Alpha', template: B }])
    expect(store.getState().background).toBe(customValue(B))
  })

  it("merges an edit into another entry's template: one entry stays, with the typed name", () => {
    useStorage()
    const store = createImageryStore(null)
    store.getState().actions.addCustom('Alpha', A)
    store.getState().actions.addCustom('Beta', B)
    const result = store.getState().actions.editCustom(B, 'Renamed B', A)
    expect(result).toEqual({ ok: true, value: customValue(A) })
    expect(store.getState().custom).toEqual([{ name: 'Renamed B', template: A }])
  })

  it('forgets a stored choice of a deleted entry, and keeps the others', () => {
    useStorage()
    const store = createImageryStore('bing')
    store.getState().actions.addCustom('Alpha', A)
    store.getState().actions.addCustom('Beta', B)
    store.getState().actions.rememberBackground(customValue(B))
    store.getState().actions.deleteCustom(B)
    expect(store.getState().background).toBeNull()
    expect(store.getState().custom.map((entry) => entry.template)).toEqual([A])
    store.getState().actions.rememberBackground(customValue(A))
    store.getState().actions.deleteCustom(B)
    expect(store.getState().background).toBe(customValue(A))
  })
})

describe('the remembered choices', () => {
  it('stores the background and the overlays chosen, not the live values', () => {
    const storage = useStorage()
    const store = createImageryStore(null)
    store.getState().actions.rememberBackground('Bing')
    store.getState().actions.rememberOverlays(['roads', 'dop'])
    store.getState().actions.setBrightness(0.5)
    expect(stored(storage.items)?.state).toEqual({
      background: 'Bing',
      overlayIds: ['roads', 'dop'],
      brightness: 0.5,
      custom: [],
    })
  })

  it('keeps the stored choice of none, and never stores the start or the view', () => {
    const storage = useStorage()
    const store = createImageryStore('bing')
    store.getState().actions.rememberBackground(NONE)
    store.getState().actions.setView({ bounds: [0, 0, 1, 1], zoom: 14 })
    store.getState().actions.finishStart(NONE, [])
    store.getState().actions.setShown({ background: NONE, overlays: [] })
    store.getState().actions.setShownBrightness(0.6)
    const persisted = store.persist.getOptions().partialize?.(store.getState())
    expect(Object.keys(persisted ?? {}).sort()).toEqual([
      'background',
      'brightness',
      'custom',
      'overlayIds',
    ])
    expect(stored(storage.items)?.state.background).toBe(NONE)
  })

  it('mirrors the brightness drawn without storing it, and keeps the stored choice apart', () => {
    const storage = useStorage()
    const store = createImageryStore(null)
    expect(store.getState().shownBrightness).toBeNull()
    store.getState().actions.setShownBrightness(0.6)
    store.getState().actions.rememberBackground('Bing')
    expect(store.getState().shownBrightness).toBe(0.6)
    expect(store.getState().brightness).toBe(1)
    expect(stored(storage.items)?.state).not.toHaveProperty('shownBrightness')
  })

  it('reads what a store stored, in a new store', () => {
    useStorage()
    const first = createImageryStore(null)
    first.getState().actions.rememberBackground(customValue(A))
    first.getState().actions.addCustom('Alpha', A)
    const second = createImageryStore(null)
    expect(second.getState().background).toBe(customValue(A))
    expect(second.getState().custom).toEqual([{ name: 'Alpha', template: A }])
  })
})

describe('the storage of version 2 is migrated', () => {
  it('turns custom-N into custom:<template>, and keeps the names and the choice', () => {
    useStorage({
      [KEY]: JSON.stringify({
        state: {
          backgroundId: 'custom-2',
          overlayIds: ['roads'],
          brightness: 0.5,
          custom: [
            { id: 'custom-1', name: 'Alpha', template: A },
            { id: 'custom-2', name: 'Beta', template: B },
          ],
          customNext: 3,
        },
        version: 2,
      }),
    })
    const store = createImageryStore(null)
    expect(store.getState().background).toBe(customValue(B))
    expect(store.getState().overlayIds).toEqual(['roads'])
    expect(store.getState().brightness).toBe(0.5)
    expect(store.getState().custom).toEqual([
      { name: 'Alpha', template: A },
      { name: 'Beta', template: B },
    ])
  })

  it('writes version 3 after the migration', () => {
    const storage = useStorage({
      [KEY]: JSON.stringify({
        state: { backgroundId: null, overlayIds: [], custom: [] },
        version: 2,
      }),
    })
    // the migration itself does not write; the first change does
    const store = createImageryStore('bing')
    store.getState().actions.rememberBackground('Bing')
    expect(stored(storage.items)?.version).toBe(3)
    // a null background of version 2 was a choice of none
    expect(stored(storage.items)?.state.background).toBe('Bing')
  })

  it('reads a version 2 choice of none as none', () => {
    useStorage({
      [KEY]: JSON.stringify({
        state: { backgroundId: null, overlayIds: [], custom: [] },
        version: 2,
      }),
    })
    expect(createImageryStore('bing').getState().background).toBe(NONE)
  })

  it('leaves no choice for a custom-N whose entry is gone', () => {
    useStorage({
      [KEY]: JSON.stringify({ state: { backgroundId: 'custom-9', custom: [] }, version: 2 }),
    })
    expect(createImageryStore('bing').getState().background).toBeNull()
  })
})

describe('the start runs once', () => {
  it('begins once, and a finished start stays', () => {
    useStorage()
    const store = createImageryStore(null)
    const { actions } = store.getState()
    expect(actions.beginStart()).toBe(true)
    expect(actions.beginStart()).toBe(false)
    actions.finishStart('Bing', ['roads'])
    expect(store.getState().start).toEqual({
      status: 'ready',
      background: 'Bing',
      overlays: ['roads'],
    })
    expect(actions.beginStart()).toBe(false)
  })

  it('goes back to idle after a failed start, so the next view tries again', () => {
    useStorage()
    const store = createImageryStore(null)
    store.getState().actions.beginStart()
    store.getState().actions.abortStart()
    expect(store.getState().start).toEqual({ status: 'idle' })
    expect(store.getState().actions.beginStart()).toBe(true)
  })
})

describe('the shown values mirror', () => {
  it('does not change the store when the same values come again', () => {
    useStorage()
    const store = createImageryStore(null)
    store.getState().actions.setShown({ background: 'Bing', overlays: ['roads'] })
    const first = store.getState().shown
    store.getState().actions.setShown({ background: 'Bing', overlays: ['roads'] })
    expect(store.getState().shown).toBe(first)
  })
})

describe('the drawn layers of the shown values, read from the query cache', () => {
  const source = { type: 'raster' as const, tiles: [A], tileSize: 256 }

  it('is the drawn background of an index layer, with its source', () => {
    const queries = new QueryClient()
    queries.setQueryData(['imagery', 'layer', 'wms-a', true], { id: 'wms-a', name: 'A', source })
    expect(drawnShown(queries, { background: 'wms-a', overlays: [] }).background).toEqual(
      expect.objectContaining({ id: 'wms-a', name: 'A', source }),
    )
  })

  it('is nothing while the background is not drawn yet, and nothing for none', () => {
    const queries = new QueryClient()
    queries.setQueryData(['imagery', 'layer', 'wms-a', true], { id: 'wms-a', name: 'A', source })
    expect(
      drawnShown(new QueryClient(), { background: 'wms-a', overlays: [] }).background,
    ).toBeUndefined()
    expect(drawnShown(queries, { background: NONE, overlays: [] }).background).toBeUndefined()
  })

  it('reads a custom background under its value, with its template', () => {
    const queries = new QueryClient()
    queries.setQueryData(['imagery', 'custom', customValue(A), A, 1], {
      id: customValue(A),
      name: 'Alpha',
      source,
    })
    expect(drawnShown(queries, { background: customValue(A), overlays: [] }).background).toEqual(
      expect.objectContaining({ id: customValue(A) }),
    )
  })

  it('gives the overlays that are drawn, and leaves out the others', () => {
    const queries = new QueryClient()
    queries.setQueryData(['imagery', 'layer', 'roads', false], { id: 'roads', name: 'Roads' })
    const shown = drawnShown(queries, { background: 'wms-a', overlays: ['roads', 'dop'] })
    expect(shown.overlays.map((item) => item.id)).toEqual(['roads'])
  })
})
