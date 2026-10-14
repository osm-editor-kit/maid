import { moduleStorage } from '@osm-editor-kit/maid-core'
import { createContext, createElement, useContext, type ReactNode } from 'react'
import { create, useStore } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { checkTemplate, customId, type CustomEntry } from './custom.ts'
import { clampBrightness, parseStored, type ImageryStored, type View } from './helpers.ts'

/** The id a background from a link has while it is shown. It is never stored and never a custom id. */
export const VISIT_ID = 'link:visit'

/** The result of saving a custom background or showing one from a link: its id, or why it is refused */
export type SaveResult = { ok: true; id: string } | { ok: false; reason: string }

/** What the module keeps. The choice is stored; `view` and `visit` are not. */
export type ImageryState = ImageryStored & {
  /** The viewport, kept by the map layer for the panel */
  view: View | null
  /**
   * A background a link named, shown for this visit only. It is not in `custom`, and the stored
   * `backgroundId` is not changed. The first change the person makes ends it.
   */
  visit: { template: string } | null
}

/** The events the module takes. The object never changes. */
export type ImageryActions = {
  setBackground: (id: string | null) => void
  setOverlay: (id: string, on: boolean) => void
  setBrightness: (value: number) => void
  setView: (view: View) => void
  /** Saves a custom background and selects it. A template saved already selects that entry. */
  addCustom: (name: string, template: string) => SaveResult
  /** Changes the name and the template of an entry. Into another entry's template, the two merge. */
  editCustom: (id: string, name: string, template: string) => SaveResult
  /** Deletes an entry; a selected one falls back to the default background */
  deleteCustom: (id: string) => void
  /** Shows a template from a link for this visit only, see `visit` */
  visitBackground: (template: string) => SaveResult
  /** Ends the visit: the stored choice is shown again */
  leaveVisit: () => void
}

export type ImageryStore = ImageryState & { actions: ImageryActions }

/** The background that is drawn: the link's while a visit shows one, else the stored choice */
export function shownBackgroundId(state: Pick<ImageryState, 'visit' | 'backgroundId'>) {
  return state.visit ? VISIT_ID : state.backgroundId
}

/** The template of the shown background, or null when the shown background is an index layer */
export function shownTemplate(state: Pick<ImageryState, 'visit' | 'backgroundId' | 'custom'>) {
  if (state.visit) return state.visit.template
  const entry = state.custom.find((other) => other.id === state.backgroundId)
  return entry?.template ?? null
}

/**
 * The module's store, one per `imagery()` call so that the default background is its own.
 * Stored as `maid:imagery`, version 2. A stored entry is read with `parseStored`, which fills in
 * defaults for anything missing or of the wrong shape. Its hook is private: components read it
 * through the hooks below, inside an `ImageryStoreProvider`.
 */
