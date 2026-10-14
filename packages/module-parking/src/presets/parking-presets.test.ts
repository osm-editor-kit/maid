import { afterEach, describe, expect, it } from 'bun:test'
import { setLocale } from '@osm-editor-kit/maid-i18n'
import { createPresets, withChanges } from '@osm-editor-kit/maid-presets'
import type { Geometry, Presets, Tags } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'
import { ROAD_MORE_FIELDS, ROAD_PROMINENT_FIELDS, VEHICLE_KEYS } from './fields.ts'
import { parkingPresetChanges } from './index.ts'
import { PARKING_PRESETS } from './presets.ts'

const defaults: Presets = createPresets(defaultPresetData)
const parking: Presets = createPresets(withChanges(defaultPresetData, parkingPresetChanges))

function fieldValues(presets: Presets, id: string) {
  const field = presets.field(id)
  if (field === undefined) throw new Error(`no field ${id}`)
  return field.options.map((option) => option.value)
}

describe('parkingPresetChanges', () => {
  it('applies to the default presets without throwing, and builds the lookup', () => {
    expect(() => withChanges(defaultPresetData, parkingPresetChanges)).not.toThrow()
    expect(parking.preset('amenity/parking/street-side')?.name).toBe(
      'Parking area (street side bay)',
    )
  })

  it('a residential road shows the side fields first, in the order of the prominent list, then the rest under "Add field"', () => {
    const tags: Tags = { highway: 'residential' }
    const preset = parking.match(tags, 'line')
    expect(preset.id).toBe('highway/residential')
    const shown = parking.fieldsFor(preset, tags, 'line').map((field) => field.id)
    const sideShown = shown.filter((id) => id.startsWith('parking/side/'))
    expect(sideShown).toEqual([...ROAD_PROMINENT_FIELDS])
    // a parking editor: before the road's own fields
    expect(shown.slice(0, ROAD_PROMINENT_FIELDS.length)).toEqual([...ROAD_PROMINENT_FIELDS])
    expect(shown).toContain('name')
    expect(shown).toContain('maxspeed')

    const more = parking.moreFieldsFor(preset, tags, 'line').map((field) => field.id)
    expect(more).not.toContain('parking/side/parking')
    expect(more).not.toContain('parking/side/orientation')
    for (const id of ROAD_MORE_FIELDS) expect(more).toContain(id)
  })

  it('the other highway presets that show side fields get the same prominent fields', () => {
    // secondary, tertiary, unclassified and road take these lists from primary and residential through references
    for (const road of [
      'primary',
      'living_street',
      'service',
      'secondary',
      'tertiary',
      'unclassified',
      'road',
    ]) {
      const tags: Tags = { highway: road }
      const shown = parking
        .fieldsFor(parking.match(tags, 'line'), tags, 'line')
        .map((field) => field.id)
        .filter((id) => id.startsWith('parking/side/'))
      expect(shown).toEqual([...ROAD_PROMINENT_FIELDS])
    }
  })

  it('the restriction field owns its conditional keys, so removing the field removes them too', () => {
    expect(parking.field('parking/side/restriction')?.keys).toEqual([
      'parking:left:restriction',
      'parking:right:restriction',
      'parking:both:restriction:conditional',
      'parking:left:restriction:conditional',
      'parking:right:restriction:conditional',
    ])
    expect(parking.field('parking/area/restriction')?.keys).toEqual(['restriction:conditional'])
  })

  it('a side field writes its keys for left and right, with the value list of the project', () => {
    const position = parking.field('parking/side/parking')
    expect(position?.type).toBe('directionalCombo')
    expect(position?.key).toBe('parking:both')
    expect(position?.keys).toEqual(['parking:left', 'parking:right'])
    const restriction = parking.field('parking/side/restriction')
    expect(restriction?.type).toBe('parkingRestriction')
    expect(restriction?.key).toBe('parking:both:restriction')
  })
})

