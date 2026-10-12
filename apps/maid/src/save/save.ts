import { discardedTags } from '@osm-editor-kit/maid-presets/default'
import { api } from '../auth'
import { config, editor } from '../editor'
import { forgetJournal } from '../journal'
import { changesetTags, toOsmChange, type OsmChange } from './osm-change'

const VERSION = '0.0.0'

/** Why edits cannot be saved in this session, if so */
export function saveBlocked(loggedIn: boolean): string | undefined {
  // isAutomated() is already folded into config.dev: automation never gets here
  if (!config.dev)
    return 'Saving works only on data from the OSM development server: open Maid with ?live=dev. Edits on a fixture stay in this browser.'
  if (!loggedIn) return 'Log in to save.'
  return undefined
}

/** What would be uploaded now */
export function pendingChange(): OsmChange {
  // tags that editors agree never to upload (the tagging schema's list) are left out
  return toOsmChange(editor.history.changes(), discardedTags)
}

/**
 * Uploads the edits as one changeset to the OSM development server and returns its number.
 * Only ever called from a person's click (AGENTS.md, core rule 1). Afterwards the stored edits
 * are forgotten; the caller reloads the page, so the map shows what the server has now.
 * A conflict (someone changed the same element) rejects with the server's message.
 */
export async function uploadEdits(comment: string): Promise<number> {
  if (!config.dev) throw new Error('Saving is only possible on the OSM development server')
  const change = pendingChange()
  const OSM = await api()
  // the element shape is osm-api's, without the read-only attributes the server sets itself
  type Diff = Parameters<typeof OSM.uploadChangeset>[1]
  const result = await OSM.uploadChangeset(
    changesetTags(comment, VERSION),
    change as unknown as Diff,
  )
  await forgetJournal()
  return Number(Object.keys(result)[0])
}