export function createImageryStore(defaultBackground: string | null) {
  return create<ImageryStore>()(
    persist(
      (set, get) => ({
        backgroundId: defaultBackground,
        overlayIds: [],
        brightness: 1,
        custom: [],
        customNext: 1,
        view: null,
        visit: null,
        actions: {
          setBackground: (backgroundId) => set({ backgroundId, visit: null }),
          setOverlay: (id, on) =>
            set((state) => ({
              visit: null,
              overlayIds: on
                ? [...state.overlayIds.filter((other) => other !== id), id]
                : state.overlayIds.filter((other) => other !== id),
            })),
          setBrightness: (value) => set({ brightness: clampBrightness(value), visit: null }),
          setView: (view) => set({ view }),
          addCustom: (name, template) => {
            const checked = checkTemplate(template)
            if (!checked.ok) return checked
            const existing = get().custom.find((entry) => entry.template === checked.template)
            if (existing) {
              set({ backgroundId: existing.id, visit: null })
              return { ok: true, id: existing.id }
            }
            const id = customId(get().customNext)
            const entry: CustomEntry = { id, name: name.trim(), template: checked.template }
            set((state) => ({
              custom: [...state.custom, entry],
              customNext: state.customNext + 1,
              backgroundId: id,
              visit: null,
            }))
            return { ok: true, id }
          },
          editCustom: (id, name, template) => {
            const checked = checkTemplate(template)
            if (!checked.ok) return checked
            const state = get()
            if (!state.custom.some((other) => other.id === id)) {
              return { ok: false, reason: 'This background was deleted.' }
            }
            const typed = name.trim()
            const other = state.custom.find(
              (candidate) => candidate.id !== id && candidate.template === checked.template,
            )
            if (other) {
              // the same template as another entry: the two are one, and the typed name is carried over
              set((current) => ({
                custom: current.custom
                  .filter((candidate) => candidate.id !== id)
                  .map((candidate) =>
                    candidate.id === other.id && typed !== ''
                      ? { ...candidate, name: typed }
                      : candidate,
                  ),
                backgroundId: current.backgroundId === id ? other.id : current.backgroundId,
              }))
              return { ok: true, id: other.id }
            }
            set((current) => ({
              custom: current.custom.map((candidate) =>
                candidate.id === id ? { id, name: typed, template: checked.template } : candidate,
              ),
            }))
            return { ok: true, id }
          },
          deleteCustom: (id) =>
            set((state) => ({
              custom: state.custom.filter((entry) => entry.id !== id),
              backgroundId: state.backgroundId === id ? defaultBackground : state.backgroundId,
            })),
          visitBackground: (template) => {
            const checked = checkTemplate(template)
            if (!checked.ok) return checked
            set({ visit: { template: checked.template } })
            return { ok: true, id: VISIT_ID }
          },
          leaveVisit: () => set({ visit: null }),
        },
      }),
      {
        name: 'maid:imagery',
        version: 2,
        storage: createJSONStorage(() => moduleStorage()),
        // only the choice and the list are kept: `visit` (a link's background) never is
        partialize: ({ backgroundId, overlayIds, brightness, custom, customNext }) => ({
          backgroundId,
          overlayIds,
          brightness,
          custom,
          customNext,
        }),
        merge: (persisted, current) => ({
          ...current,
          ...parseStored(persisted, { backgroundId: defaultBackground }),
        }),
      },
    ),
  )
}

export type ImageryStoreHook = ReturnType<typeof createImageryStore>

const ImageryStoreContext = createContext<ImageryStoreHook | null>(null)

/** Gives a root of the module the store its components read. Every root the module renders is wrapped in it. */
export function ImageryStoreProvider(props: { store: ImageryStoreHook; children?: ReactNode }) {
  return createElement(ImageryStoreContext.Provider, { value: props.store }, props.children)
}

/** Reads one part of the module's store, from the provider above the component */
function useImagerySelector<T>(selector: (state: ImageryStore) => T): T {
  const store = useContext(ImageryStoreContext)
  if (store === null) {
    throw new Error('The imagery components must be rendered inside their ImageryStoreProvider')
  }
  // zustand's useStore, not `store(selector)`: the React Compiler takes a call whose name does not start with `use`
  // for a plain function and may skip it on the next render, which drops the hooks inside it
  return useStore(store, selector)
}

/** The stored background choice (`null` for none) */
export function useBackgroundId() {
  return useImagerySelector((state) => state.backgroundId)
}

/** The background that is drawn: the link's while a visit shows one, else the stored choice */
export function useShownBackgroundId() {
  return useImagerySelector((state) => shownBackgroundId(state))
}

/** The template of the shown background, or null for an index layer */
export function useShownTemplate() {
  return useImagerySelector((state) => shownTemplate(state))
}

/** The overlays chosen, in the order they were chosen */
export function useOverlayIds() {
  return useImagerySelector((state) => state.overlayIds)
}

export function useBrightness() {
  return useImagerySelector((state) => state.brightness)
}

export function useCustomBackgrounds() {
  return useImagerySelector((state) => state.custom)
}

/** The background a link named, shown for this visit, or null */
export function useVisit() {
  return useImagerySelector((state) => state.visit)
}

/** The viewport the map layer last reported, or null before the first report */
export function useView() {
  return useImagerySelector((state) => state.view)
}

/** The actions. They never change, so a component that takes them re-renders only for its own state. */
export function useImageryActions(): ImageryActions {
  return useImagerySelector((state) => state.actions)
}