describe('the new presets match their tags', () => {
  const cases: [string, Tags, Geometry, string][] = [
    [
      'amenity/parking/street-side',
      { amenity: 'parking', parking: 'street_side' },
      'area',
      'Parking area (street side bay)',
    ],
    // the XML's Parkplatz offers four parking values: each has the preset with the project's fields
    [
      'parking/area/lane',
      { amenity: 'parking', parking: 'lane' },
      'area',
      'Parking area (on the carriageway)',
    ],
    [
      'parking/area/half_on_kerb',
      { amenity: 'parking', parking: 'half_on_kerb' },
      'area',
      'Parking area (half on the kerb)',
    ],
    [
      'parking/area/disabled_permit',
      { amenity: 'parking', disabled: 'private' },
      'area',
      'Disabled parking bay with permit number',
    ],
    // the disabled bay wins over the Parkplatz of its parking value (as the preset itself writes the tags)
    [
      'parking/area/disabled_permit',
      { amenity: 'parking', disabled: 'private', parking: 'lane', access: 'no' },
      'area',
      'Disabled parking bay with permit number',
    ],
    [
      'parking/entrance_underground',
      { amenity: 'parking_entrance', parking: 'underground' },
      'point',
      'Underground car park entrance',
    ],
    [
      'parking/entrance_underground',
      { amenity: 'parking_entrance', parking: 'underground' },
      'vertex',
      'Underground car park entrance',
    ],
    ['parking/obstacle', { 'obstacle:parking': 'yes' }, 'point', 'Obstacle in the parking area'],
    ['parking/obstacle', { 'obstacle:parking': 'yes' }, 'area', 'Obstacle in the parking area'],
  ]
  for (const [id, tags, geometry, name] of cases) {
    it(`${id} for ${JSON.stringify(tags)} (${geometry})`, () => {
      const preset = parking.match(tags, geometry)
      expect(preset.id).toBe(id)
      expect(preset.name).toBe(name)
    })
  }

  it('every new preset is in the data with its geometry', () => {
    for (const [id, definition] of Object.entries(PARKING_PRESETS)) {
      const preset = parking.preset(id)
      expect(preset, id).toBeDefined()
      expect([...(preset?.geometry ?? [])].sort()).toEqual([...definition.geometry].sort())
    }
  })

  it('the four Parkplatz presets show the same fields, so a change of the parking value keeps them', () => {
    const fieldsOf = (value: string) => {
      const tags: Tags = { amenity: 'parking', parking: value }
      return parking.fieldsFor(parking.match(tags, 'area'), tags, 'area').map((field) => field.id)
    }
    for (const value of ['lane', 'on_kerb', 'half_on_kerb'])
      expect(fieldsOf(value)).toEqual(fieldsOf('street_side'))
    expect(fieldsOf('lane')).toContain('parking/area/restriction')
  })

  it('the German terms are found by search', () => {
    expect(parking.search('Tiefgarageneinfahrt', 'point')[0]?.id).toBe(
      'parking/entrance_underground',
    )
    expect(parking.search('Behindertenparkplatz', 'area')[0]?.id).toBe(
      'parking/area/disabled_permit',
    )
  })
})

describe("iD's presets that the project also has", () => {
  it("driveway and lowered kerb are not replaced: fields, geometry and match score are iD's", () => {
    for (const id of ['highway/service/driveway', 'barrier/kerb/lowered']) {
      expect(parking.preset(id), id).toEqual(defaults.preset(id))
    }
  })

  it("a crossing stays a vertex and keeps iD's fields, with the three fields of the project after them", () => {
    const extra = [
      'parking/crossing/kerb_extension',
      'parking/crossing/buffer_marking',
      'parking/crossing/buffer_protection',
    ]
    for (const crossing of [undefined, 'unmarked', 'uncontrolled', 'marked', 'traffic_signals']) {
      const tags: Tags = crossing ? { highway: 'crossing', crossing } : { highway: 'crossing' }
      const before = defaults.match(tags, 'vertex')
      const after = parking.match(tags, 'vertex')
      expect(after.id).toBe(before.id)
      expect([...after.geometry]).toEqual(['vertex'])
      const fieldsBefore = defaults.fieldsFor(before, tags, 'vertex').map((field) => field.id)
      const fieldsAfter = parking.fieldsFor(after, tags, 'vertex').map((field) => field.id)
      expect(fieldsAfter).toEqual([...fieldsBefore, ...extra])
    }
  })

  it('iD\'s Parking Lot offers the project\'s area fields under "Add field"', () => {
    const tags: Tags = { amenity: 'parking' }
    const more = parking
      .moreFieldsFor(parking.match(tags, 'area'), tags, 'area')
      .map((field) => field.id)
    for (const id of ['parking/area/restriction', 'parking/area/zone', 'parking/area/markings'])
      expect(more).toContain(id)
  })
})

