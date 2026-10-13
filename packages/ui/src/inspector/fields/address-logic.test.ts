import { describe, expect, test } from 'bun:test'
import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { ADDRESS_FORMATS, ADDRESS_PLACEHOLDERS } from './address-formats.ts'
import {
  addressPrefix,
  addressRows,
  cellShares,
  formatFor,
  modeSwitchEdits,
  ownedKeys,
  placeholderFor,
  slotEdits,
  slotPlaceholder,
  slotValue,
  streetPlaceMode,
  suggestionOptions,
  suggestionsFor,
  addressSuggestions,
  type AddressCandidate,
} from './address-logic.ts'

const ADDR_KEYS = [
  'addr:block_number',
  'addr:city',
  'addr:conscriptionnumber',
  'addr:country',
  'addr:county',
  'addr:district',
  'addr:door',
  'addr:floor',
  'addr:hamlet',
  'addr:housename',
  'addr:housenumber',
  'addr:neighbourhood',
  'addr:place',
  'addr:postcode',
  'addr:province',
  'addr:quarter',
  'addr:state',
  'addr:street',
  'addr:subdistrict',
  'addr:suburb',
  'addr:town',
  'addr:unit',
]

/** The schema's `address` field (fields.min.json, `addr`), as Maid's Field carries it. */
const ADDRESS: Field = {
  id: 'address',
  type: 'address',
  key: 'addr',
  keys: ADDR_KEYS,
  label: 'Address',
  options: [],
  universal: false,
}

const MEMORIAL: Field = {
  id: 'memorial/addr_subtags',
  type: 'address',
  keys: [
    'memorial:addr:city',
    'memorial:addr:housename',
    'memorial:addr:housenumber',
    'memorial:addr:place',
    'memorial:addr:postcode',
    'memorial:addr:street',
  ],
  label: 'Address',
  options: [],
  universal: false,
}

/** The names of the rows, for readable assertions: row by row, `street+place` as one name. */
function names(rows: { name: string }[][]): string[][] {
  return rows.map((row) => row.map((cell) => cell.name))
}

describe('addressPrefix', () => {
  test('the field key is the prefix', () => {
    expect(addressPrefix(ADDRESS)).toBe('addr')
    expect(addressPrefix({ key: 'post', keys: [] })).toBe('post')
  })

  test('a field without a key takes the prefix of its keys', () => {
    expect(addressPrefix(MEMORIAL)).toBe('memorial:addr')
  })

  test('nothing to go by gives addr', () => {
    expect(addressPrefix({})).toBe('addr')
  })
})

describe('formatFor', () => {
  test('no country gives the default layout: housenumber and street+place, then city and postcode', () => {
    const layout = formatFor()
    expect(layout.countryCodes).toBeUndefined()
    expect(layout.format).toEqual([
      ['housenumber', 'street+place'],
      ['city', 'postcode'],
    ])
  })

  test('an unknown country gives the default layout', () => {
    expect(formatFor('xx')).toEqual(formatFor())
  })

  test('a country gives its own layout, in any case', () => {
    expect(formatFor('de').format).toEqual([
      ['street+place', 'housenumber'],
      ['postcode', 'city'],
    ])
    expect(formatFor('DE')).toEqual(formatFor('de'))
  })

  test('a country of a group gets the group layout', () => {
    expect(formatFor('at')).toEqual(formatFor('de'))
    expect(formatFor('fr').format[0]).toEqual(['housenumber', 'street+place'])
  })

  test('the country layouts of iD name a country at most once', () => {
    const codes = ADDRESS_FORMATS.flatMap((f) => f.countryCodes ?? [])
    expect(new Set(codes).size).toBe(codes.length)
  })

  test('every name of every layout has an English placeholder', () => {
    for (const layout of ADDRESS_FORMATS) {
      for (const name of layout.format.flat()) {
        for (const part of name === 'street+place' ? ['street', 'place'] : [name]) {
          expect(ADDRESS_PLACEHOLDERS[part]).toBeDefined()
        }
      }
    }
  })
})

