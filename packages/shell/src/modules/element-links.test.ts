import { describe, expect, test } from 'bun:test'
import { DEV_API } from '../config'
import {
  changesetRowLinks,
  idLinks,
  osmRef,
  placeOf,
  userRowLinks,
  websiteOf,
} from './element-links'

const PROD = 'https://www.openstreetmap.org'
const BERLIN = { lat: 52.5, lng: 13.4 }

describe('osmRef', () => {
  test('an entity id names the OSM type by its first letter and the numeric id', () => {
    expect(osmRef('w704805875')).toEqual({ type: 'way', id: '704805875' })
    expect(osmRef('n1')).toEqual({ type: 'node', id: '1' })
    expect(osmRef('r7')).toEqual({ type: 'relation', id: '7' })
  })

  test('a new entity (negative id) and anything else is not an OSM element', () => {
    expect(osmRef('n-1')).toBeUndefined()
    expect(osmRef('w')).toBeUndefined()
    expect(osmRef('x12')).toBeUndefined()
  })
})

describe('websiteOf', () => {
  test('the development server for dev, openstreetmap.org for OpenStreetMap and the mock', () => {
    expect(websiteOf('dev')).toBe(DEV_API)
    expect(websiteOf('osm')).toBe(PROD)
    expect(websiteOf('mock')).toBe(PROD)
  })
})

describe('placeOf', () => {
  test('the engine centre [lng, lat] becomes { lat, lng }; no centre, no place', () => {
    expect(placeOf([13.4, 52.5])).toEqual(BERLIN)
    expect(placeOf([13.40237445, 52.389554849999996])).toEqual({ lat: 52.389555, lng: 13.402374 })
    expect(placeOf(undefined)).toBeUndefined()
  })
})

describe('idLinks', () => {
  test('the main link is the element history on the given website', () => {
    const links = idLinks('w704805875', { website: PROD })
    expect(links[0]?.id).toBe('osm-history')
    expect(links[0]?.url).toBe(`${PROD}/way/704805875/history`)
    const dev = idLinks('w704805875', { website: DEV_API })
    expect(dev[0]?.url).toBe(`${DEV_API}/way/704805875/history`)
    expect(dev.every((link) => link.url.startsWith(DEV_API))).toBe(true)
  })

  test('country links only where the place is in that country', () => {
    const none = idLinks('w704805875', { website: PROD, loc: BERLIN, countryCodes: [] })
    expect(none.some((link) => link.id === 'tilda')).toBe(false)
    const de = idLinks('w704805875', { website: PROD, loc: BERLIN, countryCodes: ['de'] })
    expect(de.some((link) => link.id === 'tilda')).toBe(true)
  })

  test('a new entity has no links', () => {
    expect(idLinks('n-1', { website: PROD, loc: BERLIN, countryCodes: ['de'] })).toEqual([])
  })
})

describe('changesetRowLinks and userRowLinks', () => {
  test('the main link of a changeset and of a user, on the given website', () => {
    expect(changesetRowLinks('w1', '42', DEV_API)[0]?.url).toBe(`${DEV_API}/changeset/42`)
    expect(userRowLinks('w1', 'Anna', PROD)[0]?.id).toBe('osm-user')
  })

  test('no changeset or user, or a new entity: no links', () => {
    expect(changesetRowLinks('w1', undefined, PROD)).toEqual([])
    expect(changesetRowLinks('w1', '', PROD)).toEqual([])
    expect(userRowLinks('w1', undefined, PROD)).toEqual([])
    expect(changesetRowLinks('n-1', '42', PROD)).toEqual([])
    expect(userRowLinks('n-1', 'Anna', PROD)).toEqual([])
  })
})
