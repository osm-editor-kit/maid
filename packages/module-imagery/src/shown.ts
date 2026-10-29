/**
 * The live background, overlays and brightness, as React state. The URL is the live state (`bg`, `overlays` and
 * `bg_display`, read and written through nuqs by core's `useUrlParam` and `useUrlSetting`); the store keeps the
 * choices for the next visit. The start order (start.ts) resolves once per session, when the map reports its first
 * view; then the URL is kept to what is shown.
 */
import { isAutomated } from '@osm-editor-kit/maid-core'
import { useUrlParam, useUrlSetting } from '@osm-editor-kit/maid-core/react'
import { notify } from '@osm-editor-kit/maid-ui'
import { useEffect, useRef } from 'react'
import { bestBackgrounds, coverageOf, knownLayer, layerName, listViewRows } from './eli.ts'
import { BRIGHTNESS_MAX, listingView, type View } from './helpers.ts'
import {
  useImageryActions,
  useImageryContext,
  useImagerySelector,
  type Shown,
} from './imagery-store.ts'
import {
  pendingBackground,
  pendingOverlays,
  sameIds,
  shownBackground,
  shownOverlays,
  startBackground,
  startOverlays,
} from './start.ts'
import { isOwnValue } from './url.ts'
import { switchFor } from './view-switch.ts'

/**
 * What the map shows, and how to change it. A choice writes the URL and remembers the value for the next visit. Before
 * the start order has resolved, the shown values are the pending ones (start.ts): nothing is written then.
 */
export function useLiveImagery() {
  const { urls } = useImageryContext()
  const actions = useImageryActions()
  const [urlBackground, setUrlBackground] = useUrlParam(urls.background)
  const [urlOverlays, setUrlOverlays] = useUrlParam(urls.overlays)
  const [urlOffset, setUrlOffset] = useUrlParam(urls.offset)
  const offsets = useImagerySelector((state) => state.offsets)
  const start = useImagerySelector((state) => state.start)
  const stored = useImagerySelector((state) => state.background)
  const storedOverlays = useImagerySelector((state) => state.overlayIds)
  const fallback = useImagerySelector((state) => state.defaultBackground)

  const shown: Shown =
    start.status === 'ready'
      ? {
          background: shownBackground(urlBackground, start.background, knownLayer),
          overlays: shownOverlays(urlOverlays, start.overlays, knownLayer),
        }
      : {
          background: pendingBackground(urlBackground, stored, fallback),
          overlays: pendingOverlays(urlOverlays, storedOverlays),
        }

  // the URL and the offset of a background change; the caller decides what is remembered
  const moveTo = (value: string) => {
    if (value !== shown.background) {
      actions.rememberOffset(shown.background, urlOffset)
      void setUrlOffset(offsets[value] ?? null)
    }
    void setUrlBackground(value)
  }

  return {
    shown,
    ready: start.status === 'ready',
    urlBackground,
    urlOverlays,
    setUrlBackground,
    setUrlOverlays,
    /**
     * A background the person chose: the URL and the remembered choice. The offset belongs to the background, as in iD:
     * the shift of the one being left is kept for this visit, and the shift the chosen one had comes back (none if none).
     */
    chooseBackground: (value: string) => {
      moveTo(value)
      actions.rememberBackground(value)
    },
    /**
     * A background the app switches to when the map moves out of the chosen one's coverage (useSwitchOnMove). The URL
     * follows; the remembered choice stays the person's own.
     */
    switchBackground: moveTo,
    /** Overlays the person chose, in order: the URL and the remembered list */
    chooseOverlays: (ids: string[]) => {
      void setUrlOverlays(ids)
      actions.rememberOverlays(ids)
    },
  }
}

/** The start order's inputs, read when it starts */
export type StartInput = {
  url: string | null
  urlOverlays: string[] | null
  stored: string | null
  storedOverlays: string[]
  fallback: string | null
}

/** The index reads of the start order, as parameters so that a test can count them (the real ones by default) */
export type StartSearch = {
  listView: typeof listViewRows
  bestBackgrounds: typeof bestBackgrounds
}

/**
 * The start order: the index's layers valid for the view, their best ones, then the order (start.ts). The best ones
 * are looked for only when the URL names no background: each layer's coverage is a download (568 KB gzip for the
 * Europe index, on a phone's mobile data), and startBackground uses the best ones only then.
 */
export async function resolveStart(
  view: View,
  input: StartInput,
  search: StartSearch = { listView: listViewRows, bestBackgrounds },
): Promise<{ background: string; overlays: string[] }> {
  const listed = await search.listView(listingView(view))
  const backgrounds = listed.items.filter((item) => !item.overlay)
  const best = input.url === null ? await search.bestBackgrounds(backgrounds, view) : []
  return {
    background: startBackground({
      url: input.url,
      stored: input.stored,
      fallback: input.fallback,
      valid: backgrounds.map((item) => item.id),
      best,
      known: knownLayer,
    }),
    overlays: startOverlays(input.urlOverlays, input.storedOverlays, knownLayer),
  }
}

