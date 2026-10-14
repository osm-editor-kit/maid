import { describe, expect, test } from 'bun:test'
import { createServiceRegistry, isLocalUrl, SERVICES } from './services.ts'

const url = (text: string) => new URL(text)

describe('service limits', () => {
  test('the limits are the audit values: Wikimedia 1, the APIs 6, data layers 2', () => {
    expect(SERVICES.osm.limit).toBe(6)
    expect(SERVICES.wikimedia.limit).toBe(1)
    expect(SERVICES.mapillary.limit).toBe(6)
    expect(SERVICES.panoramax.limit).toBe(6)
    expect(SERVICES.data.limit).toBe(2)
  })
})

describe('isLocalUrl', () => {
  test('the local names are local', () => {
    for (const text of [
      'http://localhost:8090/x',
      'http://127.0.0.1/x',
      'http://[::1]:8090/x',
      'https://maid.localhost/x',
      'https://maid.test/x',
    ]) {
      expect(isLocalUrl(url(text))).toBe(true)
    }
  })

  test('other names are not, even when they contain a local word', () => {
    for (const text of [
      'https://api.openstreetmap.org/api/0.6',
      'https://localhost.example.com/x',
      'https://testing.example.org/x',
      'https://127.0.0.2/x',
    ]) {
      expect(isLocalUrl(url(text))).toBe(false)
    }
  })

  test('accepts text as well as URL objects', () => {
    expect(isLocalUrl('http://localhost:8080/a.geojson')).toBe(true)
    expect(isLocalUrl('https://example.org/a.geojson')).toBe(false)
    expect(isLocalUrl('not a url')).toBe(false)
  })

  test('a relative address is local exactly when the page is', () => {
    expect(isLocalUrl('/data/a.geojson', 'http://localhost:5173/')).toBe(true)
    expect(isLocalUrl('/data/a.geojson', 'http://127.0.0.1:5173/maid')).toBe(true)
    expect(isLocalUrl('/data/a.geojson', 'https://maid.test/')).toBe(true)
    expect(isLocalUrl('/data/a.geojson', 'https://osm-editor.example.org/')).toBe(false)
    expect(isLocalUrl('data/a.geojson', 'http://localhost:5173/')).toBe(true)
  })

  test('a protocol-relative address names another host, so it is not local on a local page', () => {
    expect(isLocalUrl('//example.org/a.geojson', 'http://localhost:5173/')).toBe(false)
    expect(isLocalUrl('//localhost:8090/a.geojson', 'https://example.org/')).toBe(true)
  })

  test('without a page, a relative address is not local', () => {
    expect(isLocalUrl('/data/a.geojson', undefined)).toBe(false)
    expect(isLocalUrl('/data/a.geojson')).toBe(false)
  })

  test('an absolute address is judged by its own host, whatever the page', () => {
    expect(isLocalUrl('http://localhost:8090/x', 'https://example.org/')).toBe(true)
    expect(isLocalUrl('https://example.org/x', 'http://localhost:5173/')).toBe(false)
  })
})

describe('serviceOf', () => {
  test('known hosts are matched without any registration', () => {
    const registry = createServiceRegistry()
    expect(registry.serviceOf(url('https://en.wikipedia.org/w/api.php'))).toBe('wikimedia')
    expect(registry.serviceOf(url('https://www.wikidata.org/wiki/Q1'))).toBe('wikimedia')
    expect(registry.serviceOf(url('https://commons.wikimedia.org/w/index.php'))).toBe('wikimedia')
    expect(registry.serviceOf(url('https://wiki.openstreetmap.org/w/api.php'))).toBe('wikimedia')
    expect(registry.serviceOf(url('https://graph.mapillary.com/x'))).toBe('mapillary')
    expect(registry.serviceOf(url('https://api.panoramax.xyz/api/search'))).toBe('panoramax')
  })

  test('a host is matched by its domain, not by a word in the path', () => {
    const registry = createServiceRegistry()
    expect(registry.serviceOf(url('https://example.org/en.wikipedia.org/x'))).toBe('data')
    expect(registry.serviceOf(url('https://notmapillary.com/x'))).toBe('data')
  })

  test('an unknown remote host is data, and an unclaimed local host is local', () => {
    const registry = createServiceRegistry()
    expect(registry.serviceOf(url('https://tiles.example.org/a.geojson'))).toBe('data')
    expect(registry.serviceOf(url('http://localhost:5173/'))).toBe('local')
  })

  test('the OSM API host is claimed by the app, with or without a port', () => {
    const registry = createServiceRegistry()
    registry.register('osm', 'api.openstreetmap.org')
    expect(registry.serviceOf(url('https://api.openstreetmap.org/api/0.6/map'))).toBe('osm')
    expect(registry.serviceOf(url('https://tile.openstreetmap.org/1/2/3.png'))).toBe('data')

    registry.register('osm', 'localhost:8090')
    expect(registry.serviceOf(url('http://localhost:8090/api/0.6/map'))).toBe('osm')
    expect(registry.serviceOf(url('http://localhost:5173/'))).toBe('local')
  })

  test('a claim by a predicate is used, and a claim beats a known host', () => {
    const registry = createServiceRegistry()
    registry.register('panoramax', (u) => u.pathname.startsWith('/photos/'))
    expect(registry.serviceOf(url('https://tiles.example.org/photos/1'))).toBe('panoramax')
    // a claim beats a known host, so the app can take a host out of its known service
    registry.register('data', 'en.wikipedia.org')
    expect(registry.serviceOf(url('https://en.wikipedia.org/x'))).toBe('data')
  })

  test('a host without a port matches any port of that host', () => {
    const registry = createServiceRegistry()
    registry.register('osm', 'api.example.org')
    expect(registry.serviceOf(url('https://api.example.org:8443/x'))).toBe('osm')
  })

  test('a registry is its own: claims in one do not reach another', () => {
    const first = createServiceRegistry()
    const second = createServiceRegistry()
    first.register('osm', 'api.openstreetmap.org')
    expect(second.serviceOf(url('https://api.openstreetmap.org/x'))).toBe('data')
  })
})
