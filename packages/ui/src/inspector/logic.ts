import type { Field, FieldOption, Tags } from '@osm-editor-kit/maid-presets'
import { directionalKeys } from './fields/directional-logic.ts'
import type { MixedValue } from './fields/shared.ts'

/** OSM's limit for a tag value, in Unicode characters (iD's maxCharsForTagValue). */
export const MAX_VALUE_LENGTH = 255

/**
 * iD's unset entry in a field's options has no value. The presets write it as '' (the check fields'
 * "undefined" option, presets optionValueOf); an undefined value counts too.
 */
export function isUnsetOption(option: { value: string | undefined }) {
  return option.value === undefined || option.value === ''
}

/**
 * What is written to a tag: trimmed and in Unicode NFC, as iD's utilCleanOsmString does it. Empty
 * means the tag is removed. A value longer than MAX_VALUE_LENGTH is not cut: it is written as
 * typed, the field shows how far over it is (lengthNotice), and saving is blocked (osm_api_limits).
 */
export function cleanValue(text: string) {
  const value = text.trim().normalize('NFC')
  return value === '' ? undefined : value
}

/** The length of a draft in the unit the limit counts: Unicode characters. */
export function valueLength(text: string) {
  return Array.from(text).length
}

/** How many characters a draft is over the limit: 0 at or under it. */
export function excessOf(draft: string) {
  return Math.max(0, valueLength(draft) - MAX_VALUE_LENGTH)
}

/**
 * The counter under a text input. Silent until 10 characters before the limit; from there it
 * shows the length, and `excess` is how many characters are over the limit (0 at or under it, so
 * the counter is neutral; more is red and says so).
 */
export function lengthNotice(draft: string) {
  const length = valueLength(draft)
  if (length < MAX_VALUE_LENGTH - 10) return undefined
  return { length, excess: excessOf(draft) }
}

/** The message under an input that is over the limit: "7 characters too long", "1 character too long". */
export function tooLongText(excess: number) {
  return `${excess} ${excess === 1 ? 'character' : 'characters'} too long`
}

const LANGUAGE = /^[a-z]{2,3}(?:[-_][A-Za-z0-9]+)*$/

/**
 * Whether a tag key belongs to a field whose key is `own`. A key ending in ':' is a prefix
 * (multiCombo: payment:cash belongs to payment:). For localized names, name:<language> belongs
 * to name, but name:etymology does not.
 */
function ownsKey(field: Field, own: string, tagKey: string) {
  if (tagKey === own) return true
  if (own.endsWith(':')) return tagKey.startsWith(own)
  return (
    field.type === 'localized' &&
    tagKey.startsWith(`${own}:`) &&
    LANGUAGE.test(tagKey.slice(own.length + 1))
  )
}

/**
 * The tag keys of a field: its key or keys, plus every key of the given tag sets that the field
 * owns (see ownsKey).
 */
export function fieldKeys(field: Field, ...sources: Tags[]) {
  // both: a phone field has `key` phone and `keys` phone and contact:phone
  const listed = [...(field.key !== undefined ? [field.key] : []), ...(field.keys ?? [])]
  // a side field also owns the other spelling of its key (`cycleway` and `cycleway:both`)
  const sides =
    field.type === 'directionalCombo' && field.key !== undefined
      ? Object.values(directionalKeys(field.key))
      : []
  const own = [...new Set([...listed, ...sides])]
  const keys = new Set(own)
  for (const tags of sources) {
    for (const tagKey of Object.keys(tags)) {
      if (own.some((key) => ownsKey(field, key, tagKey))) keys.add(tagKey)
    }
  }
  return [...keys]
}

/** Some key of the field has a value. This shows the remove button. */
export function isPresent(field: Field, tags: Tags) {
  return fieldKeys(field, tags).some((key) => (tags[key] ?? '') !== '')
}

/** Some key of the field differs from the base tags. This shows the revert button. */
export function isModified(field: Field, tags: Tags, base: Tags) {
  return fieldKeys(field, tags, base).some((key) => (tags[key] ?? '') !== (base[key] ?? ''))
}

export type TagEdit = { key: string; value: string | undefined }

/** The writes that remove the field: every key that has a value is removed. */
export function removeEdits(field: Field, tags: Tags) {
  return fieldKeys(field, tags)
    .filter((key) => (tags[key] ?? '') !== '')
    .map((key) => ({ key, value: undefined }))
}

/** The writes that bring the field back to the base tags. Keys the base lacks are removed. */
export function revertEdits(field: Field, tags: Tags, base: Tags) {
  return fieldKeys(field, tags, base)
    .filter((key) => (tags[key] ?? '') !== (base[key] ?? ''))
    .map((key) => ({ key, value: base[key] || undefined }))
}

const SKIPPED_BY_CLICK = new Set(['reversible', 'alternating'])

/** The keys of a multi-key field (address, access, ...) that have a value. */
export function keysWithValue(field: Field, tags: Tags) {
  return (field.keys ?? []).filter((key) => (tags[key] ?? '') !== '')
}

/**
 * Changes whenever the value of the field's key (or of its keys) changes. Used as a React key
 * on the control, so that the draft starts over from the tags when they change elsewhere.
 */
export function valueSignature(field: Field, tags: Tags) {
  const keys = fieldKeys(field)
  return JSON.stringify(keys.map((key) => tags[key] ?? ''))
}

