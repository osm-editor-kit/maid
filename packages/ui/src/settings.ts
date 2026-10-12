import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** The theme the user picked: fixed light or dark, or whatever the operating system says. */
export type Theme = 'light' | 'dark' | 'system'

/** What the UI remembers between visits */
export type Settings = {
  theme: Theme
  /** Panel sizes in pixels, by the key the panel gave (`sidebar-width`, `dock-height`) */
  sizes: Record<string, number>
}

type SettingsStore = Settings & {
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
      setTheme: (theme) => set({ theme }),
      setSize: (key, size) => set((state) => ({ sizes: { ...state.sizes, [key]: size } })),
    }),
    {
      name: 'maid:settings',
      version: 1,
      // version 1 is the first: nothing to carry over yet
      migrate: (stored) => stored as Settings,
      partialize: ({ theme, sizes }) => ({ theme, sizes }),
    },
  ),
)
