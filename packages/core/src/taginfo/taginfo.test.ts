import { describe, expect, test } from 'bun:test'
import { createEditorFetch } from '../fetching/editor-fetch.ts'
import { createTestClock } from '../fetching/test-clock.ts'
import { createTaginfo, MIN_QUERY_LENGTH } from './taginfo.ts'

type Row = Record<string, unknown>

/** The popular keys: `keys/all` sorted by `values_all`. `opening_hours` is the one iD keeps. */
const POPULAR: Row[] = [
  { key: 'name', count_all: 9_000_000, in_wiki: true },
  { key: 'opening_hours', count_all: 3_000_000 },
]

const KEY_ROWS: Row[] = [
  { key: 'highway', count_all: 3_000_000, count_ways: 2_000_000, in_wiki: true },
  { key: 'rare', count_all: 100, in_wiki: false },
  { key: 'wiki_only', count_all: 5, in_wiki: true },
  { key: 'hashtags', count_all: 9_999 },
  { key: 'name:en', count_all: 9_999 },
  { key: 'name', count_all: 9_999 },
]

const VALUE_ROWS: Row[] = [
  { value: 'residential', count: 1_000_000, description: '' },
  { value: 'Residential', count: 900_000 },
  { value: 'a;b', count: 900_000 },
  { value: 'rare', count: 50 },
  { value: 'service', count: 200, description: 'Service road' },
  { value: 'x*', count: 900_000 },
]

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function setup(
  respond: (url: URL) => Response | Promise<Response> = defaultRespond,
  automated = false,
) {
  const calls: URL[] = []
  const clock = createTestClock()
  const net = createEditorFetch({
    now: clock.now,
    sleep: clock.sleep,
    isAutomated: () => automated,
    fetch: async (url) => {
      const target = new URL(url)
      calls.push(target)
      return respond(target)
    },
  })
  const taginfo = createTaginfo({ fetch: net.fetch, queries: net.queries })
  return { taginfo, calls }
}

function defaultRespond(url: URL): Response {
  if (url.pathname.endsWith('/keys/all')) {
    return json({ data: url.searchParams.get('sortname') === 'values_all' ? POPULAR : KEY_ROWS })
  }
  if (url.pathname.endsWith('/key/values')) return json({ data: VALUE_ROWS })
  return json({}, 404)
}

const callsTo = (calls: URL[], endpoint: string) =>
  calls.filter((url) => url.pathname.endsWith(endpoint))

describe('keys: iD taginfo.js keys()', () => {
  test('asks keys/all with iD parameters, and the sort of the geometry', async () => {
    const { taginfo, calls } = setup()
    await taginfo.keys('hig', 'point')
    const url = calls[0]!
    expect(url.origin + url.pathname).toBe('https://taginfo.openstreetmap.org/api/4/keys/all')
    expect(url.searchParams.get('rp')).toBe('10')
    expect(url.searchParams.get('sortname')).toBe('count_nodes')
    expect(url.searchParams.get('sortorder')).toBe('desc')
    expect(url.searchParams.get('page')).toBe('1')
    expect(url.searchParams.get('lang')).toBe('en')
    expect(url.searchParams.get('query')).toBe('hig')
  })

  test('the sort follows the geometry: ways for a line or an area, all for a relation', async () => {
    const { taginfo, calls } = setup()
    await taginfo.keys('hig', 'line')
    await taginfo.keys('hig', 'area')
    await taginfo.keys('hig', 'relation')
    await taginfo.keys('hig')
    const sorts = callsTo(calls, '/keys/all').map((url) => url.searchParams.get('sortname'))
    expect(sorts).toEqual(['count_ways', 'count_ways', 'count_all', 'count_all'])
  })

  test('keeps keys above 2500 uses or in the wiki, drops hashtags and created_by, puts colon keys last', async () => {
    const { taginfo } = setup()
    const keys = await taginfo.keys('hig', 'point')
    expect(keys).toEqual([
      { value: 'highway', title: 'highway' },
      { value: 'wiki_only', title: 'wiki_only' },
      { value: 'name', title: 'name' },
      { value: 'name:en', title: 'name:en' },
    ])
  })

  test('a query shorter than three characters makes no request', async () => {
    const { taginfo, calls } = setup()
    expect(MIN_QUERY_LENGTH).toBe(3)
    expect(await taginfo.keys('hi', 'point')).toEqual([])
    expect(calls).toHaveLength(0)
  })

  test('a field of the wrong type is dropped, the row stays; a numeric text count still counts', async () => {
    const { taginfo } = setup((url) =>
      url.pathname.endsWith('/keys/all')
        ? json({
            data: [
              { key: 'highway', count_all: 'many', in_wiki: true },
              { key: 'string_count', count_all: '3000000' },
              { key: 'bad_flag', count_all: 3_000_000, in_wiki: 'yes' },
              { key: 'tiny', count_all: 'lots', in_wiki: 1 },
            ],
          })
        : defaultRespond(url),
    )
    expect((await taginfo.keys('hig', 'point')).map((item) => item.value)).toEqual([
      'highway',
      'string_count',
      'bad_flag',
    ])
  })

  test('a row without a text key, or not an object, is skipped; the other rows stay', async () => {
    const { taginfo } = setup((url) =>
      url.pathname.endsWith('/keys/all')
        ? json({
            data: [
              { count_all: 3_000_000 },
              { key: 7, count_all: 3_000_000 },
              null,
              'highway',
              { key: 'highway', count_all: 3_000_000 },
            ],
          })
        : defaultRespond(url),
    )
    expect(await taginfo.keys('hig', 'point')).toEqual([{ value: 'highway', title: 'highway' }])
  })

  test('one request for a repeated query; another geometry is another query', async () => {
    const { taginfo, calls } = setup()
    const first = await taginfo.keys('hig', 'point')
    const second = await taginfo.keys('hig', 'point')
    expect(second).toEqual(first)
    expect(callsTo(calls, '/keys/all')).toHaveLength(1)
    await taginfo.keys('hig', 'line')
    expect(callsTo(calls, '/keys/all')).toHaveLength(2)
  })
})

