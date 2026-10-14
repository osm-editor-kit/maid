/**
 * The module's state: the layers a person added by URL and what is hidden are stored under
 * `maid:data-layers` (version 1). Files are session state and are not stored. A PMTiles file that
 * cannot be read is a query's error (see `pmtilesLayersOptions`), not state of this store.
 */
import { moduleStorage } from '@osm-editor-kit/maid-core'
import { z } from 'zod'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { dataLayerSchema, type DataLayerConfig, type FileLayer } from './config.ts'

/**
 * What is stored. A broken entry is dropped on its own, not the whole list: a layer that no longer
 * passes the schema becomes `null` and is left out, and a text that is not a string is too.
 */
const storedSchema = z.object({
  added: z
    .array(dataLayerSchema.nullable().catch(null))
    .catch([])
    .transform((layers) => {
      const seen = new Set<string>()
      const kept: DataLayerConfig[] = []
      for (const layer of layers) {
        if (layer === null || seen.has(layer.id)) continue
        seen.add(layer.id)
        kept.push(layer)
      }
      return kept
    }),
  hidden: z
    .array(z.string().nullable().catch(null))
    .catch([])
    .transform((ids) => [...new Set(ids.filter((id): id is string => id !== null))]),
})

export type StoredDataLayers = z.infer<typeof storedSchema>

/**
 * Turns whatever is stored into a valid state. A stored layer that no longer passes the checks is
 * dropped, not repaired; a repeated id keeps its first entry. Used on every load, so a state
 * edited by hand cannot break the map. Anything that is not an
 * object gives an empty state.
 */
export function sanitizeStored(value: unknown): StoredDataLayers {
  const result = storedSchema.safeParse(value)
  return result.success ? result.data : { added: [], hidden: [] }
}

/** The module's state: what is stored, and the files of this session */
export type DataLayersState = StoredDataLayers & {
  files: FileLayer[]
}

/** The events the module takes. The object never changes. */
export type DataLayersActions = {
  addLayer: (layer: DataLayerConfig) => void
  addFile: (file: FileLayer) => void
  remove: (id: string) => void
  setHidden: (id: string, hidden: boolean) => void
}

type DataLayersStore = DataLayersState & { actions: DataLayersActions }

/**
 * The module's store. One for the page: the editor has one map and one data-layers module. The store
 * stays here: components read the state through the hooks below.
 */
const useDataLayersStore = create<DataLayersStore>()(
  persist(
    (set) => ({
      added: [],
      hidden: [],
      files: [],
      actions: {
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
      },
    }),
    {
      name: 'maid:data-layers',
      version: 1,
      storage: createJSONStorage(() => moduleStorage()),
      partialize: (state) => ({
        added: state.added,
        // a file layer's id means nothing after a reload, so it is not stored as hidden
        hidden: state.hidden.filter((id) => !state.files.some((file) => file.id === id)),
      }),
      merge: (persisted, current) => ({ ...current, ...sanitizeStored(persisted) }),
    },
  ),
)

/** The layers the person added by URL */
export function useAddedLayers() {
  return useDataLayersStore((state) => state.added)
}

/** The layers from files, for this session */
export function useFileLayers() {
  return useDataLayersStore((state) => state.files)
}

/** The ids of the layers that are hidden */
export function useHiddenIds() {
  return useDataLayersStore((state) => state.hidden)
}

/** The actions. They never change, so a component that takes them re-renders only for its own state. */
export function useDataLayersActions(): DataLayersActions {
  return useDataLayersStore((state) => state.actions)
}
