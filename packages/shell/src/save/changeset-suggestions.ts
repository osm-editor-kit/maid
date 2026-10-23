/**
 * What the save flyout offers for the changeset's comment and source, as iD does it (ui/changeset_editor.js) and a
 * little further: the person's own history first, then their recent changesets from the server, each value once.
 * Pure: the lists come from changeset-history.ts and recent-changesets.ts.
 */
import type { Field, FieldOption } from '@osm-editor-kit/maid-presets'
import { sourceValues } from './changeset-history.ts'

/** How many comments the list under the comment shows at most */
export const COMMENT_LISTED = 8
/** How many sources are one click under the source field */
export const SOURCE_CHIPS = 6

/** `local` (the person's own uploads) and then `server`, each value once, case-sensitive */
export function mergeRecent(local: readonly string[], server: readonly string[]): string[] {
  return [...new Set([...local, ...server])]
}

/**
 * The comments to offer for the text in the comment field. iD's combobox is case-sensitive and matches the text
 * anywhere in a suggestion. An empty text offers the newest ones. A suggestion equal to the text is no suggestion.
 */
export function commentSuggestions(
  recent: readonly string[],
  typed: string,
  limit = COMMENT_LISTED,
): string[] {
  const text = typed.trim()
  return recent
    .filter((comment) => comment !== text && (text === '' || comment.includes(text)))
    .slice(0, limit)
}

/** Whether `value` is one of the sources in the `source` tag value */
export function hasSource(source: string | undefined, value: string): boolean {
  return sourceValues(source).includes(value)
}

/**
 * The `source` tag value with `value` added when it is not there, removed when it is: the toggle of a source chip.
 * Other values keep their order, a new one goes last; no values left is `undefined` (no tag).
 */
export function toggleSource(source: string | undefined, value: string): string | undefined {
  const values = sourceValues(source)
  const next = values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
  return next.length === 0 ? undefined : next.join(';')
}

/** The sources that are one click: the newest of the merged lists, at most `limit` */
export function sourceChips(recent: readonly string[], limit = SOURCE_CHIPS): string[] {
  return recent.slice(0, limit)
}

/**
 * The extra options of the source field: recent sources that are not options of the schema yet (iD's
 * `setCustomOptions`), as options that show their value.
 */
export function extraSourceOptions(
  schemaOptions: readonly FieldOption[],
  recent: readonly string[],
): FieldOption[] {
  const known = new Set(schemaOptions.map((option) => option.value))
  return recent.filter((value) => !known.has(value)).map((value) => ({ value, label: value }))
}

/**
 * The options the schema's `source` field has (id-tagging-schema, the English labels). Used while the presets are not
 * made yet, so the field is never empty.
 */
export const SOURCE_OPTIONS: readonly FieldOption[] = [
  { value: 'survey', label: 'Survey' },
  { value: 'local knowledge', label: 'Local Knowledge' },
  { value: 'aerial imagery', label: 'Aerial Imagery' },
  { value: 'gps', label: 'GPS' },
  { value: 'streetlevel imagery', label: 'Street-Level Photos' },
  { value: 'osm notes', label: 'OpenStreetMap Notes' },
]

/**
 * The changeset's `source` field for the multi-value combo: the schema's field (else the fallback above) with the
 * recent sources added as options (iD's `setCustomOptions`). Values keep their case and spaces, as in the schema.
 */
export function sourceField(schema: Field | undefined, recent: readonly string[]): Field {
  const base: Field = schema ?? {
    id: 'source',
    type: 'semiCombo',
    key: 'source',
    label: 'Sources',
    options: [...SOURCE_OPTIONS],
    universal: false,
  }
  return {
    ...base,
    key: 'source',
    type: 'semiCombo',
    snakeCase: false,
    caseSensitive: true,
    placeholder: 'Add a source',
    options: [...base.options, ...extraSourceOptions(base.options, recent)],
  }
}

/** What a source chip shows: the option's label for a value of the schema, else the value as written */
export function sourceLabel(field: Pick<Field, 'options'>, value: string): string {
  return field.options.find((option) => option.value === value)?.label ?? value
}
