/**
 * iD's background offset as pure functions: the conversions between meters and iD's stored offset, the nudge, the text
 * the panel takes, and the tile arithmetic of a shifted raster layer (offset-protocol.ts draws the tiles).
 *
 * iD's notation (`.reference/id/modules/geo/geo.ts`, `renderer/background_source.js`, `renderer/tile_layer.js`): the
 * offset is stored in pixels of iD's zoom-0 world (256 px), so one screen pixel at zoom z is 1 / 2^z of it. The meters
 * are Mercator meters: the equatorial radius for east, the polar one for north. They do not depend on the latitude,
 * and neither does iD's pixel shift, so a value in a link means the same in both editors.
 *
 * No React, no DOM, no imports: the URL parser (url.ts) and the tests use it as it is.
 */

/** East and north, in meters, as iD's link writes them: `offset=east,north` */
export type Meters = [number, number]

/** iD's stored offset: east and south, in pixels of the zoom-0 world */
export type Units = [number, number]

/** A tile: its zoom and its XYZ column and row */
export type Tile = { z: number; x: number; y: number }

/** The four nudge directions of iD's background offset section */
export type Direction = 'up' | 'left' | 'right' | 'down'

/** No offset: the imagery is where its provider draws it */
export const NO_OFFSET: Meters = [0, 0]

/** iD's constants (geo.ts): the radii of the Mercator sphere and the size of the world in its pixels */
const TAU = 2 * Math.PI
const EQUATORIAL_RADIUS = 6.378137e6
const POLAR_RADIUS = 6.3567523e6
const WORLD_PX = 256

/** Half of the Web Mercator world in meters (EPSG:3857), the origin of the `{bbox-epsg-3857}` token */
const HALF_WORLD = 20037508.342789244

/** One nudge, in screen pixels: iD's `_directions` (background_offset.js) */
export const NUDGE_STEP = 0.5

/** The four nudges as offsets in screen pixels: `up` moves the imagery north, which is a negative y in iD's units */
export const NUDGES: Readonly<Record<Direction, Meters>> = {
  up: [0, -NUDGE_STEP],
  left: [-NUDGE_STEP, 0],
  right: [NUDGE_STEP, 0],
  down: [0, NUDGE_STEP],
}

/** iD's `geoMetersToOffset`: east and north in meters, to iD's stored offset */
export function metersToUnits([east, north]: Meters): Units {
  return [(east * WORLD_PX) / (TAU * EQUATORIAL_RADIUS), (-north * WORLD_PX) / (TAU * POLAR_RADIUS)]
}

/** iD's `geoOffsetToMeters`: the stored offset to east and north in meters */
export function unitsToMeters([x, y]: Units): Meters {
  return [(x * TAU * EQUATORIAL_RADIUS) / WORLD_PX, (-y * TAU * POLAR_RADIUS) / WORLD_PX]
}

/** Two decimals, as iD writes the offset into the hash (background.js, `toFixed(2)`). `-0` becomes `0` (`+ 0`). */
export function roundMeters(value: number): number {
  return Number(value.toFixed(2)) + 0
}

/** Both values rounded to two decimals */
export function roundOffset([east, north]: Meters): Meters {
  return [roundMeters(east), roundMeters(north)]
}

/** Whether no shift is set (after rounding, as the hash has it) */
export function isZeroOffset([east, north]: Meters): boolean {
  return east === 0 && north === 0
}

/** The offset as the panel shows it, and the link writes it: `east, north` for the panel, `east,north` for the link */
export function formatOffset([east, north]: Meters): string {
  return `${east}, ${north}`
}

/**
 * Two numbers in meters, `east,north` (a comma or a semicolon, which iD reads too: background.js `init`), rounded to
 * two decimals. Null for anything else: a blank text, one number, a part that is not a number.
 */
