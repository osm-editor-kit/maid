import { describe, expect, test } from 'bun:test'
import { labelOf, mapLabelOf, type LabelFlags } from './label'

// Ported from iD's test/spec/util/util.js, describe('utilDisplayName'). The localised cases pass the
// locale codes in the order the test expects (iD's localizer produces them; the caller expands them here).
const MAP: LabelFlags = { isMapLabel: true }

describe('labelOf: iD utilDisplayName', () => {
  test('returns the name if tagged with a name', () => {
    expect(labelOf({ name: 'East Coast Greenway' })).toBe('East Coast Greenway')
  })

  test('returns just the name for non-routes', () => {
    expect(labelOf({ name: 'Abyssinian Room', ref: '260-115' })).toBe('Abyssinian Room')
  })

  test('returns just the name for route with PTv2-formatted names', () => {
    expect(
      labelOf({
        name: 'NORTA 2: French Market → Canal at Bourbon',
        network: 'NORTA',
        ref: '2',
        from: 'French Market',
        to: 'Canal at Bourbon',
      }),
    ).toBe('NORTA 2: French Market → Canal at Bourbon')
    expect(
      labelOf({
        name: 'VTA 64A: McKee & White => San Jose Diridon => Ohlone/Chynoweth',
        network: 'VTA',
        ref: '64A',
        from: 'McKee & White',
        to: 'Ohlone/Chynoweth',
        via: 'San Jose Diridon',
      }),
    ).toBe('VTA 64A: McKee & White => San Jose Diridon => Ohlone/Chynoweth')
    expect(
      labelOf({
        name: 'Bus 224: Downtown Garland Station -> Lake Ray Hubbard TC -> Downtown Dallas',
        route: 'bus',
        ref: '224',
        from: 'Downtown Garland Station',
        to: 'Downtown Dallas',
        via: 'Lake Ray Hubbard TC',
      }),
    ).toBe('Bus 224: Downtown Garland Station -> Lake Ray Hubbard TC -> Downtown Dallas')
  })

  test('suppresses the network tag if the hideNetwork flag is set', () => {
    const flags = { hideNetwork: true }
    expect(
      labelOf(
        { name: 'Lynfield Express', ref: '25L', network: 'AT', route: 'bus' },
        undefined,
        flags,
      ),
    ).toBe('25L: Lynfield Express')
    expect(labelOf({ network: 'SORTA', ref: '3X' }, undefined, flags)).toBe('3X')
    expect(
      labelOf(
        { name: 'Dallas North Tollway', network: 'US:TX:NTTA', route: 'road' },
        undefined,
        flags,
      ),
    ).toBe('Dallas North Tollway')
  })

  test('suppresses the ref tag if the hideRef flag is set', () => {
    const flags = { hideRef: true }
    expect(
      labelOf(
        { name: 'Lynfield Express', ref: '25L', network: 'AT', route: 'bus' },
        undefined,
        flags,
      ),
    ).toBe('AT Lynfield Express')
    expect(labelOf({ network: 'SORTA', ref: '3X' }, undefined, flags)).toBe('SORTA')
    expect(
      labelOf(
        { name: 'Dallas North Tollway', network: 'US:TX:NTTA', route: 'road' },
        undefined,
        flags,
      ),
    ).toBe('US:TX:NTTA Dallas North Tollway')
  })

  test('distinguishes unnamed features by ref', () => {
    expect(labelOf({ ref: '66' })).toBe('66')
  })

  test('distinguishes unnamed features by network or cycle_network', () => {
    expect(labelOf({ network: 'SORTA', ref: '3X' })).toBe('SORTA 3X')
    expect(labelOf({ network: 'ncn', cycle_network: 'US:US', ref: '76' })).toBe('US:US 76')
  })

  test('distinguishes unnamed routes by direction', () => {
    expect(labelOf({ network: 'US:US', ref: '66', direction: 'west', route: 'road' })).toBe(
      'US:US 66 west',
    )
    expect(
      labelOf({ network: 'Marguerite', ref: 'X', direction: 'anticlockwise', route: 'bus' }),
    ).toBe('Marguerite X anticlockwise')
  })

  test('distinguishes unnamed routes by waypoints', () => {
    expect(labelOf({ network: 'SORTA', ref: '3X', from: 'Downtown', route: 'bus' })).toBe(
      'SORTA 3X',
    )
    expect(labelOf({ network: 'SORTA', ref: '3X', to: 'Kings Island', route: 'bus' })).toBe(
      'SORTA 3X',
    )
    expect(labelOf({ network: 'SORTA', ref: '3X', via: 'Montgomery', route: 'bus' })).toBe(
      'SORTA 3X',
    )
    expect(
      labelOf({
        network: 'VTA',
        ref: 'Green',
        from: 'Old Ironsides',
        to: 'Winchester',
        route: 'bus',
      }),
    ).toBe('VTA Green from Old Ironsides to Winchester')
    expect(
      labelOf({
        network: 'BART',
        ref: 'Yellow',
        from: 'Antioch',
        to: 'Millbrae',
        via: 'Pittsburg/Bay Point;San Francisco International Airport',
        route: 'subway',
      }),
    ).toBe(
      'BART Yellow from Antioch to Millbrae via Pittsburg/Bay Point;San Francisco International Airport',
    )
  })

  test('can use alternative name tags', () => {
    expect(labelOf({ loc_ref: 'A' })).toBe('A')
    expect(labelOf({ 'seamark:name': 'Bean Rock' })).toBe('Bean Rock')

    expect(labelOf({ highway: 'milestone', distance: '12' })).toBe('12')
    expect(labelOf({ distance: '12' })).toBe('') // `distance` is not used as a name on other features

    expect(labelOf({ railway: 'milestone', 'railway:position': '12' })).toBe('12')
    expect(labelOf({ 'railway:position': '12' })).toBe('') // not a name on other features
  })

  test('prefers standard tags over alternative names', () => {
    expect(labelOf({ name: '1', official_name: '2' })).toBe('1')
    expect(labelOf({ ref: '1', loc_ref: '2' })).toBe('1')
    expect(labelOf({ ref: '1', network: 'AT', loc_ref: '2' })).toBe('AT 1')
  })

  test('distinguishes named features by name', () => {
    expect(labelOf({ name: 'Ohio Turnpike', route: 'road' })).toBe('Ohio Turnpike')
    expect(labelOf({ name: 'Lynfield Express', ref: '25L', route: 'bus' })).toBe(
      '25L: Lynfield Express',
    )
    expect(labelOf({ name: 'Kāpiti Expressway', ref: 'SH1', route: 'road' })).toBe(
      'SH1: Kāpiti Expressway',
    )
    expect(labelOf({ name: 'Lynfield Express', ref: '25L', network: 'AT', route: 'bus' })).toBe(
      'AT 25L: Lynfield Express',
    )
  })

  test('distinguishes named features by network or cycle_network', () => {
    expect(labelOf({ name: 'Dallas North Tollway', network: 'US:TX:NTTA', route: 'road' })).toBe(
      'US:TX:NTTA Dallas North Tollway',
    )
  })

  test('distinguishes named features by ref', () => {
    expect(
      labelOf({ name: 'Dallas North Tollway', network: 'US:TX:NTTA', ref: 'DNT', route: 'road' }),
    ).toBe('US:TX:NTTA DNT: Dallas North Tollway')
  })

  test('distinguishes named features by direction', () => {
    expect(
      labelOf({
        name: 'Dallas North Tollway',
        network: 'US:TX:NTTA',
        direction: 'south',
        route: 'road',
      }),
    ).toBe('US:TX:NTTA Dallas North Tollway south')
  })

  test('distinguishes named features by waypoints', () => {
    expect(
      labelOf({
        name: 'Kings Island Express',
        network: 'SORTA',
        ref: '71X',
        from: 'Sycamore & Court',
        to: 'Fields Ertel & Royal Point',
        route: 'bus',
      }),
    ).toBe('SORTA 71X: Kings Island Express from Sycamore & Court to Fields Ertel & Royal Point')
    expect(
      labelOf({
        name: 'Local',
        network: 'Caltrain',
        from: 'San Francisco',
        to: 'Tamien',
        via: 'College Park',
        route: 'train',
      }),
    ).toBe('Caltrain Local from San Francisco to Tamien via College Park')
  })

  test('uses addr:housename', () => {
    expect(labelOf({ 'addr:housename': 'Siglap House' })).toBe('Siglap House')
  })

  test('uses the street address (addr:street) as a last resort', () => {
    expect(labelOf({ 'addr:housenumber': '31', 'addr:street': 'Princes Street' })).toBe(
      '31 Princes Street',
    )
  })

  test('uses the street address (addr:place) as a last resort', () => {
    expect(labelOf({ 'addr:housenumber': '1', 'addr:place': 'Motutapu Island' })).toBe(
      '1 Motutapu Island',
    )
  })

  test('uses addr:unit if present', () => {
    expect(
      labelOf({ 'addr:unit': 'Flat 1', 'addr:housenumber': '30', 'addr:street': 'Madden Street' }),
    ).toBe('Flat 1, 30 Madden Street')
  })

  test('uses just addr:housenumber if it is the only addr: tag present', () => {
    expect(labelOf({ 'addr:housenumber': '32' })).toBe('32')
  })

  test('uses only the housenumber for map labels', () => {
    expect(
      labelOf({ 'addr:housenumber': '31', 'addr:street': 'Princes Street' }, undefined, MAP),
    ).toBe('31')
  })

  describe('localised names', () => {
    const order = ['en-Latn-US', 'en-US', 'en-Latn', 'en']

    test('considers the original locale code first', () => {
      expect(
        labelOf(
          {
            name: '5',
            'name:en': '4',
            'name:en-Latn': '3',
            'name:en-US': '2',
            'name:en-Latn-US': '1',
          },
          order,
        ),
      ).toBe('1')
    })

    test('falls back to the less specific codes', () => {
      expect(
        labelOf({ name: '5', 'name:en': '4', 'name:en-Latn': '3', 'name:en-US': '2' }, order),
      ).toBe('2')
      expect(labelOf({ name: '5', 'name:en': '4', 'name:en-Latn': '3' }, order)).toBe('3')
      expect(labelOf({ name: '5', 'name:en': '4' }, order)).toBe('4')
    })
  })
})

