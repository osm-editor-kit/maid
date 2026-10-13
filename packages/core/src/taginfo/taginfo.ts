import type { QueryClient } from '@tanstack/query-core'
import { SESSION_DATA } from '../fetching/query-client.ts'
import type { RemoteFetch } from '../fetching/remote-fetch.ts'

/**
 * Key and value suggestions from taginfo for the tags sheet. The endpoints, parameters and filters are
 * iD's `modules/services/taginfo.js` (pinned checkout, `.reference/id`); each copied rule is named in a
 * comment with the iD function it comes from. Maid's own rules: every request goes through the editor's
 * `fetch` (the service gate, the time limit and the automation check: fetching-audit.md 5.3, 5.8), each
 * query is cached for the session in the editor's query client, and no failure reaches the caller:
 * a failed or refused request is no suggestions.
 *
 * Under automation (`isAutomated()`) `remoteFetch` refuses the request before it is sent, so this module
 * makes no request and returns an empty list (AGENTS.md, core rule 1).
 */

/** The public instance. iD reads its base from `ID_TAGINFO_API_URL`; Maid takes it as an option. */
export const TAGINFO_API = 'https://taginfo.openstreetmap.org/api/4/'

/** iD's geometry names, as `context.graph().geometry(id)` gives them. */
export type TaginfoGeometry = 'point' | 'vertex' | 'line' | 'area' | 'relation'

/**
 * Maid rule (fetching-audit.md 5.7, sheet-design.md): a request is made only for at least three characters.
 * iD asks at once; Maid does not, so that a cell with one letter typed makes no request.
 */
export const MIN_QUERY_LENGTH = 3

/** iD `taginfo.js` keys(): `rp: 10`. */
const KEY_ROWS = 10
/** iD `taginfo.js` values(): `rp: 25`. */
const VALUE_ROWS = 25
/** iD `taginfo.js` init(): the popular keys are the first 100 by `values_all`. */
const POPULAR_KEY_ROWS = 100

/** iD `taginfo.js` `tag_sorts`: the sort of keys and values by geometry. A relation keeps `count_all`. */
const SORT_BY_GEOMETRY: Partial<Record<TaginfoGeometry, string>> = {
  point: 'count_nodes',
  vertex: 'count_nodes',
  area: 'count_ways',
  line: 'count_ways',
}

/** iD `taginfo.js` `tag_filters`: the values of a geometry, as the API's `filter`. */
const FILTER_BY_GEOMETRY: Partial<Record<TaginfoGeometry, string>> = {
  point: 'nodes',
  vertex: 'nodes',
  area: 'ways',
  line: 'ways',
}

/** iD `taginfo.js` `_extraExcludedKeys` (#5377, #7485, #10287, #11733): no values are asked for these keys. */
const EXCLUDED_VALUE_KEYS =
  /^(addr:.+|postal_code|via|((int_|loc_|nat_|official_|old_|ref_|reg_|short_|full_|sorting_|alt_|artist_|long_|bridge:|tunnel:)?name(:left|:right)?(:[a-z]+)?))$/

/** iD `taginfo.js` `_extraExcludedKeyNames`: hidden from key suggestions. */
const EXCLUDED_KEY_NAMES = /^(hashtags?|created_by)$/

/** iD `osm/tags.ts` `allowUpperCaseTagValues`: keys whose values may contain upper-case letters. */
const UPPER_CASE_VALUE_KEYS =
  /network|taxon|genus|species|brand|grape_variety|royal_cypher|listed_status|booth|rating|stars|:output|_hours|_times|_ref|manufacturer|country|target|brewery|cai_scale|traffic_sign/

export interface TagSuggestion {
  value: string
  /** The description of a value when taginfo has one, else the value itself (iD's `title`). */
  title: string
}

export interface TaginfoOptions {
  /** The editor's fetch (`editor.fetch`): gate, time limit, automation check. */
  fetch: RemoteFetch
  /** The editor's query client (`editor.queries`): the session cache. */
  queries: QueryClient
  /** The API base, ending in a slash. Default `TAGINFO_API`. */
  apiUrl?: string
  /** The language of the descriptions. iD sends the UI language. Default 'en'. */
  lang?: string
}

export interface Taginfo {
  /** Keys that start with or contain `query`. Empty for fewer than `MIN_QUERY_LENGTH` characters. Never rejects. */
  keys(query: string, geometry?: TaginfoGeometry, signal?: AbortSignal): Promise<TagSuggestion[]>
  /** Values of `key`. Empty for a key that is popular or excluded (no request). Never rejects. */
  values(
    key: string,
    query: string,
    geometry?: TaginfoGeometry,
    signal?: AbortSignal,
  ): Promise<TagSuggestion[]>
}

type Row = Record<string, unknown>

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null
}

function stringField(row: Row, name: string): string | undefined {
  const value = row[name]
  return typeof value === 'string' ? value : undefined
}

/** iD's `Number(d[count])`: a count that is not a number compares as false. */
function numberField(row: Row, name: string): number {
  const value = row[name]
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  return Number.NaN
}

/** iD `filterKeys()` with no `filter` (keys() never sets one): more than 2500 ways, nodes and so on, or in the wiki. */
function passesKeyFilter(row: Row): boolean {
  return numberField(row, 'count_all') > 2500 || row['in_wiki'] === true
}

/** iD `sortKeys`: keys without a colon first; the sort is stable. */
function sortKeys(a: string, b: string): number {
  const aColon = a.includes(':')
  const bColon = b.includes(':')
  if (!aColon && bColon) return -1
  if (aColon && !bColon) return 1
  return 0
}

