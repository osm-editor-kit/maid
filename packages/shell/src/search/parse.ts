/**
 * What the search text can name, read locally with no request: a position (decimal pairs, a pair
 * with OSM zoom, degrees-minutes-seconds, `lat=..&lon=..`, or a link with `map=zoom/lat/lon`) and an
 * OSM object by its id (`w123`, `node 123`, `way/123`, or a link to one).
 *
 * Zoom is OSM zoom (256 px tiles), as the `map=` parameter of the URL keeps it. The map is MapLibre
 * zoom plus one, so a jump subtracts one (see `mapZoomOf`).
 *
 * A pair of numbers has two readings (latitude first, or longitude first) when both are valid; both
 * are returned, the latitude-first one first. This is what iD offers too.
 */

export type OsmType = 'node' | 'way' | 'relation'

/** An OSM object by its id as the engine names it: `n123`, `w45`, `r6` */
export interface OsmId {
  type: OsmType
  id: string
}

/** A position in degrees. `zoom` is OSM zoom, when the text had one. */
export interface Position {
  lat: number
  lon: number
  zoom?: number
}

export interface SearchParse {
  /** The readings of the text as a position: at most two. Empty when the text is no position. */
  positions: Position[]
  /** The OSM objects the text names: at most one */
  ids: OsmId[]
}

/** The zoom the map takes for an OSM zoom: MapLibre zoom is one less (OSM zoom is 256 px tiles) */
export function mapZoomOf(osmZoom: number): number {
  return Math.max(0, osmZoom - 1)
}

const NUMBER = String.raw`[+-]?\d+(?:\.\d+)?`
const OSM_ZOOM = String.raw`\d{1,2}(?:\.\d+)?`
/** A part of a degrees-minutes-seconds pair: sign, degrees, degree mark, minutes, seconds, hemisphere */
const DMS_PART = String.raw`([+-]?)(\d{1,3}(?:\.\d+)?)\s*([°º˚])?\s*(?:(\d{1,2}(?:\.\d+)?)\s*['′’]\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*["″”]\s*)?([NSEW])?`

const DMS_PAIR = new RegExp(String.raw`^\s*${DMS_PART}(?:\s*[,;]\s*|\s+)${DMS_PART}\s*$`, 'i')
const DECIMAL_PAIR = new RegExp(String.raw`^(${NUMBER})(?:\s*[,;/]\s*|\s+)(${NUMBER})$`)
/** The map hash of iD, OSM and Maid: `map=zoom/lat/lon`, with an optional turn and tilt after it */
const MAP_HASH = new RegExp(
  String.raw`(?:^|[^a-z])map=(${OSM_ZOOM})\/(${NUMBER})\/(${NUMBER})`,
  'i',
)
/** A bare zoom/lat/lon, as typed: `17/52.5/13.4` */
const ZOOM_LAT_LON = new RegExp(String.raw`^(${OSM_ZOOM})\/(${NUMBER})\/(${NUMBER})$`)
const QUERY_LAT = new RegExp(String.raw`(?:^|[?&#/])lat=(${NUMBER})(?=[&#/?]|$)`, 'i')
const QUERY_LON = new RegExp(String.raw`(?:^|[?&#/])(?:lon|lng)=(${NUMBER})(?=[&#/?]|$)`, 'i')
const QUERY_ZOOM = new RegExp(String.raw`(?:^|[?&#/])(?:zoom|z)=(${OSM_ZOOM})(?=[&#/?]|$)`, 'i')

