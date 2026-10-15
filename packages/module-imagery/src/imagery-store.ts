import { moduleStorage, type UrlParamHandle } from '@osm-editor-kit/maid-core'
import { createContext, createElement, useContext, type ReactNode } from 'react'
import { create, useStore } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { checkTemplate, type CustomEntry } from './custom.ts'
import {
  BRIGHTNESS_MAX,
  clampBrightness,
  migrateStored,
  parseStored,
  type ImageryStored,
  type View,
} from './helpers.ts'
import { customValue } from './url.ts'

/** The result of saving a custom background: the background value it is chosen as, or why it is refused */
export type SaveResult = { ok: true; value: string } | { ok: false; reason: string }

/** The background and the overlays the map shows (iD's values: a layer id, `none` or `custom:<template>`) */
export type Shown = { background: string; overlays: string[] }

/** The start order (start.ts): waiting for the view and the index, resolving, or resolved (not stored) */
export type StartState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'ready'; background: string; overlays: string[] }

/**
 * What the module keeps in memory. The stored part (`ImageryStored`) is the choice for the next visit; the live
 * background, overlays and brightness are in the URL, and `start`, `view`, `shown` and `shownBrightness` are for this
 * visit only.
 */
export type ImageryState = ImageryStored & {
  /** The fork's default background (`imagery({ default })`), not stored */
  defaultBackground: string | null
  /** The viewport, kept by the map layer for the panel */
  view: View | null
  start: StartState
  /** What the map shows now, mirrored by the map layer for readers outside React (the measure, the changeset) */
  shown: Shown | null
  /** The brightness the map draws now (the URL's, see shown.ts), mirrored for the magnifier; null until drawn */
  shownBrightness: number | null
}

/** The events the module takes. The object never changes. */
export type ImageryActions = {
  /** Remembers the background the person chose, for the next visit (the URL is written by the caller) */
  rememberBackground: (value: string) => void
  /** Remembers the overlays the person chose, in the order chosen */
  rememberOverlays: (ids: string[]) => void
  /** Remembers the brightness the person chose, for the next visit (the URL is written by the caller, see shown.ts) */
  setBrightness: (value: number) => void
  setView: (view: View) => void
  /** Saves a custom background (its template is its key). A template saved already is not saved twice. */
  addCustom: (name: string, template: string) => SaveResult
  /**
   * Changes the name and the template of the entry with `template`. The stored choice follows the new template when it
   * was that background. Into another entry's template, the two merge.
   */
  editCustom: (template: string, name: string, newTemplate: string) => SaveResult
  /** Deletes the entry; a stored choice of it is forgotten */
  deleteCustom: (template: string) => void
  /** Moves from idle to starting. False when the start has begun already: the start runs once. */
  beginStart: () => boolean
  finishStart: (background: string, overlays: string[]) => void
  /** Puts the start back to idle, after a failed listing: the next view tries again */
  abortStart: () => void
  setShown: (shown: Shown) => void
  /** Mirrors the brightness drawn. It is for this visit only; the stored choice is `setBrightness`. */
  setShownBrightness: (value: number) => void
}

export type ImageryStore = ImageryState & { actions: ImageryActions }

/**
 * The module's store, one per `imagery()` call so that the default background is its own. Stored as `maid:imagery`,
 * version 3 (version 2 is migrated: see `migrateStored`). Its hook is private: components read it through the hooks
 * below, inside an `ImageryStoreProvider`.
 */
