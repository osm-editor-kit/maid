/**
 * The module's state: the layers a person added by URL and what is hidden are stored under
 * `maid:data-layers` (version 1). Files and problems are session state and are not stored.
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
}

export type DataLayerStoreHook = ReturnType<typeof createDataLayerStore>
