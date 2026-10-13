import { moduleStorage } from '@osm-editor-kit/maid-core'
import type { RasterSourceSpec } from '@osm-editor-kit/maplibre-editor-layer-index'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { checkTemplate, customId, type CustomEntry } from './custom.ts'
import { clampBrightness, parseStored, type ImageryStored, type View } from './helpers.ts'

/** The id a background from a link has while it is shown. It is never stored and never a custom id. */
export const VISIT_ID = 'link:visit'

/** The result of saving a custom background or showing one from a link: its id, or why it is refused */
export type SaveResult = { ok: true; id: string } | { ok: false; reason: string }

/** The module's state. The choice is stored; `view` and `visit` are not. */
export type ImageryState = ImageryStored & {
  /** Not stored: the viewport, kept by the map layer for the panel */
  view: View | null
  /** Not stored: the name iD cites for each layer that is drawn, by layer id (see `usedNames`) */
  names: Record<string, string>
  /** Not stored: the background as it is drawn, with the key of the choice it was drawn for (see `backgroundKey`) */
  drawnBackground: { key: string; source: RasterSourceSpec } | null
  /**
   * Not stored: a background a link named, shown for this visit only. It is not in `custom`, and the
   * stored `backgroundId` is not changed. The first change the person makes ends it.
   */
  visit: { template: string } | null
  setBackground: (id: string | null) => void
  setOverlay: (id: string, on: boolean) => void
  setBrightness: (value: number) => void
  setView: (view: View) => void
  remember: (names: Record<string, string>) => void
  /** Sets the background drawn now (with its key), or none. See `drawnBackground`. */
  rememberBackground: (drawn: { key: string; source: RasterSourceSpec } | null) => void
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

export type ImageryStore = ReturnType<typeof createImageryStore>

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
 * The key of a background choice: what the layer draws, with no overlays and no brightness. A drawn
 * background is only used while its key is the one of the choice shown now.
 */
export function backgroundKeyOf(id: string | null, template: string | null) {
  return `${id ?? ''}\n${template ?? ''}`
}

/** The key of the shown background (see `backgroundKeyOf`) */
export function backgroundKey(state: Pick<ImageryState, 'visit' | 'backgroundId' | 'custom'>) {
  return backgroundKeyOf(shownBackgroundId(state), shownTemplate(state))
}

/**
 * The background the map shows now, as a raster source with its brightness: undefined when none is
 * drawn for the shown choice (none chosen, or not drawn yet). The measure's magnifier draws it.
 */
export function backgroundOnMap(
  state: Pick<ImageryState, 'visit' | 'backgroundId' | 'custom' | 'drawnBackground' | 'brightness'>,
) {
  const drawn = state.drawnBackground
  if (shownBackgroundId(state) === null || !drawn || drawn.key !== backgroundKey(state)) {
    return undefined
  }
  return { source: drawn.source, brightness: state.brightness }
}

function without(names: Record<string, string>, id: string) {
  return Object.fromEntries(Object.entries(names).filter(([key]) => key !== id))
}

/**
 * The module's store, one per `imagery()` call so that the default background is its own.
 * Stored as `maid:imagery`, version 2. A stored entry is read with `parseStored`, which fills in
 * defaults for anything missing or of the wrong shape.
 */
export function createImageryStore(defaultBackground: string | null) {
  return create<ImageryState>()(
    persist(
      (set, get) => ({
        backgroundId: defaultBackground,
        overlayIds: [],
        brightness: 1,
        custom: [],
        customNext: 1,
        view: null,
        names: {},
        drawnBackground: null,
        visit: null,
        remember: (names) => set((state) => ({ names: { ...state.names, ...names } })),
        rememberBackground: (drawn) => set({ drawnBackground: drawn }),
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
          const entry = state.custom.find((other) => other.id === id)
          if (!entry) return { ok: false, reason: 'This background was deleted.' }
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
              names: without(current.names, id),
            }))
            return { ok: true, id: other.id }
          }
          set((current) => ({
            custom: current.custom.map((candidate) =>
              candidate.id === id ? { id, name: typed, template: checked.template } : candidate,
            ),
            // a new template is drawn again, and its name is then remembered again
            names: entry.template === checked.template ? current.names : without(current.names, id),
          }))
          return { ok: true, id }
        },
        deleteCustom: (id) =>
          set((state) => ({
            custom: state.custom.filter((entry) => entry.id !== id),
            backgroundId: state.backgroundId === id ? defaultBackground : state.backgroundId,
            names: without(state.names, id),
          })),
        visitBackground: (template) => {
          const checked = checkTemplate(template)
          if (!checked.ok) return checked
          set({ visit: { template: checked.template } })
          return { ok: true, id: VISIT_ID }
        },
        leaveVisit: () => set({ visit: null }),
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
        // version 1 had no custom backgrounds. Without a migrate step zustand drops a stored value of
        // another version, so the choice and the brightness would be lost; here they are read as they
        // are, and the list starts empty.
        migrate: (persisted) => parseStored(persisted, { backgroundId: defaultBackground }),
        merge: (persisted, current) => ({
          ...current,
          ...parseStored(persisted, { backgroundId: defaultBackground }),
        }),
      },
    ),
  )
}
