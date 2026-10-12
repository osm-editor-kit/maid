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
// Port of the matching and field logic of iD's modules/presets (index.js, preset.ts, collection.ts, field.ts).
// Search (collection.ts `search`) and applyPreset (preset.ts `setTags`, `unsetTags`) are ported too,
// without the fuzzy tiers, field defaults and location sets.
// Not ported: location sets (`locationSet` is ignored, so a preset that iD would hide outside its
// area is matched everywhere), categories, field defaults, recents, the fuzzy (edit distance) search
// tiers, suggestion presets (none in the bundled data), preferences, the file fetcher, and the
// localizer (labels come straight from the English translation).
import type { Field, FieldOption, Geometry, Preset, PresetData, Presets, Tags } from './types.ts'

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
function translationSection(translations: unknown, section: 'presets' | 'fields'): RawRecord {
  const en = asRecord(asRecord(translations)?.en)
  const presets = asRecord(en?.presets)
  return asRecord(presets?.[section]) ?? {}
}

function textOf(section: RawRecord, id: string, key: string): string | undefined {
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
): { owner: string; text: string } | undefined {
  if (seen.has(id)) return undefined
  seen.add(id)
  const text = lookup(id)
  if (text === undefined) return undefined
  const ref = referenceOf(text)
  if (ref === undefined) return { owner: id, text }
  return resolveText(lookup, ref, seen)
}

function tagValue(tags: Tags, key: string): string {
  const value: unknown = tags[key]
  return typeof value === 'string' ? value : ''
}

/** iD's prerequisiteTag check (modules/ui/field.js). An absent tag counts as ''. */
function prerequisiteHolds(prerequisite: PrerequisiteTag | undefined, tags: Tags): boolean {
  if (!prerequisite) return true
  if (prerequisite.key !== undefined) {
    const value = tagValue(tags, prerequisite.key)
    if (prerequisite.valueNot) return prerequisite.valueNot !== value
    if (prerequisite.value) return prerequisite.value === value
    return value !== ''
  }
  if (prerequisite.keyNot) return tagValue(tags, prerequisite.keyNot) === ''
  return true
}

function fieldHasValue(field: Field, tags: Tags): boolean {
  if (field.key !== undefined && tagValue(tags, field.key) !== '') return true
  return (field.keys ?? []).some((key) => tagValue(tags, key) !== '')
}

function fieldAppliesTo(field: Field, geometry: Geometry): boolean {
  return field.geometry === undefined || field.geometry.includes(geometry)
}

