// Port of the matching and field logic of iD's modules/presets (index.js, preset.ts, collection.ts, field.ts),
// the search (collection.ts `search`) and the tag changes (preset.ts `setTags`, `unsetTags`, and
// actions/change_preset.js). README.md, "Compared with iD", lists every rule and the test that pins it.
// Location sets follow iD when a `loc` is given (locations.ts holds the lookup); without one they are ignored.
// Categories and the defaults per geometry are in defaults.ts; recents and the browse list in browse.ts.
// Not ported: addable presets, suggestion presets
// (none in the bundled data), preferences, the file fetcher, and the localizer (labels come straight
// from the English translation).
import { createDefaults } from './defaults.ts'
import { deprecatedIndexOf, deprecatedTagsOf } from './deprecated.ts'
import { createLocations } from './locations.ts'
import {
  asGeometries,
  asNumber,
  asRecord,
  asString,
  asStrings,
  asTags,
  own,
  referenceOf,
} from './raw.ts'
import type { RawRecord } from './raw.ts'
import type {
  Field,
  FieldOption,
  Geometry,
  LocationSet,
  LonLat,
  Preset,
  PresetData,
  PresetOptions,
  Presets,
  Tags,
} from './types.ts'

type Which = 'fields' | 'moreFields'
type PrerequisiteTag = NonNullable<Field['prerequisiteTag']>

type Entry = {
  preset: Preset
  /** iD's isFallback(): no tags, or only area=*. */
  fallback: boolean
  /** iD leaves replacement and suggestion presets out of areaKeys. */
  deprecated: boolean
  /** Resolved `fields` and `moreFields`, unfiltered by geometry or tags. */
  fields: Field[]
  moreFields: Field[]
}

// iD seeds these four and the data then replaces them (keeping their place in the order).
const GENERIC_PRESETS: Array<[string, RawRecord]> = [
  ['point', { name: 'Point', tags: {}, geometry: ['point', 'vertex'], matchScore: 0.1 }],
  ['line', { name: 'Line', tags: {}, geometry: ['line'], matchScore: 0.1 }],
  ['area', { name: 'Area', tags: { area: 'yes' }, geometry: ['area'], matchScore: 0.1 }],
  ['relation', { name: 'Relation', tags: {}, geometry: ['relation'], matchScore: 0.1 }],
]

// iD's areaKeys ignores keys that imply lines.
const AREA_KEY_IGNORE: ReadonlySet<string> = new Set([
  'barrier',
  'highway',
  'footway',
  'railway',
  'junction',
  'type',
])

/** The translation section of the English file: 'presets' (id → {name}) or 'fields' (id → {label, options, ...}). */
function translationSection(translations: unknown, section: 'presets' | 'fields') {
  const en = asRecord(asRecord(translations)?.en)
  const presets = asRecord(en?.presets)
  return asRecord(presets?.[section]) ?? {}
}

function textOf(section: RawRecord, id: string, key: string) {
  return asString(asRecord(own(section, id))?.[key])
}

/**
 * Follows `{other}` references. Returns the id whose text was used and the text itself.
 * iD keeps a label or name that refers to another entry in that entry's translation.
 */
function resolveText(
  lookup: (id: string) => string | undefined,
  id: string,
  seen: Set<string> = new Set(),
) {
  if (seen.has(id)) return undefined
  seen.add(id)
  const text = lookup(id)
  if (text === undefined) return undefined
  const ref = referenceOf(text)
  if (ref === undefined) return { owner: id, text }
  return resolveText(lookup, ref, seen)
}

function tagValue(tags: Tags, key: string) {
  const value: unknown = tags[key]
  return typeof value === 'string' ? value : ''
}

/**
 * iD's prerequisiteTag check (modules/ui/field.js, isAllowed). An absent tag counts as ''. The order of the
 * tests is iD's: valuesNot, valueNot, values, value, then any value. Only iD's Field UI asks it; the default
 * tags of a preset do not (see setTags).
 */
function prerequisiteHolds(prerequisite: PrerequisiteTag | undefined, tags: Tags) {
  if (!prerequisite) return true
  if (prerequisite.key !== undefined) {
    const value = tagValue(tags, prerequisite.key)
    // as iD: valuesNot, valueNot, values, value, then any value (ui/field.js isAllowed)
    if (prerequisite.valuesNot !== undefined) return !prerequisite.valuesNot.includes(value)
    if (prerequisite.valueNot) return prerequisite.valueNot !== value
    if (prerequisite.values !== undefined) return prerequisite.values.includes(value)
    if (prerequisite.value) return prerequisite.value === value
    return value !== ''
  }
  if (prerequisite.keyNot) return tagValue(tags, prerequisite.keyNot) === ''
  return true
}

/**
 * iD's tagsContainFieldKey (modules/ui/field.js): one of the keys the field controls (allKeys, which includes
 * the prefixed keys of a multiCombo) is in the tags. An empty value counts, as it does in iD.
 */
function fieldHasValue(field: Field, tags: Tags) {
  // as iD: a present key counts even when its value is empty (`_tags[key] !== undefined`)
  return allKeysOf(field, tags).some((key) => Object.hasOwn(tags, key))
}

function fieldAppliesTo(field: Field, geometry: Geometry) {
  return field.geometry === undefined || field.geometry.includes(geometry)
}