describe('the default presets keep their match', () => {
  // Tag sets the parking changes must not change (their preset id, geometry as given). Same-id replacements are
  // in the list too: a replaced preset keeps its id, so its own tags still match it.
  const samples: [Tags, Geometry][] = [
    [{ highway: 'residential' }, 'line'],
    [{ highway: 'primary' }, 'line'],
    [{ highway: 'tertiary' }, 'line'],
    [{ highway: 'unclassified' }, 'line'],
    [{ highway: 'living_street' }, 'line'],
    [{ highway: 'service' }, 'line'],
    [{ highway: 'service', service: 'driveway' }, 'line'],
    [{ highway: 'trunk' }, 'line'],
    [{ highway: 'footway' }, 'line'],
    [{ highway: 'cycleway' }, 'line'],
    [{ amenity: 'parking' }, 'area'],
    [{ amenity: 'parking' }, 'point'],
    [{ amenity: 'parking', parking: 'surface' }, 'area'],
    [{ amenity: 'parking', parking: 'street_side' }, 'area'],
    [{ amenity: 'parking', parking: 'underground' }, 'area'],
    [{ amenity: 'parking', park_ride: 'yes' }, 'area'],
    [{ amenity: 'parking_space' }, 'area'],
    [{ amenity: 'parking_entrance' }, 'vertex'],
    [{ barrier: 'kerb' }, 'line'],
    [{ barrier: 'kerb', kerb: 'raised' }, 'line'],
    [{ barrier: 'kerb', kerb: 'lowered' }, 'vertex'],
    [{ highway: 'crossing', crossing: 'unmarked' }, 'vertex'],
    [{ highway: 'crossing', crossing: 'marked' }, 'vertex'],
    [{ highway: 'crossing' }, 'vertex'],
    [{ highway: 'footway', footway: 'crossing' }, 'line'],
    [{ amenity: 'cafe' }, 'point'],
    [{ shop: 'bakery' }, 'point'],
    [{ building: 'yes' }, 'area'],
    [{ barrier: 'bollard' }, 'vertex'],
    [{ emergency: 'fire_hydrant' }, 'point'],
  ]
  it(`${samples.length} sample tag sets match as before`, () => {
    for (const [tags, geometry] of samples) {
      const before = defaults.match(tags, geometry).id
      const after = parking.match(tags, geometry).id
      expect(after, `${JSON.stringify(tags)} ${geometry}`).toBe(before)
    }
  })
})

