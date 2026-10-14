// The OSM Wiki's documentation of a tag, for the "i" buttons. The request and the reading follow iD's
// osm_wikibase.js (getEntity and getDocs), reduced to a description, an image and the wiki page.
//
// The wiki is OSM infrastructure (AGENTS.md, rule 1). A request follows only a person's click on an "i",
// never runs under automation, and goes through the editor's fetch: the wikimedia gate (one at a time, a
// pause on 429 and 509), a time limit and the retry rule. Each wiki page is one query of the editor's query
// client, kept for the session. A page that the query cache does not have is read from storage (30 days)
// before it is asked. The pages of a reference are asked in one call, as iD asks the missing titles
// together, so a key page is asked once for all the tags of that key.
import {
  isAutomated,
  keys,
  MaxlagError,
  retryDelayFor,
  SESSION_DATA,
  shouldRetry,
  type EditorFetch,
  type ModuleStorage,
  type RemoteFetch,
} from '@osm-editor-kit/maid-core'
import {
  wikiTitleOf,
  type Reference,
  type ReferenceInfo,
  type ReferenceLoader,
} from '@osm-editor-kit/maid-ui'
import { z } from 'zod'

const API = 'https://wiki.openstreetmap.org/w/api.php'
/** Where iD shows an image that is on Wikimedia Commons (Wikibase property P4) */
const COMMONS_FILES = 'https://commons.wikimedia.org/w/index.php'
/** Where iD shows an image that is on the OSM Wiki (Wikibase property P28) */
const WIKI_FILES = 'https://wiki.openstreetmap.org/w/index.php'
/** The wiki page title per language (Wikibase property P31) */
const PROPERTY_WIKI_PAGE = 'P31'
const PROPERTY_COMMONS_IMAGE = 'P4'
const PROPERTY_WIKI_IMAGE = 'P28'

/** English: the popover is in English, as the presets are. The server falls back to a close language. */
const LANGUAGE = 'en'
const IMAGE_WIDTH = 400
/** The time limit of a request until its answer starts (the editor's fetch counts it) */
const TIMEOUT_MS = 10_000
/** Wikimedia's maxlag (etiquette, fetching-audit.md): the server refuses while it lags this many seconds */
const MAXLAG_SECONDS = 5
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
/** Storage keys: `maid.reference:` and the wiki page title, as before. The stored shape is unchanged. */
const STORAGE_PREFIX = 'maid.reference:'

/*
 * The shapes below are the fields the code reads from the wiki's answer, and from our own cache. The
 * wiki is a third party, so a field of another type is read as absent (`optionalText`), as a missing
 * field is. The cache is ours: an entry that does not parse counts as absent, and the wiki is asked again.
 */

/** A text field: a value of another type is read as absent */
const optionalText = z.string().optional().catch(undefined)

/** A statement's value, for the three kinds the code reads: a string, an item id, a text in a language */
const datavalueSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('string'), value: optionalText }),
  z.object({ type: z.literal('wikibase-entityid'), value: z.object({ id: optionalText }) }),
  z.object({
    type: z.literal('monolingualtext'),
    value: z.object({ text: optionalText, language: optionalText }),
  }),
])

/** A statement: its rank and the value of its main snak. A statement that is not an object is left out. */
const statementSchema = z.object({
  rank: optionalText,
  mainsnak: z
    .object({ datavalue: datavalueSchema.optional().catch(undefined) })
    .optional()
    .catch(undefined),
})

/** The statements of one property */
const statementsSchema = z
  .array(statementSchema.optional().catch(undefined))
  .optional()
  .catch(undefined)

/** The properties the code reads, and no others */
const claimsSchema = z
  .object({ P4: statementsSchema, P28: statementsSchema, P31: statementsSchema })
  .optional()
  .catch(undefined)

/** An item of the answer, as far as the code reads it */
const itemSchema = z.object({
  missing: optionalText,
  sitelinks: z
    .object({ wiki: z.object({ title: optionalText }).optional().catch(undefined) })
    .optional()
    .catch(undefined),
  descriptions: z
    .record(
      z.string(),
      z.object({ language: optionalText, value: optionalText }).optional().catch(undefined),
    )
    .optional()
    .catch(undefined),
  claims: claimsSchema,
})

/** The answer of wbgetentities. `success` and `error` decide whether it is an answer at all. */
const answerSchema = z.object({
  success: z.unknown().optional(),
  error: z.unknown().optional(),
  entities: z
    .record(z.string(), itemSchema.optional().catch(undefined))
    .optional()
    .catch(undefined),
})

