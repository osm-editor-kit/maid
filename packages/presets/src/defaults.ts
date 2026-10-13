// iD's defaults per geometry (preset_defaults.json) and the preset categories (preset_categories.json): the rows
// that the type picker lists when the search is empty. Port of iD's presetIndex.defaults (modules/presets/index.js)
// and presetCategory (modules/presets/category.ts). Not ported: addable presets (iD's addablePresetIDs), because
// Maid offers every preset. README.md, "Compared with iD", lists the rules and the tests that pin them.
import { asRecord, asString, asStrings, isGeometry, own } from './raw.ts'
import type { Geometry, Preset, PresetCategory, PresetData, PresetRow } from './types.ts'

/** iD lists a category only when more than one of its members is offered (`members.length > 1`). */
export const MIN_CATEGORY_MEMBERS = 2

/** A category as the data gives it: its icon and its member preset ids, in order. */
export type CategoryData = { icon?: string; members: string[] }

/** Whether a row of the defaults is a category (rather than a preset). */
export function isCategoryRow(row: PresetRow): row is PresetCategory {
  return 'members' in row
}

/**
 * A preset the picker may offer for these geometries: not hidden by the app or the data (`searchable: false`),
 * and it matches every geometry (iD's matchAllGeometry).
 */
export function offered(preset: Preset, geometries: readonly Geometry[]) {
  return (
    preset.searchable !== false &&
    geometries.every((geometry) => preset.geometry.includes(geometry))
  )
}

/** The categories of the data by id. An entry without a members list is left out, as iD does with a broken one. */
export function categoriesOf(value: unknown): Map<string, CategoryData> {
  const categories = new Map<string, CategoryData>()
  const record = asRecord(value)
  if (!record) return categories
  for (const id of Object.keys(record)) {
    const raw = asRecord(record[id])
    const members = asStrings(raw?.members)
    if (!raw || members === undefined) continue
    const icon = asString(raw.icon)
    categories.set(id, icon === undefined ? { members } : { icon, members })
  }
  return categories
}

/** The ids of the defaults per geometry (preset_defaults.json), in order. A geometry with no list has none. */
export function defaultIdsOf(value: unknown): Partial<Record<Geometry, string[]>> {
  const lists: Partial<Record<Geometry, string[]>> = {}
  const record = asRecord(value)
  if (!record) return lists
  for (const key of Object.keys(record)) {
    if (!isGeometry(key)) continue
    const ids = asStrings(record[key])
    if (ids !== undefined) lists[key] = ids
  }
  return lists
}

/**
 * The name of a category in the English translation (`presets.categories.<id>.name`), as preset names are read;
 * the id when the translation has none.
 */
export function categoryNameOf(translations: unknown, id: string) {
  const en = asRecord(asRecord(translations)?.en)
  const categories = asRecord(asRecord(en?.presets)?.categories)
  const entry = categories ? own(categories, id) : undefined
  return asString(asRecord(entry)?.name) ?? id
}

/**
 * The rows for a geometry list, from the ids of its defaults (with the geometry's fallback last, as iD adds it).
 * A category is listed when at least `MIN_CATEGORY_MEMBERS` of its members are offered, and then it lists only
 * those members; a preset is listed when it is offered. Ids repeat as iD's uniq drops them.
 */
export function defaultRowsFor(input: {
  geometries: readonly Geometry[]
  ids: readonly string[]
  categories: ReadonlyMap<string, CategoryData>
  categoryName: (id: string) => string
  preset: (id: string) => Preset | undefined
}): PresetRow[] {
  const { geometries, ids, categories, categoryName, preset } = input
  const rows: PresetRow[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const category = categories.get(id)
    if (category) {
      const members = category.members.flatMap((memberId) => {
        const found = preset(memberId)
        return found && offered(found, geometries) ? [found] : []
      })
      if (members.length >= MIN_CATEGORY_MEMBERS)
        rows.push(categoryRow(id, categoryName(id), category.icon, members))
      continue
    }
    const found = preset(id)
    if (found && offered(found, geometries)) rows.push(found)
  }
  return rows
}

/**
 * A category as a row. It is shaped as a preset (name, icon, geometry: the members' geometries together) with no
 * tags, so the picker draws its icon as it draws a preset's; `members` are its offered members.
 */
function categoryRow(
  id: string,
  name: string,
  icon: string | undefined,
  members: Preset[],
): PresetCategory {
  const geometry: Geometry[] = []
  for (const member of members)
    for (const value of member.geometry) if (!geometry.includes(value)) geometry.push(value)
  return {
    id,
    name,
    ...(icon === undefined ? {} : { icon }),
    geometry,
    tags: {},
    addTags: {},
    removeTags: {},
    // as iD's presetCategory: a category does not score a match, and is not searched
    matchScore: -1,
    searchable: false,
    terms: [],
    aliases: [],
    members,
  }
}

/**
 * The defaults function of a presets instance: for a geometry list, the rows of its defaults (iD's
 * `defaults(geometry)` without recents). The geometry's fallback preset comes last; a vertex falls back to
 * the point, as in iD. Empty without the data, and for an empty list of geometries.
 */
export function createDefaults(data: PresetData, preset: (id: string) => Preset | undefined) {
  const categories = categoriesOf(data.categories)
  const lists = defaultIdsOf(data.defaults)
  const categoryName = (id: string) => categoryNameOf(data.translations, id)
  return (geometries: readonly Geometry[]): PresetRow[] => {
    const [first] = geometries
    if (first === undefined) return []
    const fallback = first === 'vertex' ? 'point' : first
    return defaultRowsFor({
      geometries,
      ids: [...(lists[first] ?? []), fallback],
      categories,
      categoryName,
      preset,
    })
  }
}
