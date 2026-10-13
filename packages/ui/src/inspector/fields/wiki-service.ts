import {
  isAutomated as isAutomatedRun,
  SESSION_DATA,
  type RemoteFetch,
} from '@osm-editor-kit/maid-core'
import { z } from 'zod'
import { languageOf, qidFromIds, qidOf } from './wiki-logic.ts'

/**
 * The requests of the Wikipedia and Wikidata fields. The endpoints and parameters are iD's
 * `modules/services/wikipedia.js` and `wikidata.js` (pinned checkout, `.reference/id`). Maid's rules: every
 * request goes through the editor's `fetch` (the service gate, the time limit and the automation check, in
 * remote-fetch.ts); the answers are checked with Zod schemas of the fields the editor uses; each answer is
 * cached for the session in the editor's query client; no failure reaches the caller (no answer is an empty
 * list or undefined). Under automation (`isAutomated()`) no request is made (AGENTS.md, core rule 1).
 *
 * The language is checked before it goes into a host name: a code of letters, digits and dashes only.
 */

/** The query client's part the service uses (`editor.queries`, a TanStack QueryClient). */
export interface WikiQueries {
  fetchQuery<T>(options: {
    queryKey: readonly unknown[]
    queryFn: () => Promise<T>
    staleTime: number
    gcTime: number
  }): Promise<T>
}

/** An item of Wikidata: its QID, its label and its description, in the language asked for. */
export interface WikiItem {
  id: string
  label: string
  description?: string
}

/** The lookups the fields make. Each resolves to an empty answer when it cannot answer; it never rejects. */
export interface WikiSource {
  /** Article titles of the language's Wikipedia that match a text (iD: list=search, 10 results). */
  searchTitles(lang: string, text: string): Promise<string[]>
  /** The QID of an article, or undefined (iD: wbgetentities by sitelink). */
  qidOfArticle(lang: string, title: string): Promise<string | undefined>
  /** Items that match a text (iD: wbsearchentities, 10 results). */
  searchItems(text: string, lang: string): Promise<WikiItem[]>
  /** An item's label and description in a language (iD: wbgetentities, labels and descriptions). */
  itemOf(qid: string, lang: string): Promise<WikiItem | undefined>
}

export interface WikiSourceOptions {
  /** The editor's fetch (`editor.fetch`). */
  fetch: RemoteFetch
  /** The editor's query client (`editor.queries`): the session cache. */
  queries: WikiQueries
  /** Default: the real check (`navigator.webdriver`). Tests set it. */
  isAutomated?: () => boolean
}

const WIKIPEDIA_API = (lang: string) => `https://${lang}.wikipedia.org/w/api.php?`
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php?'

// The answers, as far as the fields read them. Other keys are dropped by Zod.
const ErrorSchema = z.object({ code: z.string().optional(), info: z.string().optional() })

const TitleSearchSchema = z.object({
  query: z.object({ search: z.array(z.object({ title: z.string() })) }).optional(),
  error: ErrorSchema.optional(),
})

const ItemSearchSchema = z.object({
  search: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .optional(),
  error: ErrorSchema.optional(),
})

const LocalizedSchema = z.record(z.string(), z.object({ value: z.string() }))

const EntitySchema = z.object({
  id: z.string().optional(),
  labels: LocalizedSchema.optional(),
  descriptions: LocalizedSchema.optional(),
})

const EntitiesSchema = z.object({
  entities: z.record(z.string(), EntitySchema).optional(),
  error: ErrorSchema.optional(),
})

/** The titles of a search answer (iD: an error or no `query.search` is no results). */
export function parseTitles(body: unknown): string[] {
  const parsed = TitleSearchSchema.safeParse(body)
  if (!parsed.success || parsed.data.error) return []
  return (parsed.data.query?.search ?? []).map((row) => row.title)
}

/** The items of a wbsearchentities answer, in the order it gives. The label falls back to the QID. */
export function parseItems(body: unknown): WikiItem[] {
  const parsed = ItemSearchSchema.safeParse(body)
  if (!parsed.success || parsed.data.error) return []
  return (parsed.data.search ?? []).map((row) => ({
    id: row.id,
    label: row.label ?? row.id,
    description: row.description,
  }))
}

