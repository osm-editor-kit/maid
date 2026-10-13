import { expect, test } from 'bun:test'
import { fromIdUrl, toIdUrl } from './id-url'

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
