import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { isUnsetOption, type TagEdit } from '../logic.ts'

/**
 * Radio fields (radio, structureRadio), as iD's radio.js. A radio over one `key` shows its options
 * and writes the key. A radio over `keys` (structureRadio: bridge, tunnel, ...) has no `key`: each
 * key is an option, and the chosen one is the key that is set to something other than `no`.
 */

/** One button of a radio. `raw` marks a value that is no option: shown in quotes and italics. */
export type RadioChoice = { value: string; label: string; raw: boolean }

/** The layer a structure gets by default (iD radio.js:333-346). Other structures have none. */
const DEFAULT_LAYER: Record<string, string> = { bridge: '1', tunnel: '-1' }

function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== ''
}

/** A key of a radio over keys counts as chosen when it is set to something other than `no`. */
function isChosenKey(value: string | undefined): value is string {
  return isSet(value) && value.toLowerCase() !== 'no'
}

/** The options in the order they are shown. A radio over keys shows its keys, labelled from the options when they name them. */
export function radioOptions(field: Field) {
  if (field.key !== undefined) {
    return field.options
      .filter((option) => !isUnsetOption(option))
      .map((option) => ({ value: option.value, label: option.label }))
  }
  return (field.keys ?? []).map((key) => ({
    value: key,
    label: field.options.find((option) => option.value === key)?.label ?? key,
  }))
}

/**
 * The chosen value. For a radio over one key, that key's value (even when no option has it). For a
 * radio over keys, the one key that is chosen; none when no key or several are.
 */
export function radioChosen(field: Field, tags: Tags) {
  if (field.key !== undefined) {
    const value = tags[field.key]
    return isSet(value) ? value : undefined
  }
  const chosen = (field.keys ?? []).filter((key) => isChosenKey(tags[key]))
  return chosen.length === 1 ? chosen[0] : undefined
}

/** The buttons: the options, plus the chosen value as a raw button when no option has it. */
export function radioChoices(field: Field, tags: Tags) {
  const choices: RadioChoice[] = radioOptions(field).map((option) => ({ ...option, raw: false }))
  const chosen = radioChosen(field, tags)
  if (field.key !== undefined && chosen !== undefined) {
    if (!choices.some((choice) => choice.value === chosen)) {
      choices.push({ value: chosen, label: chosen, raw: true })
    }
  }
  return choices
}

/** The edit that makes a key hold `value` (undefined removes it), or none when it holds that already. */
function edit(tags: Tags, key: string, value: string | undefined) {
  return (tags[key] ?? '') === (value ?? '') ? [] : [{ key, value }]
}

/**
 * The layer a structure asks for, given its type and the layer as it is. A bridge keeps a layer
 * above 0 and otherwise gets 1; a tunnel (not of type building_passage) keeps a layer below 0 and
 * otherwise gets -1. Other structures ask for none (undefined).
 */
export function structureLayer(
  structure: string | undefined,
  type: string | undefined,
  layer: string | undefined,
) {
  const current = isSet(layer) && layer.trim() !== '' ? Number(layer) : Number.NaN
  if (structure === 'bridge') return current > 0 ? layer : DEFAULT_LAYER.bridge
  if (structure === 'tunnel' && type !== 'building_passage') {
    return current < 0 ? layer : DEFAULT_LAYER.tunnel
  }
  return undefined
}

/**
 * The layer edits that go with a structure: its layer when it asks for one, else the removal of
 * the layer when it still is the default of the structure left (`previous`). A layer that the user
 * set to another value is kept.
 */
function layerEdits(
  tags: Tags,
  structure: string | undefined,
  type: string | undefined,
  previous: string | undefined,
) {
  const wanted = structureLayer(structure, type, tags.layer)
  if (wanted !== undefined) return edit(tags, 'layer', wanted)
  const old = previous === undefined ? undefined : DEFAULT_LAYER[previous]
  if (old !== undefined && tags.layer === old) return [{ key: 'layer', value: undefined }]
  return []
}

/**
 * The tag edits for choosing `choice`; undefined clears the radio. A radio over one key writes that
 * key. A radio over keys writes the chosen key (its value when it is set to something but no, else
 * yes) and removes every other key. A structureRadio also sets or removes its layer. Only the keys
 * whose value changes are returned, one edit each.
 */
export function radioWrite(field: Field, tags: Tags, choice: string | undefined) {
  if (field.key !== undefined) return edit(tags, field.key, choice)
  const edits: TagEdit[] = []
  for (const key of field.keys ?? []) {
    const value = key === choice ? (isChosenKey(tags[key]) ? tags[key] : 'yes') : undefined
    edits.push(...edit(tags, key, value))
  }
  if (field.type === 'structureRadio') {
    const current = choice === undefined ? undefined : tags[choice]
    const type = choice === undefined ? undefined : isChosenKey(current) ? current : 'yes'
    edits.push(...layerEdits(tags, choice, type, radioChosen(field, tags)))
  }
  return edits
}

/** The edits for a click on `value`: choosing the chosen one again clears the radio (iD's None). */
export function radioPick(field: Field, tags: Tags, value: string) {
  const chosen = radioChosen(field, tags)
  return radioWrite(field, tags, chosen === value ? undefined : value)
}

/**
 * The edits when the type of a structure (bridge or tunnel) is set. The type is the structure's own
 * key value; clearing it gives yes. The layer follows the type: a tunnel of type building_passage
 * loses its default layer, and a bridge or tunnel without a layer gets its default.
 */
