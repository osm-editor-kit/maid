import { m } from '@osm-editor-kit/maid-i18n'
import { OsmEntity } from '@osm-editor-kit/maid-model'
import type { Issue } from '@osm-editor-kit/maid-validation'
import type { DataSource } from '../config'

const KINDS: Record<string, string | undefined> = { n: 'node', w: 'way', r: 'relation' }

/** A feature in a sentence: "way 123", or "new way" for one that is not uploaded yet */
export function featureName(id: string): string {
  const kind = KINDS[id.charAt(0)] ?? 'feature'
  const osm = Number.parseInt(OsmEntity.toOSM(id), 10)
  if (Number.isNaN(osm)) return m.shell_feature_kind({ kind })
  return osm < 0 ? m.shell_feature_name_new({ kind }) : m.shell_feature_name({ kind, id: osm })
}

/** The sentence the save flyout shows for one error the upload would meet */
export function errorSentence(error: Issue): string {
  const feature = featureName(error.entityIds[0] ?? '')
  // a tag issue says whether its first long tag is a key or a value (see osm-api-limits.ts)
  if (error.data?.kind === 'tagLength') {
    const part = error.data.part === 'key' ? 'key' : 'value'
    return m.shell_save_tag_too_long({ part, feature, message: error.message })
  }
  return `${error.message}.`
}

/**
 * Why edits cannot be saved in this session, if so, as the sentence the save flyout shows. The
 * errors are those of the OSM API limits rule on what is changed: the upload is refused while
 * there are any.
 */
export function saveBlocked(state: {
  source: DataSource
  loggedIn: boolean
  errors: readonly Issue[]
}): string | undefined {
  // isAutomated() is already folded into config.source: automation always has the mock
  if (state.source === 'mock') return m.shell_save_blocked_mock()
  const error = state.errors.find((issue) => issue.severity === 'error')
  if (error !== undefined) return errorSentence(error)
  if (!state.loggedIn) return m.shell_save_blocked_login()
  return undefined
}
