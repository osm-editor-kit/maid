import type { Field, Tags } from '@osm-editor-kit/maid-presets'

/**
 * The fields the "Add field" list shows for a query. An empty query lists all of them in the given
 * order. Otherwise a field matches when its label, its id or one of its keys contains the query
 * (case-insensitively; a space in the query also matches an underscore in a key). Ranks: a label
 * that starts with the query, then a label that contains it, then a key only. The order inside a
 * rank is the given order.
 */
export function searchFields(fields: readonly Field[], query: string) {
  const text = query.trim().toLowerCase()
  if (text === '') return [...fields]
  const underscored = text.replace(/ /g, '_')
  const ranked: { field: Field; rank: number }[] = []
  for (const field of fields) {
    const label = field.label.toLowerCase()
    const keys = [field.id, field.key, ...(field.keys ?? [])]
      .filter((key): key is string => key !== undefined)
      .map((key) => key.toLowerCase())
    if (label.startsWith(text)) ranked.push({ field, rank: 0 })
    else if (label.includes(text)) ranked.push({ field, rank: 1 })
    else if (keys.some((key) => key.includes(text) || key.includes(underscored)))
      ranked.push({ field, rank: 2 })
  }
  return ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.field)
}

/**
 * The ids of the fields whose label another of the given fields has too. Their rows in the list also
 * show the key, so that the two can be told apart.
 */
export function sharedLabelIds(fields: readonly Field[]) {
  const count = new Map<string, number>()
  for (const field of fields) count.set(field.label, (count.get(field.label) ?? 0) + 1)
  return new Set(
    fields.filter((field) => (count.get(field.label) ?? 0) > 1).map((field) => field.id),
  )
}

/** The key a row of the list shows after its label: the field's key, else its keys, else its id. */
export function rowKey(field: Field) {
  return field.key ?? (field.keys?.join(', ') || field.id)
}

/** The offered fields that are not already rows (shown or picked), by id. */
export function addableFields(offered: readonly Field[], rowIds: ReadonlySet<string>) {
  return offered.filter((field) => !rowIds.has(field.id))
}

/**
 * The rows, in order: the shown fields as the preset orders them, then the picked fields that are
 * not shown, in the order they were picked. Each field id once, so a picked field that has a value
 * and is shown is not listed twice.
 */
export function rowFields(shown: readonly Field[], picked: readonly Field[]) {
  const seen = new Set<string>()
  const rows: Field[] = []
  for (const field of [...shown, ...picked]) {
    if (seen.has(field.id)) continue
    seen.add(field.id)
    rows.push(field)
  }
  return rows
}

/** The picked ids with `id` added at the end. An id already picked keeps its place. */
export function addPicked(picked: readonly string[], id: string) {
  return picked.includes(id) ? [...picked] : [...picked, id]
}

/**
 * The fields for the picked ids, in the order picked. An id that no field has is left out (for
 * example a field whose prerequisite stopped holding).
 */
export function pickedFields(ids: readonly string[], fields: readonly Field[]) {
  const byId = new Map<string, Field>()
  for (const field of fields) byId.set(field.id, field)
  const result: Field[] = []
  for (const id of ids) {
    const field = byId.get(id)
    if (field !== undefined) result.push(field)
  }
  return result
}

/**
 * The value that showing a field from the list writes: its `default`, when it has one and its key
 * is empty. Undefined when nothing is written.
 */
export function defaultOnPick(field: Field, tags: Tags) {
  if (field.key === undefined || field.default === undefined || field.default === '')
    return undefined
  return (tags[field.key] ?? '') === '' ? field.default : undefined
}
