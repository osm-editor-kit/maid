/**
 * The measuring tape of the width fields: the distance between two clicks on the ground, in metres,
 * and the features that draw it on the map while the second click is not yet there (layers.ts
 * measure-casing, measure-line and measure-label). The engine (engine.ts startMeasure) puts the
 * features into the highlight source and writes the distance into the field.
 *
 * Pure: no MapLibre here. The distance is on the ground, from longitude and latitude, so it does
 * not depend on the zoom or on Mercator units.
 */
import type { Feature, LineString, Point } from 'geojson'
import type { LonLat } from './field-overlay'

/** The mean radius of the earth in metres (IUGG), for the great-circle distance */
const EARTH_RADIUS = 6371008.8

/** The great-circle distance between two places on the ground, in metres */
export function distanceMetres(a: LonLat, b: LonLat) {
  const toRadians = Math.PI / 180
  const dLat = (b[1] - a[1]) * toRadians
  const dLon = (b[0] - a[0]) * toRadians
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * toRadians) * Math.cos(b[1] * toRadians) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * A distance as the value of a width tag: one decimal, and no trailing ".0" ("3.4", "3", "12.5").
 * Metres, as OSM's width tag takes them.
 */
export function formatMetres(metres: number) {
  return String(Math.round(metres * 10) / 10)
}

/**
 * The features that show a measure from `start` to `end` while the second click is not made: a
 * line between the two, and its distance as a label ("3.4 m") at the middle of the line.
 */
export function measureFeatures(start: LonLat, end: LonLat) {
  const line: Feature<LineString> = {
    type: 'Feature',
    properties: { id: 'measure-line', state: 'measure-line' },
    geometry: { type: 'LineString', coordinates: [start, end] },
  }
  const label: Feature<Point> = {
    type: 'Feature',
    properties: {
      id: 'measure-label',
      state: 'measure-label',
      label: `${formatMetres(distanceMetres(start, end))} m`,
    },
    geometry: {
      type: 'Point',
      coordinates: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
    },
  }
  return [line, label]
}