/** The schema's own `reference` (`{ key, value? }`), or undefined when it has no key. */
function schemaReference(raw: RawRecord) {
  const given = asRecord(raw.reference)
  const key = asString(given?.key)
  if (key === undefined) return undefined
  const value = asString(given?.value)
  return value === undefined ? { key } : { key, value }
}

/**
 * iD's field.reference: the schema's reference, else the field's key. A multiCombo key ending in `:`
 * is looked up as `key:*`, as iD does. The value is left out: iD adds the field's current value.
 */
function fieldReferenceOf(raw: RawRecord, field: Field) {
  const given = schemaReference(raw)
  if (given) return given
  if (field.key === undefined) return undefined
  return { key: field.type === 'multiCombo' ? field.key.replace(/:$/, ':*') : field.key }
}

/** The schema's `locationSet` (`include`, `exclude`), or undefined when the entry has none (iD: everywhere). */
function locationSetOf(raw: RawRecord): LocationSet | undefined {
  const given = asRecord(raw.locationSet)
  if (!given) return undefined
  const set: LocationSet = {}
  const include = asStrings(given.include)
  if (include !== undefined) set.include = include
  const exclude = asStrings(given.exclude)
  if (exclude !== undefined) set.exclude = exclude
  return set
}

/**
 * iD's preset.reference(): the schema's reference, else the preset's first tag key other than `name`,
 * with its value. ID's Wikidata lookup (`wikidata=*` on the tags) is not ported. A `*` value is left out.
 */
function presetReferenceOf(raw: RawRecord, tags: Tags) {
  const given = schemaReference(raw)
  const key = given?.key ?? Object.keys(tags).find((name) => name !== 'name')
  if (key === undefined) return undefined
  const value = given?.value ?? tags[key]
  return value === undefined || value === '*' ? { key } : { key, value }
}

/** iD's presetPreset.matchScore: -1 when a tag of the preset is missing or different. */
function matchScore(preset: Preset, entityTags: Tags) {
  let score = 0
  for (const key in preset.tags) {
    const wanted = preset.tags[key]
    if (entityTags[key] === wanted) {
      score += preset.matchScore
    } else if (wanted === '*' && Object.hasOwn(entityTags, key)) {
      score += preset.matchScore / 2
    } else {
      return -1
    }
  }
  // iD: boost for additional matches in addTags (#6802); keys already counted above are skipped
  for (const key in preset.addTags) {
    if (Object.hasOwn(preset.tags, key)) continue
    if (entityTags[key] === preset.addTags[key]) score += preset.matchScore
  }
  if (preset.searchable === false) score *= 0.999
  return score
}

function isFallbackTags(tags: Tags) {
  const keys = Object.keys(tags)
  return keys.length === 0 || (keys.length === 1 && keys[0] === 'area')
}

/** A translation list: `text` split on `separator` (iD's `terms` are comma separated, `aliases` newline separated), else the raw array. */
function wordList(text: string | undefined, separator: string, fallback: unknown) {
  const words = text !== undefined ? text.split(separator) : (asStrings(fallback) ?? [])
  return words.map((word) => word.trim()).filter((word) => word !== '')
}

/** iD's utilStripDiacritics. */
function stripDiacritics(text: string) {
  return text.normalize('NFD').replace(/\p{Dia}/gu, '')
}

/** iD's `leading`: the text starts with `value`, or has it after a space (e.g. "office" in "Law Office"). */
function leading(text: string, value: string) {
  const index = text.indexOf(value)
  return index === 0 || (index > 0 && text[index - 1] === ' ')
}

/** iD's `presetInSearchTerm`: the query contains one of the preset's texts at its start, or after a space. */
function nameInQuery(text: string, value: string) {
  const index = value.indexOf(text)
  return index === 0 || (index > 0 && value[index - 1] === ' ')
}

/**
 * iD's osmAreaKeysExceptions (modules/osm/tags.ts): values that make a key an area without `area=yes`.
 * iD tests only that the value is listed, so the `false` entries of `emergency` count too.
 */
const AREA_KEY_EXCEPTIONS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['highway', new Set(['elevator', 'rest_area', 'services'])],
  ['public_transport', new Set(['platform'])],
  [
    'railway',
    new Set([
      'platform',
      'roundhouse',
      'station',
      'traverser',
      'turntable',
      'wash',
      'ventilation_shaft',
    ]),
  ],
  ['waterway', new Set(['dam'])],
  ['amenity', new Set(['bicycle_parking'])],
  ['emergency', new Set(['yes', 'no', 'private', 'designated', 'destination', 'official'])],
])

/**
 * What search needs about one preset, prepared once when the presets are built. As in iD, the name,
 * the aliases and the stripped forms are lower case, and the tag values and key=value strings are
 * compared as they are (the query is lower-cased, so a mixed-case value is found only by its lower-case query).
 * The terms are lower case because the schema build lower-cases them.
 */
type SearchEntry = {
  preset: Preset
  name: string
  nameStripped: string
  aliases: string[]
  aliasesStripped: string[]
  terms: string[]
  /** the same terms with diacritics removed */
  termsStripped: string[]
  /** tag values other than `*` */
  values: string[]
  /** `key=value` of the tags, and of addTags, each in the preset's order */
  tagKeyValues: string[]
  addTagKeyValues: string[]
  /**
   * The texts that a query can contain (iD's presetInSearchTerm): name, aliases, terms and stripped forms,
   * trimmed. A text that is empty before trimming is left out, as iD does.
   */
  texts: string[]
}

