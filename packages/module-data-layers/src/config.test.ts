import { describe, expect, test } from 'bun:test'
import {
  checkConfigLayers,
  checkDataLayerConfig,
  checkLayerUrl,
  guessKind,
  isLocalUrl,
  parseSourceLayers,
  pickColor,
  PALETTE,
  resolveColors,
  type DataLayerConfig,
} from './config.ts'

const GEOJSON: DataLayerConfig = {
  id: 'parking',
  name: 'Bike parking',
  kind: 'geojson',
  url: 'https://example.org/p.geojson',
}

describe('checkDataLayerConfig', () => {
  test('accepts a GeoJSON layer and trims its fields', () => {
    const checked = checkDataLayerConfig({
      ...GEOJSON,
      name: '  Bike parking ',
      url: ' https://example.org/p.geojson ',
    })
    expect(checked).toEqual({ ok: true, value: { ...GEOJSON, name: 'Bike parking' } })
  })

  test('takes a colour in any case and lower-cases it', () => {
    const checked = checkDataLayerConfig({ ...GEOJSON, color: '#D6007A' })
    expect(checked).toEqual({ ok: true, value: { ...GEOJSON, color: '#d6007a' } })
  })

  test('accepts vector tiles with source layers, split and trimmed', () => {
    const checked = checkDataLayerConfig({
      id: 'v',
      name: 'Tiles',
      kind: 'vector',
      url: 'https://tiles.example.org/{z}/{x}/{y}.pbf',
      sourceLayers: [' buildings ', 'roads'],
    })
    expect(checked).toEqual({
      ok: true,
      value: {
        id: 'v',
        name: 'Tiles',
        kind: 'vector',
        url: 'https://tiles.example.org/{z}/{x}/{y}.pbf',
        sourceLayers: ['buildings', 'roads'],
      },
    })
  })

  test('accepts PMTiles without source layers (they are read from the file)', () => {
    const checked = checkDataLayerConfig({
      id: 'p',
      name: 'P',
      kind: 'pmtiles',
      url: 'https://x.org/a.pmtiles',
    })
    expect(checked.ok).toBe(true)
  })

  test('names every reason a layer is not usable', () => {
    const checked = checkDataLayerConfig({
      id: 'has space',
      name: ' ',
      kind: 'wms',
      url: 'ftp://x',
      color: 'red',
    })
    expect(checked.ok).toBe(false)
    if (checked.ok) return
    // the address is not checked for a kind that does not exist
    expect(checked.errors).toHaveLength(4)
    expect(checked.errors.join(' ')).toContain('The id must be')
    expect(checked.errors.join(' ')).toContain('The name must not be empty')
    expect(checked.errors.join(' ')).toContain('The kind must be one of geojson, pmtiles, vector')
    expect(checked.errors.join(' ')).toContain('#d6007a')
  })

  test('an address with another scheme is refused for a real kind', () => {
    const checked = checkDataLayerConfig({ ...GEOJSON, url: 'ftp://x/a.geojson' })
    expect(checked).toEqual({
      ok: false,
      errors: ['The address must start with https:// (or http://).'],
    })
  })

  test('vector tiles need source layers and a template with z, x and y', () => {
    const checked = checkDataLayerConfig({
      id: 'v',
      name: 'V',
      kind: 'vector',
      url: 'https://x.org/{z}/{x}/{y}',
    })
    expect(checked).toEqual({
      ok: false,
      errors: ['Vector tiles need the names of their source layers.'],
    })
    const noTemplate = checkDataLayerConfig({
      id: 'v',
      name: 'V',
      kind: 'vector',
      url: 'https://x.org/t.pbf',
      sourceLayers: ['a'],
    })
    expect(noTemplate.ok).toBe(false)
    if (!noTemplate.ok)
      expect(noTemplate.errors).toEqual(['A vector tile address needs {z}, {x} and {y} in it.'])
  })

  test('source layers only apply to vector tiles and PMTiles', () => {
    const checked = checkDataLayerConfig({ ...GEOJSON, sourceLayers: ['a'] })
    expect(checked).toEqual({
      ok: false,
      errors: ['Source layers only apply to vector tiles and PMTiles.'],
    })
  })

  test('rejects a non-object', () => {
    expect(checkDataLayerConfig('layer')).toEqual({
      ok: false,
      errors: ['A data layer must be an object.'],
    })
    expect(checkDataLayerConfig(null).ok).toBe(false)
  })
})

