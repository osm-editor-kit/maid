/**
 * The map's box, snapped outwards to the tile grid of the photos. Pure: no React, no map.
 *
 * The provider hooks of the street-imagery package key their queries by the box and the zoom, as
 * raw numbers, so every move of the map is a new query. Snapping the box to tiles gives the same
 * box for every view that covers the same tiles, so the same key: a pan that comes back to a
 * place asks nothing again (the query's stale time is the session, see index.ts). The tiles are
 * the ones the package fetches: Panoramax's photos are z15 tiles and Mapillary's are z14, and the
 * z14 grid lines are a subset of the z15 ones, so one z15 grid lines up with both.
 */
import type { Bbox } from '@osm-editor-kit/street-imagery'

/** The tile zoom the box is snapped to: the photo tiles of Panoramax (the finer of the two) */
export const SNAP_ZOOM = 15

/** Keeps a snapped edge just inside its tile, so the package's own tile maths picks that tile */
const EDGE_INSET = 1e-7

/** Web Mercator reaches this latitude; beyond it there are no tiles */
const MAX_LAT = 85.0511287798

const round = (value: number) => Math.round(value * 1e7) / 1e7

const tileX = (lon: number, zoom: number) => ((lon + 180) / 360) * 2 ** zoom

const tileY = (lat: number, zoom: number) => {
  const rad = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom
}

const lonOfX = (x: number, zoom: number) => (x / 2 ** zoom) * 360 - 180

const latOfY = (y: number, zoom: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

const clampLat = (lat: number) => Math.min(MAX_LAT, Math.max(-MAX_LAT, lat))

/**
 * The smallest box of whole tiles at `zoom` that covers `bbox` (west, south, east, north). An edge
 * that lies exactly on a tile line does not take the tile beyond it. The result is rounded to
 * 1e-7 degrees, so equal tiles give equal numbers and so equal keys.
 */
export function snapBboxToTiles(bbox: Bbox, zoom: number = SNAP_ZOOM): Bbox {
  const [west, south, east, north] = bbox
  const minX = Math.floor(tileX(west, zoom))
  const maxX = Math.max(minX, Math.ceil(tileX(east, zoom)) - 1)
  const minY = Math.floor(tileY(clampLat(north), zoom))
  const maxY = Math.max(minY, Math.ceil(tileY(clampLat(south), zoom)) - 1)
  return [
    round(lonOfX(minX, zoom) + EDGE_INSET),
    round(latOfY(maxY + 1, zoom) + EDGE_INSET),
    round(lonOfX(maxX + 1, zoom) - EDGE_INSET),
    round(latOfY(minY, zoom) - EDGE_INSET),
  ]
}
