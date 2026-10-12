import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
      fromLink: {},
      setTheme: (theme) => set({ theme }),
      setSize: (key, size) => set((state) => ({ sizes: { ...state.sizes, [key]: size } })),
      setShown: (key, value) => set((state) => ({ shown: { ...state.shown, [key]: value } })),
      setFromLink: (key, fromLink) =>
        set((state) => ({ fromLink: { ...state.fromLink, [key]: fromLink } })),
    }),
    {
      name: 'maid:settings',
      version: 2,
      // version 2 added `shown`
      migrate: (stored) => ({ shown: {}, ...(stored as Partial<Settings>) }) as Settings,
      partialize: ({ theme, sizes, shown }) => ({ theme, sizes, shown }),
    },
  ),
)
