import { beforeEach, describe, expect, test } from 'bun:test'
import { HttpError, RateLimitedError, type RemoteFetch } from '@osm-editor-kit/maid-core'
import { addDataLayer, checkAddInput, type AddInput } from './add.ts'
import { installTestDOMParser } from './test-dom.ts'

installTestDOMParser()

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="52.5" lon="13.4"/>
  <trk><trkseg><trkpt lat="52.5" lon="13.4"/><trkpt lat="52.501" lon="13.401"/></trkseg></trk>
</gpx>`

const KML = '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>'
const KML_MESSAGE = 'KML is not supported. Use a GPX or GeoJSON file instead.'

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
      'A file can only be GeoJSON or GPX. Choose one of them, or give an address instead.',
    ])
  })
})

describe('addDataLayer makes no request for input the form already refuses', () => {
  let urls: string[] = []
  /** What the fake editor fetch does for the next request; the default is a plain empty answer */
  let respond: () => Promise<Response>
  const send: RemoteFetch = async (url) => {
    urls.push(String(url))
    return respond()
  }

  beforeEach(() => {
    urls = []
    respond = () => Promise.resolve(new Response('{}'))
  })

  test('no request when the form has an error', async () => {
    const result = await addDataLayer({ ...BASE, url: 'javascript:alert(1)' }, send)
    expect(result.ok).toBe(false)
    expect(urls).toEqual([])
  })

  test('a GeoJSON address is requested once and must be GeoJSON', async () => {
    const result = await addDataLayer(BASE, send)
    expect(urls).toEqual([BASE.url])
    expect(result).toEqual({
      ok: false,
      errors: [expect.stringContaining('This is JSON, but not GeoJSON.')],
    })
  })

  test('an address that cannot be reached says so in plain words', async () => {
    respond = () => Promise.reject(new TypeError('Failed to fetch'))
    const result = await addDataLayer(BASE, send)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toContain('could not be reached from this page')
  })

  test('an HTTP error answer is read as the answer it is', async () => {
    respond = () => Promise.reject(new HttpError(404, BASE.url))
    const result = await addDataLayer(BASE, send)
    expect(result).toEqual({ ok: false, errors: ['The server answered 404.'] })
  })

  test('a rate limit is read as the status it had, and not as a network failure', async () => {
    respond = () => Promise.reject(new RateLimitedError('data', 429, 0))
    const result = await addDataLayer(BASE, send)
    expect(result).toEqual({ ok: false, errors: ['The server answered 429.'] })
  })

  test('a GeoJSON file is read and parsed without a request', async () => {
    const file = new File(
      [JSON.stringify({ type: 'Feature', geometry: null, properties: {} })],
      'a.geojson',
    )
    const result = await addDataLayer({ ...BASE, url: '', file }, send)
    expect(urls).toEqual([])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.kind).toBe('file')
  })
})

describe('GPX and KML', () => {
  let urls: string[] = []
  let respond: () => Promise<Response>
  const send: RemoteFetch = async (url) => {
    urls.push(String(url))
    return respond()
  }
  const answer = (text: string) => () => Promise.resolve(new Response(text))
  const TRACK = { ...BASE, url: 'https://example.org/ride.gpx', kind: 'gpx' as const }

  beforeEach(() => {
    urls = []
    respond = answer('{}')
  })

  test('a GPX address is requested once and becomes a GPX layer, its data read later by the map', async () => {
    respond = answer(GPX)
    const result = await addDataLayer(TRACK, send)
    expect(urls).toEqual([TRACK.url])
    expect(result.ok).toBe(true)
    if (result.ok && result.value.kind === 'url') {
      expect(result.value.layer).toMatchObject({ kind: 'gpx', url: TRACK.url })
      expect(result.value.layer.sourceLayers).toBeUndefined()
    } else throw new Error('expected a URL layer')
  })

  test('a GeoJSON address that answers with GPX XML is a GPX layer too', async () => {
    respond = answer(GPX)
    const feed = { ...TRACK, url: 'https://example.org/feed', kind: 'geojson' as const }
    const result = await addDataLayer(feed, send)
    expect(result.ok && result.value.kind === 'url' && result.value.layer.kind).toBe('gpx')
  })

  test('an address named .gpx that answers with GeoJSON says it is not GPX', async () => {
    respond = answer('{"type":"FeatureCollection","features":[]}')
    const result = await addDataLayer(TRACK, send)
    expect(result).toEqual({
      ok: false,
      errors: ['This is not GPX: it must be XML with a gpx element at the top.'],
    })
  })

  test('a GPX file is read without a request, and is a file layer with features', async () => {
    const file = new File([GPX], 'ride.gpx')
    const result = await addDataLayer({ ...TRACK, url: '', file }, send)
    expect(urls).toEqual([])
    expect(result.ok && result.value.kind === 'file' && result.value.layer.name).toBe('Parking')
    if (result.ok && result.value.kind === 'file') {
      const data = result.value.layer.data
      const types = data.type === 'FeatureCollection' && data.features.map((f) => f.geometry.type)
      expect(types).toEqual(['LineString', 'Point'])
    }
  })

  test('a GeoJSON file given as GPX says it is not GPX', async () => {
    const file = new File(['{"type":"FeatureCollection","features":[]}'], 'places.json')
    const result = await addDataLayer({ ...TRACK, url: '', file }, send)
    expect(result).toEqual({
      ok: false,
      errors: ['places.json: This is not GPX: it must be XML with a gpx element at the top.'],
    })
  })

  test('a KML address is refused before any request', async () => {
    const result = await addDataLayer({ ...BASE, url: 'https://example.org/map.kml?x=1' }, send)
    expect(result).toEqual({ ok: false, errors: [KML_MESSAGE] })
    expect(urls).toEqual([])
  })

  test('a KML file is refused in plain words, with its name', async () => {
    const file = new File([KML], 'map.kml')
    const result = await addDataLayer({ ...TRACK, url: '', kind: 'geojson', file }, send)
    expect(result).toEqual({ ok: false, errors: [`map.kml: ${KML_MESSAGE}`] })
  })

  test('an address without .kml that answers with KML is refused after its one request', async () => {
    respond = answer(KML)
    const result = await addDataLayer({ ...BASE, url: 'https://example.org/feed' }, send)
    expect(urls).toEqual(['https://example.org/feed'])
    expect(result).toEqual({ ok: false, errors: [KML_MESSAGE] })
  })
})
