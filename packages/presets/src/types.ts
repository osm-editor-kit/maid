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
  /** iD's area keys: key → values that are NOT areas. Same shape as iD's `areaKeys`. The object is built once; do not mutate it. */
  areaKeys(): Record<string, Record<string, true>>
}
