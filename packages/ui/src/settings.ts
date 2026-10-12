import type { Geometry } from '@osm-editor-kit/maid-presets'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
  /** The favourite feature types, in the order they are listed, each with its number key */
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

/**
 * The one store for the UI's settings, kept in localStorage with a version. A setting that is
 * added or changes its shape gets a step in `migrate`, so stored settings are carried over, not
 * dropped. Reading is synchronous: the first paint already has the right theme and sizes.
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
      version: 3,
      // version 2 added `shown`, version 3 added `favourites`
      migrate: (stored) =>
        ({ shown: {}, favourites: [], ...(stored as Partial<Settings>) }) as Settings,
      partialize: ({ theme, sizes, shown, favourites }) => ({ theme, sizes, shown, favourites }),
    },
  ),
)
