import { describe, expect, it } from 'bun:test'
import { QueryClient, QueryObserver, type UseQueryOptions } from '@tanstack/react-query'
import {
  createWikiSource,
  parseEntityIds,
  parseItem,
  parseItems,
  parseTitles,
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

/** The error a promise rejects with, or undefined when it resolves. */
async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
    return undefined
  } catch (error) {
    return error
  }
}

/** A query client for one test: the lookups are kept for the session, as in the editor. */
function clientForTest() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

/** A field's way of asking: an observer, which honours `enabled`. Waits a turn, then reports whether it asked. */
async function observeOnce<T>(
  client: QueryClient,
  options: UseQueryOptions<T, Error, T, readonly unknown[]>,
) {
  const observer = new QueryObserver(client, options)
  const off = observer.subscribe(() => undefined)
  await new Promise((resolve) => setTimeout(resolve, 5))
  off()
  return observer.getCurrentResult()
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
    const client = clientForTest()
    const source = createWikiSource({ fetch, isAutomated: notAutomated })
    expect(await client.fetchQuery(source.titles('de', 'Ber'))).toEqual(['Berlin'])
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
    const source = createWikiSource({ fetch, isAutomated: notAutomated })
    expect(await clientForTest().fetchQuery(source.items('Berlin', 'de'))).toEqual([
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
    const source = createWikiSource({ fetch, isAutomated: notAutomated })
    expect(await clientForTest().fetchQuery(source.qidOfArticle('de-at', 'Berlin'))).toBe('Q64')
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
    const source = createWikiSource({ fetch, isAutomated: notAutomated })
    expect(await clientForTest().fetchQuery(source.item('Q64', 'de'))).toEqual({
      id: 'Q64',
      label: 'Berlin',
      description: 'Hauptstadt',
    })
    const url = new URL(urls[0] ?? '')
    expect(url.searchParams.get('ids')).toBe('Q64')
    expect(url.searchParams.get('props')).toBe('labels|descriptions')
  })

  it('keeps the answers for the session: the same question is asked once', async () => {
    const { fetch, urls } = fakeFetch({ query: { search: [{ title: 'Berlin' }] } })
    const client = clientForTest()
    const source = createWikiSource({ fetch, isAutomated: notAutomated })
    await client.fetchQuery(source.titles('de', 'Berlin'))
    await client.fetchQuery(source.titles('de', ' Berlin '))
    expect(urls).toHaveLength(1)
    expect(client.getQueryCache().getAll()).toHaveLength(1)
  })

  it('a field that observes an empty text asks nothing; a text with a language asks once it is observed', async () => {
    const { fetch, urls } = fakeFetch({ query: { search: [{ title: 'Berlin' }] } })
    const client = clientForTest()
    const source = createWikiSource({ fetch, isAutomated: notAutomated })
    expect((await observeOnce(client, source.titles('de', '  '))).fetchStatus).toBe('idle')
    expect(urls).toEqual([])
    expect((await observeOnce(client, source.titles('de', 'Berlin'))).data).toEqual(['Berlin'])
    expect(urls).toHaveLength(1)
  })

  it('makes no request under automation: no lookup is enabled, and a fetch of one answers empty', async () => {
    const { fetch, urls } = fakeFetch({ query: { search: [{ title: 'Berlin' }] } })
    const client = clientForTest()
    const source = createWikiSource({ fetch, isAutomated: automated })
    expect(source.titles('de', 'Berlin').enabled).toBe(false)
    expect((await observeOnce(client, source.titles('de', 'Berlin'))).fetchStatus).toBe('idle')
    expect(await client.fetchQuery(source.titles('de', 'Berlin'))).toEqual([])
    expect(await client.fetchQuery(source.items('Berlin', 'de'))).toEqual([])
    expect(await client.fetchQuery(source.qidOfArticle('de', 'Berlin'))).toBeNull()
    expect(await client.fetchQuery(source.item('Q64', 'de'))).toBeNull()
    expect(urls).toEqual([])
  })

  it('asks nothing for a language that is not a code (the host must not change)', async () => {
    const { fetch, urls } = fakeFetch({ query: { search: [] } })
    const client = clientForTest()
    const source = createWikiSource({ fetch, isAutomated: notAutomated })
    expect(source.titles('evil.example/#', 'Berlin').enabled).toBe(false)
    expect(await client.fetchQuery(source.qidOfArticle('../x', 'Berlin'))).toBeNull()
    expect(urls).toEqual([])
  })

  it('asks nothing for an item that is not a QID', async () => {
    const { fetch, urls } = fakeFetch({ entities: {} })
    const client = clientForTest()
    const source = createWikiSource({ fetch, isAutomated: notAutomated })
    expect(source.item('Berlin', 'de').enabled).toBe(false)
    expect(source.item(undefined, 'de').enabled).toBe(false)
    expect(await client.fetchQuery(source.item('Berlin', 'de'))).toBeNull()
    expect(urls).toEqual([])
  })

  it('a refused, failed or malformed request is a query error that is not repeated, and it keeps no answer', async () => {
    const refused = fakeFetch({}, { status: 429 })
    const client = clientForTest()
    const source = createWikiSource({ fetch: refused.fetch, isAutomated: notAutomated })
    expect(await failureOf(client.fetchQuery(source.titles('de', 'Berlin')))).toBeInstanceOf(Error)
    expect(refused.urls).toHaveLength(1)

    const offline = createWikiSource({
      fetch: () => Promise.reject(new Error('offline')),
      isAutomated: notAutomated,
    })
    expect(
      await failureOf(clientForTest().fetchQuery(offline.items('Berlin', 'de'))),
    ).toBeInstanceOf(Error)

    const malformed = createWikiSource({
      fetch: fakeFetch({ query: { search: 'nope' } }).fetch,
      isAutomated: notAutomated,
    })
    expect(await clientForTest().fetchQuery(malformed.titles('de', 'Berlin'))).toEqual([])
  })
})
