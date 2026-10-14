/**
 * The rules of the inspector for several selected features. Pure: no React, no engine.
 * iD: `ui/sections/selection_list.js` (the list), `ui/sections/feature_type.js` (the type line),
 * `ui/sections/preset_fields.js` (which fields are shared), `ui/entity_editor.js` `changeTags` (what
 * a change writes). See docs/research/multi-selection.md, 1.1 to 1.3.
 */
import type { CombinedTags } from '@osm-editor-kit/maid-model'
import type { Field } from '@osm-editor-kit/maid-presets'
import type { TagSheetChange } from '@osm-editor-kit/maid-ui'

/**
 * The selection list shows this many features. The rest are counted as "and N more": iD lists all of
 * them, which a long list would make slow to render here.
 */
export const LIST_LIMIT = 100

/** The first `limit` ids, and how many are left out of the list. */
export function listedIds(
  ids: readonly string[],
  limit = LIST_LIMIT,
): { shown: string[]; more: number } {
  return { shown: ids.slice(0, limit), more: Math.max(0, ids.length - limit) }
}

/** The ids without `id`, in their order: the features that stay selected when one is taken out. */
export function withoutId(ids: readonly string[], id: string): string[] {
  return ids.filter((other) => other !== id)
}

/**
 * The tags the fields show for several features: the keys that every feature has with one value. A mixed key is
 * absent (the field shows "Multiple values" from `combined`).
 */
export function sharedTags(combined: CombinedTags): Record<string, string> {
  const shared: Record<string, string> = {}
  for (const [key, entry] of Object.entries(combined)) {
    if (entry.kind === 'one') shared[key] = entry.value
  }
  return shared
}

/**
 * The change of each feature that a sheet change asks for, as `engine.changeTagsEach` takes it. `set` and
 * `remove` go to every feature as they are. A rename moves each feature's own value to the new key (iD's
 * keyChange): a feature without the old key is not changed by it. A value already set for the new key by
 * `set` wins over the moved one.
 * @param   change   - What the sheet of several features asks for
 * @param   features - Each selected feature with its tags
 * @return  The change of each feature, in the order of `features`
 */
export function changesPerFeature(
  change: TagSheetChange,
  features: readonly { id: string; tags: Readonly<Record<string, string>> }[],
): { id: string; set: Record<string, string>; remove: string[] }[] {
  return features.map(({ id, tags }) => {
    const set: Record<string, string> = { ...change.set }
    const remove: string[] = [...(change.remove ?? [])]
    for (const { from, to } of change.rename ?? []) {
      const value = Object.hasOwn(tags, from) ? tags[from] : undefined
      if (value === undefined || value === '') continue
      remove.push(from)
      if (!Object.hasOwn(set, to)) set[to] = value
    }
    return { id, set, remove }
  })
}

/**
 * The distinct presets of the features, most features first; ties keep the order in which they were
 * first seen (iD's `loadActivePresets`). A feature without a preset is not counted.
 * @param   presets - The preset of each feature, or undefined
 * @return  Each distinct preset with the number of features that have it
 */
export function distinctPresets<T extends { id: string }>(
  presets: readonly (T | undefined)[],
): { preset: T; count: number }[] {
  const counts = new Map<string, { preset: T; count: number }>()
  for (const preset of presets) {
    if (!preset) continue
    const entry = counts.get(preset.id)
    if (entry) entry.count += 1
    else counts.set(preset.id, { preset, count: 1 })
  }
  // Array.prototype.sort is stable: equal counts keep first-seen order
  return [...counts.values()].sort((a, b) => b.count - a.count)
}

/**
 * The type line of several features: the name of the one type they share, or "Multiple types" when
 * they differ. Empty when no feature has a type.
 */
export function typeLabel(distinct: readonly { preset: { name: string } }[]): string {
  if (distinct.length === 0) return 'No type'
  if (distinct.length === 1) return distinct[0]?.preset.name ?? 'No type'
  return 'Multiple types'
}

/**
 * The fields that every feature shows, as iD's preset fields do for several features: a field is shown
 * when every feature's list has it (by id). The field object is the first feature's. An empty list for
 * one feature (no preset) makes the intersection empty.
 * @param   perFeature - The fields of each feature
 * @return  The fields in the order of the first feature
 */
export function sharedFields(perFeature: readonly (readonly Field[])[]): Field[] {
  const [first, ...rest] = perFeature
  if (!first) return []
  const others = rest.map((list) => new Set(list.map((field) => field.id)))
  return first.filter((field) => others.every((ids) => ids.has(field.id)))
}

/** The message of a refused change: some selected features are read-only, so nothing was written. */
export function readOnlyRefusal(readOnly: number, of: number): string {
  return `${readOnly} of ${of} selected features are read-only. Nothing was changed.`
}

/** A refused change of several features (the result of `changeTags`, `changeTagsEach` or `changeTypeMany`) */
export type MultiRefusal =
  | { readonly reason: 'read-only'; readonly readOnly: number; readonly of: number }
  | { readonly reason: 'missing' }

/**
 * The toast text of a refused change of several features. The inspector and the type picker
 * both show it, each with `notify.failed`.
 */
export function refusalMessage(refusal: MultiRefusal): string {
  return refusal.reason === 'read-only'
    ? readOnlyRefusal(refusal.readOnly, refusal.of)
    : 'A selected feature is no longer in the data. Nothing was changed.'
}