describe('checkLayerUrl', () => {
  test('accepts http, https and a path on the same server', () => {
    expect(checkLayerUrl('http://localhost:8090/a.geojson', 'geojson')).toBeUndefined()
    expect(checkLayerUrl('https://example.org/a.pmtiles', 'pmtiles')).toBeUndefined()
    expect(checkLayerUrl('/data/a.geojson', 'geojson')).toBeUndefined()
  })

  test('refuses other schemes, protocol-relative and empty addresses', () => {
    expect(checkLayerUrl('javascript:alert(1)', 'geojson')).toContain('must start with https://')
    expect(checkLayerUrl('//example.org/a.geojson', 'geojson')).toContain('not valid')
    expect(checkLayerUrl('  ', 'geojson')).toBe('Enter the address of the data.')
    expect(checkLayerUrl(undefined, 'geojson')).toBe('Enter the address of the data.')
  })
})

describe('guessKind', () => {
  test('a .pmtiles address is PMTiles, also with a query', () => {
    expect(guessKind('https://example.org/data.PMTiles')).toBe('pmtiles')
    expect(guessKind('https://example.org/data.pmtiles?token=1')).toBe('pmtiles')
  })

  test('a {z} template is vector tiles', () => {
    expect(guessKind('https://tiles.example.org/{z}/{x}/{y}.pbf')).toBe('vector')
  })

  test('anything else is GeoJSON, and an empty address too', () => {
    expect(guessKind('https://example.org/places.geojson')).toBe('geojson')
    expect(guessKind('')).toBe('geojson')
  })
})

describe('parseSourceLayers', () => {
  test('splits on commas, trims, and drops blanks and repeats', () => {
    expect(parseSourceLayers(' buildings, roads ,, buildings,')).toEqual(['buildings', 'roads'])
    expect(parseSourceLayers('  ')).toEqual([])
  })
})

describe('colours', () => {
  test('the palette avoids colours that are used, in palette order', () => {
    expect(pickColor([])).toBe(PALETTE[0])
    expect(pickColor([PALETTE[0]])).toBe(PALETTE[1])
    expect(pickColor([PALETTE[0].toUpperCase(), PALETTE[1]])).toBe(PALETTE[2])
  })

  test('after the palette runs out the colours repeat', () => {
    // six colours in use: the seventh layer takes the second palette colour again
    expect(pickColor([...PALETTE, '#000000'])).toBe(PALETTE[1])
  })

  test('the palette has no colour of iD features (a grey, a blue water, a green park)', () => {
    for (const color of PALETTE) expect(color).toMatch(/^#[0-9a-f]{6}$/)
    expect(new Set(PALETTE).size).toBe(PALETTE.length)
  })

  test('resolveColors keeps set colours and picks the rest without clashing with any of them', () => {
    expect(resolveColors([undefined, PALETTE[0], undefined])).toEqual([
      PALETTE[1],
      PALETTE[0],
      PALETTE[2],
    ])
    expect(resolveColors(['#ABCDEF', undefined])).toEqual(['#abcdef', PALETTE[0]])
  })
})

describe('checkConfigLayers and isLocalUrl', () => {
  test('a duplicate id is reported, and all problems come in one error', () => {
    expect(() => checkConfigLayers([GEOJSON, GEOJSON])).toThrow('The id "parking" is used twice.')
    expect(() => checkConfigLayers([{ id: 'x' }, GEOJSON])).toThrow(
      /Data layers: The name must not be empty/,
    )
  })

  test('local addresses are the ones an automated run may load', () => {
    expect(isLocalUrl('http://localhost:8080/a.geojson')).toBe(true)
    expect(isLocalUrl('http://127.0.0.1:9/a')).toBe(true)
    expect(isLocalUrl('http://[::1]:9/a')).toBe(true)
    expect(isLocalUrl('/data/a.geojson')).toBe(true)
    expect(isLocalUrl('https://example.org/a.geojson')).toBe(false)
    expect(isLocalUrl('not a url')).toBe(false)
  })
})

describe('the schema refuses what is not a layer, and names a scheme that is not https', () => {
  test('an array is not a layer', () => {
    expect(checkDataLayerConfig([GEOJSON])).toEqual({
      ok: false,
      errors: ['A data layer must be an object.'],
    })
  })

  test('an address that is not a URL, although it starts with http, is not valid', () => {
    expect(checkLayerUrl('http:/x', 'geojson')).toBe(
      'The address is not valid. It must start with https://.',
    )
  })
})
