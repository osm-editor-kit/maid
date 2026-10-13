import { describe, expect, it } from 'bun:test'
import { createPlaceSearch, PLACE_LIMIT, PlaceSearchError, placeUrl } from './places.ts'

const ANSWER = [
  {
    place_id: 1234,
    lat: '52.5162',
    lon: '13.3777',
    display_name: 'Brandenburger Tor, Mitte, Berlin, Deutschland',
    category: 'historic',
    type: 'monument',
    importance: 0.6,
    boundingbox: ['52.5159', '52.5165', '13.3774', '13.3780'],
  },
  {
    lat: '52.52',
    lon: '13.4',
    display_name: 'Berlin, Deutschland',
    category: 'place',
    type: 'city',
  },
]

/** A fetch that answers with the body given, and records the URLs it was asked for */
function fakeFetch(body: unknown) {
  const calls: string[] = []
  const fetch = (url: string | URL) => {
    calls.push(String(url))
    return Promise.resolve(new Response(JSON.stringify(body)))
  }
  return { calls, fetch: fetch as never }
}

const online = () => false
const automated = () => true

describe('the request', () => {
  it('asks Nominatim in jsonv2 for ten places, with the text and the language', () => {
    const url = placeUrl('Brandenburger Tor', 'de')
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search')
    expect(url.searchParams.get('format')).toBe('jsonv2')
    expect(url.searchParams.get('limit')).toBe(String(PLACE_LIMIT))
    expect(PLACE_LIMIT).toBe(10)
    expect(url.searchParams.get('q')).toBe('Brandenburger Tor')
    expect(url.searchParams.get('accept-language')).toBe('de')
  })

  it('sends one request for a search', async () => {
    const { calls, fetch } = fakeFetch(ANSWER)
    const search = createPlaceSearch({ fetch, language: 'en', isAutomated: online })
    await search.search('Berlin')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('q=Berlin')
    expect(calls[0]).toContain('accept-language=en')
  })
})

describe('the answer', () => {
  it('reads the fields the list shows, and the box as south, west, north, east', async () => {
    const { fetch } = fakeFetch(ANSWER)
    const search = createPlaceSearch({ fetch, language: 'en', isAutomated: online })
    const places = await search.search('Berlin')
    expect(places[0]).toEqual({
      id: '1234',
      name: 'Brandenburger Tor, Mitte, Berlin, Deutschland',
      type: 'monument',
      lat: 52.5162,
      lon: 13.3777,
      bounds: { south: 52.5159, north: 52.5165, west: 13.3774, east: 13.378 },
    })
  })

  it('gives a place without a box or an id a point id and no bounds', async () => {
    const { fetch } = fakeFetch(ANSWER)
    const search = createPlaceSearch({ fetch, language: 'en', isAutomated: online })
    const [, city] = await search.search('Berlin')
    expect(city).toEqual({
      id: '52.52,13.4',
      name: 'Berlin, Deutschland',
      type: 'city',
      lat: 52.52,
      lon: 13.4,
    })
  })

  it('refuses an answer of another shape, or a coordinate out of range', async () => {
    const shape = createPlaceSearch({
      fetch: fakeFetch({ error: 'nope' }).fetch,
      language: 'en',
      isAutomated: online,
    })
    expect(shape.search('x')).rejects.toBeInstanceOf(PlaceSearchError)
    const range = createPlaceSearch({
      fetch: fakeFetch([{ display_name: 'x', lat: '95', lon: '1' }]).fetch,
      language: 'en',
      isAutomated: online,
    })
    expect(range.search('x')).rejects.toMatchObject({ reason: 'format' })
  })

  it('does not keep a failure: the next search asks again', async () => {
    const calls: string[] = []
    let fail = true
    const fetch = (url: string | URL) => {
      calls.push(String(url))
      if (fail) return Promise.reject(new Error('offline'))
      return Promise.resolve(new Response(JSON.stringify(ANSWER)))
    }
    const search = createPlaceSearch({ fetch: fetch as never, language: 'en', isAutomated: online })
    expect(search.search('Berlin')).rejects.toThrow('offline')
    fail = false
    expect(search.search('Berlin')).resolves.toHaveLength(2)
    expect(calls).toHaveLength(2)
  })
})

describe('the memory', () => {
  it('answers a text asked again from memory, whatever its case and spacing', async () => {
    const { calls, fetch } = fakeFetch(ANSWER)
    const search = createPlaceSearch({ fetch, language: 'en', isAutomated: online })
    await search.search('Berlin')
    await search.search('  berlin ')
    await search.search('BERLIN')
    expect(calls).toHaveLength(1)
  })

  it('keeps the languages apart', async () => {
    const { calls, fetch } = fakeFetch(ANSWER)
    const english = createPlaceSearch({ fetch, language: 'en', isAutomated: online })
    const german = createPlaceSearch({ fetch, language: 'de', isAutomated: online })
    await english.search('Berlin')
    await german.search('Berlin')
    expect(calls).toHaveLength(2)
  })
})

describe('automated runs', () => {
  it('sends nothing and refuses to search', async () => {
    const { calls, fetch } = fakeFetch(ANSWER)
    const search = createPlaceSearch({ fetch, language: 'en', isAutomated: automated })
    expect(search.enabled()).toBe(false)
    expect(search.search('Berlin')).rejects.toMatchObject({ reason: 'off' })
    expect(calls).toHaveLength(0)
  })

  it('is enabled when not automated', () => {
    const search = createPlaceSearch({
      fetch: fakeFetch(ANSWER).fetch,
      language: 'en',
      isAutomated: online,
    })
    expect(search.enabled()).toBe(true)
  })
})
