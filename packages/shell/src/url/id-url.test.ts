import { describe, expect, test } from 'bun:test'
import { createUrlParams } from '@osm-editor-kit/maid-core'
import { fromIdUrl, toIdUrl } from './id-url'
import { shellUrlParamNames } from './params'

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
    'https://ideditor.netlify.app/#background=Bing&disable_features=boundaries&hashtags=%23radnetz&id=w123,n4&map=17.25/52.5/13.4',
  )
  expect(params.get('id')).toBe('w123,n4')
  expect(params.get('background')).toBe('Bing')
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
  const id = 'https://www.openstreetmap.org/edit?editor=id#map=17/52.5/13.4&id=w1&background=Bing'
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
        name: 'my_background',
        parser: { parse: (v) => v, serialize: (v) => v },
        iD: { name: 'background' },
      },
      'imagery',
    )
    expect(() => fromIdUrl('#map=1/2/3', [clash.handle])).toThrow(
      'iD parameter "background" (URL parameter "my_background") is already mapped to "background"',
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
