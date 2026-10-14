import { afterEach, describe, expect, it } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { createImageryStore, shownBackgroundId, shownTemplate, VISIT_ID } from './imagery-store.ts'
import { drawnShown } from './ImageryLayers.tsx'
import { imagery } from './index.ts'

const KEY = 'maid:imagery'
const A = 'https://tiles.example.org/a/{z}/{x}/{y}.png'
const B = 'https://tiles.example.org/b/{z}/{x}/{y}.png'
const C = 'https://tiles.example.org/c/{z}/{x}/{y}.png'
const LINK = 'https://links.example.org/{z}/{x}/{y}.png'

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
  it("adds one, selects it, and stores it in the fork's shape", () => {
    const storage = useStorage()
    const store = createImageryStore(null)
    const result = store.getState().actions.addCustom('  Alpha  ', A)
    expect(result).toEqual({ ok: true, id: 'custom-1' })
    expect(store.getState().custom).toEqual([{ id: 'custom-1', name: 'Alpha', template: A }])
    expect(store.getState().backgroundId).toBe('custom-1')
    expect(store.getState().customNext).toBe(2)
    expect(stored(storage.items)?.state).toMatchObject({
      backgroundId: 'custom-1',
      custom: [{ id: 'custom-1', name: 'Alpha', template: A }],
      customNext: 2,
    })
  })

  it('selects an entry whose template is saved already, and does not add it twice', () => {
    useStorage()
    const store = createImageryStore(null)
    store.getState().actions.addCustom('Alpha', A)
    store.getState().actions.setBackground(null)
    const again = store.getState().actions.addCustom('Other name', `${A}\n`)
    expect(again).toEqual({ ok: true, id: 'custom-1' })
    expect(store.getState().custom).toHaveLength(1)
    expect(store.getState().custom[0]?.name).toBe('Alpha')
    expect(store.getState().backgroundId).toBe('custom-1')
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
    expect(store.getState().customNext).toBe(1)
    expect(store.getState().backgroundId).toBeNull()
  })

  it('renames an entry, keeping its id and the selection', () => {
    useStorage()
    const store = createImageryStore(null)
    store.getState().actions.addCustom('Alpha', A)
    expect(store.getState().actions.editCustom('custom-1', 'Renamed', A)).toEqual({
      ok: true,
      id: 'custom-1',
    })
    expect(store.getState().custom).toEqual([{ id: 'custom-1', name: 'Renamed', template: A }])
    expect(store.getState().backgroundId).toBe('custom-1')
  })

  it('edits the template of an entry and keeps its id', () => {
    useStorage()
    const store = createImageryStore(null)
    store.getState().actions.addCustom('Alpha', A)
    store.getState().actions.editCustom('custom-1', 'Alpha', B)
    expect(store.getState().custom).toEqual([{ id: 'custom-1', name: 'Alpha', template: B }])
  })

  it("merges an edit into another entry's template: one entry stays, with the typed name", () => {
    useStorage()
    const store = createImageryStore(null)
    store.getState().actions.addCustom('Alpha', A)
    store.getState().actions.addCustom('Beta', B)
    expect(store.getState().backgroundId).toBe('custom-2')
    const result = store.getState().actions.editCustom('custom-2', 'Renamed B', A)
    expect(result).toEqual({ ok: true, id: 'custom-1' })
    expect(store.getState().custom).toEqual([{ id: 'custom-1', name: 'Renamed B', template: A }])
    expect(store.getState().backgroundId).toBe('custom-1')
  })

  it('falls back to the default background when the selected entry is deleted', () => {
    useStorage()
    const store = createImageryStore('bing')
    store.getState().actions.addCustom('Alpha', A)
    store.getState().actions.addCustom('Beta', B)
    store.getState().actions.deleteCustom('custom-2')
    expect(store.getState().backgroundId).toBe('bing')
    expect(store.getState().custom.map((entry) => entry.id)).toEqual(['custom-1'])
  })

  it('keeps the selection when another entry is deleted', () => {
    useStorage()
    const store = createImageryStore(null)
    store.getState().actions.addCustom('Alpha', A)
    store.getState().actions.addCustom('Beta', B)
    store.getState().actions.deleteCustom('custom-1')
    expect(store.getState().backgroundId).toBe('custom-2')
  })

  it('never gives an id out twice: not after a deletion, and not after a reload', () => {
    const storage = useStorage()
    const first = createImageryStore(null)
    first.getState().actions.addCustom('Alpha', A)
    first.getState().actions.addCustom('Beta', B)
    first.getState().actions.deleteCustom('custom-2')
    expect(first.getState().actions.addCustom('Gamma', C)).toEqual({ ok: true, id: 'custom-3' })
    first.getState().actions.deleteCustom('custom-3')

    // a new store reads what the first one stored
    const second = createImageryStore(null)
    expect(second.getState().customNext).toBe(4)
    expect(second.getState().actions.addCustom('Again', `${C}?x=1`)).toEqual({
      ok: true,
      id: 'custom-4',
    })
    expect(stored(storage.items)?.state.customNext).toBe(5)
  })

  it('drops a broken entry and keeps the others, with the choice that was made', () => {
    useStorage({
      [KEY]: JSON.stringify({
        state: {
          backgroundId: 'custom-2',
          overlayIds: [],
          brightness: 0.5,
          custom: [
            { id: 'custom-1', name: 'Alpha', template: A },
            { id: 'nope', name: 'Broken', template: B },
            { id: 'custom-2', name: 42, template: B },
          ],
          customNext: 3,
        },
        version: 2,
      }),
    })
    const store = createImageryStore(null)
    expect(store.getState().custom).toEqual([
      { id: 'custom-1', name: 'Alpha', template: A },
      { id: 'custom-2', name: '', template: B },
    ])
    expect(store.getState().backgroundId).toBe('custom-2')
    expect(store.getState().brightness).toBe(0.5)
  })

  it('does not give out the number of a dropped entry', () => {
    useStorage({
      [KEY]: JSON.stringify({
        state: {
          backgroundId: null,
          custom: [
            { id: 'custom-1', name: 'Alpha', template: A },
            { id: 'custom-5', name: 'Broken: no template' },
          ],
          customNext: 2,
        },
        version: 2,
      }),
    })
    const store = createImageryStore(null)
    expect(store.getState().custom.map((entry) => entry.id)).toEqual(['custom-1'])
    expect(store.getState().customNext).toBe(6)
  })

  it('falls back to the default when the stored choice is a custom background that is gone', () => {
    useStorage({
      [KEY]: JSON.stringify({ state: { backgroundId: 'custom-9', custom: [] }, version: 2 }),
    })
    expect(createImageryStore('bing').getState().backgroundId).toBe('bing')
  })
})

