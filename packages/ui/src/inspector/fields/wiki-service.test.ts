import { describe, expect, it } from 'bun:test'
import {
  createWikiSource,
  parseEntityIds,
  parseItem,
  parseItems,
  parseTitles,
  type WikiQueries,
} from './wiki-service.ts'

/** A fetch that answers with the given body, and records the URLs it was asked for. */
function fakeFetch(body: unknown, init: { status?: number } = {}) {
  const urls: string[] = []
  const fetch = (url: string | URL) => {
    urls.push(String(url))
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: init.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  }
  return { fetch, urls }
}

/** The query client's part the service uses, with a session cache that keeps every answer. */
function fakeQueries(): WikiQueries & { size: () => number } {
  const cache = new Map<string, unknown>()
  return {
    size: () => cache.size,
    async fetchQuery<T>(options: { queryKey: readonly unknown[]; queryFn: () => Promise<T> }) {
      const key = JSON.stringify(options.queryKey)
      if (cache.has(key)) return cache.get(key) as T
      const value = await options.queryFn()
      cache.set(key, value)
      return value
    },
  }
}

const notAutomated = () => false
const automated = () => true

describe('parsing the answers (Zod, the fields the editor reads)', () => {
  it('reads the titles of a search, and nothing from an error or a malformed answer', () => {
    expect(
      parseTitles({ query: { search: [{ title: 'Berlin' }, { title: 'Berlin Hbf' }] } }),
    ).toEqual(['Berlin', 'Berlin Hbf'])
    expect(parseTitles({ error: { info: 'bad' } })).toEqual([])
    expect(parseTitles({ query: { search: 'no' } })).toEqual([])
    expect(parseTitles(null)).toEqual([])
  })

  it('reads the items of a search in the order given, the label falling back to the QID', () => {
    expect(
      parseItems({
        search: [{ id: 'Q64', label: 'Berlin', description: 'capital of Germany' }, { id: 'Q1' }],
      }),
    ).toEqual([
      { id: 'Q64', label: 'Berlin', description: 'capital of Germany' },
      { id: 'Q1', label: 'Q1', description: undefined },
    ])
  })

  it('reads the entity ids of a lookup (iD: Object.keys of the entities)', () => {
    expect(parseEntityIds({ entities: { '-1': { id: '-1', missing: '' } } })).toEqual(['-1'])
    expect(parseEntityIds({ entities: { Q64: { id: 'Q64' } } })).toEqual(['Q64'])
    expect(parseEntityIds({ entities: 'x' })).toEqual([])
  })

  it('reads the label and the description in the language, else the first of the answer', () => {
    const body = {
      entities: {
        Q64: {
          id: 'Q64',
          labels: { en: { value: 'Berlin' }, de: { value: 'Berlin (de)' } },
          descriptions: { en: { value: 'capital' } },
        },
      },
    }
    expect(parseItem(body, 'Q64', 'de')).toEqual({
      id: 'Q64',
      label: 'Berlin (de)',
      description: 'capital',
    })
    expect(
      parseItem({ entities: { Q64: { labels: { fr: { value: 'Berlin' } } } } }, 'Q64', 'de'),
    ).toEqual({ id: 'Q64', label: 'Berlin', description: undefined })
    expect(parseItem({ entities: { Q64: { id: 'Q64' } } }, 'Q64', 'de')).toBeUndefined()
  })
})