/** The value a check field works with: lower case, onewayCheck's -1 is yes (1 is not a oneway value, iD #13026), empty is unset. */
export function checkValue(type: string, value: string | undefined) {
  if (value === undefined || value === '') return undefined
  const lower = value.toLowerCase()
  return type === 'onewayCheck' && lower === '-1' ? 'yes' : lower
}

/**
 * Whether an unset oneway counts as yes: oneway_yes always, oneway when a tag of the way implies
 * it (iD check.ts:59-70).
 */
export function impliesYes(field: Field, tags: Tags) {
  if (field.type !== 'onewayCheck' || field.key === undefined) return false
  if (checkValue(field.type, tags[field.key]) !== undefined) return false
  return field.id === 'oneway_yes' || (field.id === 'oneway' && impliesOneway(tags))
}

/** iD's osmOneWayTags without oneway (osm/tags.ts:161-230): a way with one of these is one way. */
const IMPLYING_TAGS: Record<string, readonly string[]> = {
  aerialway: [
    'chair_lift',
    'drag_lift',
    'j-bar',
    'magic_carpet',
    'mixed_lift',
    'platter',
    'rope_tow',
    't-bar',
    'zip_line',
  ],
  conveying: ['forward', 'backward', 'reversible'],
  highway: ['motorway'],
  junction: ['circular', 'roundabout'],
  man_made: ['goods_conveyor', 'piste:halfpipe'],
  'piste:type': ['downhill', 'sled', 'yes'],
  'seamark:type': [
    'two-way_route',
    'recommended_traffic_lane',
    'separation_lane',
    'separation_roundabout',
  ],
  waterway: [
    'canal',
    'ditch',
    'drain',
    'fish_pass',
    'flowline',
    'pressurised',
    'river',
    'spillway',
    'stream',
    'tidal_channel',
  ],
}

function impliesOneway(tags: Tags) {
  return Object.entries(IMPLYING_TAGS).some(([key, values]) => values.includes(tags[key] ?? ''))
}

/**
 * The checkbox state of a check field of one feature: true for yes and for any other value, false for no,
 * 'unset' when the tag is absent (defaultCheck is unchecked when unset, it has no third state).
 */
export function checkState(
  type: string,
  value: string | undefined,
  impliedYes = false,
): boolean | 'unset' {
  const current = checkValue(type, value)
  if (current === undefined) return type === 'defaultCheck' && !impliedYes ? false : 'unset'
  return current !== 'no'
}

/**
 * The checkbox state of a check field over several features. A key that is mixed (the features differ after
 * checkValue's spelling, or some feature lacks it) is 'mixed': an indeterminate box. A key that is one value
 * on all features, or absent on all, is the state of checkState for that value.
 */
export function checkStateFor(
  type: string,
  value: string | undefined,
  impliedYes: boolean,
  mixed: MixedValue | undefined,
): boolean | 'unset' | 'mixed' {
  if (mixed === undefined) return checkState(type, value, impliedYes)
  const spellings = new Set(mixed.values.map((text) => checkValue(type, text)))
  if (spellings.size === 1 && !mixed.missing) return checkState(type, mixed.values[0])
  return 'mixed'
}

/**
 * The value a click on a check field writes. A mixed field is set to yes on every feature (the one value
 * that is the same wherever it is set); any other state moves on along the cycle (nextCheckValue).
 */
export function checkAfterClick(
  type: string,
  value: string | undefined,
  cycle: readonly (string | undefined)[],
  mixed: boolean,
) {
  if (mixed) return 'yes'
  return nextCheckValue(type, value, cycle)
}

/**
 * The cycle of a check field's values, unset first. Without options: unset, yes, no
 * (defaultCheck: unset, yes). With options: the unset option and the others, without the
 * reversible and alternating values, which iD never cycles to (check.ts:151-153).
 */
export function checkCycle(field: Pick<Field, 'type' | 'options'>) {
  const choices = field.options
    .filter((option) => !isUnsetOption(option) && !SKIPPED_BY_CLICK.has(option.value))
    .map((option) => option.value)
  if (choices.length > 0) return [undefined, ...choices]
  return defaultCheckCycle(field.type)
}

/** The cycle of a check type without options: unset, yes, no (defaultCheck: unset, yes). */
export function defaultCheckCycle(type: string) {
  return type === 'defaultCheck' ? [undefined, 'yes'] : [undefined, 'yes', 'no']
}

/**
 * The value after a click (or Space): the next value of the cycle, which is the type's default
 * unless the field's own cycle (checkCycle) is given. A value outside the cycle goes to unset.
 */
export function nextCheckValue(
  type: string,
  current: string | undefined,
  cycle: readonly (string | undefined)[] = defaultCheckCycle(type),
) {
  const index = cycle.indexOf(checkValue(type, current))
  return cycle[(index + 1) % cycle.length]
}

/**
 * The text next to the checkbox: the option's label for the value, else Yes or No, else the value
 * in quotes. Unset: "Assumed to be Yes" when implied, else the unset option's label or Unknown.
 */
export function checkLabel(
  field: Pick<Field, 'options'>,
  type: string,
  value: string | undefined,
  impliedYes = false,
) {
  const current = checkValue(type, value)
  if (current === undefined) {
    if (impliedYes) return 'Assumed to be Yes'
    return field.options.find((option) => isUnsetOption(option))?.label || 'Unknown'
  }
  const option = field.options.find(
    (candidate: FieldOption) =>
      !isUnsetOption(candidate) && candidate.value.toLowerCase() === current,
  )
  if (option) return option.label
  if (current === 'yes') return 'Yes'
  if (current === 'no') return 'No'
  return `"${current}"`
}
