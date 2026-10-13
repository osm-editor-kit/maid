import { describe, expect, it } from 'bun:test'
import {
  articleFromUrl,
  encodeAnchor,
  encodeTitlePath,
  languageOf,
  qidFromIds,
  qidOf,
  splitWikipediaTag,
  wikidataFollowUp,
  wikidataUrl,
  wikipediaUrl,
  wikipediaValue,
} from './wiki-logic.ts'

describe('languageOf', () => {
  it('accepts a code, lower-cased', () => {
    expect(languageOf('DE')).toBe('de')
    expect(languageOf(' zh-yue ')).toBe('zh-yue')
    expect(languageOf('simple')).toBe('simple')
  })

  it('refuses anything that could change the host of a request', () => {
    expect(languageOf('de/../x')).toBeUndefined()
    expect(languageOf('evil.example/#')).toBeUndefined()
    expect(languageOf('')).toBeUndefined()
    expect(languageOf('a')).toBeUndefined()
  })
})

describe('articleFromUrl (iD: pasted URLs)', () => {
  it('reads the language and the title, underscores as spaces, the first letter upper case', () => {
    expect(articleFromUrl('https://de.wikipedia.org/wiki/berlin_(stadt)')).toEqual({
      lang: 'de',
      title: 'Berlin (stadt)',
    })
  })

  it('decodes the title and keeps the anchor', () => {
    expect(
      articleFromUrl('https://fr.wikipedia.org/wiki/Paris%20(ville)#Histoire_du_site'),
    ).toEqual({
      lang: 'fr',
      title: 'Paris (ville)#Histoire du site',
    })
  })

  it('keeps a title that starts with the language code', () => {
    expect(articleFromUrl('https://en.wikipedia.org/wiki/en-Title')).toEqual({
      lang: 'en',
      title: 'En-Title',
    })
  })

  it('is undefined for a text that is not an article address', () => {
    expect(articleFromUrl('Berlin')).toBeUndefined()
    expect(articleFromUrl('https://example.org/wiki/Berlin')).toBeUndefined()
    expect(articleFromUrl('https://de.wikipedia.org/wiki/%E0%A4%A')).toBeUndefined()
  })
})

describe('the wikipedia tag', () => {
  it('splits lang:title (iD: updateForTags)', () => {
    expect(splitWikipediaTag('en:Title')).toEqual({ lang: 'en', title: 'Title' })
  })

  it('keeps the anchor with the title', () => {
    expect(splitWikipediaTag('de:Title#Anchor')).toEqual({ lang: 'de', title: 'Title#Anchor' })
  })

  it('is undefined without a language', () => {
    expect(splitWikipediaTag('Title')).toBeUndefined()
  })

  it('writes lang:title, trimmed; no title is no tag', () => {
    expect(wikipediaValue('de', ' Title ')).toBe('de:Title')
    expect(wikipediaValue('de', '   ')).toBeUndefined()
    expect(wikipediaValue('', 'Title')).toBeUndefined()
  })
})

describe('encoding (iD: encodePath, encodeURIAnchorFragment)', () => {
  it('encodes the title with spaces as underscores', () => {
    expect(encodeTitlePath('? (film)', undefined)).toBe('%3F_(film)')
  })

  it('adds an encoded anchor fragment', () => {
    expect(encodeTitlePath('? (film)', 'Themes and style')).toBe('%3F_(film)#Themes_and_style')
  })

  it('encodes an anchor', () => {
    expect(encodeAnchor('Theme?')).toBe('#Theme%3F')
  })

  it('replaces spaces with underscores in an anchor', () => {
    expect(encodeAnchor('Themes And Styles')).toBe('#Themes_And_Styles')
  })

  it('encodes % in an anchor, without a dot', () => {
    expect(encodeAnchor('Is%this_100% correct')).toBe('#Is%25this_100%25_correct')
  })

  it('encodes URI-encoded characters in an anchor', () => {
    expect(encodeAnchor('Section %20%25')).toBe('#Section_%2520%2525')
  })

  it('an empty anchor is no fragment', () => {
    expect(encodeAnchor(undefined)).toBe('')
    expect(encodeAnchor('')).toBe('')
  })

  it('builds the article address on the language, with the anchor', () => {
    expect(wikipediaUrl('de', 'Berlin#Geschichte')).toBe(
      'https://de.wikipedia.org/wiki/Berlin#Geschichte',
    )
    expect(wikipediaUrl('en', '? (film)')).toBe('https://en.wikipedia.org/wiki/%3F_(film)')
  })
})

describe('Wikidata items', () => {
  it('reads a QID typed, in either case, or from an item address', () => {
    expect(qidOf('q64')).toBe('Q64')
    expect(qidOf(' Q64 ')).toBe('Q64')
    expect(qidOf('https://www.wikidata.org/wiki/Q64')).toBe('Q64')
  })

  it('is undefined for text that names no item', () => {
    expect(qidOf('Berlin')).toBeUndefined()
    expect(qidOf('Q')).toBeUndefined()
    expect(qidOf('Q12x')).toBeUndefined()
  })

  it('takes the first QID of a lookup (iD: the entity ids, missing ones are -1)', () => {
    expect(qidFromIds(['-1', 'Q64'])).toBe('Q64')
    expect(qidFromIds(['-1'])).toBeUndefined()
  })

  it('builds the item address', () => {
    expect(wikidataUrl('Q64')).toBe('https://www.wikidata.org/wiki/Q64')
  })

  it('the follow-up sets the item of an article only when it differs', () => {
    expect(wikidataFollowUp(undefined, 'Q64')).toBe('Q64')
    expect(wikidataFollowUp('Q64', 'Q64')).toBeUndefined()
    expect(wikidataFollowUp('Q1', 'Q64')).toBe('Q64')
    expect(wikidataFollowUp('Q1', undefined)).toBeUndefined()
  })
})
