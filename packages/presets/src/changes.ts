/**
 * Changes to a preset data set, for a child app: `withChanges(base, changes)` returns a new PresetData with
 * the changes made, and `createPresets` builds the lookup from it as usual. It works on the raw data, so the
 * `{preset}` and template references and the labels resolve exactly as in the default data. The base is never
 * mutated.
 * See README.md, "Changing presets in a child app".
 */
import { asRecord, asStrings, isGeometry, own, referenceOf } from './raw.ts'
import type { RawRecord } from './raw.ts'
import type { Geometry, PresetData } from './types.ts'

/** Option labels: a record of value → English label, or a list of `{ value, label }` that keeps its order. */
export type FieldOptions =
  | Readonly<Record<string, string>>
  | ReadonlyArray<{ value: string; label: string }>

/** A field to add or to replace. It replaces the whole field with that id: give every property it should keep. */
export type FieldDefinition = {
  /** iD's field type, e.g. 'text', 'combo', 'check', 'radio', 'number' */
  type: string
  /** English label */
  label: string
  placeholder?: string
  key?: string
  keys?: readonly string[]
  options?: FieldOptions
  default?: string
  geometry?: readonly Geometry[]
  prerequisiteTag?: {
    key?: string
    value?: string
    values?: readonly string[]
    valueNot?: string
    valuesNot?: readonly string[]
    keyNot?: string
  }
  minValue?: number
  increment?: number
  universal?: boolean
  snakeCase?: boolean
  caseSensitive?: boolean
  customValues?: boolean
  urlFormat?: string
  pattern?: string
}

/** A preset to add or to replace. It replaces the whole preset with that id, its fields included. */
export type PresetDefinition = {
  /** English name */
  name: string
  tags: Readonly<Record<string, string>>
  geometry: readonly Geometry[]
  addTags?: Readonly<Record<string, string>>
  removeTags?: Readonly<Record<string, string>>
  icon?: string
  matchScore?: number
  /** false: not offered by search (it still matches) */
  searchable?: boolean
  terms?: readonly string[]
  aliases?: readonly string[]
  fields?: readonly string[]
  moreFields?: readonly string[]
}

/** A field id, or an id with `before` or `after` another field id in the list. Without either, the field goes last. */
export type FieldPlacement = string | { id: string; before?: string; after?: string }

/** A change to a preset that exists in the data. Each list edit is applied to the list the preset shows now. */
export type PresetEdit = {
  name?: string
  /** true: not offered by search, still matched. false: offered again. */
  hide?: boolean
  addFields?: readonly FieldPlacement[]
  removeFields?: readonly string[]
  /** Replaces the whole list, in this order. Cannot be combined with addFields or removeFields. */
  setFields?: readonly string[]
  addMoreFields?: readonly FieldPlacement[]
  removeMoreFields?: readonly string[]
  /** Replaces the whole list, in this order. Cannot be combined with addMoreFields or removeMoreFields. */
  setMoreFields?: readonly string[]
}

export type PresetChanges = {
  /** New or replaced fields, by id */
  fields?: Readonly<Record<string, FieldDefinition>>
  /** New or replaced presets, by id */
  presets?: Readonly<Record<string, PresetDefinition>>
  /** Changes to presets in the data, by id. Presets added in `presets` count as in the data. */
  presetEdits?: Readonly<Record<string, PresetEdit>>
  /** Fields offered for every feature (`universal`), by id */
  universalFields?: { add?: readonly string[]; remove?: readonly string[] }
}

type Report = (path: string, message: string) => void

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const CHANGE_KEYS = ['fields', 'presets', 'presetEdits', 'universalFields']
const FIELD_KEYS = [
  'type',
  'label',
  'placeholder',
  'key',
  'keys',
  'options',
  'default',
  'geometry',
  'prerequisiteTag',
  'minValue',
  'increment',
  'universal',
  'snakeCase',
  'caseSensitive',
  'customValues',
  'urlFormat',
  'pattern',
]
const PREREQUISITE_TEXT_KEYS = ['key', 'value', 'valueNot', 'keyNot']
const PREREQUISITE_LIST_KEYS = ['values', 'valuesNot']
const PREREQUISITE_KEYS = [...PREREQUISITE_TEXT_KEYS, ...PREREQUISITE_LIST_KEYS]
const PRESET_KEYS = [
  'name',
  'tags',
  'geometry',
  'addTags',
  'removeTags',
  'icon',
  'matchScore',
  'searchable',
  'terms',
  'aliases',
  'fields',
  'moreFields',
]
const EDIT_KEYS = [
  'name',
  'hide',
  'addFields',
  'removeFields',
  'setFields',
  'addMoreFields',
  'removeMoreFields',
  'setMoreFields',
]
const PLACEMENT_KEYS = ['id', 'before', 'after']

