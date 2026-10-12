import { describe, expect, test } from 'bun:test'
import { parseGeoJson } from './geojson.ts'

const POINT = {
  type: 'Feature',
  properties: { name: 'Bench' },
  geometry: { type: 'Point', coordinates: [13.4, 52.5] },
}

describe('parseGeoJson', () => {
  test('accepts a FeatureCollection', () => {
    const parsed = parseGeoJson(JSON.stringify({ type: 'FeatureCollection', features: [POINT] }))
    expect(parsed.ok).toBe(true)
  })

  test('accepts a single Feature', () => {
    expect(parseGeoJson(JSON.stringify(POINT)).ok).toBe(true)
  })

  test('says in plain words when the text is not JSON', () => {
    expect(parseGeoJson('{ not json')).toEqual({
      ok: false,
      errors: ['This is not JSON, so it is not GeoJSON.'],
    })
  })

  test('says so when the JSON is not GeoJSON', () => {
    const message =
      'This is JSON, but not GeoJSON. The top level must be a FeatureCollection or a Feature.'
    expect(parseGeoJson('[1, 2]')).toEqual({ ok: false, errors: [message] })
    expect(parseGeoJson('{"type":"Point","coordinates":[1,2]}')).toEqual({
      ok: false,
      errors: [message],
    })
    expect(parseGeoJson('{"type":"FeatureCollection"}')).toEqual({ ok: false, errors: [message] })
    expect(parseGeoJson('{"type":"FeatureCollection","features":[1]}')).toEqual({
      ok: false,
      errors: [message],
    })
    expect(parseGeoJson('{"type":"Feature","properties":{}}')).toEqual({
      ok: false,
      errors: [message],
    })
  })
})