describe('cellShares', () => {
  test('the default widths, normalised over the row', () => {
    const shares = cellShares(['housenumber', 'street+place'], {
      housenumber: 1 / 5,
      street: 1 / 2,
      place: 1 / 2,
      city: 2 / 3,
      postcode: 1 / 3,
    })
    expect(shares[0]?.share).toBeCloseTo(0.2 / 0.7, 10)
    expect(shares[1]?.share).toBeCloseTo(0.5 / 0.7, 10)
  })

  test('a name without a width counts 0.5', () => {
    const shares = cellShares(['unknown', 'postcode'], { postcode: 1 / 3 })
    expect(shares[0]?.share).toBeCloseTo(0.5 / (0.5 + 1 / 3), 10)
  })

  test('the shares of a row add up to 1', () => {
    const total = cellShares(['postcode', 'province', 'county', 'city'], {
      postcode: 0.3,
      province: 0.35,
      county: 0.35,
      city: 0.65,
    }).reduce((sum, cell) => sum + cell.share, 0)
    expect(total).toBeCloseTo(1, 10)
  })
})

describe('addressRows', () => {
  test('a feature without values shows the layout only', () => {
    expect(names(addressRows(ADDRESS, {}))).toEqual([
      ['housenumber', 'street+place'],
      ['city', 'postcode'],
    ])
  })

  test('the layout of the country is shown with its widths', () => {
    const rows = addressRows(ADDRESS, {}, 'jp')
    expect(names(rows)).toEqual([
      ['postcode', 'province', 'county'],
      ['city', 'suburb'],
      ['quarter', 'neighbourhood'],
      ['block_number', 'housenumber'],
    ])
    expect(rows[0]?.[0]?.share).toBeCloseTo(0.3, 10)
  })

  test('an input the layout does not show but that has a value is still shown, in a row of its own', () => {
    const rows = addressRows(ADDRESS, { 'addr:suburb': 'Mitte' }, 'de')
    expect(names(rows)).toEqual([['street+place', 'housenumber'], ['postcode', 'city'], ['suburb']])
    expect(rows[2]?.[0]?.share).toBe(1)
  })

  test('several hidden inputs share one row', () => {
    const rows = addressRows(ADDRESS, { 'addr:suburb': 'Mitte', 'addr:door': '3' }, 'de')
    expect(names(rows)[2]).toEqual(['door', 'suburb'])
    expect(rows[2]?.map((cell) => cell.share)).toEqual([0.5, 0.5])
  })

  test('a key with an empty value does not add an input', () => {
    expect(names(addressRows(ADDRESS, { 'addr:suburb': '' }, 'de'))).toHaveLength(2)
  })

  test('when street and place both have values, the place shows in a row of its own', () => {
    const rows = addressRows(ADDRESS, { 'addr:street': 'Main Street', 'addr:place': 'Old Town' })
    expect(names(rows)).toEqual([['housenumber', 'street+place'], ['city', 'postcode'], ['place']])
  })

  test('the memorial subtags show their own keys', () => {
    expect(names(addressRows(MEMORIAL, { 'memorial:addr:housename': 'Hall' }))).toEqual([
      ['housenumber', 'street+place'],
      ['city', 'postcode'],
      ['housename'],
    ])
  })
})

describe('ownedKeys', () => {
  test('the field keys, plus the keys the layout names', () => {
    expect(ownedKeys(ADDRESS, 'jp')).toEqual(expect.arrayContaining(ADDR_KEYS))
    expect(ownedKeys(MEMORIAL)).toEqual(MEMORIAL.keys ?? [])
    expect(ownedKeys(MEMORIAL, 'au')).toContain('memorial:addr:unit')
  })

  test('the street-or-place input owns both keys', () => {
    expect(ownedKeys({ key: 'post', keys: [] }, 'de')).toEqual([
      'post:street',
      'post:place',
      'post:housenumber',
      'post:postcode',
      'post:city',
    ])
  })
})

describe('slotValue and streetPlaceMode', () => {
  test('a plain input shows its own key', () => {
    expect(slotValue('city', { 'addr:city': 'Bonn' }, 'addr')).toBe('Bonn')
    expect(slotValue('city', {}, 'addr')).toBe('')
  })

  test('the street-or-place input shows the street, else the place', () => {
    expect(slotValue('street+place', { 'addr:place': 'Old Town' }, 'addr')).toBe('Old Town')
    expect(
      slotValue('street+place', { 'addr:street': 'Main', 'addr:place': 'Old Town' }, 'addr'),
    ).toBe('Main')
  })

  test('its mode is place only when the place is the value', () => {
    expect(streetPlaceMode({}, 'addr')).toBe('street')
    expect(streetPlaceMode({ 'addr:street': 'Main' }, 'addr')).toBe('street')
    expect(streetPlaceMode({ 'addr:place': 'Old Town' }, 'addr')).toBe('place')
    expect(streetPlaceMode({ 'addr:street': 'Main', 'addr:place': 'Old Town' }, 'addr')).toBe(
      'street',
    )
  })
})

