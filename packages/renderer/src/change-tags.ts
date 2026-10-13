/**
 * The tag change of several features as a plan: which features change, and the actions that change
 * them. Headless: the engine performs the actions as one undo step and redraws what they change.
 * The combined tags of a selection are in the model (`combinedTags`); this is the write side.
 */
import {
  type Action,
  actionChangeTags,
  type Graph,
  type TagChange,
  tagChangesFor,
} from '@osm-editor-kit/maid-model'

/** A change asked for by the caller. `set` writes a key, `remove` deletes it where present. */
export type TagChangeRequest = {
  readonly set?: Readonly<Record<string, string>>
  readonly remove?: readonly string[]
}

/** What a change did, or why it did not happen. Nothing is written unless `ok` is true. */
export type ChangeTagsResult =
  | { readonly ok: true; readonly changed: number }
  | {
      readonly ok: false
      readonly reason: 'read-only'
      readonly readOnly: number
      readonly of: number
    }
  | { readonly ok: false; readonly reason: 'missing' }

/** The plan: the same refusals as the result, or the actions for the features that change. */
export type TagChangePlan =
  | Exclude<ChangeTagsResult, { ok: true }>
  | { readonly ok: true; readonly changed: number; readonly actions: readonly Action[] }

/**
 * The change with what the engine's single-feature path always did to it: a key that is empty is
 * dropped, and so is a `set` value that is empty. An empty value never clears a key by accident; a
 * key is removed only by `remove`. Keys and values are not trimmed (as `setTag` did not trim).
 * @param   request - The change the caller asked for
 * @return  The change with empty keys and empty `set` values dropped
 */
export function cleanTagChange(request: TagChangeRequest): TagChange {
  const set = Object.fromEntries(
    Object.entries(request.set ?? {}).filter(([key, value]) => key !== '' && value !== ''),
  )
  const remove = (request.remove ?? []).filter((key) => key !== '')
  return { set, remove }
}

/**
 * Plans a change to the tags of several features. The ids are de-duplicated. Refuses when an id is not
 * in the graph, and when any feature is read-only: then nothing is planned. Otherwise one action per
 * feature that really changes, and none when nothing changes.
 * @param   graph      - The graph the change is made on (the staging graph of the editor)
 * @param   ids        - The features to change
 * @param   request    - The change
 * @param   isReadOnly - True for a feature that a filter makes read-only
 * @return  The refusal, or the number of changed features and the actions that change them
 */
export function planChangeTags(
  graph: Graph,
  ids: readonly string[],
  request: TagChangeRequest,
  isReadOnly: (id: string) => boolean,
): TagChangePlan {
  const unique = [...new Set(ids)]
  const tagsOfEach: Record<string, string>[] = []
  for (const id of unique) {
    const entity = graph.hasEntity(id)
    if (!entity) return { ok: false, reason: 'missing' }
    tagsOfEach.push(entity.tags)
  }

  const readOnly = unique.filter((id) => isReadOnly(id)).length
  if (readOnly > 0) return { ok: false, reason: 'read-only', readOnly, of: unique.length }

  const { next, changed } = tagChangesFor(tagsOfEach, cleanTagChange(request))
  const actions = unique.flatMap((id, i) => {
    const tags = next[i]
    return tags ? [actionChangeTags(id, tags)] : []
  })
  return { ok: true, changed, actions }
}

/** A change of one feature with its own `set` and `remove` (see `planChangeTagsEach`). */
export type TagChangeEach = { readonly id: string } & TagChangeRequest

/**
 * Plans a change to several features, each with its own `set` and `remove`: the sheet of several features
 * renames a key on each feature and keeps that feature's value. The refusals are those of `planChangeTags`:
 * an id not in the graph, or any read-only feature, and then nothing is planned. An id listed twice gets both
 * changes, in order. One action per feature whose tags really change.
 * @param   graph      - The graph the change is made on (the staging graph of the editor)
 * @param   changes    - The features and the change of each
 * @param   isReadOnly - True for a feature that a filter makes read-only
 * @return  The refusal, or the number of changed features and the actions that change them
 */
export function planChangeTagsEach(
  graph: Graph,
  changes: readonly TagChangeEach[],
  isReadOnly: (id: string) => boolean,
): TagChangePlan {
  const ids = [...new Set(changes.map((change) => change.id))]
  const tagsOf = new Map<string, Readonly<Record<string, string>>>()
  for (const id of ids) {
    const entity = graph.hasEntity(id)
    if (!entity) return { ok: false, reason: 'missing' }
    tagsOf.set(id, entity.tags)
  }
  const readOnly = ids.filter((id) => isReadOnly(id)).length
  if (readOnly > 0) return { ok: false, reason: 'read-only', readOnly, of: ids.length }
  const touched = new Set<string>()
  for (const change of changes) {
    const tags = tagsOf.get(change.id)
    if (tags === undefined) continue
    const after = tagChangesFor([tags], cleanTagChange(change)).next[0]
    if (after !== undefined) {
      tagsOf.set(change.id, after)
      touched.add(change.id)
    }
  }
  const actions = ids.flatMap((id) => {
    const tags = tagsOf.get(id)
    return touched.has(id) && tags ? [actionChangeTags(id, tags)] : []
  })
  return { ok: true, changed: actions.length, actions }
}
