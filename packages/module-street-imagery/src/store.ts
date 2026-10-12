import { isAutomated, moduleStorage } from '@osm-editor-kit/maid-core'
import type { NormalizedPhoto } from '@osm-editor-kit/street-imagery'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  DEFAULT_STORED,
  parseStored,
  type ImageryProviderId,
  type PhotoKind,
  type StreetImageryStored,
} from './state.ts'

/** Automated browsers get no photos and store nothing (AGENTS.md, core rule 1). */
export const AUTOMATED = isAutomated()

/**
 * The feature whose "Street-level images" field is on screen, as the field last registered it: the row's id, its
 * tags and the change function of the inspector. "Use this photo" writes through `onChange`. Null while no such
 * field is shown.
 */
export type ImageWriter = {
  rowId: string
  tags: Readonly<Record<string, string>>
  onChange: (key: string, value: string | undefined) => void
}

/** The image row the person last focused or clicked: the target of "Use this photo". */
export type ActiveImage = { rowId: string; key: string }

type Session = {
  /** The Mapillary token of this build, empty when there is none. Not stored. */
  mapillaryToken: string
  /** The photo open in the dock. Not stored: it is the session's choice. */
  openPhoto: NormalizedPhoto | null
  /** Moves the map to a place. Set by the map layer while it is mounted. */
  easeTo: ((lng: number, lat: number) => void) | null
  /** The field's feature, while a "Street-level images" field is shown. Not stored. */
  imageWriter: ImageWriter | null
  /** The row last focused or clicked. Not stored. */
  activeImage: ActiveImage | null
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
  /** Called by the field while it is shown. A field of another feature replaces it. */
  setImageWriter: (writer: ImageWriter | null) => void
  setActiveImage: (active: ActiveImage | null) => void
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
      imageWriter: null,
      activeImage: null,
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
      setImageWriter: (imageWriter) => set({ imageWriter }),
      setActiveImage: (activeImage) => set({ activeImage }),
    }),
    {
      name: 'maid:street-imagery',
      version: 1,
      storage: createJSONStorage(() => moduleStorage()),
      partialize: ({ providers, photoKind, date }) => ({ providers, photoKind, date }),
      migrate: (stored) => parseStored(stored),
      // every stored value is checked on load, not only after a version change
      merge: (stored, current) => ({ ...current, ...parseStored(stored) }),
    },
  ),
)
