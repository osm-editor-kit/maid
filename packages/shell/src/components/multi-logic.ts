/**
 * The rules of the inspector for several selected features. Pure: no React, no engine.
 * iD: `ui/sections/selection_list.js` (the list), `ui/sections/feature_type.js` (the type line),
 * `ui/sections/preset_fields.js` (which fields are shared), `ui/entity_editor.js` `changeTags` (what
 * a change writes). See docs/research/multi-selection.md, 1.1 to 1.3.
 */
import type { CombinedTags } from '@osm-editor-kit/maid-model'
import type { Field, Tags } from '@osm-editor-kit/maid-presets'

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
 * The tags the fields and the tag sheet show for several features: the keys that every feature has with
 * one value. A mixed key is absent (the field or row shows "Multiple values" from `combined`).
 */
export function sharedTags(combined: CombinedTags): Tags {
  const shared: Tags = {}
  for (const [key, entry] of Object.entries(combined)) {
    if (entry.kind === 'one') shared[key] = entry.value
  }
  return shared
}

/**
 * The write that turns the shared tags into the sheet's next tags: a key the sheet no longer has is
 * removed where it was shared; a key with a new value (or a new key) is set on every feature. A blank
 * value is a removal, as in `cleanTagChange`. A mixed key that the sheet does not show is not touched.
 * @param   before - The shared tags the sheet was given
 * @param   after  - The tags the sheet gives back
 * @return  The change for `engine.changeTags`
 */
export function changeFromTags(
  before: Readonly<Tags>,
  after: Readonly<Tags>,
): { set: Record<string, string>; remove: string[] } {
  const set: Record<string, string> = {}
  const remove: string[] = []
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of keys) {
    const was = Object.hasOwn(before, key) ? before[key] : undefined
    const now = Object.hasOwn(after, key) ? after[key] : undefined
    if (now === undefined || now === '') {
      if (was !== undefined) remove.push(key)
    } else if (now !== was) {
      set[key] = now
    }
  }
  return { set, remove }
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
