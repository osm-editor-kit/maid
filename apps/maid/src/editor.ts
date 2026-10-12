import { createEditor } from '@osm-editor-kit/maid-core'
import { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { useSyncExternalStore } from 'react'
import { readConfig } from './config'
import './extension-points'
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
export const editor = createEditor(editorConfig)

export const engine = new MaidEngine({
  editor,
  apiUrl: config.apiUrl,
  minDataZoom: config.minDataZoom,
  update: config.update,
  highlight: config.highlight,
  serialUpdates: config.serialUpdates,
  coalesce: config.coalesce,
  edit: config.edit,
})

/**
 * Reads from the engine inside a component. `read` runs again whenever data was merged or
 * changed. The engine lives outside React, so the React Compiler cannot see that its answers
 * change; passing the version as an argument is what tells it.
 */
export function useEngine<T>(read: (engine: MaidEngine, version: number) => T): T {
  const version = useSyncExternalStore(engine.subscribe, engine.getVersion)
  return read(engine, version)
}