/** The code of an error answer, such as `maxlag`: it goes into the message */
const errorSchema = z.object({ code: optionalText })

type WikibaseItem = z.infer<typeof itemSchema>
type Property = 'P4' | 'P28' | 'P31'

/** What the popover shows of one wiki page; null when the wiki has no item for the page */
type PageInfo = ReferenceInfo | null

/** A stored answer: when it was asked, and its info, or null for a page the wiki has no item for */
const cachedAnswerSchema = z.object({
  at: z.number(),
  info: z.union([
    z.null(),
    z.object({
      description: z.string().optional(),
      imageUrl: z.string().optional(),
      wikiTitle: z.string().optional(),
      itemId: z.string().optional(),
    }),
  ]),
})

/** The wiki pages a reference names: its key page, and its tag page when it has a value. */
function pagesOf(reference: Reference) {
  return {
    key: wikiTitleOf({ key: reference.key }),
    tag: reference.value === undefined ? undefined : wikiTitleOf(reference),
  }
}

/** The titles of the pages a reference names, the key page first. */
function titlesOf(reference: Reference): string[] {
  const pages = pagesOf(reference)
  return pages.tag === undefined ? [pages.key] : [pages.key, pages.tag]
}

/** The request for some wiki pages: one call with their titles, in English, as iD sends it. */
export function requestUrlFor(titles: readonly string[]) {
  const query = new URLSearchParams({
    action: 'wbgetentities',
    sites: 'wiki',
    titles: titles.join('|'),
    languages: LANGUAGE,
    languagefallback: '1',
    maxlag: String(MAXLAG_SECONDS),
    // the browser's CORS check needs it; iD sends it too. A User-Agent cannot be set from a page.
    origin: '*',
    format: 'json',
  })
  return `${API}?${query}`
}

/** The request for a reference: its key page and its tag page in one call, as iD sends it. */
export function requestUrl(reference: Reference) {
  return requestUrlFor(titlesOf(reference))
}

/** The URL that shows a file of a wiki at a fixed width, as iD builds it. */
function fileUrl(base: string, file: string) {
  const query = new URLSearchParams({
    title: `Special:Redirect/file/${file}`,
    width: String(IMAGE_WIDTH),
  })
  return `${base}?${query}`
}

/** The statements of one property of an item. */
function statementsOf(item: WikibaseItem, property: Property) {
  return (item.claims?.[property] ?? []).flatMap((statement) => (statement ? [statement] : []))
}

/** iD's claimToValue without a locale: the value of the first statement that is preferred, else none. */
function preferredValue(item: WikibaseItem, property: Property) {
  const statement = statementsOf(item, property).find((found) => found.rank === 'preferred')
  const datavalue = statement?.mainsnak?.datavalue
  if (datavalue?.type === 'string') return datavalue.value
  if (datavalue?.type === 'wikibase-entityid') return datavalue.value.id
  return undefined
}

/** The wiki page title in one language, from the monolingual statements of an item. The last one wins, as in iD. */
function wikiPageIn(item: WikibaseItem, language: string) {
  let page: string | undefined
  for (const statement of statementsOf(item, PROPERTY_WIKI_PAGE)) {
    const datavalue = statement.mainsnak?.datavalue
    if (datavalue?.type === 'monolingualtext' && datavalue.value.language === language) {
      page = datavalue.value.text ?? page
    }
  }
  return page
}

/** The items of an answer by the wiki page they belong to, each with its id (the key it has in the answer). Missing items are left out, as iD does. */
function itemsByTitle(entities: Record<string, WikibaseItem | undefined>) {
  const items = new Map<string, WikibaseItem & { id: string }>()
  for (const [id, item] of Object.entries(entities)) {
    if (!item || item.missing === '') continue
    const title = item.sitelinks?.wiki?.title
    if (title !== undefined) items.set(title, { ...item, id })
  }
  return items
}

/** The info of one wiki page, from its item: the description (English when there is one, else the first), the preferred image (Commons, else the wiki), the English page and the data item. */
function infoOfItem(item: (WikibaseItem & { id: string }) | undefined): PageInfo {
  if (!item) return null
  const descriptions = item.descriptions ?? {}
  const english = descriptions[LANGUAGE]
  const first = Object.values(descriptions)[0]
  const description = (english?.language === LANGUAGE ? english : first)?.value

  const commons = preferredValue(item, PROPERTY_COMMONS_IMAGE)
  const onWiki = preferredValue(item, PROPERTY_WIKI_IMAGE)
  const imageUrl =
    commons !== undefined
      ? fileUrl(COMMONS_FILES, commons)
      : onWiki !== undefined
        ? fileUrl(WIKI_FILES, onWiki)
        : undefined

  // only a real item id (Q and digits) is linked
  const itemId = /^Q\d+$/.test(item.id) ? item.id : undefined
  return { description, imageUrl, wikiTitle: wikiPageIn(item, LANGUAGE), itemId }
}