describe('labelOf: Maid additions', () => {
  test('a feature with nothing to show gives the empty string', () => {
    expect(labelOf({})).toBe('')
    expect(labelOf({ highway: 'residential' })).toBe('')
  })

  test('an empty name is not a name: a ref is used', () => {
    expect(labelOf({ name: '', ref: 'B 96' })).toBe('B 96')
  })

  test('a road with only a ref is labelled with the ref', () => {
    expect(labelOf({ highway: 'primary', ref: 'B 96' })).toBe('B 96')
    expect(labelOf({ highway: 'trunk', ref: 'A 100' }, undefined, MAP)).toBe('A 100')
  })

  test('a route with a name and no ref or network is the name', () => {
    expect(labelOf({ route: 'bicycle', name: 'Elbe Cycle Route' })).toBe('Elbe Cycle Route')
  })

  test('a route with only waypoints is the waypoints', () => {
    expect(labelOf({ route: 'train', from: 'A', to: 'B' })).toBe('from A to B')
  })

  test('the locale list falls back to the plain name when no localised name exists', () => {
    expect(labelOf({ name: 'Wien', 'name:de': 'Wien' }, ['de-AT', 'de'])).toBe('Wien')
    expect(labelOf({ name: 'Vienna', 'name:de': 'Wien' }, ['de-AT', 'de'])).toBe('Wien')
    expect(labelOf({ name: 'Vienna', 'name:fr': 'Vienne' }, ['de-AT', 'de'])).toBe('Vienna')
  })

  test('a non-route name is returned even when a locale is passed and the name is an arrow', () => {
    expect(labelOf({ name: 'A → B' }, ['de'])).toBe('A → B')
  })
})

describe('mapLabelOf', () => {
  test('a line, area or point without name or ref has no label', () => {
    expect(mapLabelOf({})).toBe('')
    expect(mapLabelOf({ highway: 'service', service: 'parking_aisle' })).toBe('')
    // an alternative name key is not used for a map label without name or ref (see label.ts)
    expect(mapLabelOf({ alt_name: 'Alt' })).toBe('')
  })

  test('uses the name when there is one', () => {
    expect(mapLabelOf({ highway: 'residential', name: 'Hauptstraße', ref: '1' })).toBe(
      'Hauptstraße',
    )
  })

  test('uses the ref of a road with no name', () => {
    expect(mapLabelOf({ highway: 'primary', ref: 'B 96' })).toBe('B 96')
  })

  test('uses the network and ref of a numbered feature with no name', () => {
    expect(mapLabelOf({ network: 'SORTA', ref: '3X' })).toBe('SORTA 3X')
  })

  test('an address without name or ref is not a map label', () => {
    expect(mapLabelOf({ 'addr:housenumber': '31', 'addr:street': 'Princes Street' })).toBe('')
  })
})
