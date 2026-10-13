import * as model from '@osm-editor-kit/maid-model'
import { useLensStore } from '@osm-editor-kit/maid-module-lenses'
import { lazyChunksPending, notify } from '@osm-editor-kit/maid-ui'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { BenchApi } from '../../../tools/refs/bench-api'
import { markerImageState } from './images'
import { preloadAfterFirstSettle } from './lazy-chunks'
import type { Shell } from './shell'

/** How long a selection may take to be drawn before `select` fails. A frame that does not draw would otherwise wait forever. */
const SELECT_LIMIT_MS = 10_000

/**
 * Resolves once the journal is not `checking` (it is looking for stored edits, or restoring them after the person said
 * yes). `pending` also ends the wait: that is the dialog, which only a person (or a check clicking it) answers.
 */
export function journalSettled(journal: Pick<Shell['journal'], 'getState' | 'subscribe'>) {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (journal.getState().status === 'checking') return
      unsubscribe()
      resolve()
    }
    const unsubscribe = journal.subscribe(check)
    check()
  })
}

/**
 * What the map, the engine and the marker images hold right now, in plain values. The benchmark reads it
 * (`window.__maid.debug()`) when a phase does not finish, so that the report says where the editor was waiting.
 */
export function maidDebugState(map: MapLibreMap, engine: Pick<Shell['engine'], 'debugState'>) {
  return {
    map: {
      loaded: map.loaded(),
      areTilesLoaded: map.areTilesLoaded(),
      moving: map.isMoving(),
      zoom: map.getZoom(),
    },
    engine: engine.debugState(),
    images: markerImageState(),
  }
}

/**
 * Maid's side of the contract in tools/refs/bench-api.d.ts. Also the debug handle for agents:
 * `window.__maid` gives the map, the engine, the editor, the data model's module (entity
 * classes and actions) and the notices (`notify`), so a check can build data without the UI.
 * `window.__maid.debug()` gives the state that `maidDebugState` describes.
 */
export function exposeBenchApi(
  { id, editor, engine, journal }: Pick<Shell, 'id' | 'editor' | 'engine' | 'journal'>,
  map: MapLibreMap,
  app: { select: (id: string | null) => void },
) {
  const api: BenchApi = {
    editor: 'maid',
    version: `maplibre-gl ${map.version}`,
    // resolves when the journal has looked for stored edits and, if they were restored, has put them back
    ready: () => journalSettled(journal),
    // OSM zoom (256px tiles) is MapLibre zoom plus one
    setCamera: ({ lng, lat, zoom }) => map.jumpTo({ center: [lng, lat], zoom: zoom - 1 }),
    getCamera: () => ({
      lng: map.getCenter().lng,
      lat: map.getCenter().lat,
      zoom: map.getZoom() + 1,
    }),
    project: (lng, lat) => {
      const point = map.project([lng, lat])
      const rect = map.getContainer().getBoundingClientRect()
      return { x: rect.left + point.x, y: rect.top + point.y }
    },
    // The picture is complete and the lazy chunks (inspector, panels, ...) that were asked for have arrived: a check
    // that selects a feature right after `settled` finds the inspector, not its fallback. The first call also
    // waits for the preload that follows the first settle (lazy-chunks.ts), so that it never starts in the middle of
    // a later phase.
    settled: async () => {
      await engine.settled()
      await preloadAfterFirstSettle(engine)
      await lazyChunksPending()
      // A lazy component shows its content in a render after its chunk arrived, and that render can ask for
      // a further chunk (the inspector for several features). Wait until three frames in a row had no chunk
      // under way and no fallback on the page.
      const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      for (let quiet = 0, i = 0; quiet < 3 && i < 240; i++) {
        await frame()
        const before = performance.now()
        await lazyChunksPending()
        const waited = performance.now() - before > 1
        quiet = waited || document.querySelector('[aria-busy="true"]') ? 0 : quiet + 1
      }
    },
    stats: () => engine.stats(),
    select: async (id) => {
      app.select(id) // the app's own path: map highlight, URL and inspector
      // Bounded: the selection is shown after the next frame the map draws. If that frame does not come, fail with
      // the state instead of waiting for ever (the runner's phase limit would catch it later, without the reason).
      const until = performance.now() + SELECT_LIMIT_MS
      await new Promise<void>((resolve, reject) => {
        const check = () => {
          if ((engine.selected()[0] ?? null) === id) return resolve()
          if (performance.now() > until) {
            return reject(
              new Error(
                `the selection of ${id} was not drawn within ${SELECT_LIMIT_MS} ms: ${JSON.stringify(maidDebugState(map, engine))}`,
              ),
            )
          }
          requestAnimationFrame(check)
        }
        check()
      })
    },
    selected: () => engine.selected(),
    hovered: () => engine.hovered(),
    nodeLoc: (id) => {
      const loc = engine.data.node(id)?.loc
      return loc ? [loc[0], loc[1]] : undefined
    },
    // every MapLibre render is a draw; counting starts when this adapter is exposed (see countPaints)
    paint: countPaints(map),
    // the engine's own tag change: one undo step, drawn through the engine's data path (see MaidEngine.setTag)
    setTag: (id, key, value) => engine.setTag(id, key, value),
    undo: () => engine.undo(),
    redo: () => engine.redo(),
    // the inspector's own sidebar: "Selected feature" is the label the inspector gives a selected feature
    inspectorShows: (id) =>
      engine.selected().includes(id) &&
      document.querySelector('aside[aria-label="Selected feature"]') !== null,
    // the lens store the app's lenses module reads (connectLenses in shell.ts applies it to the engine)
    setLens: (id) => useLensStore.getState().setActive(id),
  }
  // `notify` lets a check or a screenshot show each kind of toast (packages/ui/src/Toast.tsx)
  Object.assign(window, {
    __bench: api,
    __maid: {
      app: id,
      map,
      engine,
      editor,
      model,
      journalFlushed: journal.flushed,
      notify,
      debug: () => maidDebugState(map, engine),
    },
  })
}

/**
 * `__bench.paint`: counts the frames MapLibre draws. Each `render` event is one draw, and `at` is when it ended. The
 * counter starts when the adapter is exposed, so it is running before any edit the benchmark makes.
 */
function countPaints(map: MapLibreMap) {
  const paint = { seq: 0, at: 0 }
  map.on('render', () => {
    paint.seq++
    paint.at = performance.now()
  })
  return () => ({ seq: paint.seq, at: paint.at })
}
