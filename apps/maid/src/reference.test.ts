import { afterAll, describe, expect, it } from 'bun:test'
import type { Reference } from '@osm-editor-kit/maid-ui'
import { freshStored, loadReference, parseWikibaseAnswer, requestUrl } from './reference.ts'

// The answers are written here, not fetched. Their shape is what iD's osm_wikibase.js reads from
// wbgetentities: success, entities (missing, sitelinks.wiki.title, descriptions, claims P4, P28 and P31
// with rank and mainsnak.datavalue). The values are invented for the test.

const TAG_ITEM = {
  id: 'Q100',
  sitelinks: { wiki: { site: 'wiki', title: 'Tag:highway=residential', badges: [] } },
  descriptions: {
    en: { language: 'en', value: 'A road that gives access to houses.' },
  },
  claims: {
    P4: [
      {
        rank: 'normal',
        mainsnak: { snaktype: 'value', datavalue: { type: 'string', value: 'Other.jpg' } },
      },
      {
        rank: 'preferred',
        mainsnak: {
          snaktype: 'value',
          datavalue: { type: 'string', value: 'Residential road.jpg' },
        },
      },
    ],
    P31: [
      {
        rank: 'normal',
        mainsnak: {
          snaktype: 'value',
          datavalue: {
            type: 'monolingualtext',
            value: { text: 'Tag:highway=residential', language: 'en' },
          },
        },
      },
    ],
  },
}

const KEY_ITEM = {
  id: 'Q101',
  sitelinks: { wiki: { site: 'wiki', title: 'Key:highway', badges: [] } },
  descriptions: { en: { language: 'en', value: 'The type of a road.' } },
  claims: {
    P28: [
      {
        rank: 'preferred',
        mainsnak: { snaktype: 'value', datavalue: { type: 'string', value: 'Highway sign.svg' } },
      },
    ],
    P31: [
      {
        rank: 'normal',
        mainsnak: {
          snaktype: 'value',
          datavalue: { type: 'monolingualtext', value: { text: 'Key:highway', language: 'en' } },
        },
      },
    ],
  },
}

const TAG: Reference = { key: 'highway', value: 'residential' }
const KEY: Reference = { key: 'highway' }

function answer(...items: object[]): unknown {
  const entities: Record<string, object> = {}
  items.forEach((item, index) => {
    entities[`Q${100 + index}`] = item
  })
  return { success: 1, entities }
}

describe('parseWikibaseAnswer', () => {
  it('reads the description, the preferred Commons image and the wiki page of the tag item', () => {
    const info = parseWikibaseAnswer(answer(TAG_ITEM, KEY_ITEM), TAG)
    expect(info?.description).toBe('A road that gives access to houses.')
    expect(info?.wikiTitle).toBe('Tag:highway=residential')
    // the tag's own item, for the link to the data item
    expect(info?.itemId).toBe('Q100')
    const image = new URL(info?.imageUrl ?? '')
    expect(image.origin + image.pathname).toBe('https://commons.wikimedia.org/w/index.php')
    expect(image.searchParams.get('title')).toBe('Special:Redirect/file/Residential road.jpg')
    expect(image.searchParams.get('width')).toBe('400')
  })

  it('reads the key item for a key alone, with its image from the wiki', () => {
    const info = parseWikibaseAnswer(answer(KEY_ITEM), KEY)
    expect(info?.description).toBe('The type of a road.')
    expect(info?.wikiTitle).toBe('Key:highway')
    expect(info?.itemId).toBe('Q100')
    const image = new URL(info?.imageUrl ?? '')
    expect(image.origin + image.pathname).toBe('https://wiki.openstreetmap.org/w/index.php')
    expect(image.searchParams.get('title')).toBe('Special:Redirect/file/Highway sign.svg')
  })

  it('takes the description of the tag item only, as iD does, even when the key has one', () => {
    const tagWithoutText = { ...TAG_ITEM, descriptions: {} }
    const info = parseWikibaseAnswer(answer(tagWithoutText, KEY_ITEM), TAG)
    expect(info?.description).toBeUndefined()
  })

  it('takes the wiki page of the key item when the tag item has none in English', () => {
    const tagWithoutPage = { ...TAG_ITEM, claims: {} }
    const info = parseWikibaseAnswer(answer(tagWithoutPage, KEY_ITEM), TAG)
    expect(info?.wikiTitle).toBe('Key:highway')
  })

  it('takes the first description when there is none in English', () => {
    const german = {
      ...TAG_ITEM,
      descriptions: { de: { language: 'de', value: 'Eine Straße für Anlieger.' } },
    }
    const info = parseWikibaseAnswer(answer(german), TAG)
    expect(info?.description).toBe('Eine Straße für Anlieger.')
  })

  it('takes only a preferred image: a normal statement is not used', () => {
    const onlyNormal = {
      ...TAG_ITEM,
      claims: { P4: [TAG_ITEM.claims.P4[0]] },
    }
    const info = parseWikibaseAnswer(answer(onlyNormal), TAG)
    expect(info?.imageUrl).toBeUndefined()
  })

  it('reads a value of another type as absent, and skips an item that is not an object', () => {
    const otherType = {
      ...TAG_ITEM,
      claims: {
        P4: [
          {
            rank: 'preferred',
            mainsnak: { snaktype: 'value', datavalue: { type: 'quantity', value: { amount: 1 } } },
          },
        ],
      },
    }
    const info = parseWikibaseAnswer(
      { success: 1, entities: { Q99: 'junk', Q100: otherType } },
      TAG,
    )
    expect(info?.imageUrl).toBeUndefined()
    expect(info?.description).toBe('A road that gives access to houses.')
  })

  it('returns undefined when the wiki has no item for the reference', () => {
    const missing = { '-1': { ns: 0, title: 'Tag:highway=nothing', missing: '' } }
    expect(parseWikibaseAnswer({ success: 1, entities: missing }, TAG)).toBeUndefined()
  })

  it('throws when the answer is an error', () => {
    expect(() =>
      parseWikibaseAnswer({ success: 0, error: { code: 'unknown', messages: [] } }, TAG),
    ).toThrow('The OSM Wiki answered with an error')
  })
})

