import { describe, expect, test } from 'bun:test'
import { addressLabel, isAddressTags } from './address'

describe('isAddressTags (iD isAddressPoint)', () => {
  test('a node with only addr: keys is an address', () => {
    expect(isAddressTags({ 'addr:housenumber': '4', 'addr:street': 'Weg' })).toBe(true)
  })

  test('source and other uninteresting keys do not stop it being an address', () => {
    expect(
      isAddressTags({
        'addr:housenumber': '42',
        source: 'Geoportal Berlin / Hauskoordinaten',
        'source:addr': 'survey',
        'tiger:reviewed': 'no',
      }),
    ).toBe(true)
  })

  test('non-primary keys do not stop it being an address', () => {
    expect(
      isAddressTags({ 'addr:housenumber': '4', note: 'check', level: '1', 'note:de': 'x' }),
    ).toBe(true)
  })

  test('a bare ref is a primary key for iD (only ref: is non-primary)', () => {
    expect(isAddressTags({ 'addr:housenumber': '4', ref: '7' })).toBe(false)
  })

  test('any other primary key makes it a pin', () => {
    expect(isAddressTags({ 'addr:housenumber': '4', name: 'Bakery' })).toBe(false)
    expect(isAddressTags({ 'addr:housenumber': '4', amenity: 'bench' })).toBe(false)
  })

  test('a node with no tags, or only uninteresting ones, is not an address', () => {
    expect(isAddressTags({})).toBe(false)
    expect(isAddressTags({ source: 'survey' })).toBe(false)
  })
})

describe('addressLabel (iD utilDisplayName, map label)', () => {
  test('the house number', () => {
    expect(addressLabel({ 'addr:housenumber': '21B', 'addr:street': 'Hendonstraße' })).toBe('21B')
  })

  test('the house name wins over the number', () => {
    expect(addressLabel({ 'addr:housename': 'Villa Rot', 'addr:housenumber': '3' })).toBe(
      'Villa Rot',
    )
  })

  test('the unit is not on the map', () => {
    expect(addressLabel({ 'addr:housenumber': '5', 'addr:unit': '2.OG' })).toBe('5')
  })

  test('empty when there is no number and no name', () => {
    expect(addressLabel({ 'addr:street': 'Weg', 'addr:postcode': '12305' })).toBe('')
  })
})
