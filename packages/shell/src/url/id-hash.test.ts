// Adopted from iD test/spec/behavior/hash.js (ISC, © iD contributors), at commit 0194f3926.
// API changes: iD's hash behaviour is Maid's URL conversion (id-url.ts) and the parsers of the
// `map` parameter (params.ts). iD's `hadLocation` flag is the same fact as "the map parameter
// was read". The map itself moving and the URL being written are browser behaviour, not here.
import { describe, expect, it } from 'bun:test'
import { fromIdUrl, toIdUrl } from './id-url'
import { parseAsCamera, readParams, stateParams } from './params'

describe('iD.behaviorHash', () => {
  it('sets hadLocation if window.location.hash is present', () => {
    const { params } = fromIdUrl('#background=none&map=20.00/38.87952/-77.02405')
    expect(readParams(stateParams, `?${params}`).map).not.toBeNull()
  })

  it('centerZooms map to requested coordinates', () => {
    const { params } = fromIdUrl('#background=none&map=20.00/38.87952/-77.02405')
    const camera = readParams(stateParams, `?${params}`).map
    expect(camera?.lng).toBeCloseTo(-77.02405, 1)
    expect(camera?.lat).toBeCloseTo(38.87952, 1)
    expect(camera?.zoom).toEqual(20.0)
  })

  it.todo('centerZooms map at requested coordinates on hash change', () => {}) // needs F-beh-4

  it.todo('sets hadLocation if map-location is in local storage', () => {}) // needs F-beh-8

  it.todo('centerZooms map to previous map location', () => {}) // needs F-beh-8

  it.todo('centerZooms map to map hash if present previous map location', () => {}) // needs F-beh-8

  it('stores the current zoom and coordinates in window.location.hash on map move events', () => {
    // Maid writes 2 decimals at zoom 2 where iD writes 1; the numbers are the same
    const text = stateParams.map.serialize({ zoom: 2, lat: 38.9, lng: -77 })
    expect(parseAsCamera.parse(text)).toEqual({ zoom: 2, lat: 38.9, lng: -77 })
    // the other parameters stay in the link
    expect(toIdUrl(`?map=${text}&background=none`)).toContain('background=none')
  })

  it('accepts default changeset comment as hash parameter', () => {
    // Maid never uploads, so the comment is carried and not used as a changeset comment
    const { params, dropped } = fromIdUrl('#comment=foo+bar%20%2B1')
    expect(params.get('comment')).toBe('foo bar +1')
    expect(dropped).toEqual([])
  })

  it.todo('dispatches a (throttled) change event', () => {}) // needs F-beh-5
})
