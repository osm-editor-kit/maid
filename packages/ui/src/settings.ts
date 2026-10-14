import { moduleStorage } from '@osm-editor-kit/maid-core'
import type { Geometry } from '@osm-editor-kit/maid-presets'
import { z } from 'zod'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  moveFavourite as moveIn,
  setFavouriteNumber as setNumberIn,
  toggleFavourite as toggleIn,
  type Favourite,
} from './favourites.ts'

/** The theme the user picked: fixed light or dark, or whatever the operating system says. */
export type Theme = 'light' | 'dark' | 'system'

/**
 * A map position: the centre and the zoom in OSM's convention (256px tiles), the one the URL's
 * `map=` uses. MapLibre's zoom is one lower; the conversion is made where the map is set.
 */
export type LastView = { lng: number; lat: number; zoom: number; bearing?: number | undefined }

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
  /**
   * Where the person last left the map. Used only when the URL names no position. Not written
   * for a position that came from a link (packages/shell/src/url/view.ts).
   */
  lastView?: LastView | undefined
  /** The language the person chose in the top bar (ADR 0009, decision 4). Unset: the URL, then the browser. */
  lang?: Lang | undefined
  /**
   * The data server the person chose in the account flyout: OpenStreetMap (read only) or the
   * development server (login and saving). Read only by a build that reads live data by default
   * (`VITE_MAID_DATA=live`, packages/shell/src/config.ts). Unset: that build's default.
   */
  server?: Server | undefined
}

/** The languages Maid has (packages/i18n: LOCALES) */
export type Lang = 'en' | 'de' | 'fr' | 'es'

/** The data servers the account flyout offers: the real API, read only, and the development server */
export type Server = 'osm' | 'dev'

/**
 * What the UI does with the settings. Components read them through the `useStored*` hooks and call these
 * through `useSettingsActions`; code outside React uses `settingsActions`. Each action is an event the
 * store takes care of, and the object never changes.
 */
export type SettingsActions = {
  setShown: (key: string, value: string) => void
  /** `undefined` forgets the position */
  setLastView: (view: LastView | undefined) => void
  setTheme: (theme: Theme) => void
  /** `undefined` forgets the language, so the URL and the browser choose again */
  setLang: (lang: Lang | undefined) => void
  setServer: (server: Server) => void
  setSize: (key: string, size: number) => void
  /** Makes the preset a favourite for the geometry, or takes it out again */
  toggleFavourite: (presetId: string, geometry: Geometry) => void
  /** Moves a favourite one place up (-1) or down (+1) among the favourites of its geometry */
  moveFavourite: (presetId: string, geometry: Geometry, delta: 1 | -1) => void
  /** Gives a favourite the number typed in the list; a number another favourite has swaps the two */
  setFavouriteNumber: (presetId: string, geometry: Geometry, number: string) => void
}

type SettingsStore = Settings & { actions: SettingsActions }

/** A map position as it is stored. Each field is checked on its own by the schema below. */
const lastViewSchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  zoom: z.number().min(0).max(30),
  // optional and checked on its own: a position stored before the turn existed loads north-up
  bearing: z.number().min(-180).max(180).optional().catch(undefined),
})

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
  // optional: a value stored before this field existed loads without it
  lastView: lastViewSchema.optional().catch(undefined),
  // optional, like lastView: a language that is not one of Maid's is dropped, the rest is kept
  lang: z.enum(['en', 'de', 'fr', 'es']).optional().catch(undefined),
  // optional, like lang: a server that is not one of the two is dropped, the rest is kept
  server: z.enum(['osm', 'dev']).optional().catch(undefined),
})

/** The stored value as settings. A value that is not an object at all gives every default. */
function parseStored(value: unknown): Settings {
  const parsed = storedSchema.safeParse(value)
  return parsed.success ? parsed.data : { theme: 'system', sizes: {}, shown: {}, favourites: [] }
}

/**
 * The one store for the UI's settings, kept in localStorage with a version. Once a shape has shipped,
 * a change of it gets a step in `migrate`, so stored settings are carried over, not dropped. Until
 * then a value with another version is not read, and the defaults apply. Reading is synchronous: the
 * first paint already has the right theme and sizes. Every stored value is parsed on load (`merge`),
 * not only after a version change. Under automation nothing is read or written (`moduleStorage`).
 * The store itself is private: the hooks and functions below are its only way out.
 */
const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: 'system',
      sizes: {},
      shown: {},
      favourites: [],
      actions: {
        setTheme: (theme) => set({ theme }),
        setLang: (lang) => set({ lang }),
        setServer: (server) => set({ server }),
        setSize: (key, size) => set((state) => ({ sizes: { ...state.sizes, [key]: size } })),
        setShown: (key, value) => set((state) => ({ shown: { ...state.shown, [key]: value } })),
        setLastView: (lastView) => set({ lastView }),
        toggleFavourite: (presetId, geometry) =>
          set((state) => ({ favourites: toggleIn(state.favourites, presetId, geometry) })),
        moveFavourite: (presetId, geometry, delta) =>
          set((state) => ({ favourites: moveIn(state.favourites, presetId, geometry, delta) })),
        setFavouriteNumber: (presetId, geometry, number) =>
          set((state) => ({
            favourites: setNumberIn(state.favourites, presetId, geometry, number),
          })),
      },
    }),
    {
      name: 'maid:settings',
      version: 4,
      storage: createJSONStorage(() => moduleStorage()),
      // runs on every load. With nothing stored, the state stays as it is.
      merge: (stored, current) =>
        stored === undefined ? current : { ...current, ...parseStored(stored) },
      partialize: ({ theme, sizes, shown, favourites, lastView, lang, server }) => ({
        theme,
        sizes,
        shown,
        favourites,
        lastView,
        lang,
        server,
      }),
    },
  ),
)

/** The theme the person stored (`system` when nothing is stored). Re-renders only when it changes. */
export const useStoredTheme = () => useSettingsStore((state) => state.theme)

/** The language the person chose, or undefined */
export const useStoredLang = () => useSettingsStore((state) => state.lang)

/** The data server the person chose, or undefined */
export const useStoredServer = () => useSettingsStore((state) => state.server)

/** The favourite feature types, in the order they are listed */
export const useStoredFavourites = () => useSettingsStore((state) => state.favourites)

/** The stored filter state under a URL parameter name, e.g. `filters` */
export const useStoredShown = (key: string) => useSettingsStore((state) => state.shown[key])

/** The actions. They never change, so a component that takes them re-renders only for its own state. */
export const useSettingsActions = () => useSettingsStore((state) => state.actions)

/** The actions for code outside React (the map view, the favourites keys, the URL setup) */
export const settingsActions: SettingsActions = useSettingsStore.getState().actions

/** A snapshot of the stored settings for code outside React. Read it when needed; it does not update. */
export function getSettings(): Settings {
  const { theme, sizes, shown, favourites, lastView, lang, server } = useSettingsStore.getState()
  return { theme, sizes, shown, favourites, lastView, lang, server }
}

/** Calls the listener after any change of the settings. Returns a function that stops it. */
export function subscribeToSettings(listener: () => void): () => void {
  return useSettingsStore.subscribe(listener)
}

/**
 * Reads the stored value again, as a page load does: the state takes what is stored, and the parts that are
 * not stored keep their current value. Used by the tests.
 */
export async function loadStoredSettings(): Promise<void> {
  await useSettingsStore.persist.rehydrate()
}
