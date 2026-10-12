import { createEditor, startSetting } from '@osm-editor-kit/maid-core'
import { connectLenses } from '@osm-editor-kit/maid-module-lenses'
import { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { useSettings } from '@osm-editor-kit/maid-ui'
import { useSyncExternalStore } from 'react'
import { readConfig } from './config'
import { editorConfig } from './maid.config'
import { migrateIdHash } from './url/id-url'

/**
 * The one editor instance of this app. Module scope is fine for an app with a single map;
 * a library version creates this per instance (docs/extensibility-plan.md).
 */
// iD-style hash links become Maid query parameters before anything reads the URL
migrateIdHash(window.location, window.history)

export const config = readConfig(window.location)

/** The editor's data and modules. What this editor is lives in maid.config.ts. */
export const editor = createEditor(editorConfig(config))

/**
 * The filter states the session starts with: the link's if it has any, else the user's own.
 * '' means every filter as the editor defines it.
 */
export const filtersStart = startSetting({
  fallback: '',
  stored: useSettings.getState().shown.filters,
  url: config.filters ?? undefined,
})
useSettings.getState().setFromLink('filters', filtersStart.fromUrl)

export const engine = new MaidEngine({
  editor,
  apiUrl: config.apiUrl,
  minDataZoom: config.minDataZoom,
  filters: filtersStart.value,
})

// the lens the person chose restyles what the engine builds
connectLenses(engine)

/**
 * Reads from the engine inside a component. `read` runs again whenever data was merged or
 * changed. The engine lives outside React, so the React Compiler cannot see that its answers
 * change; passing the version as an argument is what tells it.
 */
export function useEngine<T>(read: (engine: MaidEngine, version: number) => T): T {
  const version = useSyncExternalStore(engine.subscribe, engine.getVersion)
  return read(engine, version)
}
