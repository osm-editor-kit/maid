import { describe, expect, test } from 'bun:test'
import { createUrlParams } from '@osm-editor-kit/maid-core'
import { parseAsDataLink, linkedLayerId, linkedLayerName } from './url.ts'

describe('the data parameter: one remote address', () => {
  test('a GeoJSON or PMTiles address, https or a path on this server, is read as it is', () => {
    expect(parseAsDataLink.parse('https://example.org/bike.geojson')).toBe(
      'https://example.org/bike.geojson',
    )
    expect(parseAsDataLink.parse('https://example.org/x.pmtiles?v=2')).toBe(
      'https://example.org/x.pmtiles?v=2',
    )
    expect(parseAsDataLink.parse('/data/parking.json')).toBe('/data/parking.json')
    // the value is trimmed, as the form trims it
    expect(parseAsDataLink.parse('  https://example.org/a.geojson ')).toBe(
      'https://example.org/a.geojson',
    )
  })

  test('nothing, another scheme, a protocol-relative address and vector tiles give no opinion', () => {
    expect(parseAsDataLink.parse('')).toBeNull()
    expect(parseAsDataLink.parse('   ')).toBeNull()
    expect(parseAsDataLink.parse('javascript:alert(1)')).toBeNull()
    expect(parseAsDataLink.parse('//example.org/a.geojson')).toBeNull()
    // vector tiles need source layer names a link cannot give
    expect(parseAsDataLink.parse('https://t.example.org/{z}/{x}/{y}.pbf')).toBeNull()
  })

  test('serialize writes the address back as it is', () => {
    expect(parseAsDataLink.serialize('https://example.org/a.geojson')).toBe(
      'https://example.org/a.geojson',
    )
  })

  test('the parameter is declared under its name, and the app does not own it', () => {
    const { handle } = createUrlParams(['map', 'id']).declare(
      { name: 'data', parser: parseAsDataLink, options: { history: 'replace' } },
      'data-layers',
    )
    expect(handle.name).toBe('data')
    expect(handle.iD).toBeUndefined()
  })
})

describe('the name and the id of a linked layer', () => {
  test('the name is the file name without its extension, decoded', () => {
    expect(linkedLayerName('https://example.org/data/bike-parking.geojson')).toBe('bike-parking')
    expect(linkedLayerName('https://example.org/x/Radwege%20Berlin.json?v=1')).toBe(
      'Radwege Berlin',
    )
    expect(linkedLayerName('/data/parking.pmtiles#x')).toBe('parking')
  })

  test('a name with nothing to show is "Linked data"', () => {
    expect(linkedLayerName('https://example.org/')).toBe('example.org')
    expect(linkedLayerName('/')).toBe('Linked data')
  })

  test('the id is the same for the same address, and a layer id as the checks allow', () => {
    const url = 'https://example.org/bike.geojson'
    expect(linkedLayerId(url)).toBe(linkedLayerId(url))
    expect(linkedLayerId(url)).not.toBe(linkedLayerId('https://example.org/other.geojson'))
    expect(linkedLayerId(url)).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
  })
})
