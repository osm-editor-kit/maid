import { describe, expect, it } from 'bun:test'
import { mapZoomOf, parseSearch } from './parse.ts'

const positions = (text: string) => parseSearch(text).positions
const ids = (text: string) => parseSearch(text).ids

describe('decimal positions', () => {
  it('reads a comma or space pair in both orders, latitude first', () => {
    expect(positions('52.5, 13.4')).toEqual([
      { lat: 52.5, lon: 13.4 },
      { lat: 13.4, lon: 52.5 },
    ])
    expect(positions('52.5 13.4')).toEqual(positions('52.5, 13.4'))
    expect(positions('52.5;13.4')).toEqual(positions('52.5, 13.4'))
  })

  it('reads a slash pair as the two readings too', () => {
    expect(positions('13.4/52.5')).toEqual([
      { lat: 13.4, lon: 52.5 },
      { lat: 52.5, lon: 13.4 },
    ])
  })

  it('keeps only the reading that is in range', () => {
    expect(positions('95, 10')).toEqual([{ lat: 10, lon: 95 }])
    expect(positions('10, 190')).toEqual([])
    expect(positions('200 300')).toEqual([])
  })

  it('gives one reading when both numbers are the same', () => {
    expect(positions('0, 0')).toEqual([{ lat: 0, lon: 0 }])
  })

  it('accepts signs and surrounding spaces', () => {
    expect(positions('  -33.87 , -58.38  ')).toEqual([
      { lat: -33.87, lon: -58.38 },
      { lat: -58.38, lon: -33.87 },
    ])
  })

  it('reads nothing from text that is no position', () => {
    expect(positions('')).toEqual([])
    expect(positions('Brandenburger Tor')).toEqual([])
    expect(positions('52.5 13.4 foo')).toEqual([])
    expect(positions('52.5')).toEqual([])
  })
})

describe('zoom with the position (OSM zoom)', () => {
  it('reads zoom/lat/lon as typed', () => {
    expect(positions('17/52.5/13.4')).toEqual([{ lat: 52.5, lon: 13.4, zoom: 17 }])
    expect(positions('17.25/52.5228/13.4023')).toEqual([
      { lat: 52.5228, lon: 13.4023, zoom: 17.25 },
    ])
  })

  it('rejects a zoom outside 0 to 24', () => {
    expect(positions('25/52.5/13.4')).toEqual([])
    expect(positions('-1/52.5/13.4')).toEqual([])
  })

  it('maps OSM zoom to MapLibre zoom: one less, never below 0', () => {
    expect(mapZoomOf(17)).toBe(16)
    expect(mapZoomOf(17.25)).toBe(16.25)
    expect(mapZoomOf(0)).toBe(0)
  })
})

describe('links to a map view', () => {
  it('reads the hash of an OSM link', () => {
    expect(positions('https://www.openstreetmap.org/#map=18/52.5/13.4')).toEqual([
      { lat: 52.5, lon: 13.4, zoom: 18 },
    ])
  })

  it('reads map= in a query, and ignores the turn and the tilt after it', () => {
    expect(positions('https://maid.example/?map=17/52.5/13.4/-37.5/0')).toEqual([
      { lat: 52.5, lon: 13.4, zoom: 17 },
    ])
    expect(positions('map=17/52.5/13.4')).toEqual([{ lat: 52.5, lon: 13.4, zoom: 17 }])
  })

  it('does not take a parameter whose name ends in map', () => {
    expect(positions('bmap=17/52.5/13.4')).toEqual([])
  })

  it('reads lat= and lon= in either order, with an optional zoom', () => {
    expect(positions('lat=52.5&lon=13.4')).toEqual([{ lat: 52.5, lon: 13.4 }])
    expect(positions('lon=13.4&lat=52.5')).toEqual([{ lat: 52.5, lon: 13.4 }])
    expect(positions('https://x.example/?lat=52.5&lng=13.4&zoom=16')).toEqual([
      { lat: 52.5, lon: 13.4, zoom: 16 },
    ])
  })

  it('needs both lat and lon', () => {
    expect(positions('lat=52.5')).toEqual([])
  })
})

