/**
 * Zoom numbers. MapLibre counts zoom with 512 px tiles. iD, Rapid and ELI count with 256 px tiles (OSM zoom).
 * For the same view, OSM zoom is MapLibre zoom plus one: MapLibre 13 is OSM 14. ELI's `minzoom` and the
 * notes' zoom gate are in OSM zoom, so a number from `map.getZoom()` goes through `toOsmZoom` before it is
 * compared with one, and a value in OSM zoom goes through `toMapZoom` before MapLibre is given it.
 * This is the one place of the conversion (docs/research/zoom-study.md).
 */

/** OSM (256 px) zoom of a MapLibre (512 px) zoom */
export function toOsmZoom(mapZoom: number): number {
  return mapZoom + 1
}

/** The inverse of `toOsmZoom`: an OSM (256 px) zoom as MapLibre (512 px) counts it */
export function toMapZoom(osmZoom: number): number {
  return osmZoom - 1
}