/** iD `taginfo.js` keys(): the filter, the excluded names, the colon order; `{value, title}` with the key as both. */
function keyRows(rows: readonly Row[]): TagSuggestion[] {
  const keyed: { key: string; row: Row }[] = []
  for (const row of rows) {
    const key = stringField(row, 'key')
    if (key !== undefined) keyed.push({ key, row })
  }
  return keyed
    .filter(({ key, row }) => passesKeyFilter(row) && !EXCLUDED_KEY_NAMES.test(key))
    .sort((a, b) => sortKeys(a.key, b.key))
    .map(({ key }) => ({ value: key, title: key }))
}

/** The answer is `{ data: [...] }`; anything else is an error for the caller to turn into no suggestions. */
function dataRows(body: unknown): Row[] {
  if (!isRow(body) || !Array.isArray(body['data']))
    throw new Error('taginfo: no data list in the answer')
  return body['data'].filter(isRow)
}

/**
 * The answer of one request, or none: it never rejects. An aborted caller gets none at once, and the
 * request itself carries on, so that its answer is in the cache for the next time.
 */
function answerOf(
  run: () => Promise<TagSuggestion[]>,
  signal: AbortSignal | undefined,
): Promise<TagSuggestion[]> {
  if (signal?.aborted) return Promise.resolve([])
  const pending = run().catch((): TagSuggestion[] => [])
  if (signal === undefined) return pending
  return new Promise((resolve) => {
    const stop = () => resolve([])
    signal.addEventListener('abort', stop, { once: true })
    void pending.then((items) => {
      signal.removeEventListener('abort', stop)
      resolve(items)
    })
  })
}

export function createTaginfo(options: TaginfoOptions): Taginfo {
  const { queries } = options
  const send = options.fetch
  const base = options.apiUrl ?? TAGINFO_API
  const lang = options.lang ?? 'en'

  async function getRows(path: string, params: Record<string, string>): Promise<Row[]> {
    const url = new URL(path, base)
    url.search = new URLSearchParams(params).toString()
    const response = await send(url.href, { headers: { Accept: 'application/json' } })
    return dataRows(await response.json())
  }

  async function keysOf(
    query: string,
    geometry: TaginfoGeometry | undefined,
  ): Promise<TagSuggestion[]> {
    // iD keys(): the geometry only changes the sort; `rp` 10; `sortorder` desc; `page` 1.
    const sort = (geometry && SORT_BY_GEOMETRY[geometry]) ?? 'count_all'
    const rows = await getRows('keys/all', {
      rp: String(KEY_ROWS),
      sortname: sort,
      sortorder: 'desc',
      page: '1',
      lang,
      query,
    })
    return keyRows(rows)
  }

  // iD init(): the popular keys, asked once, are excluded from value lookups (#3955), except
  // `opening_hours`. Asked on the first value lookup, not at start (no request before a person types).
  const popularKeys = () =>
    queries.fetchQuery({
      queryKey: ['taginfo', 'popular-keys'],
      queryFn: async () => {
        const rows = await getRows('keys/all', {
          rp: String(POPULAR_KEY_ROWS),
          sortname: 'values_all',
          sortorder: 'desc',
          page: '1',
          lang,
        })
        const names = keyRows(rows).map((item) => item.value)
        return new Set(names.filter((name) => name !== 'opening_hours'))
      },
      ...SESSION_DATA,
    })

  async function valuesOf(
    key: string,
    query: string,
    geometry: TaginfoGeometry | undefined,
  ): Promise<TagSuggestion[]> {
    // iD values(): the geometry sets `filter` and `sortname`; `rp` 25; `sortorder` desc; `page` 1.
    const params: Record<string, string> = {
      key,
      rp: String(VALUE_ROWS),
      sortname: (geometry && SORT_BY_GEOMETRY[geometry]) ?? 'count_all',
      sortorder: 'desc',
      page: '1',
      lang,
      query,
    }
    const filter = geometry && FILTER_BY_GEOMETRY[geometry]
    if (filter !== undefined) params['filter'] = filter
    const rows = await getRows('key/values', params)

    // iD values() filterValues(): no `;` or `,`; no upper-case letters or `*` unless the key allows
    // them (or it is type=associatedStreet); more than 100 uses. Kept in taginfo's order.
    const allowUpperCase = UPPER_CASE_VALUE_KEYS.test(key)
    const result: TagSuggestion[] = []
    for (const row of rows) {
      const value = stringField(row, 'value')
      if (value === undefined) continue
      if (/[;,]/.test(value)) continue
      if (
        !allowUpperCase &&
        !(key === 'type' && value === 'associatedStreet') &&
        /[A-Z*]/.test(value)
      )
        continue
      if (!(numberField(row, 'count') > 100)) continue
      result.push({ value, title: stringField(row, 'description') || value })
    }
    return result
  }

  return {
    keys(query, geometry, signal) {
      if (query.length < MIN_QUERY_LENGTH) return Promise.resolve([])
      return answerOf(
        () =>
          queries.fetchQuery({
            queryKey: ['taginfo', 'keys', geometry ?? 'any', query],
            queryFn: () => keysOf(query, geometry),
            ...SESSION_DATA,
          }),
        signal,
      )
    },
    values(key, query, geometry, signal) {
      if (key === '' || EXCLUDED_VALUE_KEYS.test(key)) return Promise.resolve([])
      if (query.length < MIN_QUERY_LENGTH) return Promise.resolve([])
      return answerOf(async () => {
        const popular = await popularKeys()
        if (popular.has(key)) return []
        return queries.fetchQuery({
          queryKey: ['taginfo', 'values', key, geometry ?? 'any', query],
          queryFn: () => valuesOf(key, query, geometry),
          ...SESSION_DATA,
        })
      }, signal)
    },
  }
}
