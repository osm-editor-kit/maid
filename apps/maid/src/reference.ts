// The OSM Wiki's documentation of a tag, for the "i" buttons. The request and the reading follow iD's
// osm_wikibase.js (getEntity and getDocs), reduced to a description, an image and the wiki page.
//
// The wiki is OSM infrastructure (AGENTS.md, rule 1). So: a request follows only a person's click on an
// "i"; never under automation; one request at a time; no prefetch and no retry; a tag is asked at most
// once and kept for 30 days, in memory and in localStorage.
import { isAutomated } from '@osm-editor-kit/maid-core'
import { wikiTitleOf, type Reference, type ReferenceInfo } from '@osm-editor-kit/maid-ui'

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
const TIMEOUT_MS = 10_000
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const STORAGE_PREFIX = 'maid.reference:'

type Json = Record<string, unknown>

function record(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : undefined
}

function text(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

/** The wiki pages a reference names: its key page, and its tag page when it has a value. */
function pagesOf(reference: Reference) {
  return {
    key: wikiTitleOf({ key: reference.key }),
    tag: reference.value === undefined ? undefined : wikiTitleOf(reference),
  }
}

/** The request for a reference: one call for its key and its tag page, as iD sends it. */
export function requestUrl(reference: Reference) {
  const pages = pagesOf(reference)
  const titles = [pages.key, pages.tag].filter((title) => title !== undefined).join('|')
  const query = new URLSearchParams({
    action: 'wbgetentities',
    sites: 'wiki',
    titles,
    languages: LANGUAGE,
    languagefallback: '1',
    // the browser's CORS check needs it; iD sends it too. A User-Agent cannot be set from a page.
    origin: '*',
    format: 'json',
  })
  return `${API}?${query}`
}

/** The URL that shows a file of a wiki at a fixed width, as iD builds it. */
function fileUrl(base: string, file: string) {
  const query = new URLSearchParams({
    title: `Special:Redirect/file/${file}`,
    width: String(IMAGE_WIDTH),
  })
  return `${base}?${query}`
}

/** The statements of one property of an item, as records. */
function statementsOf(item: Json, property: string) {
  const list = record(item.claims)?.[property]
  if (!Array.isArray(list)) return []
  return list.flatMap((statement) => {
    const found = record(statement)
    return found ? [found] : []
  })
}

/** iD's claimToValue without a locale: the value of the first statement that is preferred, else none. */
function preferredValue(item: Json, property: string) {
  const statement = statementsOf(item, property).find((found) => found.rank === 'preferred')
  const datavalue = record(record(statement?.mainsnak)?.datavalue)
  if (!datavalue) return undefined
  const value =
    datavalue.type === 'wikibase-entityid' ? record(datavalue.value)?.id : datavalue.value
  return text(value)
}

/** The wiki page title in one language, from the monolingual statements of an item. The last one wins, as in iD. */
function wikiPageIn(item: Json | undefined, language: string) {
  if (!item) return undefined
  let page: string | undefined
  for (const statement of statementsOf(item, PROPERTY_WIKI_PAGE)) {
    const value = record(record(record(statement.mainsnak)?.datavalue)?.value)
    if (value?.language === language) page = text(value.text) ?? page
  }
  return page
}

/** The items of the answer by the wiki page they are. Missing items are left out, as iD does. */
function itemsByTitle(answer: Json) {
  const items = new Map<string, Json>()
  for (const entry of Object.values(record(answer.entities) ?? {})) {
    const item = record(entry)
    if (!item || item.missing === '') continue
    const title = text(record(record(item.sitelinks)?.wiki)?.title)
    if (title !== undefined) items.set(title, item)
  }
  return items
}

/**
 * Reads an answer of the wiki as iD's getDocs does. The description comes from the tag's item, else the
 * key's: in English when there is one, else the first. The image is the preferred one on Commons, else
 * on the wiki. The wiki page is the English one of the tag's item, else of the key's. Undefined when the
 * wiki has neither item. Throws when the answer is an error.
 */
export function parseWikibaseAnswer(answer: unknown, reference: Reference) {
  const root = record(answer)
  if (!root || !root.success || root.error !== undefined) {
    throw new Error('The OSM Wiki answered with an error')
  }
  const pages = pagesOf(reference)
  const items = itemsByTitle(root)
  const tagItem = pages.tag === undefined ? undefined : items.get(pages.tag)
  const keyItem = items.get(pages.key)
  const item = tagItem ?? keyItem
  if (!item) return undefined

  const descriptions = record(item.descriptions) ?? {}
  const english = record(descriptions[LANGUAGE])
  const first = record(Object.values(descriptions)[0])
  const description = text((english?.language === LANGUAGE ? english : first)?.value)

  const commons = preferredValue(item, PROPERTY_COMMONS_IMAGE)
  const onWiki = preferredValue(item, PROPERTY_WIKI_IMAGE)
  const imageUrl =
    commons !== undefined
      ? fileUrl(COMMONS_FILES, commons)
      : onWiki !== undefined
        ? fileUrl(WIKI_FILES, onWiki)
        : undefined

  const wikiTitle = wikiPageIn(tagItem, LANGUAGE) ?? wikiPageIn(keyItem, LANGUAGE)
  return { description, imageUrl, wikiTitle }
}

/** A stored answer, when it is younger than 30 days: its info, or null for a reference the wiki has no item for. */
export function freshStored(raw: string | null, now: number): ReferenceInfo | null | undefined {
  const stored = parseJson(raw)
  const at = stored?.at
  if (stored === undefined || typeof at !== 'number' || now - at > MAX_AGE_MS) return undefined
  if (stored.info === null) return null
  return infoOf(stored.info)
}

function parseJson(raw: string | null) {
  if (raw === null) return undefined
  try {
    return record(JSON.parse(raw))
  } catch {
    return undefined
  }
}

function infoOf(value: unknown) {
  const info = record(value)
  if (!info) return undefined
  return {
    description: text(info.description),
    imageUrl: text(info.imageUrl),
    wikiTitle: text(info.wikiTitle),
  }
}

/** Answers of this session, by the wiki page of the reference. null: the wiki has no item for it. */
const remembered = new Map<string, ReferenceInfo | null>()

/** The requests in line: each waits for the one before, so that only one is ever in flight. */
const line: { tail: Promise<void> } = { tail: Promise.resolve() }

function queued<T>(task: () => Promise<T>) {
  const run = line.tail.then(task)
  line.tail = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function readStored(key: string) {
  try {
    return freshStored(localStorage.getItem(STORAGE_PREFIX + key), Date.now())
  } catch {
    // no localStorage (a private window, blocked site data): the answer is asked again
    return undefined
  }
}

function writeStored(key: string, info: ReferenceInfo | null) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ at: Date.now(), info }))
  } catch {
    // not kept: the answer stays in memory for this session
  }
}

async function fetchAnswer(reference: Reference) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(requestUrl(reference), {
      signal: controller.signal,
      credentials: 'omit',
    })
    if (!response.ok) throw new Error(`The OSM Wiki answered ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The OSM Wiki's documentation of a reference, for the InfoPopover. Undefined when the wiki has no item
 * for it, or under automation (`isAutomated()`), where nothing is requested. Rejects when the wiki
 * cannot be asked; nothing is kept then, so the next opening asks again.
 */
export async function loadReference(reference: Reference) {
  if (isAutomated()) return undefined
  const key = wikiTitleOf(reference)
  return queued(async () => {
    const inMemory = remembered.get(key)
    // an answer held as null (no item) is an answer: the storage is not asked again for it
    const known = inMemory !== undefined ? inMemory : readStored(key)
    if (known !== undefined) {
      remembered.set(key, known)
      return known ?? undefined
    }
    const info = parseWikibaseAnswer(await fetchAnswer(reference), reference)
    remembered.set(key, info ?? null)
    writeStored(key, info ?? null)
    return info
  })
}
