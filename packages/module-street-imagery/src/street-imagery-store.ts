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
import type { PhotoRef } from './url.ts'

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

/**
 * Writes the photo of the URL (`photo`). PhotoUrlSync registers it while it is mounted, with the query client and the
 * URL setter, so an action changes the URL and the photo in the same event. `photo`, when given, is the photo the
 * caller already has: it is put in the photo's query, so opening it makes no request.
 */
export type PhotoWriter = {
  open: (ref: PhotoRef, photo?: NormalizedPhoto) => void
  close: () => void
}

/**
 * The session's state. What is shown for the photo settings (kind, providers, dates) and the photo open in the dock is
 * not here: both are the URL's, read with the hooks of shown.ts. The stored choices are in `StreetImageryStored`.
 */
export type Session = {
  /** The Mapillary token of this build, empty when there is none. Not stored. */
  mapillaryToken: string
  /** Writes the URL's photo. Set by PhotoUrlSync while the map is mounted. Not stored. */
  photoWriter: PhotoWriter | null
  /** Moves the map to a place. Set by the map layer while it is mounted. */
  easeTo: ((lng: number, lat: number) => void) | null
  /** The field's feature, while a "Street-level images" field is shown. Not stored. */
  imageWriter: ImageWriter | null
  /** The row last focused or clicked. Not stored. */
  activeImage: ActiveImage | null
}

type Actions = {
  /**
   * Remembers a choice of the person for the next visit. The value shown is the URL's (shown.ts), which the choice
   * writes too: these actions never change what is shown by themselves. A link never calls them.
   */
  setProviders: (ids: ImageryProviderId[]) => void
  setPhotoKind: (kind: PhotoKind) => void
  setDate: (date: StreetImageryStored['date']) => void
  /**
   * Opens a photo in the dock: the URL's `photo` is written (through the photo writer). The viewer then reports the
   * photo it loaded (position, date), with the photo.
   */
  showPhoto: (ref: PhotoRef, photo?: NormalizedPhoto) => void
  /** Closes the photo in the dock: the URL's `photo` is removed */
  closePhoto: () => void
  setPhotoWriter: (writer: PhotoWriter | null) => void
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
    (set, get) => ({
      ...DEFAULT_STORED,
      mapillaryToken: '',
      photoWriter: null,
      easeTo: null,
      imageWriter: null,
      activeImage: null,
      actions: {
        setProviders: (providers) => set({ providers }),
        setPhotoKind: (photoKind) => set({ photoKind }),
        setDate: (date) => set({ date }),
        showPhoto: (ref, photo) => get().photoWriter?.open(ref, photo),
        closePhoto: () => get().photoWriter?.close(),
        setPhotoWriter: (photoWriter) => set({ photoWriter }),
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

/**
 * The stored choices (what the person chose last, for the next visit). They are the input of the URL hooks (shown.ts),
 * which decide what is shown: a reader that shows a value uses the hook, not these.
 */
export function useStoredProviders() {
  return useStreetImageryStore((state) => state.providers)
}

export function useStoredPhotoKind() {
  return useStreetImageryStore((state) => state.photoKind)
}

export function useStoredDate() {
  return useStreetImageryStore((state) => state.date)
}

export function useMapillaryToken() {
  return useStreetImageryStore((state) => state.mapillaryToken)
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

/**
 * The session's state for code outside React, as a snapshot. It does not update: read it when needed. It holds no
 * shown photo setting and no open photo (those are the URL's, shown.ts).
 */
export function getStreetImagery(): Session {
  const { mapillaryToken, photoWriter, easeTo, imageWriter, activeImage } =
    useStreetImageryStore.getState()
  return { mapillaryToken, photoWriter, easeTo, imageWriter, activeImage }
}
