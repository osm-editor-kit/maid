import { MaidEngine } from '@maid/renderer'
import { readConfig } from './config'

/**
 * The one editor instance of this app. Module scope is fine for an app with a single map;
 * a library version creates this per instance (docs/extensibility-plan.md).
 */
export const config = readConfig(window.location)

export const engine = new MaidEngine({
  apiUrl: config.apiUrl,
  minDataZoom: config.minDataZoom,
  update: config.update,
  highlight: config.highlight,
  serialUpdates: config.serialUpdates,
  coalesce: config.coalesce,
  edit: config.edit,
})
