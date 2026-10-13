import type { Editor } from '@osm-editor-kit/maid-core'
import { discardedTags } from '@osm-editor-kit/maid-presets'
import { createValidator, osmApiLimits, type Issue } from '@osm-editor-kit/maid-validation'
import { imageryOnMap } from '../imagery-used'
import { clearIgnoredIssues } from '../modules/validation-ignored'
import type { Shell } from '../shell'
import {
  assignedIds,
  changesetsOf,
  REPLICATION_DELAY_MS,
  selectionAfterUpload,
} from './after-upload'
import { errorSentence } from './blocked'
import { changesetTags, createdByValue, toOsmChange } from './osm-change'

/**
 * The errors the upload would meet: the OSM API limits rule on what is created or changed. It runs
 * on the values as the person made them. clean-tags.ts never cuts a value, but it adds a space after
 * each ';' in opening hours, which this check does not count. Deleted entities carry no tags to check.
 */
export function uploadErrors(editor: Editor): Issue[] {
  const changes = editor.history.changes()
  const ids = [...changes.created, ...changes.modified].map((entity) => entity.id)
  const validator = createValidator([osmApiLimits])
  validator.validate(editor.history.stable.graph, ids, [])
  return validator.issues().filter((issue) => issue.severity === 'error')
}

/** What would be uploaded now */
export function pendingChange(editor: Editor) {
  // tags that editors agree never to upload (the tagging schema's list) are left out
  return toOsmChange(editor.history.changes(), discardedTags)
}

/**
 * Uploads the edits as one changeset to the OSM development server. Only ever called from a person's
 * click (AGENTS.md, core rule 1). A conflict (someone changed the same element) rejects with the
 * server's message, and then nothing is forgotten.
 *
 * After a successful upload the editor starts again from the server, as iD and Rapid do: the history
 * is reset (its undo steps are gone, and a running journal clears the stored edits by itself, see
 * packages/journal), and the map loads the view again, after a short wait for the server's replication.
 * The new ids and versions come from the server's answer, so nothing old is sent a second time.
 * Resolves with the changesets (one, unless the upload was chunked) and the selection as the server
 * knows it now, which the caller shows.
 */
export async function uploadEdits(
  {
    config,
    editor,
    auth,
    engine,
    brand,
    version,
  }: Pick<Shell, 'config' | 'editor' | 'auth' | 'engine' | 'brand' | 'version'>,
  comment: string,
) {
  if (!config.dev) throw new Error('Saving is only possible on the OSM development server')
  const [first] = uploadErrors(editor)
  if (first !== undefined) throw new Error(errorSentence(first))
  const change = pendingChange(editor)
  // the app's name and version: created_by says which Maid made the changeset (checked before the upload)
  const createdBy = createdByValue(brand.name, version)
  const OSM = await auth.api()
  // the element shape is osm-api's, without the read-only attributes the server sets itself
  type Diff = Parameters<typeof OSM.uploadChangeset>[1]
  const result = await OSM.uploadChangeset(
    // the imagery on the map now, as iD's imagery_used (the background first)
    changesetTags(comment, createdBy, imageryOnMap(editor).used),
    change as unknown as Diff,
  )
  const selection = selectionAfterUpload(engine.selection, change, assignedIds(result))
  editor.history.reset()
  // ignored warnings belong to the edits that were just sent (as in iD)
  clearIgnoredIssues()
  engine.reloadAfterUpload(selection, REPLICATION_DELAY_MS)
  return { changesets: changesetsOf(result), selection }
}