describe('every value of parkraumprojekt.xml is offered', () => {
  // The value lists of the XML, as written (chunk id → values). The conditional lists are examples of text, not
  // options, so they are not listed here: those fields are free text (see fields.ts).
  const XML_LISTS: Record<string, string[]> = {
    bool_values: ['yes', 'no'],
    access_values: ['yes', 'private', 'permissive', 'customers', 'no'],
    parking_values: ['street_side', 'lane', 'on_kerb', 'half_on_kerb'],
    orientation_values: ['parallel', 'diagonal', 'perpendicular'],
    surface_values: [
      'asphalt',
      'concrete',
      'concrete:plates',
      'paving_stones',
      'sett',
      'compacted',
      'ground',
    ],
    maxstay_values: [
      '5 minutes',
      '15 minutes',
      '30 minutes',
      '1 hour',
      '2 hours',
      '3 hours',
      '24 hours',
      '7 days',
    ],
    restriction_values: ['no_parking', 'no_stopping', 'loading_only', 'charging_only'],
    crossing_values: ['unmarked', 'marked', 'traffic_signals'],
    crossing_markings_values: ['no', 'surface', 'dashes', 'dots', 'zebra', 'pictograms'],
    crossing_side_values: ['both', 'left', 'right'],
  }
  const ON_FIELDS: Record<string, string[]> = {
    // tactile paving is iD's check field (yes, no): a check has no option list
    bool_values: ['parking/area/fee', 'parking/area/markings', 'crossing/island'],
    access_values: ['parking/area/access', 'parking/side/access'],
    parking_values: ['parking/area/parking'],
    orientation_values: ['parking/side/orientation', 'orientation/orientation_parking'],
    surface_values: ['parking/area/surface', 'parking/side/surface'],
    maxstay_values: ['parking/area/maxstay', 'parking/side/maxstay'],
    restriction_values: ['parking/area/restriction', 'parking/side/restriction'],
    crossing_values: ['crossing'],
    crossing_markings_values: ['crossing/markings'],
    crossing_side_values: [
      'parking/crossing/kerb_extension',
      'parking/crossing/buffer_marking',
      'parking/crossing/buffer_protection',
    ],
  }
  for (const [list, values] of Object.entries(XML_LISTS)) {
    it(list, () => {
      for (const fieldId of ON_FIELDS[list] ?? []) {
        const offered = fieldValues(parking, fieldId)
        for (const value of values) expect(offered, `${fieldId} ${value}`).toContain(value)
      }
    })
  }

  it('the side position takes the four values of the parking list and the hot-button values', () => {
    const offered = fieldValues(parking, 'parking/side/parking')
    for (const value of [
      'street_side',
      'lane',
      'on_kerb',
      'half_on_kerb',
      'shoulder',
      'separate',
      'no',
    ]) {
      expect(offered).toContain(value)
    }
  })

  it('the checkgroup of Parkplatz: one field per vehicle, offering designated', () => {
    for (const vehicle of VEHICLE_KEYS) {
      const field = parking.field(`parking/area/vehicle/${vehicle}`)
      expect(field?.key).toBe(vehicle)
      expect(fieldValues(parking, `parking/area/vehicle/${vehicle}`)).toEqual(['designated'])
    }
  })

  it('the conditional variants are free text, on areas and on roads (the restriction ones are in its field)', () => {
    for (const id of [
      'parking/area/fee_conditional',
      'parking/area/maxstay_conditional',
      'parking/area/access_conditional',
    ]) {
      expect(parking.field(id)?.options).toEqual([])
    }
    for (const id of ['parking/side/fee_conditional']) {
      expect(parking.field(id)?.type).toBe('directionalCombo')
      expect(parking.field(id)?.options).toEqual([])
    }
  })
})

describe('the names follow the page language', () => {
  afterEach(() => setLocale('en'))

  it('shows the German names, field labels and option labels of the parking presets in German', () => {
    setLocale('de')
    const german = createPresets(withChanges(defaultPresetData, parkingPresetChanges))
    expect(german.preset('amenity/parking/street-side')?.name).toBe('Parkplatz (Parkbucht)')
    expect(german.preset('highway/service/driveway')?.name).toBe('Einfahrt')
    expect(german.field('parking/side/parking')?.label).toBe('Parkposition')
    const lane = german.field('parking/side/parking')?.options.find((o) => o.value === 'lane')
    expect(lane?.label).toBe('Fahrbahn')
    expect(german.field('crossing')?.label).toBe('Querungsart')
  })

  it('shows English again when the page is English, and leaves the other presets alone', () => {
    setLocale('de')
    createPresets(withChanges(defaultPresetData, parkingPresetChanges))
    setLocale('en')
    const english = createPresets(withChanges(defaultPresetData, parkingPresetChanges))
    expect(english.preset('amenity/parking/street-side')?.name).toBe(
      'Parking area (street side bay)',
    )
    expect(english.preset('highway/service/driveway')?.name).toBe('Driveway')
    expect(english.field('parking/side/parking')?.label).toBe('Parking position')
    expect(english.preset('highway/residential')?.name).toBe(
      defaults.preset('highway/residential')?.name,
    )
  })
})
