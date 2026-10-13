import { afterEach, describe, expect, it } from 'bun:test'
import { imagery } from './index.ts'
import {
  backgroundKey,
  backgroundKeyOf,
  backgroundOnMap,
  createImageryStore,
  shownBackgroundId,
  shownTemplate,
  VISIT_ID,
} from './store.ts'

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
    const result = store.getState().addCustom('  Alpha  ', A)
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
    store.getState().addCustom('Alpha', A)
    store.getState().setBackground(null)
    const again = store.getState().addCustom('Other name', `${A}\n`)
    expect(again).toEqual({ ok: true, id: 'custom-1' })
    expect(store.getState().custom).toHaveLength(1)
    expect(store.getState().custom[0]?.name).toBe('Alpha')
    expect(store.getState().backgroundId).toBe('custom-1')
  })

  it('refuses a template that does not work, and saves nothing', () => {
    useStorage()
    const store = createImageryStore(null)
    const result = store.getState().addCustom('Bad', 'ftp://tiles.example.org/{z}/{x}/{y}.png')
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
    store.getState().addCustom('Alpha', A)
    expect(store.getState().editCustom('custom-1', 'Renamed', A)).toEqual({
      ok: true,
      id: 'custom-1',
    })
    expect(store.getState().custom).toEqual([{ id: 'custom-1', name: 'Renamed', template: A }])
    expect(store.getState().backgroundId).toBe('custom-1')
  })

  it('edits the template of an entry and keeps its id', () => {
    useStorage()
    const store = createImageryStore(null)
    store.getState().addCustom('Alpha', A)
    store.getState().editCustom('custom-1', 'Alpha', B)
    expect(store.getState().custom).toEqual([{ id: 'custom-1', name: 'Alpha', template: B }])
  })

  it("merges an edit into another entry's template: one entry stays, with the typed name", () => {
    useStorage()
    const store = createImageryStore(null)
    store.getState().addCustom('Alpha', A)
    store.getState().addCustom('Beta', B)
    expect(store.getState().backgroundId).toBe('custom-2')
    const result = store.getState().editCustom('custom-2', 'Renamed B', A)
    expect(result).toEqual({ ok: true, id: 'custom-1' })
    expect(store.getState().custom).toEqual([{ id: 'custom-1', name: 'Renamed B', template: A }])
    expect(store.getState().backgroundId).toBe('custom-1')
  })

  it('falls back to the default background when the selected entry is deleted', () => {
    useStorage()
    const store = createImageryStore('bing')
    store.getState().addCustom('Alpha', A)
    store.getState().addCustom('Beta', B)
    store.getState().deleteCustom('custom-2')
    expect(store.getState().backgroundId).toBe('bing')
    expect(store.getState().custom.map((entry) => entry.id)).toEqual(['custom-1'])
  })

  it('keeps the selection when another entry is deleted', () => {
    useStorage()
    const store = createImageryStore(null)
    store.getState().addCustom('Alpha', A)
    store.getState().addCustom('Beta', B)
    store.getState().deleteCustom('custom-1')
    expect(store.getState().backgroundId).toBe('custom-2')
  })

  it('never gives an id out twice: not after a deletion, and not after a reload', () => {
    const storage = useStorage()
    const first = createImageryStore(null)
    first.getState().addCustom('Alpha', A)
    first.getState().addCustom('Beta', B)
    first.getState().deleteCustom('custom-2')
    expect(first.getState().addCustom('Gamma', C)).toEqual({ ok: true, id: 'custom-3' })
    first.getState().deleteCustom('custom-3')

    // a new store reads what the first one stored
    const second = createImageryStore(null)
    expect(second.getState().customNext).toBe(4)
    expect(second.getState().addCustom('Again', `${C}?x=1`)).toEqual({ ok: true, id: 'custom-4' })
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
    store.getState().addCustom('Alpha', A)
    const result = store.getState().visitBackground(LINK)
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
    store.getState().visitBackground(LINK)
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
    store.getState().addCustom('Alpha', A)
    store.getState().visitBackground(LINK)
    store.getState().setBrightness(0.5)
    expect(store.getState().visit).toBeNull()
    expect(shownTemplate(store.getState())).toBe(A)
    expect(stored(storage.items)?.state.brightness).toBe(0.5)
  })

  it('can be left with leaveVisit, which shows the stored choice again', () => {
    useStorage()
    const store = createImageryStore(null)
    store.getState().addCustom('Alpha', A)
    store.getState().visitBackground(LINK)
    store.getState().leaveVisit()
    expect(shownBackgroundId(store.getState())).toBe('custom-1')
  })

  it('refuses a template that does not work, and shows nothing', () => {
    useStorage()
    const store = createImageryStore(null)
    expect(store.getState().visitBackground('https://links.example.org/{z}/{x}').ok).toBe(false)
    expect(store.getState().visit).toBeNull()
  })
})

describe('the background as drawn, for the measure magnifier', () => {
  const source = { type: 'raster' as const, tiles: [A], tileSize: 256 }
  const drawn = (key: string) => ({ key, source })
  const choice = { visit: null, backgroundId: 'wms-a', custom: [] }

  it('is the drawn background of the shown choice, with the brightness', () => {
    const state = { ...choice, drawnBackground: drawn(backgroundKey(choice)), brightness: 0.6 }
    expect(backgroundOnMap(state)).toEqual({ source, brightness: 0.6 })
  })

  it('is nothing while the choice is not drawn yet, or another one was drawn', () => {
    expect(backgroundOnMap({ ...choice, drawnBackground: null, brightness: 1 })).toBeUndefined()
    const other = { ...choice, backgroundId: 'wms-b' }
    const stale = { ...other, drawnBackground: drawn(backgroundKey(choice)), brightness: 1 }
    expect(backgroundOnMap(stale)).toBeUndefined()
  })

  it('is nothing with no background chosen', () => {
    const none = { visit: null, backgroundId: null, custom: [] }
    expect(
      backgroundOnMap({ ...none, drawnBackground: drawn('\n'), brightness: 1 }),
    ).toBeUndefined()
  })

  it('a visit shows its own template, with its own key', () => {
    const visit = { visit: { template: A }, backgroundId: 'wms-a', custom: [] }
    expect(backgroundKey(visit)).toBe(backgroundKeyOf(VISIT_ID, A))
    expect(backgroundKey(visit)).not.toBe(backgroundKey(choice))
  })
})