describe('degrees, minutes and seconds', () => {
  it('reads hemisphere letters and marks', () => {
    const [position] = positions(`52°30'12"N 13°24'18"E`)
    expect(position?.lat).toBeCloseTo(52 + 30 / 60 + 12 / 3600, 9)
    expect(position?.lon).toBeCloseTo(13 + 24 / 60 + 18 / 3600, 9)
    expect(positions(`52°30'12"N 13°24'18"E`)).toHaveLength(1)
  })

  it('reads degrees and minutes without seconds, with a comma', () => {
    expect(positions(`52°30'N, 13°24'E`)).toEqual([{ lat: 52.5, lon: 13.4 }])
  })

  it('takes the axis from the letter when the longitude comes first', () => {
    expect(positions(`13°24'E 52°30'N`)).toEqual([{ lat: 52.5, lon: 13.4 }])
  })

  it('reads decimal numbers with a hemisphere letter or a degree mark', () => {
    expect(positions('52.5 N 13.4 E')).toEqual([{ lat: 52.5, lon: 13.4 }])
    expect(positions('52.5°N, 13.4°E')).toEqual([{ lat: 52.5, lon: 13.4 }])
    expect(positions('52.5° 13.4°')).toEqual([{ lat: 52.5, lon: 13.4 }])
  })

  it('makes south and west negative', () => {
    expect(positions('52.5 S 13.4 W')).toEqual([{ lat: -52.5, lon: -13.4 }])
    expect(positions(`52°30'12"S 13°24'18"W`)[0]?.lat).toBeLessThan(0)
  })

  it('refuses two values on the same axis and minutes of 60 or more', () => {
    expect(positions(`52°30'N 13°24'N`)).toEqual([])
    expect(positions(`52°60'N 13°24'E`)).toEqual([])
  })
})

describe('OSM ids', () => {
  it('reads a typed id in the short and the long form', () => {
    expect(ids('n123')).toEqual([{ type: 'node', id: 'n123' }])
    expect(ids('w45')).toEqual([{ type: 'way', id: 'w45' }])
    expect(ids('r6')).toEqual([{ type: 'relation', id: 'r6' }])
    expect(ids('node 123')).toEqual([{ type: 'node', id: 'n123' }])
    expect(ids('way/45')).toEqual([{ type: 'way', id: 'w45' }])
    expect(ids('Relation:6')).toEqual([{ type: 'relation', id: 'r6' }])
    expect(ids('W 7')).toEqual([{ type: 'way', id: 'w7' }])
  })

  it('drops leading zeros and refuses zero and text', () => {
    expect(ids('N0123')).toEqual([{ type: 'node', id: 'n123' }])
    expect(ids('n0')).toEqual([])
    expect(ids('way 12 34')).toEqual([])
    expect(ids('w')).toEqual([])
    expect(ids('nodes 12')).toEqual([])
  })

  it('reads the object links of OSM', () => {
    expect(ids('https://www.openstreetmap.org/way/123')).toEqual([{ type: 'way', id: 'w123' }])
    expect(ids('https://openstreetmap.org/node/42#map=17/1/2')).toEqual([
      { type: 'node', id: 'n42' },
    ])
    expect(ids('https://www.openstreetmap.org/relation/9')).toEqual([
      { type: 'relation', id: 'r9' },
    ])
  })

  it('reads the selection parameter of Maid and iD, the first id only', () => {
    expect(ids('https://maid.example/?id=w12,n3&map=18/52.5/13.4')).toEqual([
      { type: 'way', id: 'w12' },
    ])
    expect(ids('https://maid.example/#id=n3')).toEqual([{ type: 'node', id: 'n3' }])
  })
})

describe('a text with both', () => {
  it('reads an object link with a map view as an object and a position', () => {
    const parsed = parseSearch('https://www.openstreetmap.org/way/123#map=17/52.5/13.4')
    expect(parsed.ids).toEqual([{ type: 'way', id: 'w123' }])
    expect(parsed.positions).toEqual([{ lat: 52.5, lon: 13.4, zoom: 17 }])
  })

  it('trims the text first', () => {
    expect(ids('   n5  ')).toEqual([{ type: 'node', id: 'n5' }])
  })

  it('reads a name as neither', () => {
    expect(parseSearch('Maid Café')).toEqual({ positions: [], ids: [] })
  })
})