/**
 * Applies the changes to a copy of `base` and returns it. Throws one error that lists every problem, each with
 * the path of the change it is in and the id it names: an unknown preset or field id is an error, not a no-op.
 */
export function withChanges(base: PresetData, changes: PresetChanges): PresetData {
  const problems: string[] = []
  const report: Report = (path, message) => {
    problems.push(`${path}: ${message}`)
  }
  const input: RawRecord = isRecord(changes) ? changes : {}
  if (!isRecord(changes)) report('changes', 'must be an object')
  checkKeys(input, CHANGE_KEYS, 'changes', report)

  // Copies of the containers. Only the entries a change touches are replaced; the others stay shared with the base.
  const fields: RawRecord = { ...base.fields }
  const presets: RawRecord = { ...base.presets }
  const root: RawRecord = { ...asRecord(base.translations) }
  const en: RawRecord = { ...asRecord(root.en) }
  const section: RawRecord = { ...asRecord(en.presets) }
  const trFields: RawRecord = { ...asRecord(section.fields) }
  const trPresets: RawRecord = { ...asRecord(section.presets) }
  const hasField = (id: string) => Object.hasOwn(fields, id)

  // 1. fields first: presets and universal fields may refer to them
  for (const [id, value] of entriesOf(input.fields, 'fields', report)) {
    const definition = fieldOf(`fields["${id}"]`, value, report)
    if (definition === undefined) continue
    fields[id] = definition.raw
    trFields[id] = definition.text
  }

  // 2. new and replaced presets
  for (const [id, value] of entriesOf(input.presets, 'presets', report)) {
    const definition = presetOf(`presets["${id}"]`, value, hasField, report)
    if (definition === undefined) continue
    presets[id] = definition.raw
    trPresets[id] = { name: definition.name }
  }

  // 3. edits to presets in the data. as iD: a preset that ends with no fields shows none (no inheritance)
  for (const [id, value] of entriesOf(input.presetEdits, 'presetEdits', report)) {
    const path = `presetEdits["${id}"]`
    if (!Object.hasOwn(presets, id)) {
      report(path, unknownPreset(id))
      continue
    }
    if (!isRecord(value)) {
      report(path, 'must be an object')
      continue
    }
    checkKeys(value, EDIT_KEYS, path, report)
    const raw: RawRecord = { ...asRecord(presets[id]) }
    const name = readString(value, 'name', path, report)
    if (name !== undefined) trPresets[id] = { ...asRecord(own(trPresets, id)), name }
    const hide = readBoolean(value, 'hide', path, report)
    if (hide !== undefined) raw.searchable = !hide
    for (const which of ['fields', 'moreFields'] as const) {
      const edit = listEditOf(value, which, path, report)
      if (edit === undefined) continue
      const next = applyListEdit(listOf(presets, fields, id, which), edit, path, hasField, report)
      if (next === undefined) continue
      raw[which] = next
    }
    presets[id] = raw
  }

  // 4. universal fields
  const universal = input.universalFields
  if (universal !== undefined) {
    if (!isRecord(universal)) {
      report('universalFields', 'must be an object with add and remove lists')
    } else {
      checkKeys(universal, ['add', 'remove'], 'universalFields', report)
      const add = readStrings(universal, 'add', 'universalFields', report) ?? []
      const remove = readStrings(universal, 'remove', 'universalFields', report) ?? []
      for (const id of add.filter((item) => remove.includes(item))) {
        report('universalFields', `"${id}" is in both add and remove`)
      }
      for (const [ids, flag] of [
        [add, true],
        [remove, false],
      ] as const) {
        for (const [index, id] of ids.entries()) {
          const path = `universalFields.${flag ? 'add' : 'remove'}[${index}]`
          if (!hasField(id)) report(path, unknownField(id))
          else fields[id] = { ...asRecord(fields[id]), universal: flag }
        }
      }
    }
  }

  if (problems.length > 0) {
    const count = problems.length === 1 ? '1 problem' : `${problems.length} problems`
    throw new Error(
      `withChanges: ${count} in the preset changes:\n${problems.map((line) => `  - ${line}`).join('\n')}`,
    )
  }
  return {
    // the other entries of the base (the deprecated list) stay as they are
    ...base,
    presets,
    fields,
    translations: {
      ...root,
      en: { ...en, presets: { ...section, fields: trFields, presets: trPresets } },
    },
  }
}