export function createImageryStore(defaultBackground: string | null) {
  return create<ImageryStore>()(
    persist(
      (set, get) => ({
        defaultBackground,
        background: null,
        overlayIds: [],
        brightness: BRIGHTNESS_MAX,
        custom: [],
        view: null,
        start: { status: 'idle' },
        shown: null,
        shownBrightness: null,
        actions: {
          rememberBackground: (background) => set({ background }),
          rememberOverlays: (overlayIds) => set({ overlayIds }),
          setBrightness: (value) => set({ brightness: clampBrightness(value) }),
          setView: (view) => set({ view }),
          addCustom: (name, template) => {
            const checked = checkTemplate(template)
            if (!checked.ok) return checked
            if (!get().custom.some((entry) => entry.template === checked.template)) {
              set((state) => ({
                custom: [...state.custom, { name: name.trim(), template: checked.template }],
              }))
            }
            return { ok: true, value: customValue(checked.template) }
          },
          editCustom: (template, name, newTemplate) => {
            const checked = checkTemplate(newTemplate)
            if (!checked.ok) return checked
            const state = get()
            if (!state.custom.some((entry) => entry.template === template)) {
              return { ok: false, reason: 'This background was deleted.' }
            }
            const typed = name.trim()
            const value = customValue(checked.template)
            const merges = state.custom.some(
              (entry) => entry.template === checked.template && entry.template !== template,
            )
            set((current) => ({
              custom: merges
                ? current.custom
                    .filter((entry) => entry.template !== template)
                    .map((entry) =>
                      entry.template === checked.template && typed !== ''
                        ? { ...entry, name: typed }
                        : entry,
                    )
                : current.custom.map((entry) =>
                    entry.template === template
                      ? { name: typed, template: checked.template }
                      : entry,
                  ),
              background: current.background === customValue(template) ? value : current.background,
            }))
            return { ok: true, value }
          },
          deleteCustom: (template) =>
            set((state) => ({
              custom: state.custom.filter((entry) => entry.template !== template),
              background: state.background === customValue(template) ? null : state.background,
            })),
          beginStart: () => {
            if (get().start.status !== 'idle') return false
            set({ start: { status: 'starting' } })
            return true
          },
          finishStart: (background, overlays) =>
            set({ start: { status: 'ready', background, overlays } }),
          abortStart: () => {
            if (get().start.status === 'starting') set({ start: { status: 'idle' } })
          },
          setShownBrightness: (value) => {
            if (get().shownBrightness !== value) set({ shownBrightness: value })
          },
          setShown: (shown) => {
            const current = get().shown
            if (
              current !== null &&
              current.background === shown.background &&
              current.overlays.length === shown.overlays.length &&
              current.overlays.every((id, index) => id === shown.overlays[index])
            ) {
              return
            }
            set({ shown })
          },
        },
      }),
      {
        name: 'maid:imagery',
        version: 3,
        storage: createJSONStorage(() => moduleStorage()),
        migrate: (persisted, version) => migrateStored(persisted, version) as ImageryStored,
        // only the choices and the list are kept: the live values are in the URL, and the rest is for this visit
        partialize: ({ background, overlayIds, brightness, custom }) => ({
          background,
          overlayIds,
          brightness,
          custom,
        }),
        merge: (persisted, current) => ({
          ...current,
          ...parseStored(persisted),
        }),
      },
    ),
  )
}

export type ImageryStoreHook = ReturnType<typeof createImageryStore>

/** The URL parameters the module declared (index.ts): the live background, overlays and display settings */
export type ImageryUrls = {
  background: UrlParamHandle<string>
  overlays: UrlParamHandle<string[]>
  /** `bg_display`: the brightness of the background, as a number from 0.2 to 1 */
  display: UrlParamHandle<number>
}

export type ImageryContext = { store: ImageryStoreHook; urls: ImageryUrls }

const ImageryContextValue = createContext<ImageryContext | null>(null)

/** Gives a root of the module the store and its URL parameters. Every root the module renders is wrapped in it. */
export function ImageryStoreProvider(props: {
  store: ImageryStoreHook
  urls: ImageryUrls
  children?: ReactNode
}) {
  return createElement(
    ImageryContextValue.Provider,
    { value: { store: props.store, urls: props.urls } },
    props.children,
  )
}

/** The store and the URL parameters, from the provider above the component */
export function useImageryContext(): ImageryContext {
  const context = useContext(ImageryContextValue)
  if (context === null) {
    throw new Error('The imagery components must be rendered inside their ImageryStoreProvider')
  }
  return context
}

/** Reads one part of the module's store, from the provider above the component */
export function useImagerySelector<T>(selector: (state: ImageryStore) => T): T {
  const { store } = useImageryContext()
  // zustand's useStore, not `store(selector)`: the React Compiler takes a call whose name does not start with `use`
  // for a plain function and may skip it on the next render, which drops the hooks inside it
  return useStore(store, selector)
}

/** The custom backgrounds saved */
export function useCustomBackgrounds(): CustomEntry[] {
  return useImagerySelector((state) => state.custom)
}

/** The viewport the map layer last reported, or null before the first report */
export function useView() {
  return useImagerySelector((state) => state.view)
}

/** The actions. They never change, so a component that takes them re-renders only for its own state. */
export function useImageryActions(): ImageryActions {
  return useImagerySelector((state) => state.actions)
}