describe('createWikiSource', () => {
  it('asks the language’s Wikipedia for titles (iD: list=search, srsearch)', async () => {
    const { fetch, urls } = fakeFetch({ query: { search: [{ title: 'Berlin' }] } })
    const source = createWikiSource({ fetch, queries: fakeQueries(), isAutomated: notAutomated })
    expect(await source.searchTitles('de', 'Ber')).toEqual(['Berlin'])
    expect(urls).toHaveLength(1)
    const url = new URL(urls[0] ?? '')
    expect(url.origin).toBe('https://de.wikipedia.org')
    expect(url.pathname).toBe('/w/api.php')
    expect(url.searchParams.get('list')).toBe('search')
    expect(url.searchParams.get('srsearch')).toBe('Ber')
    expect(url.searchParams.get('origin')).toBe('*')
  })

  it('asks Wikidata for items in the language (iD: wbsearchentities)', async () => {
    const { fetch, urls } = fakeFetch({ search: [{ id: 'Q64', label: 'Berlin' }] })
    const source = createWikiSource({ fetch, queries: fakeQueries(), isAutomated: notAutomated })
    expect(await source.searchItems('Berlin', 'de')).toEqual([
      { id: 'Q64', label: 'Berlin', description: undefined },
    ])
    const url = new URL(urls[0] ?? '')
    expect(url.origin).toBe('https://www.wikidata.org')
    expect(url.searchParams.get('action')).toBe('wbsearchentities')
    expect(url.searchParams.get('language')).toBe('de')
    expect(url.searchParams.get('type')).toBe('item')
  })

  it('finds the item of an article by its site and title (iD: itemsByTitle)', async () => {
    const { fetch, urls } = fakeFetch({ entities: { '-1': { id: '-1' }, Q64: { id: 'Q64' } } })
    const source = createWikiSource({ fetch, queries: fakeQueries(), isAutomated: notAutomated })
    expect(await source.qidOfArticle('de-at', 'Berlin')).toBe('Q64')
    const url = new URL(urls[0] ?? '')
    expect(url.searchParams.get('sites')).toBe('de_atwiki')
    expect(url.searchParams.get('titles')).toBe('Berlin')
  })

  it('gives the label and description of an item (iD: entityByQID, props labels and descriptions)', async () => {
    const { fetch, urls } = fakeFetch({
      entities: {
        Q64: { labels: { de: { value: 'Berlin' } }, descriptions: { de: { value: 'Hauptstadt' } } },
      },
    })
    const source = createWikiSource({ fetch, queries: fakeQueries(), isAutomated: notAutomated })
    expect(await source.itemOf('Q64', 'de')).toEqual({
      id: 'Q64',
      label: 'Berlin',
      description: 'Hauptstadt',
    })
    const url = new URL(urls[0] ?? '')
    expect(url.searchParams.get('ids')).toBe('Q64')
    expect(url.searchParams.get('props')).toBe('labels|descriptions')
  })

  it('keeps the requests to a session: the same question is asked once', async () => {
    const { fetch, urls } = fakeFetch({ query: { search: [{ title: 'Berlin' }] } })
    const queries = fakeQueries()
    const source = createWikiSource({ fetch, queries, isAutomated: notAutomated })
    await source.searchTitles('de', 'Berlin')
    await source.searchTitles('de', 'Berlin')
    expect(urls).toHaveLength(1)
    expect(queries.size()).toBe(1)
  })

  it('makes no request under automation, and gives no answers', async () => {
    const { fetch, urls } = fakeFetch({ query: { search: [{ title: 'Berlin' }] } })
    const source = createWikiSource({ fetch, queries: fakeQueries(), isAutomated: automated })
    expect(await source.searchTitles('de', 'Berlin')).toEqual([])
    expect(await source.searchItems('Berlin', 'de')).toEqual([])
    expect(await source.qidOfArticle('de', 'Berlin')).toBeUndefined()
    expect(await source.itemOf('Q64', 'de')).toBeUndefined()
    expect(urls).toEqual([])
  })

  it('asks nothing for a language that is not a code (the host must not change)', async () => {
    const { fetch, urls } = fakeFetch({ query: { search: [] } })
    const source = createWikiSource({ fetch, queries: fakeQueries(), isAutomated: notAutomated })
    expect(await source.searchTitles('evil.example/#', 'Berlin')).toEqual([])
    expect(await source.qidOfArticle('../x', 'Berlin')).toBeUndefined()
    expect(urls).toEqual([])
  })

  it('asks nothing for an item that is not a QID', async () => {
    const { fetch, urls } = fakeFetch({ entities: {} })
    const source = createWikiSource({ fetch, queries: fakeQueries(), isAutomated: notAutomated })
    expect(await source.itemOf('Berlin', 'de')).toBeUndefined()
    expect(urls).toEqual([])
  })

  it('gives no answer for a refused request, a failed one or a malformed one, and never rejects', async () => {
    const refused = createWikiSource({
      fetch: fakeFetch({}, { status: 429 }).fetch,
      queries: fakeQueries(),
      isAutomated: notAutomated,
    })
    expect(await refused.searchTitles('de', 'Berlin')).toEqual([])

    const broken = createWikiSource({
      fetch: () => Promise.reject(new Error('offline')),
      queries: fakeQueries(),
      isAutomated: notAutomated,
    })
    expect(await broken.searchItems('Berlin', 'de')).toEqual([])
    expect(await broken.qidOfArticle('de', 'Berlin')).toBeUndefined()

    const malformed = createWikiSource({
      fetch: fakeFetch({ query: { search: 'nope' } }).fetch,
      queries: fakeQueries(),
      isAutomated: notAutomated,
    })
    expect(await malformed.searchTitles('de', 'Berlin')).toEqual([])
  })
})