function searchEntryOf(preset: Preset) {
  const name = preset.name.toLowerCase()
  const nameStripped = stripDiacritics(name)
  const aliases = preset.aliases.map((alias) => alias.toLowerCase())
  const aliasesStripped = aliases.map((alias) => stripDiacritics(alias))
  const keyValuesOf = (tags: Tags) => Object.entries(tags).map(([key, value]) => `${key}=${value}`)
  // as iD: presetInSearchTerm trims the text; a text that is empty before trimming is left out
  const texts = [name, ...aliases, ...preset.terms, nameStripped, ...aliasesStripped]
    .filter((text) => text.length > 0)
    .map((text) => text.trim())
  return {
    preset,
    name,
    nameStripped,
    aliases,
    aliasesStripped,
    terms: preset.terms,
    termsStripped: preset.terms.map((term) => stripDiacritics(term)),
    // as iD: the tag values are not lower-cased (only the query is)
    values: Object.values(preset.tags).filter((value) => value !== '*'),
    tagKeyValues: keyValuesOf(preset.tags),
    addTagKeyValues: keyValuesOf(preset.addTags),
    texts,
  }
}

function byNameThenId(a: SearchEntry, b: SearchEntry) {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  return a.preset.id < b.preset.id ? -1 : 1
}

/** iD's findMatchingAlias: the name or alias that equals the query, else the shortest one that contains it. */
function bestText(value: string, names: string[]) {
  if (names.includes(value)) return value
  const containing = names.filter((name) => name.includes(value))
  containing.sort((a, b) => a.length - b.length)
  return containing[0] ?? names[0] ?? ''
}

/** iD's sortPresets: an exact match first, then the higher matchScore, then the earlier position, then the shorter text. */
function rankByName(entries: SearchEntry[], value: string, variant: 'plain' | 'stripped') {
  const ranked = entries.map((entry) => {
    const names =
      variant === 'plain'
        ? [entry.name, ...entry.aliases]
        : [entry.nameStripped, ...entry.aliasesStripped]
    return { entry, text: bestText(value, names) }
  })
  ranked.sort((a, b) => {
    if (value === a.text) return -1
    if (value === b.text) return 1
    const byScore = b.entry.preset.matchScore - a.entry.preset.matchScore
    if (byScore !== 0) return byScore
    const byPosition = a.text.indexOf(value) - b.text.indexOf(value)
    if (byPosition !== 0) return byPosition
    return a.text.length - b.text.length
  })
  return ranked.map((item) => item.entry)
}

/**
 * iD's key=value tier (leadingTagKeyValues), in iD's order: the exact matches of the tags, the tags that start
 * with the query, then the same two for addTags. A preset can appear in more than one of the four.
 */
function keyValueMatches(pool: SearchEntry[], value: string) {
  return [
    ...pool.filter((entry) => entry.tagKeyValues.includes(value)),
    ...pool.filter((entry) => entry.tagKeyValues.some((kv) => leading(kv, value))),
    ...pool.filter((entry) => entry.addTagKeyValues.includes(value)),
    ...pool.filter((entry) => entry.addTagKeyValues.some((kv) => leading(kv, value))),
  ]
}

/**
 * iD's utilEditDistance (Levenshtein) on texts that are lower case with diacritics removed. The search
 * prepares them once (SearchEntry), so the search does not strip the same text again for every query.
 */
function editDistance(a: string, b: string) {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let previous = Array.from({ length: a.length + 1 }, (_, j) => j)
  for (let i = 1; i <= b.length; i++) {
    const current = [i]
    for (let j = 1; j <= a.length; j++) {
      current[j] =
        b[i - 1] === a[j - 1]
          ? (previous[j - 1] ?? 0)
          : 1 + Math.min(previous[j - 1] ?? 0, previous[j] ?? 0, current[j - 1] ?? 0)
    }
    previous = current
  }
  return previous[a.length] ?? 0
}

// iD's LANGUAGE_SUFFIX_REGEX (modules/ui/fields/localized.js): the `:xx` suffix of a localized name key.
const LANGUAGE_SUFFIX =
  /^(.*):([a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-[0-9]{3})?(?:-[a-z][a-z0-9]{4,7}|-[0-9][a-z0-9]{3})?)$/

/**
 * iD's field.allKeys: the keys a field writes, and the keys of its type that are in the tags
 * (localized `name:xx`, the keys under a multi-combo prefix, `:both` of a directional combo).
 */
function allKeysOf(field: Field, tags: Tags) {
  const keys = new Set<string>()
  if (field.key !== undefined) keys.add(field.key)
  for (const key of field.keys ?? []) keys.add(key)
  const key = field.key
  if (key !== undefined && field.type === 'directionalCombo') {
    const base = key.replace(/:both$/, '')
    keys.add(base)
    keys.add(`${base}:both`)
  }
  if (key !== undefined && field.type === 'localized') {
    for (const tagKey of Object.keys(tags)) {
      if (tagKey.startsWith(`${key}:`) && LANGUAGE_SUFFIX.test(tagKey)) keys.add(tagKey)
    }
  }
  if (key !== undefined && field.type === 'multiCombo') {
    const prefix = key.endsWith(':') ? key : `${key}:`
    for (const tagKey of Object.keys(tags)) {
      if (tagKey.startsWith(prefix)) keys.add(tagKey)
    }
  }
  return [...keys]
}

