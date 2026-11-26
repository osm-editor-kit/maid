import { describe, expect, it } from 'bun:test'
import { linkKind } from './links.ts'

describe('linkKind', () => {
  it('names elements on openstreetmap.org', () => {
    expect(linkKind('https://www.openstreetmap.org/way/123')).toEqual({
      kind: 'osm',
      label: 'way 123',
    })
    expect(linkKind('https://www.openstreetmap.org/#map=18/52/13')).toEqual({
      kind: 'osm',
      label: 'OpenStreetMap',
    })
  })

  it('takes the wiki page title without its language', () => {
    expect(linkKind('https://wiki.openstreetmap.org/wiki/DE:Key:oneway')).toEqual({
      kind: 'wiki',
      label: 'Key:oneway',
    })
    expect(linkKind('https://wiki.openstreetmap.org/wiki/Tag:highway%3Dcycleway')).toEqual({
      kind: 'wiki',
      label: 'Tag:highway=cycleway',
    })
    expect(linkKind('https://wiki.openstreetmap.org/wiki/Bicycle_infrastructure').label).toBe(
      'Bicycle infrastructure',
    )
  })

  it('shows the host of anything else, and the text of what is not a URL', () => {
    expect(linkKind('https://www.tilda-geo.de/regionen/x')).toEqual({
      kind: 'other',
      label: 'tilda-geo.de',
    })
    expect(linkKind('not a link')).toEqual({ kind: 'other', label: 'not a link' })
  })
})
