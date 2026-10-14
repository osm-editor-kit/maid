import { afterAll, describe, expect, it } from 'bun:test'
import {
  createEditorFetch,
  keys,
  RateLimitedError,
  type ModuleStorage,
} from '@osm-editor-kit/maid-core'
import type { Reference } from '@osm-editor-kit/maid-ui'
import { createReferenceLoader, freshStored, parseWikibaseAnswer, requestUrl } from './reference.ts'

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

const PRIMARY_ITEM = {
  id: 'Q102',
  sitelinks: { wiki: { site: 'wiki', title: 'Tag:highway=primary', badges: [] } },
  descriptions: { en: { language: 'en', value: 'A main road between towns.' } },
  claims: {
    P31: [
      {
        rank: 'normal',
        mainsnak: {
          snaktype: 'value',
          datavalue: {
            type: 'monolingualtext',
            value: { text: 'Tag:highway=primary', language: 'en' },
          },
        },
      },
    ],
  },
}

const TAG: Reference = { key: 'highway', value: 'residential' }
const KEY: Reference = { key: 'highway' }
const PRIMARY: Reference = { key: 'highway', value: 'primary' }
const TAG_TITLE = 'Tag:highway=residential'
const KEY_TITLE = 'Key:highway'

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

  it('asks with maxlag 5, so that a busy wiki refuses instead of answering late', () => {
    const url = new URL(requestUrl(TAG))
    expect(url.searchParams.get('maxlag')).toBe('5')
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

// ---- the loader, on the editor's fetch with a fake wiki and a fake clock ----

const DAY = 24 * 60 * 60 * 1000
const CLOCK_START = 1_000_000

/** The items of the fake wiki, by the page title they belong to */
const WIKI: Record<string, { readonly id: string }> = {
  [TAG_TITLE]: TAG_ITEM,
  [KEY_TITLE]: KEY_ITEM,
  'Tag:highway=primary': PRIMARY_ITEM,
}

/** What the wiki answers for some titles: its item for each title it has, a missing entity for the rest */
function wikiAnswer(titles: readonly string[]) {
  const entities: Record<string, object> = {}
  titles.forEach((title, index) => {
    const item = WIKI[title]
    if (item) entities[item.id] = item
    else entities[`-${index + 1}`] = { ns: 0, title, missing: '' }
  })
  return { success: 1, entities }
}

type Reply = (
  titles: readonly string[],
  call: number,
  init: RequestInit | undefined,
) => Promise<Response>

/** The wiki's API as the tests see it: each call is recorded by its titles, and `reply` decides the answer */
function fakeWiki(reply: Reply) {
  const asked: string[][] = []
  return {
    asked,
    fetch: (url: string, init?: RequestInit) => {
      const titles = (new URL(url).searchParams.get('titles') ?? '').split('|')
      asked.push(titles)
      return reply(titles, asked.length, init)
    },
  }
}

const answering: Reply = async (titles) => new Response(JSON.stringify(wikiAnswer(titles)))

const limited: Reply = async () => new Response('', { status: 429 })

/** Never answers; it ends when the request's signal aborts, as a fetch does */
const hanging: Reply = (_titles, _call, init) =>
  new Promise((_resolve, reject) => {
    const signal = init?.signal
    if (!signal) return
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })

/** A clock that moves only when a test moves it: `sleep` resolves once `advance` has passed its time */
function testClock(start = CLOCK_START) {
  const clock = { time: start }
  const timers: { at: number; resolve: () => void }[] = []
  return {
    now: () => clock.time,
    sleep: (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push({ at: clock.time + ms, resolve })
      }),
    async advance(ms: number) {
      clock.time += ms
      for (const timer of timers.splice(0)) {
        if (timer.at <= clock.time) timer.resolve()
        else timers.push(timer)
      }
      await settle()
    },
  }
}

/** The reason a call rejected with; undefined when it resolved */
function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  )
}

/** Lets the pending promise callbacks run */
function settle() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

function memoryStorage(initial: Record<string, string>): ModuleStorage & { writes: string[] } {
  const values = new Map(Object.entries(initial))
  const writes: string[] = []
  return {
    writes,
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => {
      writes.push(name)
      values.set(name, value)
    },
    removeItem: (name) => {
      values.delete(name)
    },
  }
}

function setUp(reply: Reply, stored: Record<string, string> = {}) {
  const clock = testClock()
  const wiki = fakeWiki(reply)
  const net = createEditorFetch({
    now: clock.now,
    sleep: clock.sleep,
    isAutomated: () => false,
    fetch: wiki.fetch,
  })
  const storage = memoryStorage(stored)
  const load = createReferenceLoader({
    fetch: net.fetch,
    queries: net.queries,
    storage,
    now: clock.now,
    // the retry delays are not waited for in tests (the rule's delays are checked in query-client.test.ts)
    sleep: () => Promise.resolve(),
  })
  return { load, net, clock, storage, asked: wiki.asked }
}