describe('slotEdits', () => {
  test('a plain input writes its key, cleaned', () => {
    expect(slotEdits('city', '  Bonn  ', 'addr')).toEqual([{ key: 'addr:city', value: 'Bonn' }])
  })

  test('an empty text removes a plain input', () => {
    expect(slotEdits('city', '   ', 'addr')).toEqual([{ key: 'addr:city', value: undefined }])
  })

  test('a street clears the place', () => {
    expect(slotEdits('street+place', 'Main Street', 'addr', 'street')).toEqual([
      { key: 'addr:street', value: 'Main Street' },
      { key: 'addr:place', value: undefined },
    ])
  })

  test('a place clears the street', () => {
    expect(slotEdits('street+place', 'Old Town', 'addr', 'place')).toEqual([
      { key: 'addr:place', value: 'Old Town' },
      { key: 'addr:street', value: undefined },
    ])
  })

  test('an empty street-or-place text removes both keys', () => {
    expect(slotEdits('street+place', '', 'addr', 'street')).toEqual([
      { key: 'addr:street', value: undefined },
      { key: 'addr:place', value: undefined },
    ])
  })

  test('the street-or-place input defaults to the street', () => {
    expect(slotEdits('street+place', 'Main', 'addr')[0]).toEqual({
      key: 'addr:street',
      value: 'Main',
    })
  })
})

describe('modeSwitchEdits', () => {
  test('a street moves to the place', () => {
    expect(modeSwitchEdits({ 'addr:street': 'Main' }, 'addr', 'place')).toEqual([
      { key: 'addr:place', value: 'Main' },
      { key: 'addr:street', value: undefined },
    ])
  })

  test('a place moves to the street', () => {
    expect(modeSwitchEdits({ 'addr:place': 'Old Town' }, 'addr', 'street')).toEqual([
      { key: 'addr:street', value: 'Old Town' },
      { key: 'addr:place', value: undefined },
    ])
  })

  test('nothing to move, nothing to write', () => {
    expect(modeSwitchEdits({}, 'addr', 'place')).toEqual([])
  })
})

describe('placeholders', () => {
  test('the English placeholder', () => {
    expect(placeholderFor('street')).toBe('Street')
    expect(placeholderFor('housenumber')).toBe('123')
  })

  test('a country variant is used for its country only', () => {
    expect(placeholderFor('block_number', 'jp')).toBe('Block No.')
    expect(placeholderFor('block_number', 'de')).toBe('Block Number')
    expect(placeholderFor('block_number')).toBe('Block Number')
    expect(placeholderFor('housenumber', 'JP')).toBe('Building No./Lot No.')
  })

  test('a name without a placeholder shows its name', () => {
    expect(placeholderFor('unknown')).toBe('unknown')
  })

  test('the street-or-place input shows both', () => {
    expect(slotPlaceholder('street+place')).toBe('Street / Place')
    expect(slotPlaceholder('city', 'cn')).toBe('City/Prefecture/League')
  })
})

describe('suggestions', () => {
  const list = { streets: ['Main Street'], cities: ['Bonn'], postcodes: ['53111'] }

  test('each input takes its own list', () => {
    expect(suggestionsFor('street', list)).toEqual(['Main Street'])
    expect(suggestionsFor('city', list)).toEqual(['Bonn'])
    expect(suggestionsFor('postcode', list)).toEqual(['53111'])
    expect(suggestionsFor('housenumber', list)).toBeUndefined()
  })

  test('the street-or-place input lists streets in street mode and places in place mode', () => {
    const withPlaces = { ...list, places: ['Lindenhof'] }
    expect(suggestionsFor('street+place', withPlaces, 'street')).toEqual(['Main Street'])
    expect(suggestionsFor('street+place', withPlaces, 'place')).toEqual(['Lindenhof'])
    expect(suggestionsFor('street+place', list, 'place')).toBeUndefined()
  })

  test('a housenumber or housename has a list only when there are values', () => {
    expect(suggestionsFor('housenumber', { housenumbers: [] })).toBeUndefined()
    expect(suggestionsFor('housenumber', { housenumbers: ['4', '6'] })).toEqual(['4', '6'])
    expect(suggestionsFor('housename', { housenames: ['Old Mill'] })).toEqual(['Old Mill'])
  })

  test('the other inputs take their list from the parts', () => {
    const parts = { suburb: ['Kessenich'], floor: ['2'] }
    expect(suggestionsFor('suburb', { parts })).toEqual(['Kessenich'])
    expect(suggestionsFor('floor', { parts })).toEqual(['2'])
    expect(suggestionsFor('town', { parts })).toBeUndefined()
    expect(suggestionsFor('constructor', { parts })).toBeUndefined()
  })

  test('without suggestions there is no list', () => {
    expect(suggestionsFor('street', undefined)).toBeUndefined()
  })

  test('the options drop duplicates and empty items', () => {
    expect(suggestionOptions(['Bonn', 'Bonn', '', 'Köln'], 'Köln')).toEqual([
      { value: 'Bonn', label: 'Bonn' },
      { value: 'Köln', label: 'Köln' },
    ])
  })

  test('a value that the list lacks comes first', () => {
    expect(suggestionOptions(['Bonn'], 'Hamburg')).toEqual([
      { value: 'Hamburg', label: 'Hamburg' },
      { value: 'Bonn', label: 'Bonn' },
    ])
    expect(suggestionOptions([], '')).toEqual([])
  })
})

