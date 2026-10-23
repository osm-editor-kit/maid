import { describe, expect, test } from 'bun:test'
import { chooseSource, DEV_API, OSM_API, readConfig } from './config'

/** Where the data comes from: the URL's `api`, then the stored choice, then the build's default */
describe('chooseSource', () => {
  test('a build that is not deployed keeps the mock', () => {
    expect(chooseSource({ url: null, stored: undefined, deployed: false })).toBe('mock')
  })

  test('a deployed build reads OpenStreetMap by default', () => {
    expect(chooseSource({ url: null, stored: undefined, deployed: true })).toBe('osm')
  })

  test('the stored choice decides in a deployed build, and nowhere else', () => {
    expect(chooseSource({ url: null, stored: 'dev', deployed: true })).toBe('dev')
    expect(chooseSource({ url: null, stored: 'osm', deployed: true })).toBe('osm')
    expect(chooseSource({ url: null, stored: 'dev', deployed: false })).toBe('mock')
  })

  test('the URL wins over the stored choice and the build default', () => {
    expect(chooseSource({ url: 'mock', stored: 'dev', deployed: true })).toBe('mock')
    expect(chooseSource({ url: 'osm', stored: 'dev', deployed: true })).toBe('osm')
    expect(chooseSource({ url: 'dev', stored: 'osm', deployed: true })).toBe('dev')
    expect(chooseSource({ url: 'dev', stored: undefined, deployed: false })).toBe('dev')
  })
})

/** A location with only the query string, which is all readConfig reads */
function at(search: string) {
  return { search } as Location
}

const local = { stored: undefined, deployed: false }
const deployed = { stored: undefined, deployed: true }

describe('readConfig', () => {
  test('a local build without a URL: the mock, and the choice of the mock and both servers', () => {
    const config = readConfig(at(''), local)
    expect(config.source).toBe('mock')
    expect(config.serverChoice).toBe(true)
    expect(config.serverOptions).toEqual(['mock', 'osm', 'dev'])
    expect(config.apiUrl).toMatch(/^http:\/\/localhost:\d+\/s\/small$/)
  })

  test('a deployed build without a URL: OpenStreetMap, its login, and the server choice', () => {
    const config = readConfig(at(''), deployed)
    expect(config.source).toBe('osm')
    expect(config.loginServer).toBe('osm')
    expect(config.serverChoice).toBe(true)
    expect(config.apiUrl).toBe(OSM_API)
  })

  test('a deployed build with the development server stored: its data and its login', () => {
    const config = readConfig(at(''), { stored: 'dev', deployed: true })
    expect(config.source).toBe('dev')
    expect(config.loginServer).toBe('dev')
    expect(config.apiUrl).toBe(DEV_API)
  })

  test('the URL names the source: the mock, OpenStreetMap or the development server', () => {
    expect(readConfig(at('?api=mock'), deployed).source).toBe('mock')
    expect(readConfig(at('?api=osm'), local).source).toBe('osm')
    expect(readConfig(at('?api=dev'), local).source).toBe('dev')
    expect(readConfig(at('?api=osm'), { stored: 'dev', deployed: true }).source).toBe('osm')
  })

  test('the login goes to the server of the data, and to the development server with the mock', () => {
    expect(readConfig(at('?api=osm'), local).loginServer).toBe('osm')
    expect(readConfig(at('?api=dev'), local).loginServer).toBe('dev')
    expect(readConfig(at(''), local).loginServer).toBe('dev')
  })

  test('an editor with one server opens only that one and offers no choice', () => {
    const staging = { stored: 'osm' as const, deployed: true, servers: ['dev' as const] }
    expect(readConfig(at(''), staging).source).toBe('dev')
    expect(readConfig(at('?api=osm'), staging).source).toBe('dev')
    expect(readConfig(at(''), staging).serverChoice).toBe(false)
    expect(readConfig(at(''), staging).serverOptions).toEqual(['dev'])
    const production = { stored: 'dev' as const, deployed: true, servers: ['osm' as const] }
    expect(readConfig(at(''), production).source).toBe('osm')
    expect(readConfig(at('?api=dev'), production).source).toBe('osm')
  })

  test('the build flag is carried for the login origin', () => {
    expect(readConfig(at(''), deployed).deployed).toBe(true)
    expect(readConfig(at(''), local).deployed).toBe(false)
  })

  test('a local build on a server can switch the server too', () => {
    expect(readConfig(at('?api=osm'), local).serverChoice).toBe(true)
  })
})

describe('the display at the start', () => {
  test('the URL names it, then the stored choice, else the normal look', () => {
    expect(readConfig(at('?display=wireframe'), { ...local, shown: 'edits' }).display).toBe(
      'wireframe',
    )
    expect(readConfig(at(''), { ...local, shown: 'edits' }).display).toBe('edits')
    expect(readConfig(at(''), local).display).toBe('normal')
  })

  test('a value that is neither wireframe nor edits is the normal look, a link or a stored one', () => {
    expect(readConfig(at('?display=full'), local).display).toBe('normal')
    expect(readConfig(at('?display=full'), { ...local, shown: 'wireframe' }).display).toBe(
      'wireframe',
    )
  })
})