describe('values: iD taginfo.js values()', () => {
  test('asks key/values with the key, the filter and the sort of the geometry', async () => {
    const { taginfo, calls } = setup()
    await taginfo.values('highway', 'res', 'area')
    const url = callsTo(calls, '/key/values')[0]!
    expect(url.searchParams.get('key')).toBe('highway')
    expect(url.searchParams.get('query')).toBe('res')
    expect(url.searchParams.get('filter')).toBe('ways')
    expect(url.searchParams.get('sortname')).toBe('count_ways')
    expect(url.searchParams.get('rp')).toBe('25')
    expect(url.searchParams.get('sortorder')).toBe('desc')
    expect(url.searchParams.get('page')).toBe('1')
  })

  test('a point gets the nodes filter; a relation gets no filter and count_all', async () => {
    const { taginfo, calls } = setup()
    await taginfo.values('highway', 'res', 'point')
    await taginfo.values('highway', 'resx', 'relation')
    const [point, relation] = callsTo(calls, '/key/values')
    expect(point!.searchParams.get('filter')).toBe('nodes')
    expect(relation!.searchParams.has('filter')).toBe(false)
    expect(relation!.searchParams.get('sortname')).toBe('count_all')
  })

  test('filters values: no ; or ,, no upper case or *, more than 100 uses; the description is the title', async () => {
    const { taginfo } = setup()
    expect(await taginfo.values('highway', 'res')).toEqual([
      { value: 'residential', title: 'residential' },
      { value: 'service', title: 'Service road' },
    ])
  })

  test('a value row: a non-text description is no title, a numeric text count counts, a malformed row is skipped', async () => {
    const { taginfo } = setup((url) =>
      url.pathname.endsWith('/key/values')
        ? json({
            data: [
              { value: 'residential', count: 1_000_000, description: 5 },
              { value: 'service', count: '900000', description: 'Service road' },
              { value: 3, count: 1_000_000 },
              { value: 'rare', count: true },
              { value: 'bigtown', count: 'many' },
            ],
          })
        : defaultRespond(url),
    )
    expect(await taginfo.values('highway', 'res')).toEqual([
      { value: 'residential', title: 'residential' },
      { value: 'service', title: 'Service road' },
    ])
  })

  test('keys that allow upper case keep their capitals (brand), and type=associatedStreet is kept', async () => {
    const { taginfo } = setup((url) => {
      if (!url.pathname.endsWith('/key/values')) return defaultRespond(url)
      const rows =
        url.searchParams.get('key') === 'type'
          ? [{ value: 'associatedStreet', count: 500 }]
          : [
              { value: 'Aldi', count: 500 },
              { value: 'ALDI*', count: 500 },
            ]
      return json({ data: rows })
    })
    expect((await taginfo.values('brand', 'Ald')).map((item) => item.value)).toEqual([
      'Aldi',
      'ALDI*',
    ])
    expect((await taginfo.values('type', 'ass')).map((item) => item.value)).toEqual([
      'associatedStreet',
    ])
  })

  test('a popular key gets no values and no values request', async () => {
    const { taginfo, calls } = setup()
    expect(await taginfo.values('name', 'Ber')).toEqual([])
    expect(callsTo(calls, '/key/values')).toHaveLength(0)
  })

  test('opening_hours is the exception: its values are asked', async () => {
    const { taginfo, calls } = setup()
    await taginfo.values('opening_hours', 'Mon')
    expect(callsTo(calls, '/key/values')).toHaveLength(1)
  })

  test('the excluded keys (name:en, addr:*) get no request at all', async () => {
    const { taginfo, calls } = setup()
    expect(await taginfo.values('name:en', 'Ber')).toEqual([])
    expect(await taginfo.values('addr:street', 'Ber')).toEqual([])
    expect(calls).toHaveLength(0)
  })

  test('the popular keys are asked once for the session, and a repeated values query once', async () => {
    const { taginfo, calls } = setup()
    await taginfo.values('highway', 'res')
    await taginfo.values('highway', 'resi')
    await taginfo.values('highway', 'resi')
    expect(callsTo(calls, '/keys/all')).toHaveLength(1)
    expect(callsTo(calls, '/key/values')).toHaveLength(2)
  })

  test('a query shorter than three characters makes no request', async () => {
    const { taginfo, calls } = setup()
    expect(await taginfo.values('highway', 're')).toEqual([])
    expect(calls).toHaveLength(0)
  })
})