describe('requestUrl', () => {
  it('asks for the key and the tag page in one request, in English, as iD does', () => {
    const url = new URL(requestUrl(TAG))
    expect(url.origin + url.pathname).toBe('https://wiki.openstreetmap.org/w/api.php')
    expect(url.searchParams.get('action')).toBe('wbgetentities')
    expect(url.searchParams.get('sites')).toBe('wiki')
    expect(url.searchParams.get('titles')).toBe('Key:highway|Tag:highway=residential')
    expect(url.searchParams.get('languages')).toBe('en')
    expect(url.searchParams.get('languagefallback')).toBe('1')
    expect(url.searchParams.get('origin')).toBe('*')
    expect(url.searchParams.get('format')).toBe('json')
  })

  it('asks for the key page alone when the reference has no value', () => {
    const url = new URL(requestUrl(KEY))
    expect(url.searchParams.get('titles')).toBe('Key:highway')
  })
})

describe('freshStored', () => {
  const now = Date.parse('2026-10-12T12:00:00Z')
  const day = 24 * 60 * 60 * 1000

  it('gives back a stored answer younger than 30 days', () => {
    const raw = JSON.stringify({ at: now - 29 * day, info: { description: 'A road.' } })
    expect(freshStored(raw, now)).toEqual({ description: 'A road.' })
  })

  it('gives nothing for an answer older than 30 days', () => {
    const raw = JSON.stringify({ at: now - 31 * day, info: { description: 'A road.' } })
    expect(freshStored(raw, now)).toBeUndefined()
  })

  it('gives null back for a reference the wiki had no item for', () => {
    expect(freshStored(JSON.stringify({ at: now, info: null }), now)).toBeNull()
  })

  it('gives nothing when there is no entry, or the entry is not readable', () => {
    expect(freshStored(null, now)).toBeUndefined()
    expect(freshStored('{not json', now)).toBeUndefined()
    expect(freshStored(JSON.stringify({ info: null }), now)).toBeUndefined()
  })

  it('counts an entry as absent when a part of it does not have its type', () => {
    expect(freshStored(JSON.stringify({ at: now, info: { description: 5 } }), now)).toBeUndefined()
    expect(freshStored(JSON.stringify({ at: now, info: 'A road.' }), now)).toBeUndefined()
    expect(freshStored(JSON.stringify({ at: 'today', info: null }), now)).toBeUndefined()
  })
})

describe('loadReference under automation', () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const originalFetch = globalThis.fetch

  afterAll(() => {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    globalThis.fetch = originalFetch
  })

  it('sends no request and returns nothing when the browser is automated', async () => {
    let requests = 0
    globalThis.fetch = (async () => {
      requests += 1
      return new Response('{}')
    }) as unknown as typeof fetch
    Object.defineProperty(globalThis, 'navigator', {
      value: { webdriver: true },
      configurable: true,
    })
    expect(await loadReference(TAG)).toBeUndefined()
    expect(requests).toBe(0)
  })
})
