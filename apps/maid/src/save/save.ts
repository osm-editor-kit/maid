import { discardedTags } from '@osm-editor-kit/maid-presets/default'
import { createValidator, osmApiLimits, type Issue } from '@osm-editor-kit/maid-validation'
import { api } from '../auth'
import { config, editor } from '../editor'
import { imageryOnMap } from '../imagery-used'
import { forgetJournal } from '../journal'
import { errorSentence } from './blocked'
import { changesetTags, toOsmChange } from './osm-change'

const VERSION = '0.0.0'

/**
 * The errors the upload would meet: the OSM API limits rule on what is created or changed. It runs
 * on the values as the person made them. clean-tags.ts never cuts a value, but it adds a space after
 * each ';' in opening hours, which this check does not count. Deleted entities carry no tags to check.
 */
export function uploadErrors(): Issue[] {
  const changes = editor.history.changes()
  const ids = [...changes.created, ...changes.modified].map((entity) => entity.id)
  const validator = createValidator([osmApiLimits])
  validator.validate(editor.history.stable.graph, ids, [])
  return validator.issues().filter((issue) => issue.severity === 'error')
}

/** What would be uploaded now */
export function pendingChange() {
  // tags that editors agree never to upload (the tagging schema's list) are left out
  return toOsmChange(editor.history.changes(), discardedTags)
}

/**
 * Uploads the edits as one changeset to the OSM development server and returns its number.
 * Only ever called from a person's click (AGENTS.md, core rule 1). Afterwards the stored edits
 * are forgotten; the caller reloads the page, so the map shows what the server has now.
 * A conflict (someone changed the same element) rejects with the server's message.
 */
export async function uploadEdits(comment: string) {
  if (!config.dev) throw new Error('Saving is only possible on the OSM development server')
  const [first] = uploadErrors()
  if (first !== undefined) throw new Error(errorSentence(first))
  const change = pendingChange()
  const OSM = await api()
  // the element shape is osm-api's, without the read-only attributes the server sets itself
  type Diff = Parameters<typeof OSM.uploadChangeset>[1]
  const result = await OSM.uploadChangeset(
    // the imagery on the map now, as iD's imagery_used (the background first)
    changesetTags(comment, VERSION, imageryOnMap().used),
    change as unknown as Diff,
  )
  await forgetJournal()
  return Number(Object.keys(result)[0])
}