/** iD's presetPreset.matchScore: -1 when a tag of the preset is missing or different. */
function matchScore(preset: Preset, entityTags: Tags): number {
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

function isFallbackTags(tags: Tags): boolean {
  const keys = Object.keys(tags)
  return keys.length === 0 || (keys.length === 1 && keys[0] === 'area')
}

/** A translation list: `text` split on `separator` (iD's `terms` are comma separated, `aliases` newline separated), else the raw array. */
function wordList(text: string | undefined, separator: string, fallback: unknown): string[] {
  const words = text !== undefined ? text.split(separator) : (asStrings(fallback) ?? [])
  return words.map((word) => word.trim()).filter((word) => word !== '')
}

/** iD's utilStripDiacritics. */
function stripDiacritics(text: string): string {
  return text.normalize('NFD').replace(/\p{Dia}/gu, '')
}

/** iD's `leading`: the text starts with `value`, or has it after a space (e.g. "office" in "Law Office"). */
function leading(text: string, value: string): boolean {
  const index = text.indexOf(value)
  return index === 0 || (index > 0 && text[index - 1] === ' ')
}

/** iD's `presetInSearchTerm`: the query starts with the preset's name, or has it after a space. */
function nameInQuery(name: string, value: string): boolean {
  if (name.length === 0) return false
  const index = value.indexOf(name)
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

/** What search needs about one preset, lower-cased once when the presets are built. */
type SearchEntry = {
  preset: Preset
  name: string
  nameStripped: string
  aliases: string[]
  aliasesStripped: string[]
  terms: string[]
  /** tag values other than `*` */
  values: string[]
  /** `key=value` for tags and addTags */
  keyValues: string[]
  /** name, aliases, terms and stripped names: the texts that a query can contain */
  texts: string[]
}

function searchEntryOf(preset: Preset): SearchEntry {
  const name = preset.name.toLowerCase()
  const nameStripped = stripDiacritics(name)
  const aliases = preset.aliases.map((alias) => alias.toLowerCase())
  const aliasesStripped = aliases.map((alias) => stripDiacritics(alias))
  const values = Object.values(preset.tags)
    .filter((value) => value !== '*')
    .map((value) => value.toLowerCase())
  const keyValues = [
    ...new Set(
      [...Object.entries(preset.tags), ...Object.entries(preset.addTags)].map(([key, value]) =>
        `${key}=${value}`.toLowerCase(),
      ),
    ),
  ]
  const texts = [name, ...aliases, ...preset.terms, nameStripped, ...aliasesStripped]
  return {
    preset,
    name,
    nameStripped,
    aliases,
    aliasesStripped,
    terms: preset.terms,
    values,
    keyValues,
    texts,
  }
}

function byNameThenId(a: SearchEntry, b: SearchEntry): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  return a.preset.id < b.preset.id ? -1 : 1
}

/** iD's findMatchingAlias: the name or alias that equals the query, else the shortest one that contains it. */
function bestText(value: string, names: string[]): string {
  if (names.includes(value)) return value
  const containing = names.filter((name) => name.includes(value))
  containing.sort((a, b) => a.length - b.length)
  return containing[0] ?? names[0] ?? ''
}

/** iD's sortPresets: an exact match first, then the higher matchScore, then the earlier position, then the shorter text. */
function rankByName(
  entries: SearchEntry[],
  value: string,
  variant: 'plain' | 'stripped',
): SearchEntry[] {
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

/** iD's key=value tier: exact matches first, then those that start with the query. */
function keyValueMatches(pool: SearchEntry[], value: string): SearchEntry[] {
  const exact = pool.filter((entry) => entry.keyValues.includes(value))
  const prefix = pool.filter((entry) => entry.keyValues.some((kv) => leading(kv, value)))
  return [...exact, ...prefix]
}

function mustGet<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`presets: missing generic preset ${what}`)
  return value
}