describe('createReferenceLoader', () => {
  it('asks the key page once for two tags of one key', async () => {
    const { load, asked } = setUp(answering)
    const residential = await load(TAG)
    const primary = await load(PRIMARY)
    expect(asked).toEqual([[KEY_TITLE, TAG_TITLE], ['Tag:highway=primary']])
    expect(residential?.description).toBe('A road that gives access to houses.')
    expect(primary?.description).toBe('A main road between towns.')
  })

  it('shares the key page between two tags that load at the same time', async () => {
    const { load, asked } = setUp(answering)
    await Promise.all([load(TAG), load(PRIMARY)])
    expect(asked.flat().filter((title) => title === KEY_TITLE)).toHaveLength(1)
    expect(asked).toHaveLength(2)
  })

  it('makes one request for two loads of one tag at the same time', async () => {
    const { load, asked } = setUp(answering)
    const [first, second] = await Promise.all([load(TAG), load(TAG)])
    expect(asked).toHaveLength(1)
    expect(second).toEqual(first)
  })

  it('makes no state change for an aborted load, and asks again on the next one', async () => {
    const mode = { hang: true }
    const { load, asked, net, storage } = setUp((titles, call, init) =>
      mode.hang ? hanging(titles, call, init) : answering(titles, call, init),
    )
    const controller = new AbortController()
    const pending = load(TAG, controller.signal)
    await settle()
    controller.abort()
    expect(await rejectionOf(pending)).toBeDefined()
    await settle()
    expect(storage.writes).toEqual([])
    expect(net.queries.getQueryData(keys.wiki(TAG_TITLE))).toBeUndefined()

    mode.hang = false
    const info = await load(TAG)
    expect(asked).toHaveLength(2)
    expect(info?.description).toBe('A road that gives access to houses.')
  })

  it('pauses on a rate limit, and the next call waits for the pause to end', async () => {
    const { load, asked, clock } = setUp((titles, call, init) =>
      call === 1 ? limited(titles, call, init) : answering(titles, call, init),
    )
    expect(await rejectionOf(load(TAG))).toBeInstanceOf(RateLimitedError)
    const next = load(PRIMARY)
    await settle()
    expect(asked).toHaveLength(1)
    await clock.advance(10_000)
    expect((await next)?.description).toBe('A main road between towns.')
    expect(asked).toHaveLength(2)
  })

  it('keeps a stored answer younger than 30 days, and asks nothing for it', async () => {
    const at = CLOCK_START - 29 * DAY
    const { load, asked } = setUp(answering, {
      [`maid.reference:${KEY_TITLE}`]: JSON.stringify({
        at,
        info: { description: 'The type of a road.', wikiTitle: KEY_TITLE, itemId: 'Q101' },
      }),
      [`maid.reference:${TAG_TITLE}`]: JSON.stringify({
        at,
        info: {
          description: 'A road that gives access to houses.',
          wikiTitle: TAG_TITLE,
          itemId: 'Q100',
        },
      }),
    })
    const info = await load(TAG)
    expect(asked).toHaveLength(0)
    expect(info?.description).toBe('A road that gives access to houses.')
    expect(info?.itemId).toBe('Q100')
  })

  it('asks again for a stored answer older than 30 days, and only for that page', async () => {
    const { load, asked, storage } = setUp(answering, {
      [`maid.reference:${KEY_TITLE}`]: JSON.stringify({
        at: CLOCK_START - 1 * DAY,
        info: { description: 'The type of a road.', wikiTitle: KEY_TITLE, itemId: 'Q101' },
      }),
      [`maid.reference:${TAG_TITLE}`]: JSON.stringify({
        at: CLOCK_START - 31 * DAY,
        info: { description: 'Old text.', wikiTitle: TAG_TITLE, itemId: 'Q100' },
      }),
    })
    const info = await load(TAG)
    expect(asked).toEqual([[TAG_TITLE]])
    expect(info?.description).toBe('A road that gives access to houses.')
    expect(storage.writes).toEqual([`maid.reference:${TAG_TITLE}`])
  })

  it('retries a maxlag answer as the retry rule says, and stores nothing', async () => {
    const { load, asked, storage } = setUp(
      async () => new Response(JSON.stringify({ error: { code: 'maxlag' } })),
    )
    const failure = await rejectionOf(load(TAG))
    expect(failure instanceof Error ? failure.message : undefined).toBe(
      'The OSM Wiki answered with an error (maxlag)',
    )
    expect(asked).toHaveLength(3)
    expect(storage.writes).toEqual([])
  })
})

describe('the loader under automation', () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

  afterAll(() => {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
  })

  it('sends no request and returns nothing when the browser is automated', async () => {
    const { load, asked } = setUp(answering)
    Object.defineProperty(globalThis, 'navigator', {
      value: { webdriver: true },
      configurable: true,
    })
    expect(await load(TAG)).toBeUndefined()
    expect(asked).toHaveLength(0)
  })
})
