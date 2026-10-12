/**
 * The module's state: the layers a person added by URL and what is hidden are stored under
 * `maid:data-layers` (version 1). Files and problems are session state and are not stored.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { checkDataLayerConfig, isRecord, type DataLayerConfig, type FileLayer } from './config.ts'

export type StoredDataLayers = {
  /** Layers added by URL, in the order they were added */
  added: DataLayerConfig[]
  /** Ids of hidden layers: config, added and file layers */
  hidden: string[]
}

/**
 * Turns whatever is stored into a valid state. A stored layer that no longer passes the checks is
 * dropped, not repaired; a repeated id keeps its first entry. Used on every load, so a state
 * written by an older version or edited by hand cannot break the map.
 */
export function sanitizeStored(value: unknown): StoredDataLayers {
  const record = isRecord(value) ? value : {}
  const added: DataLayerConfig[] = []
  const seen = new Set<string>()
  if (Array.isArray(record.added)) {
    for (const entry of record.added) {
      const checked = checkDataLayerConfig(entry)
      if (checked.ok && !seen.has(checked.value.id)) {
        seen.add(checked.value.id)
        added.push(checked.value)
      }
    }
  }
  const hidden = Array.isArray(record.hidden)
    ? [...new Set(record.hidden.filter((id): id is string => typeof id === 'string'))]
    : []
  return { added, hidden }
}

export type DataLayerStore = StoredDataLayers & {
  files: FileLayer[]
  /** Per layer id, why it could not be read (set by the map when it tries to draw it) */
  problems: Record<string, string>
  addLayer: (layer: DataLayerConfig) => void
  addFile: (file: FileLayer) => void
  remove: (id: string) => void
  setHidden: (id: string, hidden: boolean) => void
  setProblem: (id: string, message: string | undefined) => void
}

/**
 * A store of its own for each module. The hook it returns is what the components read: the
 * selectors pick stable values (arrays and objects of the state), never new ones.
 */
export function createDataLayerStore() {
  return create<DataLayerStore>()(
    persist(
      (set) => ({
        added: [],
        hidden: [],
        files: [],
        problems: {},
        addLayer: (layer) => set((state) => ({ added: [...state.added, layer] })),
        addFile: (file) => set((state) => ({ files: [...state.files, file] })),
        remove: (id) =>
          set((state) => ({
            added: state.added.filter((layer) => layer.id !== id),
            files: state.files.filter((file) => file.id !== id),
            hidden: state.hidden.filter((hiddenId) => hiddenId !== id),
          })),
        setHidden: (id, hidden) =>
          set((state) => {
            const rest = state.hidden.filter((hiddenId) => hiddenId !== id)
            return { hidden: hidden ? [...rest, id] : rest }
          }),
        setProblem: (id, message) =>
          set((state) => {
            if (state.problems[id] === message) return state
            const problems = { ...state.problems }
            if (message === undefined) delete problems[id]
            else problems[id] = message
            return { problems }
          }),
      }),
      {
        name: 'maid:data-layers',
        version: 1,
        partialize: (state) => ({
          added: state.added,
          // a file layer's id means nothing after a reload, so it is not stored as hidden
          hidden: state.hidden.filter((id) => !state.files.some((file) => file.id === id)),
        }),
        migrate: (persisted) => sanitizeStored(persisted),
        merge: (persisted, current) => ({ ...current, ...sanitizeStored(persisted) }),
      },
    ),
  )
}

export type DataLayerStoreHook = ReturnType<typeof createDataLayerStore>
