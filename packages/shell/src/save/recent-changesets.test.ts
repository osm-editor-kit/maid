import { describe, expect, it } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import {
  NO_RECENT,
  parseRecentChangesets,
  recentChangesetsQuery,
  recentChangesetsUrl,
} from './recent-changesets.ts'

const SERVER_ANSWER = {
  version: '0.6',
  changesets: [
    { id: 3, tags: { comment: 'Added benches', source: 'survey;gps', created_by: 'Maid 0.1' } },
    { id: 2, tags: { created_by: 'iD' } },
    { id: 1, tags: { comment: 'Added benches', source: 'gps;Bing aerial imagery' } },
    { id: 0 },
  ],
}

describe('recentChangesetsUrl', () => {
  it('asks the API of the data for the changesets of a display name, as JSON', () => {
    expect(recentChangesetsUrl('https://api.openstreetmap.org', 'Mapper One')).toBe(
      'https://api.openstreetmap.org/api/0.6/changesets.json?display_name=Mapper+One',
    )
    expect(recentChangesetsUrl('http://localhost:8090/s/small/', 'a&b=c')).toBe(
      'http://localhost:8090/s/small/api/0.6/changesets.json?display_name=a%26b%3Dc',
    )
  })
})

describe('parseRecentChangesets', () => {
  it('takes the comments and the single sources, newest first, each once', () => {
    expect(parseRecentChangesets(SERVER_ANSWER)).toEqual({
      comments: ['Added benches'],
      sources: ['survey', 'gps', 'Bing aerial imagery'],
    })
  })

  it('skips changesets without a comment, as iD does', () => {
    expect(
      parseRecentChangesets({ changesets: [{ tags: { source: 'survey' } }] }).comments,
    ).toEqual([])
  })

  it('gives nothing for an empty list, or an answer of another shape', () => {
    expect(parseRecentChangesets({ version: '0.6', changesets: [] })).toEqual(NO_RECENT)
    expect(parseRecentChangesets(null)).toEqual(NO_RECENT)
    expect(parseRecentChangesets({ changesets: 'no' })).toEqual(NO_RECENT)
  })

  it('skips a changeset that does not fit and reads the others', () => {
    const answer = { changesets: [{ tags: { comment: 5 } }, { tags: { comment: 'ok' } }, 7] }
    expect(parseRecentChangesets(answer).comments).toEqual(['ok'])
  })
})

describe('recentChangesetsQuery', () => {
  function run(user: string | undefined) {
    const requests: { url: string; init: unknown }[] = []
    const remote = async (url: string | URL, init?: unknown) => {
      requests.push({ url: String(url), init })
      return Response.json(SERVER_ANSWER)
    }
    const queries = new QueryClient()
    const options = recentChangesetsQuery({ remote, apiUrl: 'https://api.test', user })
    return { requests, options, queries }
  }

  it('asks once for a logged-in person, through the OSM service, and keeps the answer', async () => {
    const { requests, options, queries } = run('Mapper One')
    expect(options.enabled).toBe(true)
    const first = await queries.fetchQuery(options)
    expect(first.comments).toEqual(['Added benches'])
    await queries.fetchQuery(options)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe(
      'https://api.test/api/0.6/changesets.json?display_name=Mapper+One',
    )
    expect(requests[0]?.init).toMatchObject({ service: 'osm' })
  })

  it('is off for nobody, and asks nothing', () => {
    const { requests, options } = run(undefined)
    expect(options.enabled).toBe(false)
    expect(requests).toHaveLength(0)
  })

  it('keeps the people and the servers apart', () => {
    const one = recentChangesetsQuery({
      remote: async () => new Response(),
      apiUrl: 'https://a.test',
      user: 'x',
    })
    const two = recentChangesetsQuery({
      remote: async () => new Response(),
      apiUrl: 'https://a.test',
      user: 'y',
    })
    const three = recentChangesetsQuery({
      remote: async () => new Response(),
      apiUrl: 'https://b.test',
      user: 'x',
    })
    expect(new Set([one, two, three].map((o) => JSON.stringify(o.queryKey))).size).toBe(3)
  })
})
