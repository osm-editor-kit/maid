import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { cleanValue } from '../logic.ts'
import { ADDRESS_FORMATS, ADDRESS_PLACEHOLDERS } from './address-formats.ts'

/**
 * Suggestions for the inputs of the address field, as the app computes them from the loaded
 * features (iD's getNear*, address.js:44-200). Plain text lists; the field does no lookup itself.
 */
export type AddressSuggestions = { streets?: string[]; cities?: string[]; postcodes?: string[] }

/** The name of the input that holds `addr:street` or `addr:place`, as iD's street+place. */
export const STREET_PLACE = 'street+place'

/** Which of the two keys the street-or-place input writes. */
export type StreetOrPlace = 'street' | 'place'

/** One input of a row: its format name and its share of the row's width (the shares add up to 1). */
export type AddressCell = { name: string; share: number }

/** iD's widths when a layout has none of its own (address.js:55-58). Other names count 0.5. */
const DEFAULT_WIDTHS: Readonly<Record<string, number>> = {
  housenumber: 1 / 5,
  unit: 1 / 5,
  floor: 1 / 5,
  street: 1 / 2,
  place: 1 / 2,
  city: 2 / 3,
  state: 1 / 4,
  postcode: 1 / 3,
}
const DEFAULT_WIDTH = 0.5

const DEFAULT_PREFIX = 'addr'

/**
 * The prefix of the field's tag keys: `addr` for the address field, `post` for the postal address,
 * `memorial:addr` for the memorial's subtags (which has no key of its own, only keys).
 */
export function addressPrefix(field: Pick<Field, 'key' | 'keys'>) {
  if (field.key !== undefined) return field.key
  const first = field.keys?.[0]
  if (first !== undefined && first.includes(':')) return first.slice(0, first.lastIndexOf(':'))
  return DEFAULT_PREFIX
}

/** The layout of a country (iD's ISO code, in any case). Without a match, or without a country, the default. */
export function formatFor(country?: string) {
  const code = country?.toLowerCase()
  const match =
    code === undefined ? undefined : ADDRESS_FORMATS.find((f) => f.countryCodes?.includes(code))
  return match ?? ADDRESS_FORMATS.find((f) => f.countryCodes === undefined) ?? { format: [] }
}

/** The tag names of an input: `street+place` is `street` and `place`. */
function namesOf(name: string) {
  return name === STREET_PLACE ? ['street', 'place'] : [name]
}

function hasValue(value: string | undefined) {
  return value !== undefined && value !== ''
}

/** The name of a key of the field: `addr:street` is `street`. */
function nameOf(prefix: string, key: string) {
  return key.startsWith(`${prefix}:`) ? key.slice(prefix.length + 1) : key
}

/**
 * The tag keys the field owns: its keys, plus the keys of every input the country's layout names
 * (a layout can name a key that the schema does not list).
 */
export function ownedKeys(field: Pick<Field, 'key' | 'keys'>, country?: string) {
  const prefix = addressPrefix(field)
  const named = formatFor(country)
    .format.flat()
    .flatMap(namesOf)
    .map((name) => `${prefix}:${name}`)
  return [...new Set([...(field.keys ?? []), ...named])]
}

/** The shares of a row's width, as iD's row(): each name's width over the row's total. */
export function cellShares(names: readonly string[], widths: Readonly<Record<string, number>>) {
  const weight = (name: string) => widths[name] || DEFAULT_WIDTH
  const total = names.reduce((sum, name) => sum + weight(name), 0)
  return names.map((name) => ({ name, share: weight(name) / total }))
}

function equalCells(names: readonly string[]) {
  return names.map((name) => ({ name, share: 1 / names.length }))
}

/**
 * The rows the field shows: the layout's rows, then one more row with every input that the layout
 * does not show but that has a value (nothing is hidden). The street-or-place input shows the
 * street when both have a value, so `place` then needs its own input.
 */