describe('tags of other keys', () => {
  test('the default layout does not read other tags', () => {
    const tags: Tags = { 'addr:housenumber': '12', name: 'Shop' }
    expect(names(addressRows(ADDRESS, tags))).toEqual([
      ['housenumber', 'street+place'],
      ['city', 'postcode'],
    ])
  })
})

describe('formatFor, by country, end to end', () => {
  // the layouts of iD's address_formats.json (checked against it when this was written)
  test('Germany: the street before the house number, the postcode before the city', () => {
    expect(names(addressRows(ADDRESS, {}, 'de'))).toEqual([
      ['street+place', 'housenumber'],
      ['postcode', 'city'],
    ])
  })

  test('France: the house number before the street, the postcode before the city', () => {
    expect(names(addressRows(ADDRESS, {}, 'fr'))).toEqual([
      ['housenumber', 'street+place'],
      ['postcode', 'city'],
    ])
  })

  test('the United States: the state between the city and the postcode, the unit after the street', () => {
    expect(names(addressRows(ADDRESS, {}, 'us'))).toEqual([
      ['housenumber', 'street', 'unit'],
      ['city', 'state', 'postcode'],
    ])
  })

  test('Japan: the largest unit first, with its own widths', () => {
    expect(names(addressRows(ADDRESS, {}, 'jp'))).toEqual([
      ['postcode', 'province', 'county'],
      ['city', 'suburb'],
      ['quarter', 'neighbourhood'],
      ['block_number', 'housenumber'],
    ])
    expect(formatFor('jp').widths?.postcode).toBe(0.3)
  })

  test('no country gives the default layout', () => {
    expect(names(addressRows(ADDRESS, {}, undefined))).toEqual([
      ['housenumber', 'street+place'],
      ['city', 'postcode'],
    ])
  })

  test('the country code is taken in any case', () => {
    expect(names(addressRows(ADDRESS, {}, 'US'))).toEqual(names(addressRows(ADDRESS, {}, 'us')))
  })
})

