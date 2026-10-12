/**
 * Every URL parameter Maid knows, defined once as nuqs parsers. Nothing else in the app
 * reads `location` directly.
 *
 * - State parameters (`map`, `id`) change while the app runs; components use the hooks in state.ts.
 * - Setup parameters are read once at start, before React renders (config.ts). They are for
 *   development and the benchmark and are not part of the public URL contract.
 */
import {
  createParser,
  parseAsFloat,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs'

/** OSM zoom (256px tiles), like iD's `map=` */
export type Camera = { zoom: number; lat: number; lng: number }

/** `map=17.25/52.5228/13.4023`: zoom/lat/lng, the order iD uses. Precision follows the zoom. */
export const parseAsCamera = createParser<Camera>({
  parse(value) {
    const [zoom, lat, lng] = value.split('/').map(Number)
    if (zoom === undefined || lat === undefined || lng === undefined) return null
    if ([zoom, lat, lng].some((n) => !Number.isFinite(n))) return null
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    return { zoom, lat, lng }
  },
  serialize({ zoom, lat, lng }) {
    const digits = Math.max(2, Math.ceil(zoom / 3) - 1)
    return `${zoom.toFixed(2)}/${lat.toFixed(digits)}/${lng.toFixed(digits)}`
  },
  eq: (a, b) => a.zoom === b.zoom && a.lat === b.lat && a.lng === b.lng,
})

/** `1` or `0`. Shorter than true/false and what the benchmark scripts pass. */
export const parseAsFlag = createParser<boolean>({
  parse: (value) =>
    value === '1' || value === 'true' ? true : value === '0' || value === 'false' ? false : null,
  serialize: (value) => (value ? '1' : '0'),
})

/** Public state: part of every Maid URL, safe to share */
export const stateParams = {
  map: parseAsCamera,
  /** Selected feature, e.g. `w123`, like iD */
  id: parseAsString,
  /** Filter states that differ from the editor's own, e.g. `buildings:readonly,boundaries:hidden` */
  filters: parseAsString,
}

/** Development and benchmark switches, read once at start */
export const setupParams = {
  scene: parseAsString.withDefault('small'),
  /** `1`: read from the real OSM API. `dev`: read from, and save to, the OSM development server. */
  live: parseAsStringLiteral(['0', '1', 'dev']).withDefault('0'),
  ui: parseAsFlag.withDefault(true),
  labels: parseAsFlag.withDefault(true),
  icons: parseAsFlag.withDefault(true),
  pins: parseAsStringLiteral(['fit', 'all']).withDefault('fit'),
  fill: parseAsStringLiteral(['partial', 'full', 'wireframe']).withDefault('partial'),
  workers: parseAsInteger.withDefault(4),
  minDataZoom: parseAsFloat.withDefault(16),
  tolerance: parseAsFloat.withDefault(0),
  sourceMaxZoom: parseAsInteger.withDefault(17),
  fade: parseAsInteger.withDefault(150),
}

type Parsed<T> = {
  [K in keyof T]: T[K] extends { parseServerSide(v: unknown): infer V } ? V : never
}

/** Reads a group of parameters from a query string, outside React */
export function readParams<
  T extends Record<string, { parseServerSide(value: string | undefined): unknown }>,
>(parsers: T, search: string): Parsed<T> {
  const query = new URLSearchParams(search)
  const out: Record<string, unknown> = {}
  for (const name in parsers)
    out[name] = parsers[name]!.parseServerSide(query.get(name) ?? undefined)
  return out as Parsed<T>
}
