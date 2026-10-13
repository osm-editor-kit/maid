import { describe, expect, test } from 'bun:test'
import { QueryClient } from '@tanstack/query-core'
import { createEditor } from '../editor.ts'
import { createEditorFetch, type FetchPause } from './editor-fetch.ts'
import { AutomationBlockedError, RateLimitedError } from './remote-fetch.ts'
import { createTestClock } from './test-clock.ts'

const API = 'https://api.example.org/api/0.6/map?bbox=1,2,3,4'

describe('createEditorFetch', () => {
  test('a rate limit pauses the service, the list shows it, and subscribers hear it end', async () => {
    const clock = createTestClock()
    const sent: string[] = []
    const net = createEditorFetch({
      now: clock.now,
      sleep: clock.sleep,
      isAutomated: () => false,
      fetch: (url) => {
        sent.push(url)
        return Promise.resolve(new Response(null, { status: 429, headers: { 'Retry-After': '5' } }))
      },
    })
    net.services.register('osm', 'api.example.org')

    const heard: (readonly FetchPause[])[] = []
    net.fetchPauses.subscribe((pauses) => heard.push(pauses))

    const start = clock.now()
    const failure = await net.fetch(API).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(RateLimitedError)
    expect(net.fetchPauses.list()).toEqual([{ service: 'osm', until: start + 5000 }])

    await clock.advance(5000)
    expect(net.fetchPauses.list()).toEqual([])
    expect(heard).toEqual([[{ service: 'osm', until: start + 5000 }], []])
    expect(sent).toHaveLength(1)
  })

  test('under automation a remote host is refused before any request', async () => {
    const sent: string[] = []
    const net = createEditorFetch({
      isAutomated: () => true,
      fetch: (url) => {
        sent.push(url)
        return Promise.resolve(new Response('ok'))
      },
    })
    const failure = await net.fetch(API).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(AutomationBlockedError)
    expect(sent).toHaveLength(0)
  })

  test('the query client is one per call and holds no data at the start', () => {
    const first = createEditorFetch({ isAutomated: () => false })
    const second = createEditorFetch({ isAutomated: () => false })
    expect(first.queries).toBeInstanceOf(QueryClient)
    expect(first.queries).not.toBe(second.queries)
    expect(first.queries.getQueryCache().getAll()).toHaveLength(0)
  })
})

describe('the editor carries the fetching', () => {
  test('createEditor gives queries, fetch, services and fetchPauses, one set per editor', () => {
    const editor = createEditor()
    const other = createEditor()
    expect(editor.queries).toBeInstanceOf(QueryClient)
    expect(typeof editor.fetch).toBe('function')
    expect(typeof editor.services.serviceOf).toBe('function')
    expect(editor.fetchPauses.list()).toEqual([])
    expect(editor.queries).not.toBe(other.queries)
    editor.destroy()
    other.destroy()
  })

  test('destroy clears the queries', async () => {
    const editor = createEditor()
    await editor.queries.fetchQuery({
      queryKey: ['test', 'kept'],
      queryFn: () => Promise.resolve(1),
    })
    expect(editor.queries.getQueryCache().getAll()).toHaveLength(1)
    editor.destroy()
    expect(editor.queries.getQueryCache().getAll()).toHaveLength(0)
  })
})