describe('the visit background from a link', () => {
  it('is shown for the visit, without changing the stored choice or the list', () => {
    const storage = useStorage()
    const store = createImageryStore(null)
    store.getState().actions.addCustom('Alpha', A)
    const result = store.getState().actions.visitBackground(LINK)
    expect(result).toEqual({ ok: true, id: VISIT_ID })
    expect(store.getState().backgroundId).toBe('custom-1')
    expect(store.getState().custom).toEqual([{ id: 'custom-1', name: 'Alpha', template: A }])
    expect(shownBackgroundId(store.getState())).toBe(VISIT_ID)
    expect(shownTemplate(store.getState())).toBe(LINK)
    expect(JSON.stringify(stored(storage.items))).not.toContain('links.example.org')
  })

  it('is not in the part that is persisted', () => {
    useStorage()
    const store = createImageryStore(null)
    store.getState().actions.visitBackground(LINK)
    const persisted = store.persist.getOptions().partialize?.(store.getState())
    expect(Object.keys(persisted ?? {}).sort()).toEqual(
      ['backgroundId', 'brightness', 'custom', 'customNext', 'overlayIds'].sort(),
    )
  })

  it('is not stored through the module either', () => {
    const storage = useStorage()
    const module = imagery()
    expect(module.visitBackground(LINK).ok).toBe(true)
    // the store wrote its state after the visit: the link is not in what it wrote
    expect(storage.items.get(KEY)).toBeDefined()
    expect(storage.items.get(KEY)).not.toContain('links.example.org')
  })

  it('ends with the first change the person makes, and that change is stored', () => {
    const storage = useStorage()
    const store = createImageryStore(null)
    store.getState().actions.addCustom('Alpha', A)
    store.getState().actions.visitBackground(LINK)
    store.getState().actions.setBrightness(0.5)
    expect(store.getState().visit).toBeNull()
    expect(shownTemplate(store.getState())).toBe(A)
    expect(stored(storage.items)?.state.brightness).toBe(0.5)
  })

  it('can be left with leaveVisit, which shows the stored choice again', () => {
    useStorage()
    const store = createImageryStore(null)
    store.getState().actions.addCustom('Alpha', A)
    store.getState().actions.visitBackground(LINK)
    store.getState().actions.leaveVisit()
    expect(shownBackgroundId(store.getState())).toBe('custom-1')
  })

  it('refuses a template that does not work, and shows nothing', () => {
    useStorage()
    const store = createImageryStore(null)
    expect(store.getState().actions.visitBackground('https://links.example.org/{z}/{x}').ok).toBe(
      false,
    )
    expect(store.getState().visit).toBeNull()
  })
})