/** An OSM object's link: openstreetmap.org/way/123 (and osm.org) */
const OSM_LINK = /(?:openstreetmap|osm)\.org\/(node|way|relation)\/(\d{1,18})(?!\d)/i
/** Maid's and iD's selection parameter: `id=w123` (the first of `id=w1,n2`) */
const ID_PARAM = /(?:^|[?&#])id=([nwr])(\d{1,18})(?=[,&#]|$)/i
/** Typed: `n123`, `w 45`, `r6`, `node 123`, `way/123`, `relation:6` */
const TYPED_ID = /^(node|way|relation|n|w|r)\s*[\s/:#]?\s*(\d{1,18})$/i

function number(text: string): number {
  return Number(text)
}

function validLat(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= 90
}

function validLon(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= 180
}

/** A position, or undefined when a value is out of range. A zoom is OSM zoom, 0 to 24. */
function positionOf(lat: number, lon: number, zoom?: number): Position | undefined {
  if (!validLat(lat) || !validLon(lon)) return undefined
  if (zoom === undefined) return { lat, lon }
  if (!Number.isFinite(zoom) || zoom < 0 || zoom > 24) return undefined
  return { lat, lon, zoom }
}

/** The two readings of a pair of numbers: latitude first, then longitude first (only the valid ones, no repeats) */
function readingsOf(a: number, b: number): Position[] {
  const readings = [positionOf(a, b), a === b ? undefined : positionOf(b, a)]
  return readings.filter((reading): reading is Position => reading !== undefined)
}

/** The axis a hemisphere letter names, and whether the value is negative. No letter: neither. */
const HEMISPHERE: Partial<Record<string, { axis: 'lat' | 'lon'; negative: boolean }>> = {
  N: { axis: 'lat', negative: false },
  S: { axis: 'lat', negative: true },
  E: { axis: 'lon', negative: false },
  W: { axis: 'lon', negative: true },
}

function hemisphere(letter: string | undefined): { axis?: 'lat' | 'lon'; negative: boolean } {
  const side = letter === undefined ? undefined : HEMISPHERE[letter.toUpperCase()]
  return side ?? { negative: false }
}

interface DmsPart {
  value: number
  axis?: 'lat' | 'lon'
  /** Whether the part has a degree mark, minutes, seconds or a hemisphere: what makes it degrees-minutes-seconds */
  marked: boolean
}

function dmsPartOf(
  sign: string | undefined,
  degrees: string,
  mark: string | undefined,
  minutes: string | undefined,
  seconds: string | undefined,
  letter: string | undefined,
): DmsPart | undefined {
  const minute = minutes === undefined ? 0 : number(minutes)
  const second = seconds === undefined ? 0 : number(seconds)
  if (minute >= 60 || second >= 60) return undefined
  const side = hemisphere(letter)
  const magnitude = number(degrees) + minute / 60 + second / 3600
  const negative = sign === '-' || side.negative
  return {
    value: negative ? -magnitude : magnitude,
    axis: side.axis,
    marked: Boolean(mark || minutes !== undefined || seconds !== undefined || letter),
  }
}

/**
 * Degrees, minutes and seconds with hemisphere letters or marks: `52°30'12"N 13°24'18"E`, `52.5 N 13.4 E`,
 * `52°30'N, 13°24'E`. One reading: a hemisphere letter names the axis; without one the order is latitude, longitude.
 */
function dmsPositionOf(text: string): Position | undefined {
  const match = DMS_PAIR.exec(text)
  if (!match) return undefined
  const first = dmsPartOf(match[1], match[2] ?? '', match[3], match[4], match[5], match[6])
  const second = dmsPartOf(match[7], match[8] ?? '', match[9], match[10], match[11], match[12])
  if (!first || !second || !(first.marked || second.marked)) return undefined
  // a letter names its axis; a part without one takes the other axis
  const firstAxis = first.axis ?? (second.axis === 'lat' ? 'lon' : 'lat')
  const secondAxis = second.axis ?? (firstAxis === 'lat' ? 'lon' : 'lat')
  if (firstAxis === secondAxis) return undefined
  const lat = firstAxis === 'lat' ? first.value : second.value
  const lon = firstAxis === 'lat' ? second.value : first.value
  return positionOf(lat, lon)
}

function positionsOf(text: string): Position[] {
  if (!text) return []
  const map = MAP_HASH.exec(text)
  if (map) {
    const position = positionOf(number(map[2] ?? ''), number(map[3] ?? ''), number(map[1] ?? ''))
    return position ? [position] : []
  }
  const lat = QUERY_LAT.exec(text)
  const lon = QUERY_LON.exec(text)
  if (lat && lon) {
    const zoom = QUERY_ZOOM.exec(text)
    const position = positionOf(
      number(lat[1] ?? ''),
      number(lon[1] ?? ''),
      zoom ? number(zoom[1] ?? '') : undefined,
    )
    return position ? [position] : []
  }
  const dms = dmsPositionOf(text)
  if (dms) return [dms]
  const zoomed = ZOOM_LAT_LON.exec(text)
  if (zoomed) {
    const position = positionOf(
      number(zoomed[2] ?? ''),
      number(zoomed[3] ?? ''),
      number(zoomed[1] ?? ''),
    )
    return position ? [position] : []
  }
  const pair = DECIMAL_PAIR.exec(text)
  if (pair) return readingsOf(number(pair[1] ?? ''), number(pair[2] ?? ''))
  return []
}

function idOf(letter: string, digits: string): OsmId | undefined {
  const normalised = digits.replace(/^0+(?=\d)/, '')
  if (normalised === '0') return undefined
  const type: OsmType = letter === 'n' ? 'node' : letter === 'w' ? 'way' : 'relation'
  return { type, id: `${letter}${normalised}` }
}

function idsOf(text: string): OsmId[] {
  if (!text) return []
  const link = OSM_LINK.exec(text)
  if (link) {
    const found = idOf((link[1] ?? '').charAt(0).toLowerCase(), link[2] ?? '')
    return found ? [found] : []
  }
  const param = ID_PARAM.exec(text)
  if (param) {
    const found = idOf((param[1] ?? '').toLowerCase(), param[2] ?? '')
    return found ? [found] : []
  }
  const typed = TYPED_ID.exec(text)
  if (typed) {
    const found = idOf((typed[1] ?? '').charAt(0).toLowerCase(), typed[2] ?? '')
    return found ? [found] : []
  }
  return []
}

/**
 * Reads the search text as positions and OSM ids. Both can come from one text (a link to an object
 * on a map view gives both). Nothing is fetched and nothing is changed.
 */
export function parseSearch(text: string): SearchParse {
  const query = text.trim()
  return { positions: positionsOf(query), ids: idsOf(query) }
}