export function structureTypeEdits(structure: string, tags: Tags, type: string | undefined) {
  const value = type === undefined || type.trim() === '' ? 'yes' : type
  return [...edit(tags, structure, value), ...layerEdits(tags, structure, value, structure)]
}

/**
 * Access (iD access.js). One row per key; each row's options are the access values, with the
 * list cut per key as iD does (access: no yes and no designated; bicycle: plus dismount).
 */
const ACCESS_VALUES: { value: string; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'designated', label: 'Designated' },
  { value: 'permissive', label: 'Permissive' },
  { value: 'destination', label: 'Destination' },
  { value: 'customers', label: 'Customers' },
  { value: 'private', label: 'Private' },
  { value: 'permit', label: 'Permit' },
  { value: 'unknown', label: 'Unknown' },
]

/** The options of one access row (access.js:85-112). */
export function accessOptions(key: string) {
  const options =
    key === 'access'
      ? ACCESS_VALUES.filter((option) => option.value !== 'yes' && option.value !== 'designated')
      : [...ACCESS_VALUES]
  if (key === 'bicycle') options.push({ value: 'dismount', label: 'Dismount' })
  return options
}

/** The access a road or barrier gives by default, per tag value (access.js:115-280). */
const PLACEHOLDERS_BY_TAG: Record<string, Record<string, Record<string, string>>> = {
  highway: {
    footway: { foot: 'designated', motor_vehicle: 'no' },
    steps: { foot: 'yes', motor_vehicle: 'no', bicycle: 'no', horse: 'no' },
    ladder: { foot: 'yes', motor_vehicle: 'no', bicycle: 'no', horse: 'no' },
    pedestrian: { foot: 'yes', motor_vehicle: 'no' },
    living_street: { foot: 'yes' },
    cycleway: { motor_vehicle: 'no', bicycle: 'designated' },
    bridleway: { motor_vehicle: 'no', horse: 'designated' },
    path: { foot: 'yes', motor_vehicle: 'no', bicycle: 'yes', horse: 'yes' },
    motorway: { foot: 'no', motor_vehicle: 'yes', bicycle: 'no', horse: 'no' },
    trunk: { motor_vehicle: 'yes' },
    primary: { foot: 'yes', motor_vehicle: 'yes', bicycle: 'yes', horse: 'yes' },
    secondary: { foot: 'yes', motor_vehicle: 'yes', bicycle: 'yes', horse: 'yes' },
    tertiary: { foot: 'yes', motor_vehicle: 'yes', bicycle: 'yes', horse: 'yes' },
    residential: { foot: 'yes', motor_vehicle: 'yes', bicycle: 'yes', horse: 'yes' },
    unclassified: { foot: 'yes', motor_vehicle: 'yes', bicycle: 'yes', horse: 'yes' },
    service: { foot: 'yes', motor_vehicle: 'yes', bicycle: 'yes', horse: 'yes' },
    motorway_link: { foot: 'no', motor_vehicle: 'yes', bicycle: 'no', horse: 'no' },
    trunk_link: { motor_vehicle: 'yes' },
    primary_link: { foot: 'yes', motor_vehicle: 'yes', bicycle: 'yes', horse: 'yes' },
    secondary_link: { foot: 'yes', motor_vehicle: 'yes', bicycle: 'yes', horse: 'yes' },
    tertiary_link: { foot: 'yes', motor_vehicle: 'yes', bicycle: 'yes', horse: 'yes' },
    construction: { access: 'no' },
    busway: { access: 'no', bus: 'designated', emergency: 'yes' },
  },
  barrier: {
    bollard: { access: 'no', bicycle: 'yes', foot: 'yes' },
    bus_trap: { motor_vehicle: 'no', psv: 'yes', foot: 'yes', bicycle: 'yes' },
    city_wall: { access: 'no' },
    coupure: { access: 'yes' },
    cycle_barrier: { motor_vehicle: 'no' },
    ditch: { access: 'no' },
    entrance: { access: 'yes' },
    fence: { access: 'no' },
    hedge: { access: 'no' },
    jersey_barrier: { access: 'no' },
    motorcycle_barrier: { motor_vehicle: 'no' },
    rail_guard: { access: 'no' },
  },
}

/**
 * The access value a key would have from the tags (iD's getPlaceholder, access.js:318-349): its
 * own value; motorroad=yes for foot, bicycle and horse gives no; vehicle for bicycle and
 * motor_vehicle; access; then the default of the highway or barrier value. access is yes unless
 * there is a barrier. Undefined when none applies (the field's own placeholder is shown then).
 */
export function impliedAccess(tags: Tags, key: string) {
  const own = tags[key]
  if (own) return own
  if (tags.motorroad === 'yes' && (key === 'foot' || key === 'bicycle' || key === 'horse')) {
    return 'no'
  }
  if (tags.vehicle && (key === 'bicycle' || key === 'motor_vehicle')) return tags.vehicle
  if (tags.access) return tags.access
  for (const tagKey of Object.keys(PLACEHOLDERS_BY_TAG)) {
    const value = tags[tagKey]
    if (!value) continue
    const implied = PLACEHOLDERS_BY_TAG[tagKey]?.[value]?.[key]
    if (implied) return implied
  }
  if (key === 'access' && !tags.barrier) return 'yes'
  return undefined
}
