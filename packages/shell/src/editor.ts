import { createEditor, isLocalUrl } from '@osm-editor-kit/maid-core'
import { createFilterSet } from '@osm-editor-kit/maid-filters'
import { connectLenses } from '@osm-editor-kit/maid-module-lenses'
import { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { useSettings } from '@osm-editor-kit/maid-ui'
import { useSyncExternalStore } from 'react'
import { readConfig } from './config'
import { editorConfig } from './maid.config'
import { migrateIdHash } from './url/id-url'
import { startShown } from './url/shown'

/**
 * The one editor instance of this app. Module scope is fine for an app with a single map;
 * a library version creates this per instance (docs/extensibility-plan.md).
 */
// iD-style hash links become Maid query parameters before anything reads the URL
migrateIdHash(window.location, window.history)

export const config = readConfig(window.location)

/** The editor's data and modules. What this editor is lives in maid.config.ts. */
export const editor = createEditor(editorConfig(config))

// The OSM API is a service of its own: its requests wait in the 'osm' gate, and a pause on it is its own.
// A local API (the mock, on localhost) is not claimed: it stays with the 'local' gate, as hosts that no
// service claims do, so the mock is never paused or limited as the real API is.
const apiUrl = new URL(config.apiUrl)
if (!isLocalUrl(apiUrl)) editor.services.register('osm', apiUrl.host)

/** The filter states in the URL's notation, as the editor writes them: the same states are one value */
export const normalizeFilters = (param: string) => createFilterSet(editor.filters, param).toParam()

/**
 * The filter states the session starts with: the URL's if it has any, else the person's stored
 * choice, else the editor's own. '' means every filter as the editor defines it. A value from the
 * URL is not written to storage (docs/adr/0009-decisions-of-2026-10-13.md).
 */
export const filtersStart = startShown(
  { url: config.filters, stored: useSettings.getState().shown.filters, fallback: '' },
  normalizeFilters,
)

export const engine = new MaidEngine({
  editor,
  apiUrl: config.apiUrl,
  minDataZoom: config.minDataZoom,
  filters: filtersStart.value,
  // the editor's fetch: gated per service, time-limited, paused on a rate limit
  fetch: editor.fetch,
})

// the lens the person chose restyles what the engine builds
connectLenses(engine)

/**
 * Reads from the engine inside a component. `read` runs again whenever data was merged or
 * changed. The engine lives outside React, so the React Compiler cannot see that its answers
 * change; passing the version as an argument is what tells it.
 */
export function useEngine<T>(read: (engine: MaidEngine, version: number) => T) {
  const version = useSyncExternalStore(engine.subscribe, engine.getVersion)
  return read(engine, version)
}
