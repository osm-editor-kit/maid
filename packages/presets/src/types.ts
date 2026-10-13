export type Tags = Record<string, string>
export type Geometry = 'point' | 'vertex' | 'line' | 'area' | 'relation'

/** A point as `[longitude, latitude]`, the order iD and the location packages use. */
export type LonLat = readonly [number, number]

/**
 * iD's `locationSet`: the places where a preset or a field applies. `include` and `exclude` are country
 * codes (ISO 3166-1 alpha-2 or alpha-3, any case), regions (`Q46`, `EU`, `001`, `Planet`) or `.geojson` files;
 * the set is the union of `include` less the union of `exclude`. Absent: everywhere.
 */
export type LocationSet = { include?: string[]; exclude?: string[] }

/** The OSM Wiki page that documents a tag: `key` alone, or `key=value` (iD's `reference`). */
export type Reference = { key: string; value?: string }

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
  /** What the OSM Wiki documents for this type: the schema's `reference`, else iD's choice. Absent when there is none. */
  reference?: Reference
  /** iD's `locationSet`: the preset is matched, and offered by search, only where it holds. Absent: everywhere. */
  locationSet?: LocationSet
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
  prerequisiteTag?: {
    key?: string
    value?: string
    values?: string[]
    valueNot?: string
    valuesNot?: string[]
    keyNot?: string
  }
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
  /** What the OSM Wiki documents for this field: the schema's `reference`, else its key. Absent when there is none. */
  reference?: Reference
  /** iD's `locationSet`: the field is shown, and its default written, only where it holds. Absent: everywhere. */
  locationSet?: LocationSet
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

/**
 * Options of the preset functions that write tags. `skipFieldDefaults` leaves out the default tags of the
 * fields (iD's `skipFieldDefaults`): iD's validation for outdated tags uses it, the preset list does not.
 * `loc` is the point the feature is at (iD's `loc`, the centre of its extent): the fields whose location set
 * does not hold there are left out of the field defaults. Without `loc`, every location set is ignored.
 */
export type PresetOptions = { skipFieldDefaults?: boolean; loc?: LonLat }

export type Presets = {
  /**
   * The preset that describes these tags for this geometry. Always returns one (generic fallback). With `loc`,
   * a preset whose location set does not hold there is passed over for the best one that does (iD's matchTags).
   */
  match(tags: Tags, geometry: Geometry, loc?: LonLat): Preset
  preset(id: string): Preset | undefined
  field(id: string): Field | undefined
  /**
   * The preset's fields that apply: its own `fields` with `{preset}` and template references expanded, filtered by the field's `geometry` and `prerequisiteTag`. Then every `moreFields` entry and universal field whose key (or one of its keys) is in `tags`, even with an empty value (iD's tagsContainFieldKey), without duplicates.
   * With `loc`, a field whose location set does not hold there is left out (iD's `fields(loc)` and `isAllowed`).
   */
  fieldsFor(preset: Preset, tags: Tags, geometry: Geometry, loc?: LonLat): Field[]
  /**
   * The fields the "Add field" list offers for these tags: every `moreFields` entry and universal
   * field that `fieldsFor` does not return, that applies to the geometry and whose prerequisiteTag
   * holds. No duplicates. Sorted by label, universal fields last (iD's order). With `loc`, only the
   * fields whose location set holds there.
   */
  moreFieldsFor(preset: Preset, tags: Tags, geometry: Geometry, loc?: LonLat): Field[]
  /** iD's `locationSetsAt` for one location set: true when it holds at `loc`, or when there is no location set. */
  matchesLocation(locationSet: LocationSet | undefined, loc: LonLat): boolean
  /**
   * The country of a point as an ISO 3166-1 alpha-2 code in lower case (the codes of the address formats), or
   * undefined outside every country. iD's `countryCoder.iso1A2Code`. The borders ship with the package.
   */
  countryAt(loc: LonLat): string | undefined
  /** iD's area keys: key → values that are NOT areas. Same shape as iD's `areaKeys`. The object is built once; do not mutate it. */
  areaKeys(): Record<string, Record<string, true>>
  /**
   * Presets for this geometry whose name, alias, term or tag value matches the query, in iD's order of
   * tiers (collection.ts `search`), and close matches of the name or a term (edit distance). Only searchable
   * presets. The geometry's fallback preset comes last, as in iD, so `limit` counts it. As in iD, the tiers
   * are cut to `limit - 1` before duplicates are removed, so a preset that two tiers find uses two places.
   * The default limit is 50 (iD's MAXRESULTS). An empty query returns the first `limit` presets by name.
   * With `loc`, only the presets whose location set holds there are searched (iD's collection.search).
   */
  search(query: string, geometry: Geometry, limit?: number, loc?: LonLat): Preset[]
  /** iD's preset.matchScore: how well the tags fit the preset; -1 when a tag of the preset is missing or different. */
  matchScore(preset: Preset, tags: Tags): number
  /** iD's preset.matchGeometry: the preset is for this geometry. */
  matchGeometry(preset: Preset, geometry: Geometry): boolean
  /** iD's preset.matchAllGeometry: the preset is for every one of these geometries (true for an empty list). */
  matchAllGeometry(preset: Preset, geometries: Geometry[]): boolean
  /** iD's preset.isFallback: the preset has no tags, or only `area=*`. */
  isFallback(preset: Preset): boolean
  /**
   * iD's setTags: the tags with the preset's addTags (a `*` value becomes `yes` unless the key already has a
   * value), `area=yes` for an area where no tag of the preset makes it one (areaKeys), then the field defaults
   * of the fields that apply to the geometry and whose key is not set yet. Field defaults are not checked
   * against prerequisiteTag, as in iD. `skipFieldDefaults` leaves them out. Returns a new object.
   */
  setTags(tags: Tags, preset: Preset, geometry: Geometry, options?: PresetOptions): Tags
  /**
   * iD's unsetTags: the tags without the preset's removeTags (except `ignoringKeys`), without the field
   * defaults that still hold (unless `skipFieldDefaults`), and without `area`. Returns a new object.
   */
  unsetTags(
    tags: Tags,
    preset: Preset,
    geometry: Geometry,
    ignoringKeys?: readonly string[],
    options?: PresetOptions,
  ): Tags
  /**
   * The tags after choosing `preset` for a feature that had `tags` and matched `previous` (iD's actionChangePreset):
   * the previous preset's tags and field keys are removed, except the keys the new preset keeps (its addTags
   * and the keys of its fields that apply to the geometry); then the new preset's tags are added (`setTags`).
   * `skipFieldDefaults` applies to that last step only, as in iD: the removal of the old preset never skips
   * field defaults. Without `previous`, only the new preset's tags are added. Returns a new object.
   */
  applyPreset(
    tags: Tags,
    preset: Preset,
    geometry: Geometry,
    previous?: Preset,
    options?: PresetOptions,
  ): Tags
}
