// Tile arithmetic for the OSM data requests: the lon/lat of the edges of a tile at the OSM zoom TILE_ZOOM (256 px tiles).
// Used by the engine's tile loading (loadVisibleTiles, loadTile); MapLibre's zoom is one more.

/** OSM zoom (256 px tiles) of the OSM data requests, as iD and Rapid use. Not a MapLibre zoom */
const TILE_ZOOM = 16

export const lon2x = (lon: number) => Math.floor(((lon + 180) / 360) * 2 ** TILE_ZOOM)
export const lat2y = (lat: number) =>
  Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** TILE_ZOOM)
export const x2lon = (x: number) => (x / 2 ** TILE_ZOOM) * 360 - 180
export const y2lat = (y: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** TILE_ZOOM))) * 180) / Math.PI