export function createPresets(data: PresetData): Presets {
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

  function buildField(id: string, raw: RawRecord): Field {
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
    return field
  }

  // iD's option label: the translation of the field the label points to, then of the field itself.
  function optionText(owner: string, id: string, value: string): string {
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

  function parentOf(id: string): string | undefined {
    const slash = id.lastIndexOf('/')
    return slash > 0 ? id.slice(0, slash) : undefined
  }

  // Expands `{preset}` and `{@templates/x}` references and inherits `fields` from the parent preset
  // when a preset has none of its own. Memoized per preset and list; a cycle resolves to nothing.
  const memo: Record<Which, Map<string, Field[]>> = { fields: new Map(), moreFields: new Map() }
  const stack = new Set<string>()
  function resolveList(presetId: string, which: Which): Field[] {
    const cached = memo[which].get(presetId)
    if (cached) return cached
    if (stack.has(presetId)) return []
    stack.add(presetId)
    const listed = asStrings(rawPresets.get(presetId)?.[which])
    const resolved: Field[] = []
    if (listed && listed.length > 0) {
      for (const entry of listed) {
        const ref = referenceOf(entry)
        if (ref !== undefined) {
          resolved.push(...resolveList(ref, which))
          continue
        }
        const field = fields.get(entry)
        if (field) resolved.push(field)
      }
    } else if (which === 'fields') {
      const parent = parentOf(presetId)
      if (parent !== undefined) resolved.push(...resolveList(parent, which))
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

  function match(tags: Tags, geometry: Geometry): Preset {
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

  function fieldsFor(preset: Preset, tags: Tags, geometry: Geometry): Field[] {
    const entry = entries.get(preset.id)
    const result: Field[] = []
    const seen = new Set<string>()
    const add = (field: Field) => {
      if (seen.has(field.id)) return
      seen.add(field.id)
      result.push(field)
    }
    // 1. the preset's fields; iD also keeps a field whose key already has a value, prerequisite or not
    for (const field of entry?.fields ?? []) {
      if (!fieldAppliesTo(field, geometry)) continue
      if (fieldHasValue(field, tags) || prerequisiteHolds(field.prerequisiteTag, tags)) add(field)
    }
    // 2. moreFields and universal fields that have a value
    for (const field of entry?.moreFields ?? []) {
      if (fieldAppliesTo(field, geometry) && fieldHasValue(field, tags)) add(field)
    }
    for (const field of universal) {
      if (fieldAppliesTo(field, geometry) && fieldHasValue(field, tags)) add(field)
    }
    return result
  }

  function moreFieldsFor(preset: Preset, tags: Tags, geometry: Geometry): Field[] {
    const entry = entries.get(preset.id)
    const shown = new Set(fieldsFor(preset, tags, geometry).map((field) => field.id))
    const seen = new Set<string>()
    const offered: Field[] = []
    for (const field of [...(entry?.moreFields ?? []), ...universal]) {
      if (seen.has(field.id) || shown.has(field.id)) continue
      seen.add(field.id)
      if (fieldAppliesTo(field, geometry) && prerequisiteHolds(field.prerequisiteTag, tags)) {
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

  // iD's collection.search: the tiers in iD's order, each tier ranked as iD ranks it; a preset is listed once.
  function search(query: string, geometry: Geometry, limit = 20): Preset[] {
    if (limit <= 0) return []
    const value = query.toLowerCase().trim()
    if (value === '') return byName[geometry].slice(0, limit)
    const pool = searchIndex[geometry]
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
      () => pool.filter((e) => e.terms.some((t) => leading(t, value))),
      () => pool.filter((e) => e.values.some((v) => leading(v, value))),
      () => (value.includes('=') ? keyValueMatches(pool, value) : []),
      // the query contains the preset's name, e.g. "cafe near me"
      () => pool.filter((e) => e.texts.some((t) => nameInQuery(t, value))),
    ]
    const found: Preset[] = []
    const seen = new Set<Preset>()
    for (const tier of tiers) {
      for (const entry of tier()) {
        if (seen.has(entry.preset)) continue
        seen.add(entry.preset)
        found.push(entry.preset)
        if (found.length >= limit) return found
      }
    }
    return found
  }

  // iD's needsAreaTag test in setTags: no tag of the preset is an area key (and it is not an exception).
  function needsAreaTag(preset: Preset): boolean {
    for (const key of Object.keys(preset.addTags)) {
      const value = preset.addTags[key] ?? ''
      if (!preset.geometry.includes('line') && Object.hasOwn(areaKeys, key)) return false
      if (AREA_KEY_EXCEPTIONS.get(key)?.has(value)) return false
    }
    return true
  }

  // iD's setTags. Field defaults are not applied (iD's skipFieldDefaults), because they need the field
  // definitions for the location and the user's preferences, which this package does not have.
  function withPresetTags(tags: Tags, preset: Preset, geometry: Geometry): Tags {
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
    return result
  }

  // iD's unsetTags, minus field defaults. Keys the new preset sets are kept here, because the new
  // preset overwrites them anyway. iD's unsetTags also deletes `area`; withPresetTags decides it again.
  function withoutTagsOf(tags: Tags, previous: Preset, next: Preset): Tags {
    const result: Tags = { ...tags }
    for (const key of Object.keys(previous.removeTags)) {
      if (!Object.hasOwn(next.addTags, key)) delete result[key]
    }
    return result
  }

  function applyPreset(tags: Tags, preset: Preset, geometry: Geometry, previous?: Preset): Tags {
    const kept = previous ? withoutTagsOf(tags, previous, preset) : { ...tags }
    return withPresetTags(kept, preset, geometry)
  }

  return {
    match,
    preset: (id) => entries.get(id)?.preset,
    field: (id) => fields.get(id),
    fieldsFor,
    moreFieldsFor,
    areaKeys: () => areaKeys,
    search,
    applyPreset,
  }
}
