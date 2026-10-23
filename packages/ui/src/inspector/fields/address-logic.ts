import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { cleanValue } from '../logic.ts'
import { ADDRESS_FORMATS, ADDRESS_PLACEHOLDERS } from './address-formats.ts'

/**
 * Suggestions for the inputs of the address field, as the app computes them from the loaded
 * features (iD's getNear* and getEnclosing*, address.js:44-200; see `addressSuggestions`). Plain text
 * lists; the field does no lookup itself. `parts` holds the other inputs by their name (`suburb`, `floor`).
 */
export type AddressSuggestions = {
  streets?: string[]
  places?: string[]
  cities?: string[]
  postcodes?: string[]
  housenumbers?: string[]
  housenames?: string[]
  parts?: Record<string, string[]>
}

/**
 * A feature near the one being edited, as the host finds it: the features within about 200 m of the edited
 * feature's centre, without the edited feature itself. `distanceMetres` is iD's distance: from the edited
 * feature's centre to the candidate's centre, or to its nearest point when the candidate is a line.
 * `encloses` is true for an area (a closed way or a multipolygon) whose outline contains the whole edited feature
 * (iD's getEnclosing). `inEnclosingBuilding` is true for a point that lies in a building containing the
 * edited feature (iD's isInNearbyBuilding; the host finds the building, the point must be within 100 m).
 */
export type AddressCandidate = {
  type: 'node' | 'way' | 'relation'
  tags: Tags
  distanceMetres: number
  encloses?: boolean
  inEnclosingBuilding?: boolean
}

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

/**
 * The country of a feature: one ISO code (iD's, in any case), or the list of its codes, the territory first and then
 * the country (`['hk', 'cn']`, as `countryCodesAt`).
 */
export type Countries = string | readonly string[]

/** The first code of the countries (the territory when there is one, as iD's placeholders use). */
function firstCode(country: Countries | undefined) {
  return typeof country === 'string' ? country : country?.[0]
}

/**
 * The layout of a feature: the layout of its first code that has one, as iD's loop over its country codes. Without a
 * match, or without a country, the default.
 */
