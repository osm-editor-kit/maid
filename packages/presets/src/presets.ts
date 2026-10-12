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
// Not ported: location sets (`locationSet` is ignored, so a preset that iD would hide outside its
// area is matched everywhere), categories, defaults, recents, search, preferences, the file fetcher,
// and the localizer (labels come straight from the English translation).
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

  return {
    match,
    preset: (id) => entries.get(id)?.preset,
    field: (id) => fields.get(id),
    fieldsFor,
    areaKeys: () => areaKeys,
  }
}