function withoutKeys(tags: Tags, keys: ReadonlySet<string>) {
  return Object.fromEntries(Object.entries(tags).filter(([key]) => !keys.has(key)))
}

function mustGet<T>(value: T | undefined, what: string) {
  if (value === undefined) throw new Error(`presets: missing generic preset ${what}`)
  return value
}

export function createPresets(data: PresetData): Presets {
  // One location lookup per presets instance; its location sets are registered when first used.
  const locations = createLocations()
  // The schema's deprecated tags, indexed once (deprecated.ts)
  const deprecated = deprecatedIndexOf(data.deprecated)
  // iD's location test: without a `loc`, every location set holds.
  function here(locationSet: LocationSet | undefined, loc: LonLat | undefined) {
    return loc === undefined || locations.matchesLocation(locationSet, loc)
  }

  // Fields first: presets refer to them.
  const presetNames = translationSection(data.translations, 'presets')
  const fieldTexts = translationSection(data.translations, 'fields')
  const rawFields = new Map<string, RawRecord>()
  for (const [id, value] of Object.entries(data.fields)) {
    const raw = asRecord(value)
    if (raw) rawFields.set(id, raw)
  }
  const fields = new Map<string, Field>()
  for (const [id, raw] of rawFields) fields.set(id, buildField(id, raw))

  function buildField(id: string, raw: RawRecord) {
    const fieldLookup = (key: string) => (fieldId: string) =>
      textOf(fieldTexts, fieldId, key) ?? asString(rawFields.get(fieldId)?.[key])
    const label = resolveText(fieldLookup('label'), id)
    const optionOwner = label?.owner ?? id
    const options: FieldOption[] = (asStrings(raw.options) ?? []).map((value) => ({
      value,
      label: optionText(optionOwner, id, value),
    }))
    const field: Field = {
      id,
      type: asString(raw.type) ?? '',
      label: label?.text ?? id,
      options,
      universal: raw.universal === true,
    }
    const key = asString(raw.key)
    if (key !== undefined) field.key = key
    const keys = asStrings(raw.keys)
    if (keys !== undefined) field.keys = keys
    const placeholder = resolveText(fieldLookup('placeholder'), id)
    if (placeholder !== undefined) field.placeholder = placeholder.text
    const defaultValue = asString(raw.default)
    if (defaultValue !== undefined) field.default = defaultValue
    if (Array.isArray(raw.geometry)) field.geometry = asGeometries(raw.geometry)
    const prerequisite = asRecord(raw.prerequisiteTag)
    if (prerequisite) {
      const picked: PrerequisiteTag = {}
      for (const name of ['key', 'value', 'valueNot', 'keyNot'] as const) {
        const text = asString(prerequisite[name])
        if (text !== undefined) picked[name] = text
      }
      // as iD: the list forms of prerequisiteTag (values, valuesNot) are read too
      const values = asStrings(prerequisite.values)
      if (values !== undefined) picked.values = values
      const valuesNot = asStrings(prerequisite.valuesNot)
      if (valuesNot !== undefined) picked.valuesNot = valuesNot
      field.prerequisiteTag = picked
    }
    const minValue = asNumber(raw.minValue)
    if (minValue !== undefined) field.minValue = minValue
    const increment = asNumber(raw.increment)
    if (increment !== undefined) field.increment = increment
    if (typeof raw.snake_case === 'boolean') field.snakeCase = raw.snake_case
    if (typeof raw.caseSensitive === 'boolean') field.caseSensitive = raw.caseSensitive
    if (typeof raw.customValues === 'boolean') field.customValues = raw.customValues
    const urlFormat = asString(raw.urlFormat)
    if (urlFormat !== undefined) field.urlFormat = urlFormat
    const pattern = asString(raw.pattern)
    if (pattern !== undefined) field.pattern = pattern
    const reference = fieldReferenceOf(raw, field)
    if (reference !== undefined) field.reference = reference
    const locationSet = locationSetOf(raw)
    if (locationSet !== undefined) field.locationSet = locationSet
    return field
  }

  // iD's option label: the translation of the field the label points to, then of the field itself.
  function optionText(owner: string, id: string, value: string) {
    for (const source of owner === id ? [id] : [owner, id]) {
      const options = asRecord(asRecord(own(fieldTexts, source))?.options)
      const entry = options ? own(options, value) : undefined
      const text = asString(entry) ?? asString(asRecord(entry)?.title)
      if (text !== undefined) return text
    }
    return value
  }

  // Presets: the raw records (seeds first, then the data replaces them in place).
  const rawPresets = new Map<string, RawRecord>()
  for (const [id, raw] of GENERIC_PRESETS) rawPresets.set(id, raw)
  for (const [id, value] of Object.entries(data.presets)) {
    const raw = asRecord(value)
    if (raw) rawPresets.set(id, raw)
  }

  const presetLookup = (id: string) =>
    textOf(presetNames, id, 'name') ?? asString(rawPresets.get(id)?.name)

  // Expands `{preset}` and `{@templates/x}` references (the bundled dist still has them; the templates are
  // presets with a `@template` tag). Memoized per preset and list; a cycle resolves to nothing.
  // As iD: a preset with no fields of its own shows none. iD does not inherit the fields of the parent
  // preset (`a/b` to `a`): the schema build leaves such a preset without fields, and so does iD's runtime.
  const memo: Record<Which, Map<string, Field[]>> = { fields: new Map(), moreFields: new Map() }
  const stack = new Set<string>()
  function resolveList(presetId: string, which: Which) {
    const cached = memo[which].get(presetId)
    if (cached) return cached
    if (stack.has(presetId)) return []
    stack.add(presetId)
    // as iD: a preset with no fields of its own has none; the parent's fields are not inherited
    const listed = asStrings(rawPresets.get(presetId)?.[which]) ?? []
    const resolved: Field[] = []
    for (const entry of listed) {
      const ref = referenceOf(entry)
      if (ref !== undefined) {
        resolved.push(...resolveList(ref, which))
        continue
      }
      const field = fields.get(entry)
      if (field) resolved.push(field)
    }
    stack.delete(presetId)
    const unique = [...new Set(resolved)]
    memo[which].set(presetId, unique)
    return unique
  }

  const entries = new Map<string, Entry>()
  for (const [id, raw] of rawPresets) {
    const tags = asTags(raw.tags)
    const addTags = asRecord(raw.addTags) ? asTags(raw.addTags) : tags
    const removeTags = asRecord(raw.removeTags) ? asTags(raw.removeTags) : addTags
    const score = asNumber(raw.matchScore)
    const preset: Preset = {
      id,
      name: resolveText(presetLookup, id)?.text ?? id,
      geometry: asGeometries(raw.geometry),
      tags,
      addTags,
      removeTags,
      matchScore: score !== undefined && score !== 0 ? score : 1,
      searchable: raw.searchable !== false,
      terms: wordList(textOf(presetNames, id, 'terms'), ',', raw.terms).map((term) =>
        term.toLowerCase(),
      ),
      aliases: wordList(textOf(presetNames, id, 'aliases'), '\n', raw.aliases),
    }
    const icon = asString(raw.icon)
    if (icon !== undefined) preset.icon = icon
    const reference = presetReferenceOf(raw, tags)
    if (reference !== undefined) preset.reference = reference
    const locationSet = locationSetOf(raw)
    if (locationSet !== undefined) preset.locationSet = locationSet
    const replacement = asString(raw.replacement)
    if (replacement !== undefined) preset.replacement = replacement
    entries.set(id, {
      preset,
      fallback: isFallbackTags(tags),
      deprecated: Boolean(raw.replacement) || raw.suggestion === true,
      fields: resolveList(id, 'fields'),
      moreFields: resolveList(id, 'moreFields'),
    })
  }
  const ordered = [...entries.values()]

  // iD's _geometryIndex: geometry → tag key → tag value → presets, in preset order.
  const index: Record<Geometry, Map<string, Map<string, Preset[]>>> = {
    point: new Map(),
    vertex: new Map(),
    line: new Map(),
    area: new Map(),
    relation: new Map(),
  }
  for (const { preset } of ordered) {
    for (const geometry of preset.geometry) {
      const byKey = index[geometry]
      for (const [key, value] of Object.entries(preset.tags)) {
        let byValue = byKey.get(key)
        if (!byValue) {
          byValue = new Map()
          byKey.set(key, byValue)
        }
        const list = byValue.get(value)
        if (list) list.push(preset)
        else byValue.set(value, [preset])
      }
    }
  }

  const generic: Record<Geometry, Preset> = {
    point: mustGet(entries.get('point')?.preset, 'point'),
    vertex: mustGet(entries.get('point')?.preset, 'point'),
    line: mustGet(entries.get('line')?.preset, 'line'),
    area: mustGet(entries.get('area')?.preset, 'area'),
    relation: mustGet(entries.get('relation')?.preset, 'relation'),
  }

  // iD's matchCandidates: every preset that matches these tags with its score, the best score first. The sort is
  // stable, so equal scores keep the order of the keys and of the index.
  function matchesRanked(tags: Tags, geometry: Geometry) {
    const byKey = index[geometry]
    const found: Array<{ preset: Preset; score: number }> = []
    for (const key in tags) {
      const byValue = byKey.get(key)
      if (!byValue) continue
      const value = tags[key]
      if (value === undefined) continue
      // exact value first, then presets with `*` for this key (iD's order)
      for (let pass = 0; pass < 2; pass++) {
        const list = byValue.get(pass === 0 ? value : '*')
        if (!list) continue
        for (const candidate of list) {
          const score = matchScore(candidate, tags)
          if (score !== -1) found.push({ preset: candidate, score })
        }
      }
    }
    return found.sort((a, b) => b.score - a.score)
  }

  function match(tags: Tags, geometry: Geometry, loc?: LonLat) {
    const byKey = index[geometry]
    let best: Preset | undefined
    let bestScore = -1
    for (const key in tags) {
      const byValue = byKey.get(key)
      if (!byValue) continue
      const value = tags[key]
      if (value === undefined) continue
      // exact value first, then presets with `*` for this key (iD's order)
      for (let pass = 0; pass < 2; pass++) {
        const list = byValue.get(pass === 0 ? value : '*')
        if (!list) continue
        for (const candidate of list) {
          const score = matchScore(candidate, tags)
          if (score === -1) continue
          if (score > bestScore) {
            bestScore = score
            best = candidate
          }
        }
      }
    }

    // as iD's matchTags: when the best preset does not hold at this place, the best one that does is taken
    if (best !== undefined && !here(best.locationSet, loc)) {
      best = matchesRanked(tags, geometry).find(({ preset }) =>
        here(preset.locationSet, loc),
      )?.preset
    }

    // iD: if any part of an address is present, the "Address" preset is the fallback (#4353)
    if (best === undefined || entries.get(best.id)?.fallback) {
      const address = index[geometry].get('addr:*')?.get('*')?.[0]
      if (address !== undefined) {
        for (const key in tags) {
          if (key.startsWith('addr:')) {
            best = address
            break
          }
        }
      }
    }

    return best ?? generic[geometry]
  }

  const universal = [...fields.values()].filter((field) => field.universal)

  function fieldsFor(preset: Preset, tags: Tags, geometry: Geometry, loc?: LonLat) {
    const entry = entries.get(preset.id)
    const result: Field[] = []
    const seen = new Set<string>()
    const add = (field: Field) => {
      if (seen.has(field.id)) return
      seen.add(field.id)
      result.push(field)
    }
    // as iD: a field whose location set does not hold is not shown (ui/field.js isAllowed, preset.fields(loc))
    const applies = (field: Field) =>
      fieldAppliesTo(field, geometry) && here(field.locationSet, loc)
    // 1. the preset's fields; iD also keeps a field whose key already has a value, prerequisite or not
    for (const field of entry?.fields ?? []) {
      if (!applies(field)) continue
      if (fieldHasValue(field, tags) || prerequisiteHolds(field.prerequisiteTag, tags)) add(field)
    }
    // 2. moreFields and universal fields that have a value
    for (const field of entry?.moreFields ?? []) {
      if (applies(field) && fieldHasValue(field, tags)) add(field)
    }
    for (const field of universal) {
      if (applies(field) && fieldHasValue(field, tags)) add(field)
    }
    return result
  }

  function moreFieldsFor(preset: Preset, tags: Tags, geometry: Geometry, loc?: LonLat) {
    const entry = entries.get(preset.id)
    const shown = new Set(fieldsFor(preset, tags, geometry, loc).map((field) => field.id))
    const seen = new Set<string>()
    const offered: Field[] = []
    for (const field of [...(entry?.moreFields ?? []), ...universal]) {
      if (seen.has(field.id) || shown.has(field.id)) continue
      seen.add(field.id)
      if (
        fieldAppliesTo(field, geometry) &&
        here(field.locationSet, loc) &&
        prerequisiteHolds(field.prerequisiteTag, tags)
      ) {
        offered.push(field)
      }
    }
    // iD (form_fields.js): by title, universal fields last
    return offered.sort(
      (a, b) => Number(a.universal) - Number(b.universal) || a.label.localeCompare(b.label),
    )
  }

  // iD's areaKeys (index.js): a keeplist of keys from area presets, and per key the values that are lines.
  const areaKeys: Record<string, Record<string, true>> = {}
  for (const { preset, deprecated } of ordered) {
    if (deprecated) continue
    const key = Object.keys(preset.tags)[0]
    if (key === undefined || AREA_KEY_IGNORE.has(key)) continue
    if (preset.geometry.includes('area') && !Object.hasOwn(areaKeys, key)) areaKeys[key] = {}
  }
  for (const { preset, deprecated } of ordered) {
    if (deprecated || !preset.geometry.includes('line')) continue
    for (const key in preset.addTags) {
      const value = preset.addTags[key]
      if (!Object.hasOwn(areaKeys, key) || value === undefined || value === '*') continue
      const values = areaKeys[key]
      if (values) values[value] = true
    }
  }

  // Search: the searchable presets per geometry, prepared once (lower-cased names, terms, values).
  const searchIndex: Record<Geometry, SearchEntry[]> = {
    point: [],
    vertex: [],
    line: [],
    area: [],
    relation: [],
  }
  for (const { preset } of ordered) {
    if (!preset.searchable) continue
    const entry = searchEntryOf(preset)
    for (const geometry of preset.geometry) searchIndex[geometry].push(entry)
  }
  // The empty query's order: by name, then id.
  const byName: Record<Geometry, Preset[]> = {
    point: [...searchIndex.point].sort(byNameThenId).map((entry) => entry.preset),
    vertex: [...searchIndex.vertex].sort(byNameThenId).map((entry) => entry.preset),
    line: [...searchIndex.line].sort(byNameThenId).map((entry) => entry.preset),
    area: [...searchIndex.area].sort(byNameThenId).map((entry) => entry.preset),
    relation: [...searchIndex.relation].sort(byNameThenId).map((entry) => entry.preset),
  }

  // as iD: collection.search, the tiers in iD's order, each ranked as iD ranks it. The tiers are
  // joined and the first `limit - 1` entries are kept, duplicates included; then the duplicates are removed
  // and the geometry's fallback is added last (or where it already is).
  // as iD: the default limit is MAXRESULTS, 50
  function search(query: string, geometry: Geometry, limit = 50, loc?: LonLat) {
    if (limit <= 0) return []
    const value = query.toLowerCase().trim()
    // as iD's collection.search: a preset whose location set does not hold here is not searched at all. The
    // test is made for the presets that are taken, not for the whole pool: removing entries from a ranked tier
    // leaves the order of the others as it is, so the result is the same, and few location sets are resolved.
    const placed = (preset: Preset) => here(preset.locationSet, loc)
    // not as iD: iD returns the whole collection for an empty query and the UI shows its defaults instead
    if (value === '') {
      const names: Preset[] = []
      for (const preset of byName[geometry]) {
        if (names.length >= limit) break
        if (placed(preset)) names.push(preset)
      }
      return names
    }
    const pool = searchIndex[geometry]
    const valueStripped = stripDiacritics(value)
    const tiers: Array<() => SearchEntry[]> = [
      // the name or an alias starts the query, or has it after a space
      () =>
        rankByName(
          pool.filter((e) => leading(e.name, value) || e.aliases.some((a) => leading(a, value))),
          value,
          'plain',
        ),
      // the same with diacritics stripped
      () =>
        rankByName(
          pool.filter(
            (e) =>
              leading(e.nameStripped, value) || e.aliasesStripped.some((a) => leading(a, value)),
          ),
          value,
          'stripped',
        ),
      // a term starts the query (iD keeps the order of the presets here)
      () => pool.filter((e) => e.terms.some((t) => leading(t, value))),
      // a tag value starts the query
      () => pool.filter((e) => e.values.some((v) => leading(v, value))),
      // close matches to the name (iD: edit distance, less the length difference, below 3), closest first
      () =>
        pool
          .map((entry) => ({ entry, dist: editDistance(valueStripped, entry.nameStripped) }))
          .filter(({ entry, dist }) => dist + Math.min(value.length - entry.name.length, 0) < 3)
          .sort((a, b) => a.dist - b.dist)
          .map(({ entry }) => entry),
      // close matches to a term
      () =>
        pool.filter((e) =>
          e.terms.some(
            (t, i) =>
              editDistance(valueStripped, e.termsStripped[i] ?? '') +
                Math.min(value.length - t.length, 0) <
              3,
          ),
        ),
      () => (value.includes('=') ? keyValueMatches(pool, value) : []),
      // the query contains the preset's name, e.g. "cafe near me"
      () => pool.filter((e) => e.texts.some((t) => nameInQuery(t, value))),
    ]
    // as iD: MAXRESULTS - 1 entries of the joined tiers are kept, duplicates included; a preset found twice takes two
    const room = limit - 1
    const taken: Preset[] = []
    for (const tier of tiers) {
      if (taken.length >= room) break
      for (const entry of tier()) {
        if (taken.length >= room) break
        if (placed(entry.preset)) taken.push(entry.preset)
      }
    }
    const found = [...new Set(taken)]
    const fallback = generic[geometry]
    if (!found.includes(fallback)) found.push(fallback)
    return found
  }

  // iD's needsAreaTag test in setTags: no tag of the preset is an area key (and it is not an exception).
  function needsAreaTag(preset: Preset) {
    for (const key of Object.keys(preset.addTags)) {
      const value = preset.addTags[key] ?? ''
      if (!preset.geometry.includes('line') && Object.hasOwn(areaKeys, key)) return false
      if (AREA_KEY_EXCEPTIONS.get(key)?.has(value)) return false
    }
    return true
  }

  /** The preset's own fields, not its moreFields: iD's preset.fields(). */
  function fieldsOf(preset: Preset) {
    return entries.get(preset.id)?.fields ?? []
  }

  /** The preset's own fields that hold at `loc` (iD's preset.fields(loc)). Without a `loc`, all of them. */
  function fieldsHere(preset: Preset, loc: LonLat | undefined) {
    return fieldsOf(preset).filter((field) => here(field.locationSet, loc))
  }

  // iD's setTags: the addTags (a `*` becomes yes unless an ancillary key already has a value), then area=yes
  // where needed, then the field defaults that are still missing. Returns a new object.
  function withPresetTags(
    tags: Tags,
    preset: Preset,
    geometry: Geometry,
    options: PresetOptions = {},
  ) {
    const result: Tags = { ...tags }
    for (const key of Object.keys(preset.addTags)) {
      const value = preset.addTags[key]
      if (value === undefined) continue
      if (value !== '*') {
        result[key] = value
      } else if (preset.tags[key] || !result[key]) {
        // iD: a key the preset matches on becomes `yes`; an ancillary key keeps an existing value.
        result[key] = 'yes'
      }
    }
    if (!Object.hasOwn(preset.addTags, 'area')) {
      delete result.area
      if (geometry === 'area' && needsAreaTag(preset)) result.area = 'yes'
    }
    // as iD's setTags: the defaults of the preset's own fields (not moreFields) that apply to the geometry and
    // to the location, when the key is not set. iD does not look at prerequisiteTag here.
    if (!options.skipFieldDefaults) {
      for (const field of fieldsHere(preset, options.loc)) {
        if (!field.key || !field.default || !fieldAppliesTo(field, geometry)) continue
        if (!result[field.key]) result[field.key] = field.default
      }
    }
    return result
  }

  // iD's unsetTags: the removeTags except the ignored keys, then the field defaults that still hold, then area.
  // Returns a new object.
  function withoutPresetTags(
    tags: Tags,
    preset: Preset,
    geometry: Geometry,
    ignoringKeys: readonly string[] = [],
    options: PresetOptions = {},
  ) {
    const result: Tags = { ...tags }
    for (const key of Object.keys(preset.removeTags)) {
      if (!ignoringKeys.includes(key)) delete result[key]
    }
    // as iD: a field whose default is undefined is skipped (iD compares `field.default === tags[key]`)
    if (!options.skipFieldDefaults) {
      for (const field of fieldsHere(preset, options.loc)) {
        if (!field.key || field.default === undefined || !fieldAppliesTo(field, geometry)) continue
        if (ignoringKeys.includes(field.key)) continue
        if (result[field.key] === field.default) delete result[field.key]
      }
    }
    delete result.area
    return result
  }

  // iD's preserveKeys in actionChangePreset: the keys of the new preset's addTags, and the keys of its fields
  // (fields and moreFields) that apply to the geometry. When the old preset is a sub-preset of the new one
  // (highway/service/driveway to highway/service), keys that define the old sub-preset are not kept.
  function preserveKeysOf(
    tags: Tags,
    preset: Preset,
    geometry: Geometry,
    previous: Preset,
    loc: LonLat | undefined,
  ) {
    const keys = new Set(Object.keys(preset.addTags))
    const wasSubPreset = previous.id.startsWith(preset.id)
    const newFields = [...fieldsOf(preset), ...(entries.get(preset.id)?.moreFields ?? [])]
    for (const field of newFields) {
      if (!fieldAppliesTo(field, geometry) || !here(field.locationSet, loc)) continue
      for (const key of allKeysOf(field, tags)) {
        if (wasSubPreset && Object.hasOwn(previous.tags, key)) continue
        keys.add(key)
      }
    }
    return [...keys]
  }

  // iD's actionChangePreset. Without a previous preset the new preset's tags are set. With one, its tags and
  // field keys are removed, except the keys that the new preset keeps. Field keys of the old preset that the
  // new one does not keep are removed only when the old preset no longer matches afterwards: a collective
  // preset (e.g. school with a building field) keeps the old tags. Returns a new object.
  // as iD: `skipFieldDefaults` applies to the new preset's setTags only. The removal of the old preset never
  // skips field defaults (iD passes `false` there).
  function applyPreset(
    tags: Tags,
    preset: Preset,
    geometry: Geometry,
    previous?: Preset,
    options: PresetOptions = {},
  ) {
    if (!previous) return withPresetTags(tags, preset, geometry, options)
    // as iD's actionChangePreset: the location is used everywhere, for the new preset's keys, the old preset's
    // field keys and both presets' defaults
    const loc = options.loc
    const removal: PresetOptions = { loc }
    const preserve = preserveKeysOf(tags, preset, geometry, previous, loc)
    let current = tags
    if (previous.id !== preset.id) {
      const previousEntry = entries.get(previous.id)
      const oldFields = [...(previousEntry?.fields ?? []), ...(previousEntry?.moreFields ?? [])]
      const keep = new Set(preserve)
      const removeKeys = new Set(
        oldFields
          .filter((field) => here(field.locationSet, loc))
          .flatMap((field) => allKeysOf(field, tags))
          .filter((key) => !keep.has(key)),
      )
      const reduced = withPresetTags(
        withoutPresetTags(withoutKeys(tags, removeKeys), previous, geometry, preserve, removal),
        preset,
        geometry,
        options,
      )
      if (matchScore(previous, reduced) === -1) current = reduced
    }
    return withPresetTags(
      withoutPresetTags(current, previous, geometry, preserve, removal),
      preset,
      geometry,
      options,
    )
  }

  // the type picker's defaults per geometry, categories included (defaults.ts)
  const defaults = createDefaults(data, (id) => entries.get(id)?.preset)

  return {
    match,
    preset: (id) => entries.get(id)?.preset,
    defaults,
    field: (id) => fields.get(id),
    fieldsFor,
    moreFieldsFor,
    matchesLocation: (locationSet, loc) => locations.matchesLocation(locationSet, loc),
    deprecatedTags: (tags) => deprecatedTagsOf(tags, deprecated),
    countryAt: (loc) => locations.countryAt(loc),
    areaKeys: () => areaKeys,
    search,
    matchScore: (preset, tags) => matchScore(preset, tags),
    // as iD: preset.matchGeometry and matchAllGeometry (F-presets-1; iD's preset list uses the second for a selection)
    matchGeometry: (preset, geometry) => preset.geometry.includes(geometry),
    matchAllGeometry: (preset, geometries) =>
      geometries.every((geometry) => preset.geometry.includes(geometry)),
    isFallback: (preset) => isFallbackTags(preset.tags),
    setTags: (tags, preset, geometry, options) => withPresetTags(tags, preset, geometry, options),
    unsetTags: (tags, preset, geometry, ignoringKeys, options) =>
      withoutPresetTags(tags, preset, geometry, ignoringKeys, options),
    applyPreset,
  }
}
