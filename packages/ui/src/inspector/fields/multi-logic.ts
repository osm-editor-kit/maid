import type { Field, FieldOption, Tags } from '@osm-editor-kit/maid-presets'
import { cleanValue, isUnsetOption, MAX_VALUE_LENGTH, valueLength } from '../logic.ts'
import { matchLabel, valueFromText } from './combo-logic.ts'
import { mixedOf } from './mixed-logic.ts'
import type { CombinedTags, MixedValue } from './shared.ts'

/*
 * Pure logic of the multi-value combos: semiCombo (one tag, values joined with ';'), multiCombo
 * (one tag per chosen value, `key:value=yes`) and manyCombo (one yes/no tag per key). The
 * components in Multi.tsx only call these.
 */

function unique(values: readonly string[]) {
  return [...new Set(values)]
}

// ---------------------------------------------------------------- semiCombo

/** The values of one tag: split at ';', trimmed, empty ones dropped. Order and duplicates kept. */
export function semiList(value: string | undefined) {
  if (value === undefined) return []
  return value
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

/** The pieces of a typed text: a comma or a semicolon separates them. Empty pieces are dropped. */
export function semiValues(text: string) {
  return text
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

/** The text after the last separator: what the list filters by while several values are typed. */
export function afterLastSeparator(text: string) {
  const cut = Math.max(text.lastIndexOf(','), text.lastIndexOf(';'))
  return cut < 0 ? text : text.slice(cut + 1)
}

/**
 * The tag value for a list of values: joined with ';', cleaned as every tag value is (not cut: a
 * longer text is saved as typed and the save is blocked). No values removes the tag.
 */
export function semiWrite(values: readonly string[]) {
  return cleanValue(values.join(';'))
}

/**
 * The chips of a semiCombo over several features. A value that every feature has is a plain chip; a value that
 * only some have (it is missing from a distinct value of the key, or some feature lacks the key) is `some`.
 * Without a mixed key the chips are the one value's list, all plain.
 */
export function semiChips(value: string | undefined, mixed: MixedValue | undefined) {
  if (mixed === undefined) return semiList(value).map((piece) => ({ value: piece, some: false }))
  const lists = mixed.values.map((text) => semiList(text))
  const pieces = unique(lists.flat())
  return pieces.map((piece) => ({
    value: piece,
    some: mixed.missing || lists.some((list) => !list.includes(piece)),
  }))
}

/** The list fills the 255 characters: no value can be added and the input hides. */
export function semiFull(values: readonly string[]) {
  return valueLength(semiWrite(values) ?? '') >= MAX_VALUE_LENGTH
}

/**
 * The list after a typed text is accepted. Each piece is spelled as a combo spells a typed text
 * (a label becomes its value; refused and empty pieces are dropped). Duplicates are removed, as
 * iD does unless a field allows them.
 */
export function addSemi(field: Field, current: readonly string[], typed: string) {
  const added: string[] = []
  for (const piece of semiValues(typed)) {
    const write = valueFromText(field, piece)
    if (write === 'refused' || write.value === undefined) continue
    added.push(write.value)
  }
  return unique([...current, ...added])
}

/**
 * The list after the list was accepted with an option picked from it. The option is added as it
 * is (no spelling); the text before the last separator is added as typed.
 */
export function acceptSemi(
  field: Field,
  current: readonly string[],
  typed: string,
  option?: FieldOption,
) {
  if (option === undefined) return addSemi(field, current, typed)
  const cut = Math.max(typed.lastIndexOf(','), typed.lastIndexOf(';'))
  const before = cut < 0 ? '' : typed.slice(0, cut)
  return unique([...addSemi(field, current, before), option.value])
}

/** The list without the value at the index. Index based, so equal values are removed one at a time. */
export function removeSemi(current: readonly string[], index: number) {
  return current.filter((_, position) => position !== index)
}

/** The options a semi list still offers: those whose value is not chosen yet. */
export function semiOptions(field: Field, current: readonly string[]) {
  return field.options.filter((option) => !isUnsetOption(option) && !current.includes(option.value))
}

// ---------------------------------------------------------------- multiCombo

/** The state of a chip's value: yes and no are the checkbox states, anything else is mixed. */
export type ChipState = 'yes' | 'no' | 'other'

export function chipState(value: string): ChipState {
  const lower = value.toLowerCase()
  if (lower === 'yes') return 'yes'
  if (lower === 'no') return 'no'
  return 'other'
}

/**
 * The key prefix of a multiCombo: its key with a ':' at the end (iD adds it, combo.js:57-60).
 * Undefined without a key or with an empty one.
 */
export function multiPrefix(field: Pick<Field, 'key'>) {
  if (field.key === undefined || field.key === '') return undefined
  return field.key.endsWith(':') ? field.key : `${field.key}:`
}

/**
 * The tag a chosen suffix stands for. Undefined when the suffix is empty: a multiCombo never
 * writes the bare prefix as a tag (the `payment:` bug).
 */
export function multiKey(field: Pick<Field, 'key'>, suffix: string) {
  const prefix = multiPrefix(field)
  if (prefix === undefined || suffix === '') return undefined
  return `${prefix}${suffix}`
}

/**
 * The suffix a typed text stands for: a label becomes its option's value, any other text is
 * spelled as a combo spells it. Undefined when nothing is left.
 */
export function multiSuffix(field: Field, typed: string) {
  const write = valueFromText(field, typed)
  if (write === 'refused') return undefined
  return write.value
}

/** One chip of a multiCombo: a tag `prefix + suffix` with a value. */
export type MultiChip = {
  key: string
  suffix: string
  value: string
  /** The label of the suffix's option, else the raw suffix */
  label: string
  /** The suffix is not one of the options: the label is shown in italics */
  raw: boolean
  state: ChipState
}

/**
 * The chips of a multiCombo: every tag that starts with the prefix and has a value. The bare
 * prefix is not a chip. Chips follow the options' order; unknown suffixes come last, in tag order.
 */
export function multiChosen(field: Field, tags: Tags) {
  const prefix = multiPrefix(field)
  if (prefix === undefined) return []
  const chips: MultiChip[] = []
  for (const [key, value] of Object.entries(tags)) {
    if (!key.startsWith(prefix) || value === '') continue
    const suffix = key.slice(prefix.length)
    if (suffix === '') continue
    const option = field.options.find((candidate) => candidate.value === suffix)
    chips.push({
      key,
      suffix,
      value,
      label: option?.label ?? suffix,
      raw: option === undefined,
      state: chipState(value),
    })
  }
  return chips.sort((a, b) => optionRank(field, a.suffix) - optionRank(field, b.suffix))
}

/** The state of a mixed key's chip: its value when there is one value, else other (a dash). */
function mixedState(mixed: MixedValue): ChipState {
  const [only] = mixed.values
  return mixed.values.length === 1 && only !== undefined ? chipState(only) : 'other'
}

function optionRank(field: Pick<Field, 'options'>, value: string) {
  const index = field.options.findIndex((option) => option.value === value)
  return index < 0 ? field.options.length : index
}

/**
 * The write that chooses a suffix. It is `yes`, unless the tag has a value other than `no`:
 * then the value stays (iD keeps `language:de=main`). Undefined when nothing is to be written.
 */
export function multiAdd(field: Field, tags: Tags, suffix: string) {
  const key = multiKey(field, suffix)
  if (key === undefined) return undefined
  const old = tags[key]
  if (old !== undefined && old !== '' && old.toLowerCase() !== 'no') return undefined
  return { key, value: 'yes' }
}

/** The write that flips a chip between yes and no (iD's invertMultikey). Anything else becomes yes. */
export function multiToggle(chip: MultiChip) {
  return { key: chip.key, value: chip.state === 'yes' ? 'no' : 'yes' }
}

/**
 * The chips of a multiCombo over several features: the chips of the shared tags, plus a chip for each
 * suffix whose key is mixed. A mixed chip is `some`; its state is the value when all of them share one
 * spelling of a yes or no, else `other` (a dash).
 */
export function multiChipsFor(
  field: Field,
  tags: Tags,
  combined: CombinedTags | undefined,
): (MultiChip & { some: boolean })[] {
  const prefix = multiPrefix(field)
  const shared = multiChosen(field, tags).map((chip) => ({ ...chip, some: false }))
  if (prefix === undefined || combined === undefined) return shared
  const mixedChips: (MultiChip & { some: boolean })[] = []
  for (const key of Object.keys(combined)) {
    const mixed = mixedOf(combined, key)
    if (mixed === undefined || !key.startsWith(prefix)) continue
    const suffix = key.slice(prefix.length)
    if (suffix === '') continue
    const option = field.options.find((candidate) => candidate.value === suffix)
    mixedChips.push({
      key,
      suffix,
      value: mixed.values.join(', '),
      label: option?.label ?? suffix,
      raw: option === undefined,
      state: mixedState(mixed),
      some: true,
    })
  }
  return [...shared, ...mixedChips].sort(
    (a, b) => optionRank(field, a.suffix) - optionRank(field, b.suffix),
  )
}

/** The options a multiCombo's input offers: those that have no chip yet. */
export function multiOptions(field: Field, chips: readonly MultiChip[]) {
  return field.options.filter(
    (option) => !isUnsetOption(option) && !chips.some((chip) => chip.suffix === option.value),
  )
}

// ---------------------------------------------------------------- manyCombo

/** One chip of a manyCombo: a yes/no tag of one of the field's keys that has a value. */
export type ManyChip = { key: string; label: string; value: string; state: ChipState }

/** The label of a key: its option's label, else the key itself. */
export function manyLabel(field: Pick<Field, 'options'>, key: string) {
  return field.options.find((option) => option.value === key)?.label ?? key
}

/** The chips of a manyCombo: the field's keys that have a value, in the order of `keys`. */
export function manyChosen(field: Field, tags: Tags) {
  return (field.keys ?? [])
    .filter((key) => (tags[key] ?? '') !== '')
    .map((key) => {
      const value = tags[key] ?? ''
      return { key, label: manyLabel(field, key), value, state: chipState(value) }
    })
}

/**
 * The chips of a manyCombo over several features: the keys that have a value on all of them, and the keys
 * that are mixed (some of them have it), in the order of `keys`. A mixed key is `some`.
 */
export function manyChipsFor(field: Field, tags: Tags, combined: CombinedTags | undefined) {
  return (field.keys ?? []).flatMap((key) => {
    const mixed = mixedOf(combined, key)
    if (mixed === undefined) {
      const value = tags[key] ?? ''
      if (value === '') return []
      return [{ key, label: manyLabel(field, key), value, state: chipState(value), some: false }]
    }
    const state = mixedState(mixed)
    return [
      { key, label: manyLabel(field, key), value: mixed.values.join(', '), state, some: true },
    ]
  })
}

/** The keys a manyCombo's input offers: those without a value. Customs are not allowed. */
export function manyCandidates(field: Field, tags: Tags, combined?: CombinedTags) {
  return (field.keys ?? [])
    .filter((key) => (tags[key] ?? '') === '' && mixedOf(combined, key) === undefined)
    .map((key) => ({ value: key, label: manyLabel(field, key) }))
}

/** The key a typed text picks: an exact label of one of the candidates. */
export function manyPick(candidates: readonly FieldOption[], typed: string) {
  return matchLabel(candidates, typed)?.value
}

/** The write that chooses a key: it is set to yes. */
export function manyAdd(key: string) {
  return { key, value: 'yes' }
}

/** The write that removes a key. */
export function manyRemove(key: string) {
  return { key, value: undefined }
}
