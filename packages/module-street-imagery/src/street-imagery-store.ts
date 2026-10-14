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
  /**
   * The photo kind the URL shows (`photo_type`, url.ts), once the module has started; null before. Not stored: the
   * stored `photoKind` is the choice for the next visit. The readers use this value, or the stored one before the start.
   */
  shownPhotoKind: PhotoKind | null
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
  /** A choice of the person: remembered for the next visit, and shown now (the URL follows, shown.ts) */
  setPhotoKind: (kind: PhotoKind) => void
  /** The kind the URL shows: not remembered. Called by the URL sync (shown.ts). */
  adoptPhotoKind: (kind: PhotoKind) => void
  setDate: (date: StreetImageryStored['date']) => void
  /** Opens a photo in the dock. The viewer then reports the photo it loaded (position, date). */
  showPhoto: (photo: NormalizedPhoto) => void
  closePhoto: () => void
  setEaseTo: (easeTo: Session['easeTo']) => void
  /** Called by the field while it is shown. A field of another feature replaces it. */
  setImageWriter: (writer: ImageWriter | null) => void
  setActiveImage: (active: ActiveImage | null) => void
  /** The Mapillary token of this build, set when the module starts */
  setMapillaryToken: (token: string) => void
}

/** The module's state: what the person chose (stored) and the session's (not stored) */
export type StreetImageryState = StreetImageryStored & Session

/** The events the module takes. The object never changes. */
export type StreetImageryActions = Actions

type StreetImageryStore = StreetImageryState & { actions: StreetImageryActions }

/**
 * The module's state. What the person chose (providers, photo kind, dates) is stored under
 * `maid:street-imagery`, version 1; the rest is for the session. Reading back is checked by
 * `parseStored`, so a damaged value falls back to the defaults. The store itself stays here:
 * components read the state through the hooks below, code outside React through `streetImageryActions`
 * and `getStreetImagery`.
 */
const useStreetImageryStore = create<StreetImageryStore>()(
  persist<StreetImageryStore, [], [], StreetImageryStored>(
    (set) => ({
      ...DEFAULT_STORED,
      shownPhotoKind: null,
      mapillaryToken: '',
      openPhoto: null,
      easeTo: null,
      imageWriter: null,
      activeImage: null,
      actions: {
        setProvider: (id, on) =>
          set((state) => ({
            providers: [...state.providers.filter((item) => item !== id), ...(on ? [id] : [])],
            openPhoto: !on && state.openPhoto?.providerId === id ? null : state.openPhoto,
          })),
        setPhotoKind: (photoKind) => set({ photoKind, shownPhotoKind: photoKind }),
        adoptPhotoKind: (shownPhotoKind) => set({ shownPhotoKind }),
        setDate: (date) => set({ date }),
        showPhoto: (photo) => set({ openPhoto: photo }),
        closePhoto: () => set({ openPhoto: null }),
        setEaseTo: (easeTo) => set({ easeTo }),
        setImageWriter: (imageWriter) => set({ imageWriter }),
        setActiveImage: (activeImage) => set({ activeImage }),
        setMapillaryToken: (mapillaryToken) => set({ mapillaryToken }),
      },
    }),
    {
      name: 'maid:street-imagery',
      version: 1,
      storage: createJSONStorage(() => moduleStorage()),
      partialize: ({ providers, photoKind, date }) => ({ providers, photoKind, date }),
      // every stored value is checked on load, not only after a version change
      merge: (stored, current) => ({ ...current, ...parseStored(stored) }),
    },
  ),
)

/** The providers the person switched on */
export function useProviders() {
  return useStreetImageryStore((state) => state.providers)
}

/** The photo kind shown: the URL's, else the stored choice */
export function usePhotoKind() {
  return useStreetImageryStore((state) => state.shownPhotoKind ?? state.photoKind)
}

/** The kind the URL shows, or null before the module has started (for the URL sync) */
export function useShownPhotoKind() {
  return useStreetImageryStore((state) => state.shownPhotoKind)
}

/** The kind the person chose last (the stored choice), for code outside React */
export function storedPhotoKind(): PhotoKind {
  return useStreetImageryStore.getState().photoKind
}

export function useDate() {
  return useStreetImageryStore((state) => state.date)
}

export function useMapillaryToken() {
  return useStreetImageryStore((state) => state.mapillaryToken)
}

/** The photo open in the dock */
export function useOpenPhoto() {
  return useStreetImageryStore((state) => state.openPhoto)
}

/** Moves the map to a place; null while no map is mounted */
export function useEaseTo() {
  return useStreetImageryStore((state) => state.easeTo)
}

/** The field whose "Use this photo" writes to a feature, or null */
export function useImageWriter() {
  return useStreetImageryStore((state) => state.imageWriter)
}

/** The image row the person last focused or clicked */
export function useActiveImage() {
  return useStreetImageryStore((state) => state.activeImage)
}

/** Whether the image row (`rowId`, `imageKey`) is the active one */
export function useIsActiveImage(rowId: string, imageKey: string): boolean {
  return useStreetImageryStore(
    (state) =>
      state.activeImage !== null &&
      state.activeImage.rowId === rowId &&
      state.activeImage.key === imageKey,
  )
}

/** The actions. They never change, so a component that takes them re-renders only for its own state. */
export function useStreetImageryActions(): StreetImageryActions {
  return useStreetImageryStore((state) => state.actions)
}

/** The actions for code outside React (photo loading, the field's cleanup, the module's start) */
export const streetImageryActions: StreetImageryActions = useStreetImageryStore.getState().actions

/** The module's state for code outside React, as a snapshot. It does not update: read it when needed. */
export function getStreetImagery(): StreetImageryState {
  const {
    providers,
    photoKind,
    shownPhotoKind,
    date,
    mapillaryToken,
    openPhoto,
    easeTo,
    imageWriter,
    activeImage,
  } = useStreetImageryStore.getState()
  return {
    providers,
    photoKind: shownPhotoKind ?? photoKind,
    shownPhotoKind,
    date,
    mapillaryToken,
    openPhoto,
    easeTo,
    imageWriter,
    activeImage,
  }
}
