import type { NormalizedPhoto } from '@osm-editor-kit/street-imagery'
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import {
  DEFAULT_STORED,
  isAutomatedBrowser,
  parseStored,
  type ImageryProviderId,
  type PhotoKind,
  type StreetImageryStored,
} from './state.ts'

/** Automated browsers get no photos and store nothing (AGENTS.md, core rule 1). */
export const AUTOMATED = isAutomatedBrowser(
  typeof navigator === 'undefined' ? undefined : navigator,
)

/** Storage that keeps nothing: what automated browsers use instead of localStorage. */
const nothing: StateStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

type Session = {
  /** The Mapillary token of this build, empty when there is none. Not stored. */
  mapillaryToken: string
  /** The photo open in the dock. Not stored: it is the session's choice. */
  openPhoto: NormalizedPhoto | null
  /** Moves the map to a place. Set by the map layer while it is mounted. */
  easeTo: ((lng: number, lat: number) => void) | null
}

type Actions = {
  /** Switching a provider off closes a photo that came from it. */
  setProvider: (id: ImageryProviderId, on: boolean) => void
  setPhotoKind: (kind: PhotoKind) => void
  setDate: (date: StreetImageryStored['date']) => void
  /** Opens a photo in the dock. The viewer then reports the photo it loaded (position, date). */
  showPhoto: (photo: NormalizedPhoto) => void
  closePhoto: () => void
  setEaseTo: (easeTo: Session['easeTo']) => void
}

export type StreetImageryStore = StreetImageryStored & Session & Actions

/**
 * The module's state. What the person chose (providers, photo kind, dates) is stored under
 * `maid:street-imagery`, version 1; the rest is for the session. Reading back is checked by
 * `parseStored`, so a damaged value falls back to the defaults.
 */
export const useStreetImageryStore = create<StreetImageryStore>()(
  persist<StreetImageryStore, [], [], StreetImageryStored>(
    (set) => ({
      ...DEFAULT_STORED,
      mapillaryToken: '',
      openPhoto: null,
      easeTo: null,
      setProvider: (id, on) =>
        set((state) => ({
          providers: [...state.providers.filter((item) => item !== id), ...(on ? [id] : [])],
          openPhoto: !on && state.openPhoto?.providerId === id ? null : state.openPhoto,
        })),
      setPhotoKind: (photoKind) => set({ photoKind }),
      setDate: (date) => set({ date }),
      showPhoto: (photo) => set({ openPhoto: photo }),
      closePhoto: () => set({ openPhoto: null }),
      setEaseTo: (easeTo) => set({ easeTo }),
    }),
    {
      name: 'maid:street-imagery',
      version: 1,
      storage: createJSONStorage(() => (AUTOMATED ? nothing : localStorage)),
      partialize: ({ providers, photoKind, date }) => ({ providers, photoKind, date }),
      migrate: (stored) => parseStored(stored),
      // every stored value is checked on load, not only after a version change
      merge: (stored, current) => ({ ...current, ...parseStored(stored) }),
    },
  ),
)
