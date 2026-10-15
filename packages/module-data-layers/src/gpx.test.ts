import { beforeAll, describe, expect, test } from 'bun:test'
import { parseGpx, isGpxText, isKmlText, xmlRootName } from './gpx.ts'
import { installTestDOMParser } from './test-dom.ts'

beforeAll(() => installTestDOMParser())

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="52.5" lon="13.4"><name>Bench</name></wpt>
  <trk>
    <name>Ride</name>
    <trkseg>
      <trkpt lat="52.5" lon="13.4"><ele>34</ele></trkpt>
      <trkpt lat="52.501" lon="13.401"><ele>35</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`

const KML = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>`

describe('the root element of XML text', () => {
  test('a prolog and comments are skipped; GPX and KML are told apart', () => {
    expect(xmlRootName(GPX)).toBe('gpx')
    expect(xmlRootName('﻿<!-- made by a tool -->\n<gpx/>')).toBe('gpx')
    expect(isGpxText(GPX)).toBe(true)
    expect(isKmlText(KML)).toBe(true)
    expect(isGpxText(KML)).toBe(false)
  })

  test('JSON and empty text have no root element', () => {
    expect(xmlRootName('{"type":"FeatureCollection"}')).toBeUndefined()
    expect(xmlRootName('')).toBeUndefined()
    expect(isGpxText('{"type":"FeatureCollection"}')).toBe(false)
  })
})

describe('parseGpx', () => {
  test('a track becomes a LineString and a waypoint a Point, in one FeatureCollection', async () => {
    const parsed = await parseGpx(GPX)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok || parsed.value.type !== 'FeatureCollection') return
    const geometries = parsed.value.features.map((feature) => feature.geometry?.type)
    expect(geometries).toEqual(['LineString', 'Point'])
    const [track, waypoint] = parsed.value.features
    expect(track?.geometry).toEqual({
      type: 'LineString',
      // the elevation of each point (`ele`) is the third coordinate
      coordinates: [
        [13.4, 52.5, 34],
        [13.401, 52.501, 35],
      ],
    })
    expect(waypoint?.geometry).toEqual({ type: 'Point', coordinates: [13.4, 52.5] })
  })

  test('XML that is not GPX is refused in plain words', async () => {
    const message = 'This is not GPX: it must be XML with a gpx element at the top.'
    expect(await parseGpx(KML)).toEqual({ ok: false, errors: [message] })
    expect(await parseGpx('{"type":"FeatureCollection","features":[]}')).toEqual({
      ok: false,
      errors: [message],
    })
  })
})
