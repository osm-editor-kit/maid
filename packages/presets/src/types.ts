export type Tags = Record<string, string>
export type Geometry = 'point' | 'vertex' | 'line' | 'area' | 'relation'

export type Preset = {
  id: string
  /** English name, resolved; falls back to the id */
  name: string
  icon?: string
  geometry: Geometry[]
  tags: Tags
  addTags: Tags
  removeTags: Tags
  /** iD's `matchScore`, default 1 */
  matchScore: number
  /** false for presets that are not offered in search (iD's `searchable: false`), default true */
  searchable: boolean
  /** Search words from the translation, lower case */
  terms: string[]
  /** Other names from the translation */
  aliases: string[]
}

export type FieldOption = { value: string; label: string }

export type Field = {
  id: string
  /** iD's field type, e.g. 'text', 'number', 'combo', 'check' */
  type: string
  key?: string
  keys?: string[]
  /** English label, resolved; falls back to the id */
  label: string
  placeholder?: string
  /** [] when the field has none; label from the translation, else the value */
  options: FieldOption[]
  default?: string
  geometry?: Geometry[]
  prerequisiteTag?: { key?: string; value?: string; valueNot?: string; keyNot?: string }
  minValue?: number
  increment?: number
  universal: boolean
  /** Combos: false when values keep their spaces; iD writes spaces as underscores otherwise */
  snakeCase?: boolean
  /** Combos: true when values keep their case; iD writes lower case otherwise */
  caseSensitive?: boolean
  /** Combos: false when only the listed options may be chosen */
  customValues?: boolean
  /** Identifier fields: the link for a value, with `{value}` in it */
  urlFormat?: string
  /** Identifier fields: a regular expression the value has to match for the link */
  pattern?: string
}

/**
 * The raw data: the three files of id-tagging-schema, or a changed copy of them.
 * - presets: the parsed `dist/presets.min.json`
 * - fields: the parsed `dist/fields.min.json`
 * - translations: the parsed `dist/translations/en.min.json` (top-level key `en`)
 * Values are unknown and are narrowed while the indexes are built; malformed entries are skipped.
 */
export type PresetData = {
  presets: Record<string, unknown>
  fields: Record<string, unknown>
  translations: unknown
}

export type Presets = {
  /** The preset that describes these tags for this geometry. Always returns one (generic fallback). */
  match(tags: Tags, geometry: Geometry): Preset
  preset(id: string): Preset | undefined
  field(id: string): Field | undefined
  /** The preset's fields that apply: resolved (inheritance, templates), filtered by the field's `geometry` and `prerequisiteTag`. Then every `moreFields` entry and universal field whose key (or one of its keys) has a value in `tags`, without duplicates. */
  fieldsFor(preset: Preset, tags: Tags, geometry: Geometry): Field[]
  /**
   * The fields the "Add field" list offers for these tags: every `moreFields` entry and universal
   * field that `fieldsFor` does not return, that applies to the geometry and whose prerequisiteTag
   * holds. No duplicates. Sorted by label, universal fields last (iD's order).
   */
  moreFieldsFor(preset: Preset, tags: Tags, geometry: Geometry): Field[]
  /** iD's area keys: key → values that are NOT areas. Same shape as iD's `areaKeys`. The object is built once; do not mutate it. */
  areaKeys(): Record<string, Record<string, true>>
  /**
   * Presets for this geometry whose name, alias, term or tag value matches the query, best first.
   * Only searchable presets. An empty query returns the first `limit` presets by name.
   */
  search(query: string, geometry: Geometry, limit?: number): Preset[]
  /**
   * The tags after choosing `preset` for a feature that had `tags` and matched `previous`:
   * the previous preset's tags are removed (iD's `unsetTags`, without touching tags the new
   * preset also sets), then the new preset's tags are added (iD's `setTags`: `addTags`, a `*`
   * value becomes `yes` unless the key already has a value; for geometry `area`, `area=yes` is added when no
   * tag of the preset makes it an area by `areaKeys`, as iD does). Returns a new object.
   */
  applyPreset(tags: Tags, preset: Preset, geometry: Geometry, previous?: Preset): Tags
}
