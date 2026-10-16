/**
 * The shifted tiles of an offset background. MapLibre has no translate for a raster layer, so a shifted layer is drawn
 * tile by tile: this protocol fetches the up to four source tiles that overlap a tile, draws them shifted onto a canvas
 * and hands MapLibre the canvas as PNG bytes (a protocol's raster tile is bytes that MapLibre decodes itself; an
 * ImageBitmap there fails with "The source image could not be decoded"). The pure part (the tile arithmetic and the URLs) is offset.ts.
 *
 * The registration is an imperative call, on purpose: `addProtocol` is a static of the map library, not of a map, and
 * react-map-gl has no declarative form for it. The module's setup makes it (index.ts), once per editor; not a hidden
 * react-map-gl control, which would exist only to reach the library. It is the same as the PMTiles protocol
 * (module-data-layers/src/pmtiles.ts). The tiles are requested through the editor's fetch (core's RemoteFetch), so the
 * host gate and the automation refusal apply to them as to every request of the editor.
 *
 * A server without CORS cannot be drawn on a canvas: its tiles fail, the background is marked (`useCannotShift`), and
 * its layer is drawn unshifted from then on, with a notice in the panel.
 */
import { HttpError, type RemoteFetch } from '@osm-editor-kit/maid-core'
import { addProtocol } from 'maplibre-gl'
import { useSyncExternalStore } from 'react'
import {
  OFFSET_SCHEME,
  placements,
  readShiftedTileUrl,
  shiftOf,
  tileAt,
  tileUrl,
  type ShiftedSource,
} from './offset.ts'

/** The backgrounds (their `shown.background` value) whose tiles cannot be drawn, and a count that changes with them */
const failed = new Set<string>()
let failures = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function markFailed(key: string) {
  if (failed.has(key)) return
  failed.add(key)
  failures += 1
  for (const listener of listeners) listener()
}

/**
 * Whether the background with this key cannot be shifted (its server has no CORS, so its tiles cannot be drawn on a
 * canvas). A component that shows it re-renders when a background is marked.
 */
export function useCannotShift(key: string): boolean {
  useSyncExternalStore(subscribe, () => failures)
  return failed.has(key)
}

/** The function that registers a protocol: maplibre-gl's `addProtocol`, or a stand-in in a test */
export type AddProtocol = typeof addProtocol

/**
 * Registers the protocol with MapLibre. `send` is a getter for the editor's request function, read at each request, so
 * the fetch in use then is the one that makes the tile requests. It must run before a shifted source is added, which
 * a child's effect does later. Called from the module's setup, so once per editor. Calling it again only replaces the
 * registration (MapLibre keeps one loader per name): the latest editor's getter is the one in use.
 */
export function registerOffsetProtocol(send: () => RemoteFetch, add: AddProtocol = addProtocol) {
  add(OFFSET_SCHEME, (request, controller) =>
    drawShifted(request.url, send(), controller.signal).then((data) => ({ data })),
  )
}

/** One source tile, decoded, or null when the server has no tile there (HTTP error: drawn as empty) */
async function fetchImage(
  url: string,
  source: ShiftedSource,
  send: RemoteFetch,
  signal: AbortSignal,
): Promise<ImageBitmap | null> {
  try {
    const response = await send(url, { signal })
    return await createImageBitmap(await response.blob())
  } catch (error) {
    if (error instanceof HttpError) return null
    // the browser refused the response: no CORS header on the server, so the tile cannot be read into a canvas
    if (error instanceof TypeError) markFailed(source.key)
    throw error
  }
}

/** A canvas of `size` pixels: an OffscreenCanvas where it exists, the document's canvas otherwise */
function newCanvas(size: number): {
  draw: (image: ImageBitmap, x: number, y: number) => void
  bytes: () => Promise<ArrayBuffer>
} {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(size, size)
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('A 2D canvas is needed to shift imagery')
    return {
      draw: (image, x, y) => context.drawImage(image, x, y, size, size),
      bytes: async () => (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer(),
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('A 2D canvas is needed to shift imagery')
  return {
    draw: (image, x, y) => context.drawImage(image, x, y, size, size),
    bytes: () =>
      new Promise<ArrayBuffer>((resolve, reject) =>
        canvas.toBlob((blob) =>
          blob
            ? resolve(blob.arrayBuffer())
            : reject(new Error('The shifted tile could not be written')),
        ),
      ),
  }
}

/** The shifted tile of one URL: the source tiles that overlap it, drawn where they fall */
async function drawShifted(
  url: string,
  send: RemoteFetch,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  const shifted = readShiftedTileUrl(url)
  if (shifted === null) throw new Error(`Not a shifted tile: ${url}`)
  const { tile, source } = shifted
  const shift = shiftOf(source.units, tile.z, source.tileSize)
  const parts = await Promise.all(
    placements(shift, source.tileSize).map(async (place) => {
      const neighbour = tileAt(tile, place.dx, place.dy)
      if (neighbour === null) return null
      const image = await fetchImage(
        tileUrl(source.template, neighbour, source.tms),
        source,
        send,
        signal,
      )
      return image === null ? null : { image, x: place.x, y: place.y }
    }),
  )
  const canvas = newCanvas(source.tileSize)
  for (const part of parts) {
    if (part === null) continue
    canvas.draw(part.image, part.x, part.y)
    part.image.close()
  }
  return canvas.bytes()
}