/** The entity ids of a wbgetentities answer (a missing article has id "-1", which is not a QID). */
export function parseEntityIds(body: unknown): string[] {
  const parsed = EntitiesSchema.safeParse(body)
  if (!parsed.success || parsed.data.error) return []
  return Object.keys(parsed.data.entities ?? {})
}

/** The label and description of one entity in a language (iD: the language, then any other the answer has). */
export function parseItem(body: unknown, qid: string, lang: string): WikiItem | undefined {
  const parsed = EntitiesSchema.safeParse(body)
  if (!parsed.success || parsed.data.error) return undefined
  const entity = parsed.data.entities?.[qid]
  if (!entity) return undefined
  const label = entity.labels?.[lang]?.value ?? firstValue(entity.labels)
  if (label === undefined) return undefined
  const description = entity.descriptions?.[lang]?.value ?? firstValue(entity.descriptions)
  return { id: qid, label, description }
}

function firstValue(map: Record<string, { value: string }> | undefined): string | undefined {
  if (!map) return undefined
  const first = Object.values(map)[0]
  return first?.value
}

function query(params: Record<string, string>): string {
  return new URLSearchParams({ ...params, origin: '*' }).toString()
}

export function createWikiSource(options: WikiSourceOptions): WikiSource {
  const send = options.fetch
  const queries = options.queries
  const isAutomated = options.isAutomated ?? isAutomatedRun

  /** The answer of one request as JSON, or undefined: a failed or refused request is no answer. */
  async function getJson(url: string): Promise<unknown> {
    try {
      const response = await send(url, { headers: { Accept: 'application/json' } })
      if (!response.ok) return undefined
      return await response.json()
    } catch {
      return undefined
    }
  }

  /** Cached for the session, and never asked under automation. */
  function cached<T>(key: readonly unknown[], empty: T, run: () => Promise<T>): Promise<T> {
    if (isAutomated()) return Promise.resolve(empty)
    return queries
      .fetchQuery({ queryKey: ['wiki', ...key], queryFn: run, ...SESSION_DATA })
      .catch(() => empty)
  }

  return {
    searchTitles(lang, text) {
      const code = languageOf(lang)
      const trimmed = text.trim()
      if (code === undefined || trimmed === '') return Promise.resolve([])
      return cached<string[]>(['titles', code, trimmed], [], async () => {
        const body = await getJson(
          WIKIPEDIA_API(code) +
            query({
              action: 'query',
              list: 'search',
              srlimit: '10',
              srinfo: 'suggestion',
              format: 'json',
              srsearch: trimmed,
            }),
        )
        return parseTitles(body)
      })
    },

    qidOfArticle(lang, title) {
      const code = languageOf(lang)
      const trimmed = title.trim()
      if (code === undefined || trimmed === '') return Promise.resolve(undefined)
      // null, not undefined: the query client does not cache an undefined answer
      return cached<string | null>(['article-qid', code, trimmed], null, async () => {
        const body = await getJson(
          WIKIDATA_API +
            query({
              action: 'wbgetentities',
              format: 'json',
              formatversion: '2',
              sites: `${code.replace(/-/g, '_')}wiki`,
              titles: trimmed,
              languages: 'en',
            }),
        )
        return qidFromIds(parseEntityIds(body)) ?? null
      }).then((qid) => qid ?? undefined)
    },

    searchItems(text, lang) {
      const code = languageOf(lang)
      const trimmed = text.trim()
      if (code === undefined || trimmed === '') return Promise.resolve([])
      return cached<WikiItem[]>(['items', code, trimmed], [], async () => {
        const body = await getJson(
          WIKIDATA_API +
            query({
              action: 'wbsearchentities',
              format: 'json',
              formatversion: '2',
              search: trimmed,
              type: 'item',
              language: code,
              uselang: code,
              limit: '10',
            }),
        )
        return parseItems(body)
      })
    },

    itemOf(qid, lang) {
      const code = languageOf(lang)
      const id = qidOf(qid)
      if (code === undefined || id === undefined) return Promise.resolve(undefined)
      return cached<WikiItem | null>(['item', code, id], null, async () => {
        const body = await getJson(
          WIKIDATA_API +
            query({
              action: 'wbgetentities',
              format: 'json',
              formatversion: '2',
              ids: id,
              props: 'labels|descriptions',
              languages: code,
              languagefallback: '1',
            }),
        )
        return parseItem(body, id, code) ?? null
      }).then((item) => item ?? undefined)
    },
  }
}