export function addressRows(field: Field, tags: Tags, country?: string) {
  const prefix = addressPrefix(field)
  const layout = formatFor(country)
  const widths = layout.widths ?? DEFAULT_WIDTHS
  const rows = layout.format.map((row) => cellShares(row, widths))
  const covered = new Set<string>()
  for (const name of layout.format.flat()) {
    if (name !== STREET_PLACE) {
      covered.add(name)
      continue
    }
    covered.add('street')
    if (!(hasValue(tags[`${prefix}:street`]) && hasValue(tags[`${prefix}:place`])))
      covered.add('place')
  }
  const extra = ownedKeys(field, country)
    .map((key) => nameOf(prefix, key))
    .filter((name) => !covered.has(name) && hasValue(tags[`${prefix}:${name}`]))
  if (extra.length > 0) rows.push(equalCells([...new Set(extra)]))
  return rows
}

/** The value an input shows. The street-or-place input shows the street, else the place. */
export function slotValue(name: string, tags: Tags, prefix: string) {
  if (name === STREET_PLACE) return tags[`${prefix}:street`] || tags[`${prefix}:place`] || ''
  return tags[`${prefix}:${name}`] ?? ''
}

/** Which key the street-or-place input holds: place only when the place has the value. */
export function streetPlaceMode(tags: Tags, prefix: string) {
  return !hasValue(tags[`${prefix}:street`]) && hasValue(tags[`${prefix}:place`])
    ? 'place'
    : 'street'
}

/**
 * The writes of one input for a text (as committed). An empty text removes the key. The
 * street-or-place input writes the key of its mode and removes the other one, as iD does.
 */
export function slotEdits(
  name: string,
  text: string,
  prefix: string,
  mode: StreetOrPlace = 'street',
) {
  const value = cleanValue(text)
  if (name !== STREET_PLACE) return [{ key: `${prefix}:${name}`, value }]
  const other: StreetOrPlace = mode === 'street' ? 'place' : 'street'
  return [
    { key: `${prefix}:${mode}`, value },
    { key: `${prefix}:${other}`, value: undefined },
  ]
}

/**
 * The writes of the street-or-place switch: the shown value moves to the key of the new mode, and
 * the other key is removed. Nothing to move, nothing to write.
 */
export function modeSwitchEdits(tags: Tags, prefix: string, to: StreetOrPlace) {
  const value = slotValue(STREET_PLACE, tags, prefix)
  if (!hasValue(value)) return []
  const from: StreetOrPlace = to === 'street' ? 'place' : 'street'
  return [
    { key: `${prefix}:${to}`, value },
    { key: `${prefix}:${from}`, value: undefined },
  ]
}

/** The placeholder of an input: the country's variant (`name!cc`) when there is one, else the English one. */
export function placeholderFor(name: string, country?: string) {
  const code = country?.toLowerCase()
  const local = code === undefined ? undefined : ADDRESS_PLACEHOLDERS[`${name}!${code}`]
  return local ?? ADDRESS_PLACEHOLDERS[name] ?? name
}

/** The placeholder of an input, as iD shows it: `Street / Place` for the street-or-place input. */
export function slotPlaceholder(name: string, country?: string) {
  if (name !== STREET_PLACE) return placeholderFor(name, country)
  return `${placeholderFor('street', country)} / ${placeholderFor('place', country)}`
}

/**
 * The suggestions of an input (its list of values). The street-or-place input lists streets in
 * street mode; there are no place suggestions in the type. No list: the input is plain text.
 */
export function suggestionsFor(
  name: string,
  suggestions: AddressSuggestions | undefined,
  mode: StreetOrPlace = 'street',
) {
  if (name === STREET_PLACE) return mode === 'street' ? suggestions?.streets : undefined
  if (name === 'street') return suggestions?.streets
  if (name === 'city') return suggestions?.cities
  if (name === 'postcode') return suggestions?.postcodes
  return undefined
}

/**
 * The options of a suggestion list, as a combo shows them. The current value comes first when the
 * list lacks it, so that the combo shows it as a listed value (not in italics).
 */
export function suggestionOptions(list: readonly string[], value: string) {
  const values = [...new Set(list.filter((item) => item !== ''))]
  const shown = value !== '' && !values.includes(value) ? [value, ...values] : values
  return shown.map((item) => ({ value: item, label: item }))
}