export function readOffset(text: string): Meters | null {
  const parts = text.trim().replace(/;/g, ',').split(',')
  if (parts.length !== 2) return null
  const [eastText = '', northText = ''] = parts.map((part) => part.trim())
  if (eastText === '' || northText === '') return null
  const east = Number(eastText)
  const north = Number(northText)
  if (!Number.isFinite(east) || !Number.isFinite(north)) return null
  return roundOffset([east, north])
}

/**
 * The offset after one nudge of `step` screen pixels at OSM zoom `zoom` (iD's `background.nudge`: the step is divided
 * by 2^zoom, because a screen pixel is that much of the zoom-0 world). Rounded as the link is. Null when it is zero again.
 */
export function nudgeOffset(meters: Meters, step: Meters, zoom: number): Meters | null {
  const [x, y] = metersToUnits(meters)
  const scale = 2 ** -zoom
  const next = roundOffset(unitsToMeters([x + step[0] * scale, y + step[1] * scale]))
  return isZeroOffset(next) ? null : next
}

/**
 * The shift of a tile of `tileSize` pixels at zoom `z`, in its own pixels. iD's pixel offset is `offset * 2^z` in
 * zoom-0 world pixels (tile_layer.js), so a tile of `tileSize` pixels, which covers 1 / 2^z of the world, shifts by
 * `offset * 2^z * tileSize / 256`.
 */
export function shiftOf([x, y]: Units, z: number, tileSize: number): Units {
  const scale = (2 ** z * tileSize) / WORLD_PX
  return [x * scale, y * scale]
}

/**
 * Where one source tile is drawn on the output tile: `dx`, `dy` are its column and row relative to the output tile,
 * and `x`, `y` are the pixels of its top-left corner on the output tile.
 */
export type Placement = { dx: number; dy: number; x: number; y: number }

/** The tiles that overlap one axis of the output: `rel` is the tile's index from the output's, `at` its start in pixels */
function axisPlacements(shift: number, size: number): { rel: number; at: number }[] {
  // a shift of k tiles and a fraction: the tile k+1 back and the tile k back can overlap the output; nothing else can
  const base = Math.floor(shift / size)
  const found: { rel: number; at: number }[] = []
  // `0 - base`, not `-base`: for a base of 0 the latter is -0, which is no index a test or a Map key would expect
  for (const rel of [-1 - base, 0 - base]) {
    const at = rel * size + shift
    if (at < size && at + size > 0) found.push({ rel, at })
  }
  return found
}

/**
 * The source tiles to draw so that the output tile (of `size` pixels) shows the source moved by `shift` pixels: the
 * output pixel `u` shows the source at `u - shift`. At most four (two tiles per axis); a tile that does not overlap
 * the output is left out. Sub-pixel shifts are kept: the canvas draws them at their place.
 */
export function placements(shift: readonly [number, number], size: number): Placement[] {
  const result: Placement[] = []
  for (const column of axisPlacements(shift[0], size)) {
    for (const row of axisPlacements(shift[1], size)) {
      result.push({ dx: column.rel, dy: row.rel, x: column.at, y: row.at })
    }
  }
  return result
}

/** The tile at `dx`, `dy` from `tile`: x wraps around the world, y outside the world has no tile (null) */
export function tileAt(tile: Tile, dx: number, dy: number): Tile | null {
  const n = 2 ** tile.z
  const y = tile.y + dy
  if (y < 0 || y >= n) return null
  const x = (((tile.x + dx) % n) + n) % n
  return { z: tile.z, x, y }
}

/** The Bing quadkey of a tile, as MapLibre writes `{quadkey}` */
export function quadkey({ z, x, y }: Tile): string {
  let key = ''
  for (let i = z; i > 0; i--) {
    const bit = 2 ** (i - 1)
    key += String((Math.floor(x / bit) % 2) + 2 * (Math.floor(y / bit) % 2))
  }
  return key
}

