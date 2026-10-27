/** Applying a task option to a feature: one undo step. */
import type { Editor } from '@osm-editor-kit/maid-core'
import { actionChangeTags } from '@osm-editor-kit/maid-model'
import { applyOption, isApplied, type TaskOption } from '@osm-editor-kit/maid-tasks'

export type ApplyOutcome = { ok: true } | { ok: false; reason: 'read-only' | 'missing' | 'applied' }

/**
 * Sets and removes the tags of the option on the feature, as one undo step (`perform`, then `commit` with the
 * annotation and the feature selected). Nothing is changed when the feature is read-only (a filter), is not in the
 * data, or already has the option's tags.
 */
export function applyTaskOption(
  history: Editor['history'],
  id: string,
  option: Pick<TaskOption, 'set' | 'remove'>,
  annotation: string,
  readOnly: boolean,
): ApplyOutcome {
  if (readOnly) return { ok: false, reason: 'read-only' }
  const entity = history.staging.graph.hasEntity(id)
  if (!entity) return { ok: false, reason: 'missing' }
  if (isApplied(entity.tags, option)) return { ok: false, reason: 'applied' }
  history.perform(actionChangeTags(id, applyOption(entity.tags, option)))
  history.commit({ annotation, selectedIDs: [id] })
  return { ok: true }
}