// ---- definitions: shape checks, then the raw record that createPresets reads ----

function fieldOf(path: string, value: unknown, report: Report) {
  if (!isRecord(value)) {
    report(path, 'must be an object')
    return undefined
  }
  checkKeys(value, FIELD_KEYS, path, report)
  if (value.type === undefined) report(path, 'type is required, e.g. "text", "combo" or "check"')
  if (value.label === undefined) report(path, 'label is required: the English text')
  const options = readOptions(value, 'options', path, report)
  const raw: RawRecord = {
    type: readString(value, 'type', path, report),
    key: readString(value, 'key', path, report),
    keys: readStrings(value, 'keys', path, report),
    options: options?.map((option) => option.value),
    default: readString(value, 'default', path, report),
    geometry: readGeometries(value, 'geometry', path, report),
    prerequisiteTag: readPrerequisite(value, 'prerequisiteTag', path, report),
    minValue: readNumber(value, 'minValue', path, report),
    increment: readNumber(value, 'increment', path, report),
    universal: readBoolean(value, 'universal', path, report),
    snake_case: readBoolean(value, 'snakeCase', path, report),
    caseSensitive: readBoolean(value, 'caseSensitive', path, report),
    customValues: readBoolean(value, 'customValues', path, report),
    urlFormat: readString(value, 'urlFormat', path, report),
    pattern: readString(value, 'pattern', path, report),
  }
  // the English texts go to the translation section, where createPresets looks for them first
  const text: RawRecord = { label: readString(value, 'label', path, report) }
  const placeholder = readString(value, 'placeholder', path, report)
  if (placeholder !== undefined) text.placeholder = placeholder
  if (options !== undefined) {
    text.options = Object.fromEntries(options.map((option) => [option.value, option.label]))
  }
  return { raw, text }
}

function presetOf(path: string, value: unknown, hasField: (id: string) => boolean, report: Report) {
  if (!isRecord(value)) {
    report(path, 'must be an object')
    return undefined
  }
  checkKeys(value, PRESET_KEYS, path, report)
  if (value.name === undefined) report(path, 'name is required: the English name')
  if (value.tags === undefined) report(path, 'tags is required, {} for none')
  if (value.geometry === undefined) report(path, 'geometry is required, e.g. ["line"]')
  const geometry = readGeometries(value, 'geometry', path, report)
  if (geometry !== undefined && geometry.length === 0) {
    report(`${path}.geometry`, 'needs at least one of point, vertex, line, area, relation')
  }
  const fieldIds = readStrings(value, 'fields', path, report)
  const moreFieldIds = readStrings(value, 'moreFields', path, report)
  checkFieldIds(fieldIds, `${path}.fields`, hasField, report)
  checkFieldIds(moreFieldIds, `${path}.moreFields`, hasField, report)
  const raw: RawRecord = {
    tags: readTags(value, 'tags', path, report),
    geometry,
    addTags: readTags(value, 'addTags', path, report),
    removeTags: readTags(value, 'removeTags', path, report),
    icon: readString(value, 'icon', path, report),
    matchScore: readNumber(value, 'matchScore', path, report),
    searchable: readBoolean(value, 'searchable', path, report),
    terms: readStrings(value, 'terms', path, report),
    aliases: readStrings(value, 'aliases', path, report),
    fields: fieldIds,
    moreFields: moreFieldIds,
  }
  return { raw, name: readString(value, 'name', path, report) ?? '' }
}

// ---- preset edits: the lists ----

