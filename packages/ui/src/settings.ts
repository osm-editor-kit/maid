import { moduleStorage } from '@osm-editor-kit/maid-core'
import type { Geometry } from '@osm-editor-kit/maid-presets'
import { z } from 'zod'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  moveFavourite as moveIn,
  toggleFavourite as toggleIn,
  type Favourite,
} from './favourites.ts'

/** The theme the user picked: fixed light or dark, or whatever the operating system says. */
export type Theme = 'light' | 'dark' | 'system'

/** What the UI remembers between visits */
export type Settings = {
  theme: Theme
  /** Panel sizes in pixels, by the key the panel gave (`sidebar-width`, `dock-height`) */
  sizes: Record<string, number>
  /**
   * The user's own choice of what is shown, by the name of its URL parameter (`filters`), in the
   * URL's notation. A link never writes here (docs/architecture/09-storage-and-settings.md).
   */
  shown: Record<string, string>
  /** The favourite feature types, in the order they are listed, each with its number */
  favourites: Favourite[]
}

type SettingsStore = Settings & {
  /**
   * Not stored. The settings of `shown` whose value in this session comes from the link the
   * session started with: changes to them stay in the session until the user drops the link's
   * value or keeps it as their own.
   */
  fromLink: Record<string, boolean>
  setShown: (key: string, value: string) => void
  setFromLink: (key: string, fromLink: boolean) => void
  setTheme: (theme: Theme) => void
  setSize: (key: string, size: number) => void
  /** Makes the preset a favourite for the geometry, or takes it out again */
  toggleFavourite: (presetId: string, geometry: Geometry) => void
  /** Moves a favourite one place up (-1) or down (+1) among the favourites of its geometry */
  moveFavourite: (presetId: string, geometry: Geometry, delta: 1 | -1) => void
}

/** A favourite as it is stored: the same shape as `Favourite`, read field by field */
const favouriteSchema = z.object({
  presetId: z.string(),
  geometry: z.enum(['point', 'vertex', 'line', 'area', 'relation']),
  // a positive whole number without a leading zero, as many digits as wanted
  number: z.string().regex(/^[1-9][0-9]*$/),
})

/**
 * The stored settings. A field that does not fit gets its default on its own: a broken `sizes` keeps
 * the favourites, and a favourite that does not fit is left out while the others are kept.
 */
const storedSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).catch('system'),
  sizes: z.record(z.string(), z.number()).catch(() => ({})),
  shown: z.record(z.string(), z.string()).catch(() => ({})),
  favourites: z
    .array(z.unknown())
    .transform((items) =>
      items.flatMap((item) => {
        const found = favouriteSchema.safeParse(item)
        return found.success ? [found.data] : []
      }),
    )
    .catch(() => []),
})

/** The stored value as settings. A value that is not an object at all gives every default. */
function parseStored(value: unknown): Settings {
  const parsed = storedSchema.safeParse(value)
  return parsed.success ? parsed.data : { theme: 'system', sizes: {}, shown: {}, favourites: [] }
}

/** A version 3 value with its favourites numbered in list order. Anything else is passed on as it is. */
function numbered(stored: unknown): unknown {
  const found = z.looseObject({ favourites: z.array(z.looseObject({})) }).safeParse(stored)
  if (!found.success) return stored
  return {
    ...found.data,
    favourites: found.data.favourites.map((favourite, index) => ({
      ...favourite,
      number: String(index + 1),
    })),
  }
}

/**
 * The one store for the UI's settings, kept in localStorage with a version. A setting that is
 * added or changes its shape gets a step in `migrate`, so stored settings are carried over, not
 * dropped. Reading is synchronous: the first paint already has the right theme and sizes.
 * Every stored value is parsed on load (`merge`), not only after a version change. Under automation
 * nothing is read or written (`moduleStorage`).
 */
export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: 'system',
      sizes: {},
      shown: {},
      favourites: [],
      fromLink: {},
      setTheme: (theme) => set({ theme }),
      setSize: (key, size) => set((state) => ({ sizes: { ...state.sizes, [key]: size } })),
      setShown: (key, value) => set((state) => ({ shown: { ...state.shown, [key]: value } })),
      setFromLink: (key, fromLink) =>
        set((state) => ({ fromLink: { ...state.fromLink, [key]: fromLink } })),
      toggleFavourite: (presetId, geometry) =>
        set((state) => ({ favourites: toggleIn(state.favourites, presetId, geometry) })),
      moveFavourite: (presetId, geometry, delta) =>
        set((state) => ({ favourites: moveIn(state.favourites, presetId, geometry, delta) })),
    }),
    {
      name: 'maid:settings',
      version: 4,
      storage: createJSONStorage(() => moduleStorage()),
      // version 2 added `shown`, version 3 added `favourites`: a version 2 value parses with the defaults.
      // Version 4 gave every favourite a number in place of one of seven fixed keys: the favourites
      // of version 3 keep their order and are numbered 1, 2, 3, ...
      migrate: (stored, version) => parseStored(version < 4 ? numbered(stored) : stored),
      // runs on every load. With nothing stored, the state stays as it is.
      merge: (stored, current) =>
        stored === undefined ? current : { ...current, ...parseStored(stored) },
      partialize: ({ theme, sizes, shown, favourites }) => ({ theme, sizes, shown, favourites }),
    },
  ),
)
