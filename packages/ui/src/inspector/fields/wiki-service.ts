import {
  isAutomated as isAutomatedRun,
  SESSION_DATA,
  type RemoteFetch,
} from '@osm-editor-kit/maid-core'
import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { languageOf, qidFromIds, qidOf } from './wiki-logic.ts'

/**
 * The requests of the Wikipedia and Wikidata fields. The endpoints and parameters are iD's
 * `modules/services/wikipedia.js` and `wikidata.js` (pinned checkout, `.reference/id`). Maid's rules: every
 * request goes through the editor's `fetch` (the service gate, the time limit and the automation check, in
 * remote-fetch.ts); the answers are checked with Zod schemas of the fields the editor uses. Each lookup is a
 * `queryOptions` of TanStack Query: the fields use it with `useQuery`, and the answers are kept for the session in
 * the editor's query client. Under automation no lookup is enabled (AGENTS.md, core rule 1), and the app gives the
 * fields no source then (wiki-context.ts).
 *
 * The language is checked before it goes into a host name: a code of letters, digits and dashes only.
 */

/** An item of Wikidata: its QID, its label and its description, in the language asked for. */
export interface WikiItem {
  id: string
  label: string
  description?: string
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

/** The options of one lookup: kept for the session, never retried, and never asked under automation. */
function lookup<T>(
  key: readonly string[],
  asked: boolean,
  empty: T,
  run: () => Promise<T>,
  automated: () => boolean,
) {
  return queryOptions({
    queryKey: ['wiki', ...key] as readonly unknown[],
    // checked here too: a fetchQuery ignores `enabled`, and an automated run asks nothing
    queryFn: () => (automated() ? Promise.resolve(empty) : run()),
    enabled: asked && !automated(),
    ...SESSION_DATA,
    // a failed request is an error of the query, shown as no answer by the field; it is not repeated
    retry: false,
  })
}

/**
 * The lookups as query options (`useQuery(source.titles(lang, text))`, or `queryClient.fetchQuery`). A failed
 * request is an error (not cached); a field shows it as no answer. Under automation every lookup is disabled.
 */
export interface WikiSourceOptions {
  /** The editor's fetch (`editor.fetch`): the gate, the time limit and the automation refusal apply. */
  fetch: RemoteFetch
  /** Default: the real check (`navigator.webdriver`). Tests set it. */
  isAutomated?: () => boolean
}

export function createWikiSource(options: WikiSourceOptions) {
  const send = options.fetch
  const isAutomated = options.isAutomated ?? isAutomatedRun

  /** The answer of one request as JSON. A failed request throws: the query keeps no answer for it. */
  async function getJson(url: string): Promise<unknown> {
    const response = await send(url, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`The wiki answered ${response.status}`)
    return response.json()
  }

  return {
    /** Article titles of the language's Wikipedia that match a text (iD: list=search, 10 results). */
    titles(lang: string, text: string) {
      const code = languageOf(lang)
      const trimmed = text.trim()
      return lookup(
        ['titles', code ?? '', trimmed],
        code !== undefined && trimmed !== '',
        [],
        async () => {
          if (code === undefined) return []
          return parseTitles(
            await getJson(
              WIKIPEDIA_API(code) +
                query({
                  action: 'query',
                  list: 'search',
                  srlimit: '10',
                  srinfo: 'suggestion',
                  format: 'json',
                  srsearch: trimmed,
                }),
            ),
          )
        },
        isAutomated,
      )
    },

    /** The QID of an article, or null (iD: wbgetentities by sitelink). Null, not undefined: a query needs data. */
    qidOfArticle(lang: string, title: string) {
      const code = languageOf(lang)
      const trimmed = title.trim()
      return lookup<string | null>(
        ['article-qid', code ?? '', trimmed],
        code !== undefined && trimmed !== '',
        null,
        async () => {
          if (code === undefined) return null
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
        },
        isAutomated,
      )
    },

    /** Items that match a text (iD: wbsearchentities, 10 results). */
    items(text: string, lang: string) {
      const code = languageOf(lang)
      const trimmed = text.trim()
      return lookup(
        ['items', code ?? '', trimmed],
        code !== undefined && trimmed !== '',
        [],
        async () => {
          if (code === undefined) return []
          return parseItems(
            await getJson(
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
            ),
          )
        },
        isAutomated,
      )
    },

    /** An item's label and description in a language, or null (iD: wbgetentities, labels and descriptions). */
    item(qid: string | undefined, lang: string) {
      const code = languageOf(lang)
      const id = qid === undefined ? undefined : qidOf(qid)
      return lookup<WikiItem | null>(
        ['item', code ?? '', id ?? ''],
        code !== undefined && id !== undefined,
        null,
        async () => {
          if (code === undefined || id === undefined) return null
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
        },
        isAutomated,
      )
    },
  }
}

/** The lookups of the fields: the options of each, from `createWikiSource`. */
export type WikiSource = ReturnType<typeof createWikiSource>