/**
 * The start order, once per session, when the map reports its first view (iD's `background.init`). It does nothing
 * under automation: the pending values stand, and no imagery list is read (AGENTS.md, core rule 1).
 */
export function useImageryStart(view: View | null) {
  const actions = useImageryActions()
  const { urlBackground, urlOverlays, setUrlBackground, setUrlOverlays, shown, ready } =
    useLiveImagery()
  const stored = useImagerySelector((state) => state.background)
  const storedOverlays = useImagerySelector((state) => state.overlayIds)
  const fallback = useImagerySelector((state) => state.defaultBackground)

  useEffect(() => {
    if (view === null || isAutomated()) return
    if (!actions.beginStart()) return
    resolveStart(view, { url: urlBackground, urlOverlays, stored, storedOverlays, fallback }).then(
      (result) => actions.finishStart(result.background, result.overlays),
      () => actions.abortStart(),
    )
  }, [view, actions, urlBackground, urlOverlays, stored, storedOverlays, fallback])

  // once resolved, the URL says what is shown: a value the URL does not give, or gives unknown, is written
  const { background, overlays } = shown
  useEffect(() => {
    if (!ready) return
    if (urlBackground !== background) void setUrlBackground(background)
    if (!sameIds(urlOverlays, overlays)) void setUrlOverlays(overlays)
  }, [ready, urlBackground, urlOverlays, background, overlays, setUrlBackground, setUrlOverlays])
}

/**
 * The background to switch to for a view, as the start order would choose it: the best layers that cover more
 * than half of the view (listed like the start does), else the fork's default (view-switch.ts). Null when the
 * chosen one stays.
 */
async function switchTarget(view: View, chosen: string, fallback: string | null) {
  if (isOwnValue(chosen)) return null
  const listed = await listViewRows(listingView(view))
  if (!knownLayer(chosen)) return null
  const backgrounds = listed.items.filter((item) => !item.overlay)
  const best = await bestBackgrounds(backgrounds, view)
  // a coverage that cannot be read is not guessed: the chosen background stays (the rejection ends the switch)
  const chosenCoverage = await coverageOf(chosen)
  return switchFor({
    bounds: view.bounds,
    chosen,
    chosenCoverage,
    best,
    fallback,
    known: knownLayer,
  })
}

/**
 * When the person moves the map (a new view), the chosen background is switched if it does not cover the new view:
 * once per move end, and only once the start order has resolved. The first view of the session is not switched: the
 * start order decides it. A choice of the person is not undone by this: it changes the chosen background only, so the
 * choice stays until the next move. A switch that is overtaken by a newer view or a choice is dropped.
 */
export function useSwitchOnMove(view: View | null) {
  const { shown, ready, switchBackground } = useLiveImagery()
  const fallback = useImagerySelector((state) => state.defaultBackground)
  const chosen = shown.background
  // the view this hook has handled: the same view again (a change of the chosen background) asks nothing new
  const handled = useRef<View | null>(null)
  // the chosen background as it is now: a choice the person makes while the switch is looked up wins
  const current = useRef(chosen)
  useEffect(() => {
    current.current = chosen
  }, [chosen])

  useEffect(() => {
    if (view === null || handled.current === view) return
    handled.current = view
    if (!ready || isAutomated()) return
    void switchTarget(view, chosen, fallback).then(
      (target) => {
        if (target === null || handled.current !== view || current.current !== chosen) return
        const from = layerName(chosen)
        switchBackground(target)
        notify.info(`Background changed to ${layerName(target)}: ${from} does not cover this area`)
      },
      () => {
        // no coverage or no list: the background stays
      },
    )
  }, [view, ready, chosen, fallback, switchBackground])
}

/** Mirrors what is shown into the store, for readers outside React (the measure and the changeset read it) */
export function useMirrorShown(shown: Shown) {
  const actions = useImageryActions()
  const { background, overlays } = shown
  useEffect(() => {
    actions.setShown({ background, overlays })
  }, [actions, background, overlays])
}

/**
 * The brightness of the background as the URL gives it (`bg_display`, a setting with core's `useUrlSetting`): the
 * value to draw, and `chooseBrightness`, a choice of the person (the URL and the remembered value). The stored
 * brightness is the default; a link never writes it. Nothing is written before the start order has resolved, as for
 * the background. `writes` is true in one instance only (the map layer), so the URL is written once.
 */
export function useLiveBrightness(writes: boolean) {
  const { urls } = useImageryContext()
  const actions = useImageryActions()
  const stored = useImagerySelector((state) => state.brightness)
  const started = useImagerySelector((state) => state.start.status === 'ready')
  const setting = useUrlSetting(urls.display, {
    stored,
    fallback: BRIGHTNESS_MAX,
    remember: actions.setBrightness,
    ready: writes && started,
    omitFallback: true,
  })
  return { brightness: setting.value, chooseBrightness: setting.choose }
}

/** Mirrors the brightness drawn into the store, for the measure's magnifier (read outside React), like useMirrorShown */
export function useMirrorBrightness(brightness: number) {
  const actions = useImageryActions()
  useEffect(() => {
    actions.setShownBrightness(brightness)
  }, [actions, brightness])
}
