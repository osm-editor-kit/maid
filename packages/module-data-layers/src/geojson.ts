/** Reading GeoJSON text a person gave or a URL returned. Pure. */
import type { MapLayerItem } from '@osm-editor-kit/maid-renderer'
import { z } from 'zod'
import type { Checked } from './config.ts'

/** What the map's GeoJSON source takes: a feature collection or a single feature */
export type GeoJsonData = MapLayerItem['source']['data']

type Feature = Extract<GeoJsonData, { type: 'Feature' }>
type Geometry = NonNullable<Feature['geometry']>

const NOT_JSON = 'This is not JSON, so it is not GeoJSON.'
const NOT_GEOJSON =
  'This is JSON, but not GeoJSON. The top level must be a FeatureCollection or a Feature.'

/**
 * The geometry's `type` is checked to be text; the coordinates are not (a large file has millions
 * of them, and MapLibre skips what it cannot draw). The type still says it is a Geometry, which the
 * schema does not prove. `null` is a valid geometry in GeoJSON.
 */
const geometry = z.custom<Geometry | null>(
  (value) =>
    value === null ||
    (typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      typeof value.type === 'string'),
)

/**
 * A feature needs a geometry key and a properties object (or `null`). Other members (`id`, `bbox`)
 * are kept as they are.
 */
const feature = z.looseObject({
  type: z.literal('Feature'),
  geometry,
  // many files in the wild leave `properties` out, although the format asks for it: accepted, as before
  properties: z
    .looseObject({})
    .nullish()
    .transform((properties) => properties ?? null),
})

const featureCollection = z.looseObject({
  type: z.literal('FeatureCollection'),
  features: z.array(feature),
})

type ParsedFeature = z.infer<typeof feature>

/**
 * A FeatureCollection or a single Feature. Features with a `null` geometry draw nothing, so they are
 * left out: the map's GeoJSON types have no null geometry.
 */
const geoJsonSchema = z
  .discriminatedUnion('type', [featureCollection, feature])
  .transform((value): GeoJsonData => {
    if (value.type === 'FeatureCollection') {
      const drawable = value.features.filter(
        (item): item is ParsedFeature & { geometry: Geometry } => item.geometry !== null,
      )
      return { ...value, features: drawable }
    }
    if (value.geometry === null) return { type: 'FeatureCollection', features: [] }
    return { ...value, geometry: value.geometry }
  })

/**
 * Parses GeoJSON text. Accepts a FeatureCollection or a Feature. Checked: the text is JSON, the top
 * level is one of the two, and every feature has a geometry (object or `null`, with a `type` text)
 * and its properties, if it has any, are an object or `null`. Not checked: the coordinates and the geometry type name's
 * meaning. The map skips what it cannot draw.
 */
export function parseGeoJson(text: string): Checked<GeoJsonData> {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, errors: [NOT_JSON] }
  }
  const parsed = geoJsonSchema.safeParse(json)
  if (!parsed.success) return { ok: false, errors: [NOT_GEOJSON] }
  return { ok: true, value: parsed.data }
}