describe('addressSuggestions', () => {
  // A feature at the origin; the host gives each candidate its distance from the edited feature's centre.
  const near = (
    type: AddressCandidate['type'],
    tags: Tags,
    distanceMetres: number,
    extra: Partial<AddressCandidate> = {},
  ): AddressCandidate => ({ type, tags, distanceMetres, ...extra })

  test('streets are the named highways and the addr:street of nearby addresses, nearest first, each once', () => {
    const result = addressSuggestions(
      [
        near('way', { highway: 'residential', name: 'Hauptstraße' }, 60),
        near('way', { highway: 'footway', name: 'Am Park' }, 20),
        near('node', { 'addr:street': 'Bahnhofstraße' }, 35),
        near('way', { highway: 'residential', name: 'Hauptstraße' }, 90),
        near('way', { highway: 'residential' }, 10),
        near('way', { building: 'yes', name: 'Rathaus' }, 15),
      ],
      'addr',
    )
    expect(result.streets).toEqual(['Am Park', 'Bahnhofstraße', 'Hauptstraße'])
  })

  test('a street beyond 200 m is left out', () => {
    const result = addressSuggestions(
      [
        near('way', { highway: 'primary', name: 'Far Road' }, 201),
        near('way', { highway: 'primary', name: 'Near Road' }, 199),
      ],
      'addr',
    )
    expect(result.streets).toEqual(['Near Road'])
  })

  test('places are the named places and the addr:place of nearby addresses; admin level 8 is no place', () => {
    const result = addressSuggestions(
      [
        near('node', { place: 'village', name: 'Lindenhof' }, 80),
        near(
          'relation',
          { boundary: 'administrative', admin_level: '9', name: 'Ortsteil Nord' },
          40,
        ),
        near('relation', { boundary: 'administrative', admin_level: '8', name: 'Stadt' }, 10),
        near('node', { 'addr:place': 'Hof am Berg' }, 120),
        near('node', { place: 'village' }, 5),
      ],
      'addr',
    )
    expect(result.places).toEqual(['Ortsteil Nord', 'Lindenhof', 'Hof am Berg'])
  })

  test('cities take addr:city in place of the name, and a city needs a name unless it has addr:city', () => {
    const result = addressSuggestions(
      [
        near('node', { place: 'town', name: 'Bonn' }, 150),
        near('node', { place: 'city', name: 'Köln', 'addr:city': 'Cologne' }, 90),
        near('relation', { boundary: 'administrative', admin_level: '8', name: 'Bonn' }, 150),
        near('node', { 'addr:city': 'Düsseldorf' }, 120),
        near('node', { place: 'city' }, 10),
        near('node', { place: 'suburb', name: 'Dorf' }, 10),
      ],
      'addr',
    )
    expect(result.cities).toEqual(['Cologne', 'Düsseldorf', 'Bonn'])
  })

  test('postcodes are the addr:postcode values, then the postal_code values, each once', () => {
    const result = addressSuggestions(
      [
        near('node', { 'addr:postcode': '53111' }, 30),
        near('node', { postal_code: '53117' }, 10),
        near('node', { postal_code: '53111' }, 15),
        near('node', { 'addr:postcode': '53113' }, 50),
        near('node', { 'addr:postcode': '53111' }, 70),
      ],
      'addr',
    )
    expect(result.postcodes).toEqual(['53111', '53113', '53117'])
  })

  test('the other inputs list their addr:* values near, nearest first', () => {
    const result = addressSuggestions(
      [
        near('node', { 'addr:suburb': 'Kessenich' }, 100),
        near('node', { 'addr:suburb': 'Dottendorf' }, 40),
        near('node', { 'addr:suburb': 'Kessenich' }, 10),
        near('node', { 'addr:floor': '2' }, 5),
      ],
      'addr',
    )
    expect(result.parts?.suburb).toEqual(['Kessenich', 'Dottendorf'])
    expect(result.parts?.floor).toEqual(['2'])
    expect(result.parts?.town).toEqual([])
  })

  test('housenumbers are the enclosing addresses and the points in an enclosing building, sorted by value', () => {
    const result = addressSuggestions(
      [
        near('relation', { 'addr:housenumber': '12', building: 'yes' }, 0, { encloses: true }),
        near('way', { 'addr:housenumber': '4' }, 0, { encloses: true }),
        near('node', { 'addr:housenumber': '3a' }, 60, { inEnclosingBuilding: true }),
        near('node', { 'addr:housenumber': '99' }, 150, { inEnclosingBuilding: true }),
        near('node', { 'addr:housenumber': '7' }, 20),
      ],
      'addr',
    )
    expect(result.housenumbers).toEqual(['12', '3a', '4'])
  })

  test('housenames are the enclosing addresses by name, and the same rule as housenumbers', () => {
    const result = addressSuggestions(
      [near('way', { 'addr:housename': 'Old Mill' }, 0, { encloses: true })],
      'addr',
    )
    expect(result.housenames).toEqual(['Old Mill'])
    expect(suggestionsFor('housename', result)).toEqual(['Old Mill'])
  })

  test('the keys of the field prefix are used: a postal address reads post:*', () => {
    const result = addressSuggestions(
      [near('node', { 'post:city': 'Gamma' }, 10), near('node', { 'addr:city': 'Delta' }, 10)],
      'post',
    )
    expect(result.cities).toEqual(['Gamma'])
  })

  test('no candidates give empty lists, and the housenumbers then have no list', () => {
    const result = addressSuggestions([], 'addr')
    expect(result.streets).toEqual([])
    expect(result.housenumbers).toEqual([])
    expect(suggestionsFor('housenumber', result)).toBeUndefined()
    expect(suggestionsFor('street', result)).toEqual([])
  })

  test('a candidate without any tag of the lists gives nothing', () => {
    const result = addressSuggestions([near('node', { amenity: 'cafe', name: 'Café' }, 10)], 'addr')
    expect(result.streets).toEqual([])
    expect(result.places).toEqual([])
    expect(result.cities).toEqual([])
    expect(result.postcodes).toEqual([])
  })
})