type ListEdit = {
  set?: readonly string[]
  add?: readonly FieldPlacement[]
  remove?: readonly string[]
  /** the names of the three keys in the change, for the error paths */
  keys: readonly [string, string, string]
}

function listEditOf(
  value: RawRecord,
  which: 'fields' | 'moreFields',
  path: string,
  report: Report,
) {
  const keys: readonly [string, string, string] =
    which === 'fields'
      ? ['setFields', 'addFields', 'removeFields']
      : ['setMoreFields', 'addMoreFields', 'removeMoreFields']
  const [setKey, addKey, removeKey] = keys
  const set = readStrings(value, setKey, path, report)
  const add = readPlacements(value, addKey, path, report)
  const remove = readStrings(value, removeKey, path, report)
  if (set !== undefined && (add !== undefined || remove !== undefined)) {
    report(path, `${setKey} cannot be combined with ${addKey} or ${removeKey}`)
    return undefined
  }
  if (set === undefined && add === undefined && remove === undefined) return undefined
  return { set, add, remove, keys }
}

/** The ids a preset shows for `which`, as createPresets resolves them: `{preset}` and template references expanded. */
function listOf(
  presets: RawRecord,
  fields: RawRecord,
  id: string,
  which: 'fields' | 'moreFields',
  stack: Set<string> = new Set(),
) {
  if (stack.has(id)) return []
  stack.add(id)
  const listed = asStrings(asRecord(own(presets, id))?.[which]) ?? []
  const ids: string[] = []
  for (const entry of listed) {
    const reference = referenceOf(entry)
    if (reference !== undefined) ids.push(...listOf(presets, fields, reference, which, stack))
    else if (Object.hasOwn(fields, entry)) ids.push(entry)
  }
  stack.delete(id)
  return [...new Set(ids)]
}

/** The list after the edit, or undefined when the edit has a problem (reported). */
function applyListEdit(
  current: readonly string[],
  edit: ListEdit,
  path: string,
  hasField: (id: string) => boolean,
  report: Report,
) {
  const [setKey, addKey, removeKey] = edit.keys
  if (edit.set !== undefined) {
    checkFieldIds(edit.set, `${path}.${setKey}`, hasField, report)
    return [...edit.set]
  }
  let list = [...current]
  for (const [index, id] of (edit.remove ?? []).entries()) {
    const at = `${path}.${removeKey}[${index}]`
    if (!list.includes(id)) report(at, `"${id}" is not in the list`)
    else list = list.filter((item) => item !== id)
  }
  for (const [index, placement] of (edit.add ?? []).entries()) {
    const at = `${path}.${addKey}[${index}]`
    const { id, before, after } = typeof placement === 'string' ? { id: placement } : placement
    if (!hasField(id)) {
      report(at, unknownField(id))
      continue
    }
    if (list.includes(id)) {
      report(at, `"${id}" is already in the list; use ${setKey} to change the order`)
      continue
    }
    if (before !== undefined && after !== undefined) {
      report(at, 'give before or after, not both')
      continue
    }
    const anchor = before ?? after
    if (anchor === undefined) {
      list.push(id)
      continue
    }
    const position = list.indexOf(anchor)
    if (position === -1) {
      report(at, `"${anchor}" is not in the list`)
      continue
    }
    list.splice(before !== undefined ? position : position + 1, 0, id)
  }
  return list
}

// ---- reading values: each reports a wrong type and returns undefined ----

function entriesOf(value: unknown, path: string, report: Report) {
  if (value === undefined) return []
  if (!isRecord(value)) {
    report(path, 'must be an object, keyed by id')
    return []
  }
  return Object.entries(value)
}

function checkKeys(value: RawRecord, allowed: readonly string[], path: string, report: Report) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key))
      report(path, `unknown key "${key}" (allowed: ${allowed.join(', ')})`)
  }
}

function checkFieldIds(
  ids: readonly string[] | undefined,
  path: string,
  hasField: (id: string) => boolean,
  report: Report,
) {
  ids?.forEach((id, index) => {
    if (!hasField(id)) report(`${path}[${index}]`, unknownField(id))
  })
}

function unknownField(id: string) {
  return `no field "${id}" (define it in fields, or check the id)`
}

function unknownPreset(id: string) {
  return `no preset "${id}" in the data (define it in presets, or check the id)`
}

