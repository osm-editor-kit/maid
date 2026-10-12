import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { addDataLayer, checkAddInput, type AddInput } from './add.ts'

const BASE: AddInput = {
  name: 'Parking',
  kind: 'geojson',
  url: 'https://example.org/p.geojson',
  sourceLayers: '',
  color: '#d6007a',
}

describe('checkAddInput (the form, no network)', () => {
  test('a complete GeoJSON address has no errors', () => {
    expect(checkAddInput(BASE)).toEqual([])
  })

  test('the name, the address and the colour are required', () => {
    expect(checkAddInput({ ...BASE, name: '  ' })).toEqual(['Give the layer a name.'])
    expect(checkAddInput({ ...BASE, url: '' })).toEqual(['Enter the address of the data.'])
    expect(checkAddInput({ ...BASE, color: 'pink' })).toEqual(['Pick a colour.'])
  })

  test('vector tiles need source layers and a template', () => {
    const vector = {
      ...BASE,
      kind: 'vector' as const,
      url: 'https://t.example.org/{z}/{x}/{y}.pbf',
    }
    expect(checkAddInput(vector)).toEqual([
      'Vector tiles need the names of their source layers, separated by commas.',
    ])
    expect(checkAddInput({ ...vector, sourceLayers: 'roads, water' })).toEqual([])
    expect(
      checkAddInput({ ...vector, sourceLayers: 'roads', url: 'https://t.example.org/t.pbf' }),
    ).toEqual(['A vector tile address needs {z}, {x} and {y} in it.'])
  })

  test('a file is GeoJSON only, and then the address is not checked', () => {
    const file = new File(['{}'], 'a.geojson')
    expect(checkAddInput({ ...BASE, url: '', file })).toEqual([])
    expect(checkAddInput({ ...BASE, kind: 'pmtiles', file })).toEqual([
      'A file can only be GeoJSON. Choose GeoJSON, or give an address instead.',
    ])
  })
})

describe('addDataLayer makes no request for input the form already refuses', () => {
  const original = globalThis.fetch
  let requests = 0

  beforeEach(() => {
    requests = 0
    globalThis.fetch = (async () => {
      requests += 1
      return new Response('{}')
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = original
  })

  test('no request when the form has an error', async () => {
    const result = await addDataLayer({ ...BASE, url: 'javascript:alert(1)' })
    expect(result.ok).toBe(false)
    expect(requests).toBe(0)
  })

  test('a GeoJSON address is requested once and must be GeoJSON', async () => {
    const result = await addDataLayer(BASE)
    expect(requests).toBe(1)
    expect(result).toEqual({
      ok: false,
      errors: [expect.stringContaining('This is JSON, but not GeoJSON.')],
    })
  })

  test('an address that cannot be reached says so in plain words', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    const result = await addDataLayer(BASE)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toContain('could not be reached from this page')
  })

  test('a GeoJSON file is read and parsed without a request', async () => {
    const file = new File(
      [JSON.stringify({ type: 'Feature', geometry: null, properties: {} })],
      'a.geojson',
    )
    const result = await addDataLayer({ ...BASE, url: '', file })
    expect(requests).toBe(0)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.kind).toBe('file')
  })
})
