import { LOCALES } from '@osm-editor-kit/maid-i18n'
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
import { normaliseBearing, roundDegrees } from './bearing'
import { idUrlParamNames } from './id-url'

/**
 * OSM zoom (256px tiles), like iD's `map=`. The turn (bearing) and the tilt (pitch) are in degrees;
 * a position without them is north-up and flat. Tilt is switched off in the editor (ADR 0009).
 */
export type Camera = { zoom: number; lat: number; lng: number; bearing?: number; pitch?: number }

/** The highest tilt MapLibre allows */
const MAX_PITCH = 85

/**
 * `map=17.25/52.5228/13.4023/-37.5/0`: zoom/lat/lng, the order iD uses, then the turn and the tilt
 * when they are not zero (tilda-geo's order). The turn is written only when it or the tilt is not zero.
 * Precision follows the zoom.
 */
export const parseAsCamera = createParser<Camera>({
  parse(value) {
    const [zoom, lat, lng, bearing, pitch] = value.split('/').map(Number)
    if (zoom === undefined || lat === undefined || lng === undefined) return null
    if ([zoom, lat, lng].some((n) => !Number.isFinite(n))) return null
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    const camera: Camera = { zoom, lat, lng }
    if (bearing !== undefined) {
      if (!Number.isFinite(bearing)) return null
      camera.bearing = normaliseBearing(bearing)
    }
    if (pitch !== undefined) {
      if (!Number.isFinite(pitch) || pitch < 0 || pitch > MAX_PITCH) return null
      camera.pitch = pitch
    }
    return camera
  },
  serialize({ zoom, lat, lng, bearing = 0, pitch = 0 }) {
    const digits = Math.max(2, Math.ceil(zoom / 3) - 1)
    const head = `${zoom.toFixed(2)}/${lat.toFixed(digits)}/${lng.toFixed(digits)}`
    const turn = roundDegrees(normaliseBearing(bearing))
    const tilt = roundDegrees(pitch)
    if (tilt !== 0) return `${head}/${turn}/${tilt}`
    return turn !== 0 ? `${head}/${turn}` : head
  },
  eq: (a, b) =>
    a.zoom === b.zoom &&
    a.lat === b.lat &&
    a.lng === b.lng &&
    (a.bearing ?? 0) === (b.bearing ?? 0) &&
    (a.pitch ?? 0) === (b.pitch ?? 0),
})

/** `1` or `0`, the only notation. Anything else gives the default. */
export const parseAsFlag = createParser<boolean>({
  parse: (value) => (value === '1' ? true : value === '0' ? false : null),
  serialize: (value) => (value ? '1' : '0'),
})

/**
 * The language of the page: one of Maid's (`LOCALES`), or nothing. iD's `locale` is mapped onto it (id-url.ts),
 * so an iD link's `de-DE` arrives here as `de`. A value that is not one of Maid's is no opinion (null).
 */
export const parseAsLang = parseAsStringLiteral(LOCALES)

/** Public state: part of every Maid URL, safe to share */
export const stateParams = {
  map: parseAsCamera,
  /** Selected feature, e.g. `w123`, like iD */
  id: parseAsString,
  /**
   * The relation open beside the inspector, e.g. `r123`, with `id` the member that is selected in it. Maid only: a link
   * to iD keeps `id` (the selected feature) and leaves this out (id-url.ts has no rule for it).
   */
  relation: parseAsString,
  /** Filter states that differ from the editor's own, e.g. `buildings:readonly,boundaries:hidden` */
  filters: parseAsString,
  /**
   * What the map shows of the data, as iD's wireframe (W) and highlight changes (G): `wireframe` or `edits`. Absent is the
   * normal look. The engine holds it; the URL follows it (url/display.ts).
   */
  display: parseAsStringLiteral(['wireframe', 'edits']),
  /** The language of this page. The account menu's choice writes it too, so the address and the stored choice agree */
  lang: parseAsLang,
  /**
   * Light, dark, or `system` (follow the operating system), as iD's `theme` for light and dark. No key follows the
   * system: the theme switch writes `system` by removing the key, like `lang`.
   */
  theme: parseAsStringLiteral(['light', 'dark', 'system']),
  /** The changeset's comment, hashtags and source, prefilled from a link as in iD */
  comment: parseAsString,
  hashtags: parseAsString,
  source: parseAsString,
  /**
   * The levels of validation rules, as iD's `validationDisable`, `validationWarning` and `validationError`: comma lists
   * of `type/subtype` with `*`. Read at start; Maid does not write them.
   */
  validation_disable: parseAsString,
  validation_warning: parseAsString,
  validation_error: parseAsString,
}

/**
 * Every query parameter the app owns: the state and setup parameters, and the names iD links map onto. The editor
 * refuses these for modules (`reservedUrlParams` in core's createEditor).
 */
export function shellUrlParamNames(): string[] {
  return [
    ...new Set([...Object.keys(stateParams), ...Object.keys(setupParams), ...idUrlParamNames()]),
  ]
}

/** Development and benchmark switches, read once at start */
export const setupParams = {
  scene: parseAsString.withDefault('small'),
  /**
   * Where the data comes from: `mock` the local mock API, `osm` OpenStreetMap, `dev` the OSM development server.
   * Unset (null) gives the build's default and the person's stored server choice (config.ts).
   */
  api: parseAsStringLiteral(['mock', 'osm', 'dev']),
  ui: parseAsFlag.withDefault(true),
  labels: parseAsFlag.withDefault(true),
  icons: parseAsFlag.withDefault(true),
  pins: parseAsStringLiteral(['fit', 'all']).withDefault('fit'),
  workers: parseAsInteger.withDefault(4),
  minDataZoom: parseAsFloat.withDefault(16),
  tolerance: parseAsFloat.withDefault(0),
  sourceMaxZoom: parseAsInteger.withDefault(17),
  fade: parseAsInteger.withDefault(150),
  /** `blank`: the measure's magnifier is drawn without imagery (the browser check has none), see MapView */
  loupe: parseAsStringLiteral(['blank']),
}

type Parsed<T> = {
  [K in keyof T]: T[K] extends { parseServerSide(v: unknown): infer V } ? V : never
}

/**
 * The `lang` of an address, outside React (mount.tsx picks the language before React renders): one of Maid's
 * languages, or `null` when the address names none.
 */
export function urlLang(search: string): (typeof LOCALES)[number] | null {
  return readParams({ lang: stateParams.lang }, search).lang ?? null
}

/** Reads a group of parameters from a query string, outside React */
export function readParams<
  T extends Record<string, { parseServerSide(value: string | undefined): unknown }>,
>(parsers: T, search: string) {
  const query = new URLSearchParams(search)
  const out: Record<string, unknown> = {}
  for (const name in parsers)
    out[name] = parsers[name]!.parseServerSide(query.get(name) ?? undefined)
  return out as Parsed<T>
}