function readString(obj: RawRecord, key: string, path: string, report: Report) {
  const value = obj[key]
  if (value === undefined || typeof value === 'string') return value
  report(`${path}.${key}`, 'must be text')
  return undefined
}

function readBoolean(obj: RawRecord, key: string, path: string, report: Report) {
  const value = obj[key]
  if (value === undefined || typeof value === 'boolean') return value
  report(`${path}.${key}`, 'must be true or false')
  return undefined
}

function readNumber(obj: RawRecord, key: string, path: string, report: Report) {
  const value = obj[key]
  if (value === undefined || (typeof value === 'number' && Number.isFinite(value))) return value
  report(`${path}.${key}`, 'must be a number')
  return undefined
}

function readStrings(obj: RawRecord, key: string, path: string, report: Report) {
  const value = obj[key]
  if (value === undefined) return undefined
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return [...value]
  report(`${path}.${key}`, 'must be a list of text')
  return undefined
}

function readGeometries(obj: RawRecord, key: string, path: string, report: Report) {
  const value = obj[key]
  if (value === undefined) return undefined
  if (Array.isArray(value) && value.every(isGeometry)) return [...value]
  report(`${path}.${key}`, 'must be a list of point, vertex, line, area or relation')
  return undefined
}

function readTags(obj: RawRecord, key: string, path: string, report: Report) {
  const value = obj[key]
  if (value === undefined) return undefined
  if (isRecord(value) && Object.values(value).every((item) => typeof item === 'string')) {
    return Object.fromEntries(Object.entries(value).map(([tag, text]) => [tag, String(text)]))
  }
  report(`${path}.${key}`, 'must be an object of tag keys to tag values (text)')
  return undefined
}

function readPrerequisite(obj: RawRecord, key: string, path: string, report: Report) {
  const value = obj[key]
  if (value === undefined) return undefined
  const at = `${path}.${key}`
  if (!isRecord(value)) {
    report(at, `must be an object with ${PREREQUISITE_KEYS.join(', ')}`)
    return undefined
  }
  checkKeys(value, PREREQUISITE_KEYS, at, report)
  const picked: Record<string, string | string[]> = {}
  for (const name of PREREQUISITE_TEXT_KEYS) {
    const text = readString(value, name, at, report)
    if (text !== undefined) picked[name] = text
  }
  for (const name of PREREQUISITE_LIST_KEYS) {
    const list = readStrings(value, name, at, report)
    if (list !== undefined) picked[name] = list
  }
  return picked
}

function readPlacements(obj: RawRecord, key: string, path: string, report: Report) {
  const value = obj[key]
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    report(`${path}.${key}`, 'must be a list')
    return undefined
  }
  // The callback returns a bare id or a placement: the annotation names the array type, since inference unites two array types and fails.
  return value.flatMap((item, index): FieldPlacement[] => {
    const at = `${path}.${key}[${index}]`
    if (typeof item === 'string') return [item]
    if (!isRecord(item)) {
      report(at, 'must be a field id, or {id, before} or {id, after}')
      return []
    }
    checkKeys(item, PLACEMENT_KEYS, at, report)
    const id = readString(item, 'id', at, report)
    if (id === undefined) {
      report(at, 'id is required')
      return []
    }
    const before = readString(item, 'before', at, report)
    const after = readString(item, 'after', at, report)
    const placement: { id: string; before?: string; after?: string } = { id }
    if (before !== undefined) placement.before = before
    if (after !== undefined) placement.after = after
    return [placement]
  })
}

function readOptions(obj: RawRecord, key: string, path: string, report: Report) {
  const value = obj[key]
  if (value === undefined) return undefined
  const at = `${path}.${key}`
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => {
      if (
        isRecord(item) &&
        typeof item.value === 'string' &&
        typeof item.label === 'string' &&
        item.value !== ''
      ) {
        return [{ value: item.value, label: item.label }]
      }
      report(`${at}[${index}]`, 'must be {value, label}, both text, with a value')
      return []
    })
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([optionValue, label]) => {
      if (typeof label === 'string' && optionValue !== '') return [{ value: optionValue, label }]
      report(`${at}["${optionValue}"]`, 'the label must be text')
      return []
    })
  }
  report(at, 'must be an object of value to label, or a list of {value, label}')
  return undefined
}
