/**
 * The tags of several features, each set to its own tags, as one change: the type picker gives each
 * feature the tags of the new preset, computed from that feature's own tags and old preset. Headless:
 * the engine performs the actions as one undo step. The per-feature counterpart of `planChangeTags`
 * (change-tags.ts), which writes the same change to every feature.
 */
import { type Action, actionChangeTags, type Graph } from '@osm-editor-kit/maid-model'
import type { TagChangePlan } from './change-tags'

/** The full tags one feature should have after the change (a key not listed is removed) */
export type TagsOfFeature = {
  readonly id: string
  readonly tags: Readonly<Record<string, string>>
}

/**
 * The tags as they are written: a key that is empty and a value that is empty are dropped, as
 * `cleanTagChange` does, so an empty value never stays on a feature. Keys and values are not trimmed.
 */
function cleanTags(tags: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tags).filter(([key, value]) => key !== '' && value !== ''),
  )
}

/** True when both tag sets have the same keys with the same values */
function sameTags(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>) {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}

/**
 * Plans the tags of several features, each set to its own tags. The same refusals as `planChangeTags`:
 * nothing is planned when an id is not in the graph (`missing`) or when any feature is read-only
 * (`read-only`, with how many of how many). Otherwise one action per feature whose tags really change,
 * and none when nothing changes. A feature listed twice takes the later of its two tag sets.
 * @param   graph      - The graph the change is made on (the staging graph of the editor)
 * @param   changes    - The features and the full tags each one should have
 * @param   isReadOnly - True for a feature that a filter makes read-only
 * @return  The refusal, or the number of changed features and the actions that change them
 */
export function planSetTagsEach(
  graph: Graph,
  changes: readonly TagsOfFeature[],
  isReadOnly: (id: string) => boolean,
): TagChangePlan {
  const wanted = new Map<string, Record<string, string>>()
  for (const { id, tags } of changes) wanted.set(id, cleanTags(tags))

  for (const id of wanted.keys()) {
    if (!graph.hasEntity(id)) return { ok: false, reason: 'missing' }
  }

  const readOnly = [...wanted.keys()].filter((id) => isReadOnly(id)).length
  if (readOnly > 0) return { ok: false, reason: 'read-only', readOnly, of: wanted.size }

  const actions: Action[] = []
  for (const [id, tags] of wanted) {
    const entity = graph.hasEntity(id)
    if (!entity || sameTags(entity.tags, tags)) continue
    actions.push(actionChangeTags(id, tags))
  }
  return { ok: true, changed: actions.length, actions }
}
