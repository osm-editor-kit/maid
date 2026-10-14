import { describe, expect, test } from 'bun:test'
import { createUrlParams } from '@osm-editor-kit/maid-core'
import { fromIdUrl, migrateIdHash, toIdUrl } from './id-url'
import { shellUrlParamNames, urlLang } from './params'

test('osm.org edit link', () => {
  const { params, dropped } = fromIdUrl(
    'https://www.openstreetmap.org/edit?editor=id#map=19/52.52280/13.40230',
  )
  expect(params.get('map')).toBe('19/52.5228/13.4023')
  expect(params.has('editor')).toBe(false)
  expect(dropped).toEqual([])
})

test('selection, changeset texts and carried parameters', () => {
  const { params } = fromIdUrl(
    'https://ideditor.netlify.app/#disable_features=boundaries&hashtags=%23radnetz&id=w123,n4&map=17.25/52.5/13.4',
  )
  expect(params.get('id')).toBe('w123,n4')
  expect(params.get('hashtags')).toBe('#radnetz')
  expect(params.get('disable_features')).toBe('boundaries')
})

test('dropped and unknown parameters are reported, not passed on', () => {
  const { params, dropped } = fromIdUrl('#map=17/1/2&walkthrough=true&whatever=1')
  expect([...params.keys()]).toEqual(['map'])
  expect(dropped.map((d) => d.name)).toEqual(['walkthrough', 'whatever'])
})

test('a query parameter wins over the hash, other query parameters stay', () => {
  const { params } = fromIdUrl('http://localhost:5173/?scene=dense&map=18/3/4#map=17/1/2')
  expect(params.get('map')).toBe('18/3/4')
  expect(params.get('scene')).toBe('dense')
})

test('broken map value', () => {
  expect(fromIdUrl('#map=abc').dropped[0]).toEqual({ name: 'map', why: 'could not be read' })
})

test('open in iD', () => {
  expect(toIdUrl('?map=17.00/52.5228/13.4023&id=w123&scene=dense')).toBe(
    'https://www.openstreetmap.org/edit?editor=id#map=17.00/52.5228/13.4023&id=w123',
  )
  expect(toIdUrl('')).toBe('https://www.openstreetmap.org/edit?editor=id')
})

test('round trip keeps what both editors understand', () => {
  const id = 'https://www.openstreetmap.org/edit?editor=id#map=17/52.5/13.4&id=w1&hashtags=%23x'
  expect(toIdUrl(`?${fromIdUrl(id).params.toString()}`)).toBe(id)
})

describe('a parameter a module declared with an iD name', () => {
  // the registry gives the handle, as a module does with api.urlParam
  const { handle } = createUrlParams(shellUrlParamNames()).declare(
    {
      name: 'brightness',
      parser: { parse: (v) => (Number.isFinite(Number(v)) ? v : null), serialize: (v) => v },
      iD: {
        name: 'brightness',
        // iD writes a fraction, Maid a percentage
        fromId: (v) => String(Number(v) * 100),
        toId: (v) => String(Number(v) / 100),
      },
    },
    'imagery',
  )
  const declared = [handle]

  test('an iD link gives the module parameter, converted', () => {
    const { params, dropped } = fromIdUrl('#map=17/1/2&brightness=0.5', declared)
    expect(params.get('brightness')).toBe('50')
    expect(dropped).toEqual([])
  })

  test('the module parameter goes back to iD in iD notation', () => {
    expect(toIdUrl('?map=17/1/2&brightness=50', undefined, declared)).toBe(
      'https://www.openstreetmap.org/edit?editor=id#map=17/1/2&brightness=0.5',
    )
  })

  test('without the declaration the iD name is unknown, as before', () => {
    expect(fromIdUrl('#brightness=0.5').dropped).toEqual([
      { name: 'brightness', why: 'unknown to Maid' },
    ])
    expect(toIdUrl('?brightness=50')).toBe('https://www.openstreetmap.org/edit?editor=id')
  })

  test('a declared iD name that a shell row already uses is refused', () => {
    const clash = createUrlParams().declare(
      {
        name: 'my_map',
        parser: { parse: (v) => v, serialize: (v) => v },
        iD: { name: 'map' },
      },
      'imagery',
    )
    expect(() => fromIdUrl('#map=1/2/3', [clash.handle])).toThrow(
      'iD parameter "map" (URL parameter "my_map") is already mapped to "map"',
    )
  })

  test('an alias a shell row already uses is refused too', () => {
    const clash = createUrlParams().declare(
      {
        name: 'my_background',
        parser: { parse: (v) => v, serialize: (v) => v },
        iD: { name: 'background', aliases: ['id'] },
      },
      'imagery',
    )
    expect(() => fromIdUrl('#map=1/2/3', [clash.handle])).toThrow(
      'iD parameter "id" (URL parameter "my_background") is already mapped to "id"',
    )
  })

  test('a declared iD name that Maid drops is refused', () => {
    const clash = createUrlParams().declare(
      {
        name: 'tour',
        parser: { parse: (v) => v, serialize: (v) => v },
        iD: { name: 'walkthrough' },
      },
      'help',
    )
    expect(() => toIdUrl('?map=1/2/3', undefined, [clash.handle])).toThrow('dropped by Maid')
  })
})

