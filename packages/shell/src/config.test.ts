import { describe, expect, test } from 'bun:test'
import { chooseLiveMode, DEV_API, OSM_API, readConfig } from './config'

/** The data the page starts with: the URL's `live`, then the stored choice, then the build's default */
describe('chooseLiveMode', () => {
  test('a build without VITE_MAID_DATA keeps the mock, as before', () => {
    expect(chooseLiveMode({ url: null, stored: undefined, liveBuild: false })).toBe('0')
  })

  test('a live build reads the OSM API by default', () => {
    expect(chooseLiveMode({ url: null, stored: undefined, liveBuild: true })).toBe('1')
  })

  test('the stored choice decides in a live build, and nowhere else', () => {
    expect(chooseLiveMode({ url: null, stored: 'dev', liveBuild: true })).toBe('dev')
    expect(chooseLiveMode({ url: null, stored: 'osm', liveBuild: true })).toBe('1')
    expect(chooseLiveMode({ url: null, stored: 'dev', liveBuild: false })).toBe('0')
  })

  test('the URL wins over the stored choice and the build default', () => {
    expect(chooseLiveMode({ url: '0', stored: 'dev', liveBuild: true })).toBe('0')
    expect(chooseLiveMode({ url: '1', stored: 'dev', liveBuild: true })).toBe('1')
    expect(chooseLiveMode({ url: 'dev', stored: 'osm', liveBuild: true })).toBe('dev')
    expect(chooseLiveMode({ url: 'dev', stored: undefined, liveBuild: false })).toBe('dev')
  })
})

/** A location with only the query string, which is all readConfig reads */
function at(search: string) {
  return { search } as Location
}

describe('readConfig', () => {
  test('without a live build and without a URL: the local mock', () => {
    const config = readConfig(at(''), { stored: undefined, liveBuild: false })
    expect(config.live).toBe(false)
    expect(config.dev).toBe(false)
    expect(config.serverChoice).toBe(false)
    expect(config.apiUrl).toMatch(/^http:\/\/localhost:\d+\/s\/small$/)
  })

  test('a live build without a URL: OpenStreetMap, read only, and the server choice is offered', () => {
    const config = readConfig(at(''), { stored: undefined, liveBuild: true })
    expect(config.live).toBe(true)
    expect(config.dev).toBe(false)
    expect(config.serverChoice).toBe(true)
    expect(config.apiUrl).toBe(OSM_API)
  })

  test('a live build with the development server stored: saving is possible there', () => {
    const config = readConfig(at(''), { stored: 'dev', liveBuild: true })
    expect(config.dev).toBe(true)
    expect(config.apiUrl).toBe(DEV_API)
  })

  test('one source for the whole visit: a fixture, the OSM API or the development server', () => {
    expect(readConfig(at(''), { stored: undefined, liveBuild: false }).source).toBe('fixture')
    expect(readConfig(at('?live=1'), { stored: undefined, liveBuild: false }).source).toBe('osm')
    expect(readConfig(at('?live=dev'), { stored: undefined, liveBuild: false }).source).toBe('dev')
  })

  test('the build flag is carried for the login origin', () => {
    expect(readConfig(at(''), { stored: undefined, liveBuild: true }).liveBuild).toBe(true)
    expect(readConfig(at(''), { stored: undefined, liveBuild: false }).liveBuild).toBe(false)
  })

  test('the URL overrides the stored choice in a live build', () => {
    expect(readConfig(at('?live=1'), { stored: 'dev', liveBuild: true }).dev).toBe(false)
    expect(readConfig(at('?live=dev'), { stored: 'osm', liveBuild: true }).dev).toBe(true)
    expect(readConfig(at('?live=0'), { stored: 'dev', liveBuild: true }).live).toBe(false)
  })

  test('a live session in a development build can switch the server too', () => {
    const config = readConfig(at('?live=1'), { stored: undefined, liveBuild: false })
    expect(config.live).toBe(true)
    expect(config.serverChoice).toBe(true)
  })
})
