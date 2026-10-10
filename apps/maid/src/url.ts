import { createParser, parseAsString, useQueryState } from 'nuqs'

/** OSM zoom (256px tiles), like iD's `map=` */
export type Camera = { zoom: number; lat: number; lng: number }

/** `map=17.25/52.52280/13.40230`: zoom/lat/lng, the order iD uses. Precision follows the zoom. */
const parseAsCamera = createParser<Camera>({
  parse(value) {
    const [zoom, lat, lng] = value.split('/').map(Number)
    if (zoom === undefined || lat === undefined || lng === undefined) return null
    if ([zoom, lat, lng].some((n) => !Number.isFinite(n))) return null
    return { zoom, lat, lng }
  },
  serialize({ zoom, lat, lng }) {
    const digits = Math.max(2, Math.ceil(zoom / 3) - 1)
    return `${zoom.toFixed(2)}/${lat.toFixed(digits)}/${lng.toFixed(digits)}`
  },
  eq: (a, b) => a.zoom === b.zoom && a.lat === b.lat && a.lng === b.lng,
})

/** Map position in the URL. Written on move end, replacing the history entry. */
export function useCameraParam() {
  return useQueryState('map', parseAsCamera.withOptions({ history: 'replace', throttleMs: 300 }))
}

/** Selected feature in the URL, e.g. `id=w123`, like iD */
export function useSelectedId() {
  return useQueryState('id', parseAsString.withOptions({ history: 'replace' }))
}
