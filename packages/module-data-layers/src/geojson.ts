/** Reading GeoJSON text a person gave or a URL returned. Pure. */
import type { MapLayerItem } from '@osm-editor-kit/maid-renderer'
import { isRecord, type Checked } from './config.ts'

/** What the map's GeoJSON source takes: a feature collection or a single feature */
export type GeoJsonData = MapLayerItem['source']['data']

/**
 * Parses GeoJSON text. Accepts a FeatureCollection or a Feature (the top level must be one of
 * them, and every feature of a collection must be a feature). Geometry is not checked further:
 * the map skips what it cannot draw.
 */
export function parseGeoJson(text: string): Checked<GeoJsonData> {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['This is not JSON, so it is not GeoJSON.'] }
  }
  if (!isRecord(value)) return notGeoJson()
  if (value.type === 'FeatureCollection') {
    if (!Array.isArray(value.features) || !value.features.every(isFeature)) return notGeoJson()
    return { ok: true, value: asGeoJson(value) }
  }
  if (value.type === 'Feature' && isFeature(value)) return { ok: true, value: asGeoJson(value) }
  return notGeoJson()
}

/** The shape was checked above; the GeoJSON types are stricter about geometry than the checks are. */
function asGeoJson(value: Record<string, unknown>): GeoJsonData {
  return value as unknown as GeoJsonData
}

function isFeature(value: unknown): boolean {
  return isRecord(value) && value.type === 'Feature' && 'geometry' in value
}

function notGeoJson(): Checked<GeoJsonData> {
  return {
    ok: false,
    errors: [
      'This is JSON, but not GeoJSON. The top level must be a FeatureCollection or a Feature.',
    ],
  }
}