/**
 * The info of a reference from the info of its pages, as iD's getDocs reads them: the description, the
 * image and the data item come from the tag's item when it has one, else from the key's; the wiki page is
 * the tag's English page, else the key's. Undefined when the wiki has neither item.
 */
function combine(tag: PageInfo | undefined, key: PageInfo | undefined): ReferenceInfo | undefined {
  const item = tag ?? key
  if (!item) return undefined
  return {
    description: item.description,
    imageUrl: item.imageUrl,
    itemId: item.itemId,
    wikiTitle: tag?.wikiTitle ?? key?.wikiTitle,
  }
}

/**
 * Reads an answer of the wiki page by page: for each title asked, its info, or null when the wiki has no
 * item for it. Throws when the answer is an error; the message names the code (`maxlag` for a busy wiki).
 */
export function parseWikibasePages(answer: unknown, titles: readonly string[]) {
  const parsed = answerSchema.safeParse(answer)
  if (!parsed.success || !parsed.data.success || parsed.data.error !== undefined) {
    const code = parsed.success ? errorSchema.safeParse(parsed.data.error).data?.code : undefined
    const message = `The OSM Wiki answered with an error${code === undefined ? '' : ` (${code})`}`
    // a busy wiki: the retry waits the 5 seconds Wikimedia asks for
    throw code === 'maxlag' ? new MaxlagError(message) : new Error(message)
  }
  const items = itemsByTitle(parsed.data.entities ?? {})
  return new Map<string, PageInfo>(
    titles.map((title): [string, PageInfo] => [title, infoOfItem(items.get(title))]),
  )
}

/**
 * Reads one answer that holds both pages of a reference, as iD's getDocs does. Undefined when the wiki has
 * neither item. Throws when the answer is an error.
 */
export function parseWikibaseAnswer(answer: unknown, reference: Reference) {
  const pages = pagesOf(reference)
  const found = parseWikibasePages(answer, titlesOf(reference))
  return combine(pages.tag === undefined ? undefined : found.get(pages.tag), found.get(pages.key))
}

/** A stored answer, when it is younger than 30 days: its info, or null for a page the wiki has no item for. */
export function freshStored(raw: string | null, now: number) {
  if (raw === null) return undefined
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return undefined
  }
  const stored = cachedAnswerSchema.safeParse(json)
  if (!stored.success || now - stored.data.at > MAX_AGE_MS) return undefined
  return stored.data.info
}

/** Resolves with the value of a promise, or rejects as it does, unless `signal` aborts first: then it rejects with the reason. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return promise
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
  })
}

export type ReferenceLoaderDeps = {
  /** The editor's fetch: the wikimedia gate, the time limit and the pause on 429 apply to it */
  fetch: RemoteFetch
  /** The editor's query client: each wiki page is one query, kept for the session */
  queries: EditorFetch['queries']
  /** Where answers are kept for 30 days across visits: `moduleStorage()` in the app (nothing under automation) */
  storage: ModuleStorage
  /** Epoch milliseconds. Injected so that tests need no real clock. */
  now: () => number
  /** Waits between the retries of a call. Default: a timer. Tests pass one that does not wait. */
  sleep?: (ms: number) => Promise<void>
}

/** One call to the wiki in flight: the pages it asks for, the way to cancel it, and its answer */
type Batch = {
  readonly titles: readonly string[]
  readonly controller: AbortController
  readonly answer: Promise<Map<string, PageInfo>>
}

/**
 * The loader of the "i" popovers. The app makes one, on the editor's fetch and query cache; tests make
 * their own with fakes. Under automation it asks nothing and returns undefined.
 */