export function formatFor(country?: Countries) {
  const codes = typeof country === 'string' ? [country] : (country ?? [])
  for (const code of codes) {
    const match = ADDRESS_FORMATS.find((f) => f.countryCodes?.includes(code.toLowerCase()))
    if (match) return match
  }
  return ADDRESS_FORMATS.find((f) => f.countryCodes === undefined) ?? { format: [] }
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
export function ownedKeys(field: Pick<Field, 'key' | 'keys'>, country?: Countries) {
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
export function addressRows(field: Field, tags: Tags, country?: Countries) {
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

/**
 * The placeholder of an input: the variant of its first country (`name!cc`) when there is one, else the English one.
 * As iD, only the first code is tried.
 */
export function placeholderFor(name: string, country?: Countries) {
  const code = firstCode(country)?.toLowerCase()
  const local = code === undefined ? undefined : ADDRESS_PLACEHOLDERS[`${name}!${code}`]
  return local ?? ADDRESS_PLACEHOLDERS[name] ?? name
}

/** The placeholder of an input, as iD shows it: `Street / Place` for the street-or-place input. */
export function slotPlaceholder(name: string, country?: Countries) {
  if (name !== STREET_PLACE) return placeholderFor(name, country)
  return `${placeholderFor('street', country)} / ${placeholderFor('place', country)}`
}

/**
 * The suggestions of an input (its list of values). The street-or-place input lists streets in street mode and
 * places in place mode. The housenumber and housename inputs have a list only when there are values (iD shows
 * their caret only then). No list: the input is plain text.
 */
export function suggestionsFor(
  name: string,
  suggestions: AddressSuggestions | undefined,
  mode: StreetOrPlace = 'street',
) {
  if (name === STREET_PLACE) return mode === 'street' ? suggestions?.streets : suggestions?.places
  if (name === 'street') return suggestions?.streets
  if (name === 'city') return suggestions?.cities
  if (name === 'postcode') return suggestions?.postcodes
  if (name === 'housenumber') return nonEmptyList(suggestions?.housenumbers)
  if (name === 'housename') return nonEmptyList(suggestions?.housenames)
  const parts = suggestions?.parts
  return parts && Object.hasOwn(parts, name) ? parts[name] : undefined
}

function nonEmptyList(list: string[] | undefined) {
  return list && list.length > 0 ? list : undefined
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

/** iD's radius for the lists of nearby features (address.js getNear, 200 m). */
const NEAR_METRES = 200
/** iD's radius for the points inside an enclosing building (address.js getEnclosingValues, 100 m). */
const IN_BUILDING_METRES = 100

/** The other inputs with a list of nearby values (iD's getNearValues, the default of the dropdowns). */
const OTHER_PARTS = [
  'block_number',
  'country',
  'county',
  'district',
  'floor',
  'hamlet',
  'neighbourhood',
  'province',
  'quarter',
  'state',
  'subdistrict',
  'suburb',
  'town',
] as const

/** A tag value, or undefined when it is missing or empty (iD tests the tag for being truthy). */
function text(value: string | undefined) {
  return value === undefined || value === '' ? undefined : value
}

/**
 * iD's getNear: the values of the candidates within `radius`, nearest first, each value once (the nearest
 * candidate that gives a value is the one kept). A candidate without a value is left out.
 */
function nearest(
  candidates: readonly AddressCandidate[],
  valueOf: (candidate: AddressCandidate) => string | undefined,
  radius = NEAR_METRES,
) {
  const found: Array<{ value: string; distanceMetres: number }> = []
  for (const candidate of candidates) {
    const value = valueOf(candidate)
    if (value !== undefined && candidate.distanceMetres <= radius) {
      found.push({ value, distanceMetres: candidate.distanceMetres })
    }
  }
  found.sort((a, b) => a.distanceMetres - b.distanceMetres)
  return [...new Set(found.map((item) => item.value))]
}

/** iD's isAddressable test for a place (address.js getNearPlaces). */
function isPlace(tags: Tags) {
  if (text(tags.name) === undefined) return false
  if (text(tags.place) !== undefined) return true
  return tags.boundary === 'administrative' && Number(tags.admin_level) > 8
}

/** iD's isAddressable test for a city (address.js getNearCities). */
function isCity(tags: Tags) {
  if (text(tags.name) === undefined) return false
  if (tags.boundary === 'administrative' && tags.admin_level === '8') return true
  if (tags.border_type === 'city') return true
  return ['city', 'town', 'village', 'hamlet'].includes(tags.place ?? '')
}

/**
 * The suggestion lists of the address field, from the features near the edited one (iD's getNearStreets,
 * getNearPlaces, getNearCities, getNearPostcodes, getNearValues and getEnclosingValues in address.js). `prefix` is
 * the field's key prefix (`addr`, see `addressPrefix`). Each list has each value once.
 *
 * As iD: the radius is 200 m (100 m for the points in an enclosing building). Streets are the named highways,
 * places the named places, cities the named cities; a city takes its `addr:city` in place of its name. Postcodes
 * are the `addr:postcode` values, then the `postal_code` values. The housenumbers and housenames are the addresses
 * of the enclosing areas and of the points in an enclosing building, sorted by value (iD sorts them, not by
 * distance). The other inputs are the `addr:*` values near.
 *
 * Not as iD: streets also take the `addr:street` of a nearby address, and places its `addr:place`, as the
 * owner asked. iD gives those only where the feature is itself an address.
 */
export function addressSuggestions(
  candidates: readonly AddressCandidate[],
  prefix: string,
): AddressSuggestions {
  const tagOf = (tags: Tags, name: string) => text(tags[`${prefix}:${name}`])
  const streetOf = (candidate: AddressCandidate) =>
    (candidate.type === 'way' && text(candidate.tags.highway) !== undefined
      ? text(candidate.tags.name)
      : undefined) ?? tagOf(candidate.tags, 'street')
  const placeOf = (candidate: AddressCandidate) =>
    (isPlace(candidate.tags) ? text(candidate.tags.name) : undefined) ??
    tagOf(candidate.tags, 'place')
  const cityOf = (candidate: AddressCandidate) =>
    tagOf(candidate.tags, 'city') ??
    (isCity(candidate.tags) ? text(candidate.tags.name) : undefined)

  // iD's enclosing rule: an enclosing area's address, or an address point in an enclosing building (sorted by value)
  const enclosing = (name: string) => {
    const values: string[] = []
    for (const candidate of candidates) {
      const value = tagOf(candidate.tags, name)
      if (value === undefined) continue
      const inside =
        candidate.encloses === true ||
        (candidate.type === 'node' &&
          candidate.inEnclosingBuilding === true &&
          candidate.distanceMetres <= IN_BUILDING_METRES)
      if (inside) values.push(value)
    }
    return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  }

  const parts: Record<string, string[]> = {}
  for (const name of OTHER_PARTS) {
    parts[name] = nearest(candidates, (candidate) => tagOf(candidate.tags, name))
  }

  return {
    streets: nearest(candidates, streetOf),
    places: nearest(candidates, placeOf),
    cities: nearest(candidates, cityOf),
    postcodes: [
      ...new Set([
        ...nearest(candidates, (candidate) => tagOf(candidate.tags, 'postcode')),
        ...nearest(candidates, (candidate) => text(candidate.tags.postal_code)),
      ]),
    ],
    housenumbers: enclosing('housenumber'),
    housenames: enclosing('housename'),
    parts,
  }
}