/** The tile's bounds in EPSG:3857 as `minx,miny,maxx,maxy`, as MapLibre writes `{bbox-epsg-3857}` */
export function bbox3857({ z, x, y }: Tile): string {
  const size = (2 * HALF_WORLD) / 2 ** z
  const minX = -HALF_WORLD + x * size
  const maxY = HALF_WORLD - y * size
  return [minX, maxY - size, minX + size, maxY].join(',')
}

/**
 * The URL of a tile from a tile template of the source (already in MapLibre's form: `{z}`, `{x}`, `{y}`, `{quadkey}`,
 * `{bbox-epsg-3857}`). `{y}` counts from the south when `tms`, as MapLibre counts it for `scheme: 'tms'`. Other
 * tokens are left as they are.
 */
export function tileUrl(template: string, tile: Tile, tms: boolean): string {
  const row = tms ? 2 ** tile.z - 1 - tile.y : tile.y
  return template
    .replaceAll('{z}', String(tile.z))
    .replaceAll('{x}', String(tile.x))
    .replaceAll('{y}', String(row))
    .replaceAll('{quadkey}', quadkey(tile))
    .replaceAll('{bbox-epsg-3857}', bbox3857(tile))
}

/** The scheme of a shifted layer's tile URLs. The protocol is registered under it (offset-protocol.ts). */
export const OFFSET_SCHEME = 'maid-offset'

const PREFIX = `${OFFSET_SCHEME}://tile/`

/** What a shifted tile needs besides its address: the template, the shift, the tile size, the scheme, the background */
export type ShiftedSource = {
  template: string
  units: Units
  tileSize: number
  tms: boolean
  /** The background's value (`shown.background`): the key of the notice when its tiles cannot be drawn */
  key: string
}

/**
 * The tile URL of a shifted layer, with `{z}`, `{x}` and `{y}` left for MapLibre to fill for each tile. The template
 * and the rest go in the query, encoded (its braces are encoded too, so MapLibre does not fill them), and the protocol
 * reads them back with `readShiftedTileUrl`.
 */
export function shiftedTileUrl(source: ShiftedSource): string {
  const params = new URLSearchParams({
    src: source.template,
    east: String(source.units[0]),
    north: String(source.units[1]),
    size: String(source.tileSize),
    tms: source.tms ? '1' : '0',
    key: source.key,
  })
  return `${PREFIX}{z}/{x}/{y}?${params.toString()}`
}

/** A shifted tile: its address, and what to draw it from */
export type ShiftedTile = { tile: Tile; source: ShiftedSource }

/**
 * Reads a shifted tile URL back, with the address MapLibre filled in. Null for any other URL, and for a URL whose parts
 * are not what `shiftedTileUrl` writes.
 */
export function readShiftedTileUrl(url: string): ShiftedTile | null {
  if (!url.startsWith(PREFIX)) return null
  const query = url.indexOf('?')
  if (query < 0) return null
  const [z = NaN, x = NaN, y = NaN] = url.slice(PREFIX.length, query).split('/').map(Number)
  const params = new URLSearchParams(url.slice(query + 1))
  const template = params.get('src')
  const key = params.get('key')
  const east = numberParam(params, 'east')
  const north = numberParam(params, 'north')
  const tileSize = numberParam(params, 'size')
  if (template === null || key === null) return null
  if (!Number.isFinite(east) || !Number.isFinite(north)) return null
  if (!Number.isInteger(tileSize) || tileSize <= 0) return null
  if (![z, x, y].every((part) => Number.isInteger(part) && part >= 0)) return null
  const n = 2 ** z
  if (x >= n || y >= n) return null
  return {
    tile: { z, x, y },
    source: {
      template,
      units: [east, north],
      tileSize,
      tms: params.get('tms') === '1',
      key,
    },
  }
}

/** A number from the query, or NaN when it is missing (Number(null) would be 0) */
function numberParam(params: URLSearchParams, name: string): number {
  const text = params.get(name)
  if (text === null || text.trim() === '') return Number.NaN
  return Number(text)
}