export function createReferenceLoader(deps: ReferenceLoaderDeps): ReferenceLoader {
  const { fetch: send, queries, storage, now } = deps
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  /** The callers waiting for each page. A call to the wiki is cancelled when none waits for any of its pages. */
  const waiting = new Map<string, number>()
  /** The call in flight that asks for each page */
  const batches = new Map<string, Batch>()

  function cachedOf(title: string) {
    return queries.getQueryData<PageInfo>(keys.wiki(title))
  }

  /** The query of a page is filled from storage when it is empty and the stored answer is fresh */
  function seed(title: string) {
    if (cachedOf(title) !== undefined) return
    const stored = freshStored(storage.getItem(STORAGE_PREFIX + title), now())
    if (stored !== undefined) queries.setQueryData(keys.wiki(title), stored)
  }

  /** Called for a fresh answer only: a failed one is not stored */
  function remember(title: string, info: PageInfo) {
    storage.setItem(STORAGE_PREFIX + title, JSON.stringify({ at: now(), info }))
  }

  async function requestPages(titles: readonly string[], signal: AbortSignal) {
    const response = await send(requestUrlFor(titles), {
      signal,
      timeoutMs: TIMEOUT_MS,
      credentials: 'omit',
    })
    return parseWikibasePages(await response.json(), titles)
  }

  /**
   * A call with the retry rule of the editor (`shouldRetry`: at most two retries, never a 4xx, a rate limit
   * or an abort) and its delays (`retryDelayFor`). The retries belong to the call, not to each page, so
   * that the pages of one call are retried together: one request per try.
   */
  async function requestWithRetries(titles: readonly string[], signal: AbortSignal) {
    for (let retries = 0; ; retries++) {
      try {
        return await requestPages(titles, signal)
      } catch (error) {
        if (!shouldRetry(retries, error)) throw error
        await sleep(retryDelayFor(retries, error))
        if (signal.aborted) throw signal.reason
      }
    }
  }

  /** One call to the wiki for these pages. The answer is kept for each page; the call is forgotten when it is over. */
  function startBatch(titles: readonly string[]): Batch {
    const controller = new AbortController()
    const answer = requestWithRetries(titles, controller.signal).then((pages) => {
      for (const title of titles) remember(title, pages.get(title) ?? null)
      return pages
    })
    const batch: Batch = { titles, controller, answer }
    for (const title of titles) batches.set(title, batch)
    const forget = () => {
      for (const title of titles) if (batches.get(title) === batch) batches.delete(title)
    }
    answer.then(forget, forget)
    return batch
  }

  /**
   * The answer for one page, for its query. A page that a call is already asking for joins that call. Else
   * the call also asks for the other pages of the reference that nobody has yet.
   */
  function askPage(title: string, others: readonly string[]): Promise<PageInfo> {
    const batch =
      batches.get(title) ??
      startBatch([
        title,
        ...others.filter((other) => cachedOf(other) === undefined && !batches.has(other)),
      ])
    return batch.answer.then((pages) => pages.get(title) ?? null)
  }

  /** A caller of a page has left (its answer came, or its signal aborted). With no caller left, the page's query stops, and a call that no page of it waits for is cancelled. */
  function release(title: string) {
    const left = (waiting.get(title) ?? 1) - 1
    if (left > 0) {
      waiting.set(title, left)
      return
    }
    waiting.delete(title)
    void queries.cancelQueries({ queryKey: keys.wiki(title) })
    const batch = batches.get(title)
    if (batch && batch.titles.every((other) => !waiting.has(other))) batch.controller.abort()
  }

  /** One caller's answer for a page. Callers share the page's query, so two of them make one call. */
  function pageOf(
    title: string,
    others: readonly string[],
    signal: AbortSignal | undefined,
  ): Promise<PageInfo> {
    if (signal?.aborted) return Promise.reject(signal.reason)
    waiting.set(title, (waiting.get(title) ?? 0) + 1)
    const query = queries.fetchQuery({
      queryKey: keys.wiki(title),
      queryFn: () => askPage(title, others),
      ...SESSION_DATA,
      // the retries are the call's (requestWithRetries), not the query's
      retry: false,
    })
    const answer = untilAborted(query, signal)
    const leave = () => release(title)
    answer.then(leave, leave)
    return answer
  }

  const loader: ReferenceLoader = async (reference, signal) => {
    if (isAutomated()) return undefined
    const pages = pagesOf(reference)
    seed(pages.key)
    if (pages.tag !== undefined) seed(pages.tag)
    const keyPage = pageOf(pages.key, pages.tag === undefined ? [] : [pages.tag], signal)
    const tagPage = pages.tag === undefined ? undefined : pageOf(pages.tag, [pages.key], signal)
    const [key, tag] = await Promise.all([keyPage, tagPage])
    return combine(tag, key)
  }
  return loader
}
