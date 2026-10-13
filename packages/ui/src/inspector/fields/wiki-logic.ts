import { cleanValue } from '../logic.ts'

/**
 * The Wikipedia and Wikidata fields as pure rules: the URL and tag formats, the links, and the pick from a
 * lookup. The rules are iD's `modules/ui/fields/wikipedia.js` and `wikidata.js` (pinned checkout,
 * `.reference/id`); the regular expressions are iD's. The requests are in wiki-service.ts.
 */

/** iD wikipedia.js `change()`: a pasted article URL; group 1 the language, 2 the title, 3 the anchor. */
const ARTICLE_URL = /https?:\/\/([-a-z]+)\.wikipedia\.org\/(?:wiki|\1-[-a-z]+)\/([^#]+)(?:#(.+))?/

/** iD wikipedia.js `updateForTags()`: a tag `lang:title`, with an optional `#anchor` in the title. */
const WIKIPEDIA_TAG = /([^:]+):([^#]+)(?:#(.+))?/

/** A Wikipedia language code: `en`, `de`, `zh-yue`, `simple`. Not a list of the languages: the field takes any code. */
const LANGUAGE = /^[a-z][a-z0-9-]{1,19}$/

/** iD wikidata.js: a proper QID. */
const QID = /^Q[0-9]+$/

/** A Wikidata item page address, as the link of the field gives it. */
const WIKIDATA_URL = /wikidata\.org\/(?:wiki|entity)\/(Q[0-9]+)/

/** A language code, lower-cased, or undefined when the text is not one. */
export function languageOf(text: string): string | undefined {
  const lang = text.trim().toLowerCase()
  return LANGUAGE.test(lang) ? lang : undefined
}

/** The language and title of a pasted article URL (iD: the title's underscores become spaces, the first letter is upper case). */
export function articleFromUrl(text: string): { lang: string; title: string } | undefined {
  const match = text.trim().match(ARTICLE_URL)
  if (!match) return undefined
  try {
    let title = decodeURIComponent(match[2] ?? '').replace(/_/g, ' ')
    if (match[3]) title += `#${decodeURIComponent(match[3]).replace(/_/g, ' ')}`
    title = title.slice(0, 1).toUpperCase() + title.slice(1)
    return { lang: match[1] ?? '', title }
  } catch {
    // a malformed escape is not an article address
    return undefined
  }
}

/** The language and the title (with its `#anchor`) of a `wikipedia` tag value, or undefined for another shape. */
export function splitWikipediaTag(value: string): { lang: string; title: string } | undefined {
  const match = value.match(WIKIPEDIA_TAG)
  if (!match) return undefined
  const title = (match[2] ?? '') + (match[3] ? `#${match[3]}` : '')
  return { lang: match[1] ?? '', title }
}

/**
 * The `wikipedia` tag for a language and a title, cleaned as the editor cleans values. Undefined when the
 * title is empty (the tag is removed then, as iD does).
 */
export function wikipediaValue(lang: string, title: string): string | undefined {
  const trimmed = title.trim()
  if (trimmed === '' || lang === '') return undefined
  return cleanValue(`${lang}:${trimmed}`)
}

/** iD wikipedia.js `encodeURIAnchorFragment()`: the anchor with spaces as underscores, URI-encoded, with its `#`. */
export function encodeAnchor(anchor: string | undefined): string {
  if (!anchor) return ''
  return `#${encodeURIComponent(anchor.replace(/ /g, '_'))}`
}

/** iD wikipedia.js `encodePath()`: the title with spaces as underscores, URI-encoded, then the anchor. */
export function encodeTitlePath(title: string, anchor: string | undefined): string {
  return `${encodeURIComponent(title.replace(/ /g, '_'))}${encodeAnchor(anchor)}`
}

/** The article's page address on the language's Wikipedia. */
export function wikipediaUrl(lang: string, title: string): string {
  const hash = title.indexOf('#')
  const page = hash === -1 ? title : title.slice(0, hash)
  const anchor = hash === -1 ? undefined : title.slice(hash + 1)
  return `https://${lang}.wikipedia.org/wiki/${encodeTitlePath(page, anchor)}`
}

/** The Wikidata item's page address. */
export function wikidataUrl(qid: string): string {
  return `https://www.wikidata.org/wiki/${qid}`
}

/**
 * The QID that a typed text names: a QID itself (`Q64`, case-insensitive), or the QID of an item page
 * address. Undefined for any other text.
 */
export function qidOf(text: string): string | undefined {
  const trimmed = text.trim()
  const upper = trimmed.toUpperCase()
  if (QID.test(upper)) return upper
  const match = trimmed.match(WIKIDATA_URL)
  return match?.[1]
}

/** iD wikipedia.js `itemsByTitle`: the first QID among the entity ids that wbgetentities answered. */
export function qidFromIds(ids: readonly string[]): string | undefined {
  return ids.find((id) => QID.test(id))
}

/**
 * The effect of a Wikipedia change on the `wikidata` tag, as iD's follow-up does it: the QID of the article
 * when it is found and differs from the tag; nothing when they are equal or nothing was found.
 */
export function wikidataFollowUp(
  currentWikidata: string | undefined,
  foundQid: string | undefined,
): string | undefined {
  if (foundQid === undefined || foundQid === currentWikidata) return undefined
  return foundQid
}