describe('the drawn layers of the shown choice, read from the query cache', () => {
  const source = { type: 'raster' as const, tiles: [A], tileSize: 256 }
  const index = { visit: null, backgroundId: 'wms-a', custom: [], overlayIds: [] }

  it('is the drawn background of an index layer, with its source', () => {
    const queries = new QueryClient()
    queries.setQueryData(['imagery', 'layer', 'wms-a', true], { id: 'wms-a', name: 'A', source })
    expect(drawnShown(queries, index).background).toEqual(
      expect.objectContaining({ id: 'wms-a', name: 'A', source }),
    )
  })

  it('is nothing while the choice is not drawn yet', () => {
    expect(drawnShown(new QueryClient(), index).background).toBeUndefined()
  })

  it('is nothing with no background chosen, even if one was drawn before', () => {
    const queries = new QueryClient()
    queries.setQueryData(['imagery', 'layer', 'wms-a', true], { id: 'wms-a', name: 'A', source })
    const none = { ...index, backgroundId: null }
    expect(drawnShown(queries, none).background).toBeUndefined()
  })

  it('reads a custom background with its template', () => {
    const queries = new QueryClient()
    queries.setQueryData(['imagery', 'custom', 'custom-1', A, 1], {
      id: 'custom-1',
      name: 'Alpha',
      source,
    })
    const custom = { visit: null, backgroundId: 'custom-1', custom: [], overlayIds: [] }
    const entry = { ...custom, custom: [{ id: 'custom-1', name: 'Alpha', template: A }] }
    expect(drawnShown(queries, entry).background).toEqual(
      expect.objectContaining({ id: 'custom-1' }),
    )
  })

  it('a visit reads its own template, under the visit id', () => {
    const queries = new QueryClient()
    queries.setQueryData(['imagery', 'custom', VISIT_ID, A, 1], { id: VISIT_ID, name: 'L', source })
    const visit = { visit: { template: A }, backgroundId: 'wms-a', custom: [], overlayIds: [] }
    expect(drawnShown(queries, visit).background).toEqual(expect.objectContaining({ id: VISIT_ID }))
  })

  it('gives the overlays that are drawn, and leaves out the others', () => {
    const queries = new QueryClient()
    queries.setQueryData(['imagery', 'layer', 'roads', false], { id: 'roads', name: 'Roads' })
    const state = { ...index, overlayIds: ['roads', 'dop'] }
    expect(drawnShown(queries, state).overlays.map((item) => item.id)).toEqual(['roads'])
  })
})