describe('the imagery parameters: background, its alias layer, and overlays', () => {
  // the handles the module declares (imagery/index.ts); the values are strings, and overlays' none is an empty iD value
  const plain = { parse: (v: string) => v, serialize: (v: string) => v }
  const registry = createUrlParams(shellUrlParamNames())
  const background = registry.declare(
    { name: 'background', parser: plain, iD: { name: 'background', aliases: ['layer'] } },
    'imagery',
  ).handle
  const overlays = registry.declare(
    {
      name: 'overlays',
      parser: plain,
      iD: { name: 'overlays', toId: (v) => (v === 'none' ? '' : v) },
    },
    'imagery',
  ).handle
  const declared = [background, overlays]

  test('iD background is read as the same name, and a template keeps its characters', () => {
    const { params, dropped } = fromIdUrl(
      '#map=17/1/2&background=custom:https://tiles.example.org/{z}/{x}/{y}.png?key=a b',
      declared,
    )
    expect(params.get('background')).toBe(
      'custom:https://tiles.example.org/{z}/{x}/{y}.png?key=a b',
    )
    expect(dropped).toEqual([])
  })

  test('iD layer is read as background when background is not given', () => {
    expect(fromIdUrl('#layer=Bing', declared).params.get('background')).toBe('Bing')
  })

  test('background wins over layer, and the layer is reported', () => {
    const { params, dropped } = fromIdUrl('#layer=Bing&background=none', declared)
    expect(params.get('background')).toBe('none')
    expect(dropped).toEqual([{ name: 'layer', why: 'background is given too' }])
  })

  test('without the declaration, background and layer are unknown to Maid', () => {
    expect(fromIdUrl('#background=Bing&layer=Bing').dropped).toEqual([
      { name: 'background', why: 'unknown to Maid' },
      { name: 'layer', why: 'unknown to Maid' },
    ])
  })

  test('the link is written with iD names, and none is left out of overlays', () => {
    expect(toIdUrl('?map=17/1/2&background=Bing&overlays=none', undefined, declared)).toBe(
      'https://www.openstreetmap.org/edit?editor=id#map=17/1/2&background=Bing',
    )
    expect(toIdUrl('?background=Bing&overlays=a,b', undefined, declared)).toBe(
      'https://www.openstreetmap.org/edit?editor=id#background=Bing&overlays=a,b',
    )
  })

  /** A history that records the URLs it is given, and a location of an address */
  function recorder() {
    const urls: string[] = []
    const history = {
      state: null,
      replaceState: (_state: unknown, _title: string, url: string) => urls.push(url),
    }
    const at = (href: string) => {
      const url = new URL(href)
      return { href, pathname: url.pathname, hash: url.hash } as Location
    }
    return { urls, history: history as unknown as History, at }
  }

  test('the first pass keeps what no rule knows yet, and the second pass converts it', () => {
    const { urls, history, at } = recorder()
    const template = 'custom:https://a.example/{z}/{x}/{y}.png'
    const start = `https://maid.example/?scene=small#map=17/1/2&background=${encodeURIComponent(template)}&overlays=a,b`
    migrateIdHash(at(start), history)
    // map is Maid's now; background and overlays wait in the hash, as the module's names are not declared yet
    expect(urls).toEqual([
      '/?scene=small&map=17/1/2#background=custom%3Ahttps%3A%2F%2Fa.example%2F%7Bz%7D%2F%7Bx%7D%2F%7By%7D.png&overlays=a%2Cb',
    ])
    migrateIdHash(at(`https://maid.example${urls[0]}`), history, declared, { final: true })
    expect(urls[1]).toBe(
      '/?scene=small&map=17/1/2&background=custom%3Ahttps%3A//a.example/%7Bz%7D/%7Bx%7D/%7By%7D.png&overlays=a,b',
    )
  })

  test('the final pass drops what is still unknown, and reports it', () => {
    const { urls, history, at } = recorder()
    migrateIdHash(at('https://maid.example/#map=1/2/3&whatever=1'), history, [], { final: true })
    expect(urls).toEqual(['/?map=1/2/3'])
  })

  test('a hash with nothing of Maid in it is left alone by the first pass', () => {
    const { urls, history, at } = recorder()
    migrateIdHash(at('https://maid.example/#background=Bing'), history)
    expect(urls).toEqual([])
  })
})

describe('iD links: the language and the GPX file', () => {
  test('locale is the language of the link, by its base language, and the first one Maid has wins', () => {
    expect(fromIdUrl('#locale=de-DE').params.get('lang')).toBe('de')
    expect(fromIdUrl('#locale=fr_FR').params.get('lang')).toBe('fr')
    expect(fromIdUrl('#locale=pt-BR,es-MX,de').params.get('lang')).toBe('es')
    expect(fromIdUrl('#locale=EN').params.get('lang')).toBe('en')
  })

  test('a locale Maid does not have is left out, and a lang in the address stays', () => {
    const { params, dropped } = fromIdUrl('#locale=pt-BR')
    expect(params.has('lang')).toBe(false)
    expect(dropped).toEqual([{ name: 'locale', why: 'could not be read' }])
    expect(fromIdUrl('?lang=fr#locale=de-DE').params.get('lang')).toBe('fr')
  })

  test("the hand-over reads through the shell's language parameter", () => {
    expect(urlLang(`?${fromIdUrl('#locale=de-DE').params.toString()}`)).toBe('de')
  })

  test("Maid writes its language as iD's locale, and the round trip keeps it", () => {
    expect(toIdUrl('?lang=de')).toBe('https://www.openstreetmap.org/edit?editor=id#locale=de')
    const id = 'https://www.openstreetmap.org/edit?editor=id#locale=fr'
    expect(toIdUrl(`?${fromIdUrl(id).params.toString()}`)).toBe(id)
  })

  test('a GPX file is left out with the reason, not passed on as a Maid parameter', () => {
    const { params, dropped } = fromIdUrl('#gpx=https://example.org/track.gpx&map=17/1/2')
    expect(params.has('gpx')).toBe(false)
    expect(dropped).toEqual([
      { name: 'gpx', why: 'Maid draws GeoJSON, PMTiles and vector tiles, not GPX files' },
    ])
    expect(shellUrlParamNames()).not.toContain('gpx')
  })
})
