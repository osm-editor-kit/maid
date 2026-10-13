import { describe, expect, test } from 'bun:test'
import { parseGeoJson } from './geojson.ts'

const POINT = {
  type: 'Feature' as const,
  properties: { name: 'Bench' },
  geometry: { type: 'Point' as const, coordinates: [13.4, 52.5] },
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

describe('parseGeoJson: what is checked and what is not', () => {
  test('a feature with no geometry draws nothing, so it is left out of a collection', () => {
    const parsed = parseGeoJson(
      JSON.stringify({
        type: 'FeatureCollection',
        features: [POINT, { type: 'Feature', geometry: null, properties: {} }],
      }),
    )
    expect(parsed).toEqual({ ok: true, value: { type: 'FeatureCollection', features: [POINT] } })
  })

  test('a single feature with no geometry is an empty collection', () => {
    expect(parseGeoJson('{"type":"Feature","geometry":null,"properties":{}}')).toEqual({
      ok: true,
      value: { type: 'FeatureCollection', features: [] },
    })
  })

  test('a geometry must be null or an object with a type, and properties an object or null', () => {
    const feature = (extra: object) => JSON.stringify({ type: 'Feature', properties: {}, ...extra })
    expect(parseGeoJson(feature({ geometry: 5 })).ok).toBe(false)
    expect(parseGeoJson(feature({ geometry: {} })).ok).toBe(false)
    expect(parseGeoJson(feature({ geometry: POINT.geometry, properties: 5 })).ok).toBe(false)
    expect(parseGeoJson(feature({ geometry: POINT.geometry, properties: null })).ok).toBe(true)
  })

  test('other members of a feature, such as its id, are kept as they are', () => {
    expect(parseGeoJson(JSON.stringify({ ...POINT, id: 7 }))).toEqual({
      ok: true,
      value: { ...POINT, id: 7 },
    })
  })
})