describe('errors and automation: no suggestions, no throw', () => {
  test('under automation: zero requests and an empty list', async () => {
    const { taginfo, calls } = setup(defaultRespond, true)
    expect(await taginfo.keys('hig', 'point')).toEqual([])
    expect(await taginfo.values('highway', 'res', 'area')).toEqual([])
    expect(calls).toHaveLength(0)
  })

  test('a 429 gives no suggestions and does not throw; the gate pauses, the request is made once', async () => {
    const { taginfo, calls } = setup(
      () => new Response('', { status: 429, headers: { 'Retry-After': '30' } }),
    )
    expect(await taginfo.keys('hig', 'point')).toEqual([])
    expect(calls).toHaveLength(1)
  })

  test('a 429 on the popular keys gives no values and does not throw', async () => {
    const { taginfo, calls } = setup((url) =>
      url.searchParams.get('sortname') === 'values_all'
        ? new Response('', { status: 429 })
        : defaultRespond(url),
    )
    expect(await taginfo.values('highway', 'res')).toEqual([])
    expect(callsTo(calls, '/key/values')).toHaveLength(0)
  })

  test('a failed answer (a 500, a network error) is asked once: no retry against taginfo', async () => {
    const serverError = setup(() => new Response('', { status: 500 }))
    expect(await serverError.taginfo.keys('hig', 'point')).toEqual([])
    expect(callsTo(serverError.calls, '/keys/all')).toHaveLength(1)

    const networkError = setup(() => {
      throw new TypeError('Failed to fetch')
    })
    expect(await networkError.taginfo.keys('hig', 'point')).toEqual([])
    expect(callsTo(networkError.calls, '/keys/all')).toHaveLength(1)

    const failedValues = setup((url) =>
      url.pathname.endsWith('/key/values')
        ? new Response('', { status: 500 })
        : defaultRespond(url),
    )
    expect(await failedValues.taginfo.values('highway', 'res')).toEqual([])
    expect(callsTo(failedValues.calls, '/key/values')).toHaveLength(1)
  })

  test('a 404 and a malformed answer give no suggestions', async () => {
    const missing = setup(() => new Response('', { status: 404 }))
    expect(await missing.taginfo.keys('hig')).toEqual([])
    expect(missing.calls).toHaveLength(1)
    const malformed = setup(() => json({ nodata: true }))
    expect(await malformed.taginfo.keys('hig')).toEqual([])
  })

  test('an aborted caller gets the empty list at once; the answer still lands in the cache', async () => {
    let release = (): void => {}
    const { taginfo, calls } = setup(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(json({ data: KEY_ROWS }))
        }),
    )
    const controller = new AbortController()
    const pending = taginfo.keys('hig', 'point', controller.signal)
    controller.abort()
    expect(await pending).toEqual([])
    release()
    const later = await taginfo.keys('hig', 'point')
    expect(later.map((item) => item.value)).toEqual(['highway', 'wiki_only', 'name', 'name:en'])
    expect(calls).toHaveLength(1)
  })
})
