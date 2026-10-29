import {
  ADDRESS_PLAQUE,
  PIN_SHADOW,
  PLAQUE_SHADOW,
  SHADOW_COLOUR,
  SHADOW_PAD,
} from '@osm-editor-kit/maid-renderer'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { SPRITE_OF_PREFIX, spriteOf } from './sprite-sets'
import { appUrl } from './url/public-url'

export { SPRITE_OF_PREFIX, spriteOf }

/**
 * A marker image as its id names it: `pin-<preset icon>` (`pin-none` is the empty pin), `icon-<preset icon>`, the plaque,
 * and the shadows of a hovered or selected pin and plaque
 */
export type MarkerImage =
  | { kind: 'pin'; icon: string }
  | { kind: 'icon'; icon: string }
  | { kind: 'plaque' }
  | { kind: 'shadow'; of: 'pin' | 'plaque' }

/** Reads a marker image id. Any other id (the direction arrows, the parking arrow) is not a marker: undefined. */
export function parseMarkerImage(id: string): MarkerImage | undefined {
  if (id === ADDRESS_PLAQUE) return { kind: 'plaque' }
  if (id === PIN_SHADOW) return { kind: 'shadow', of: 'pin' }
  if (id === PLAQUE_SHADOW) return { kind: 'shadow', of: 'plaque' }
  if (id.startsWith('pin-')) return { kind: 'pin', icon: id.slice(4) }
  if (id.startsWith('icon-')) return { kind: 'icon', icon: id.slice(5) }
  return undefined
}

/**
 * How long one marker image may take before it is given up. Every step that waits (the sprite file, the icon's load,
 * the whole image) is limited by it: a promise that never settles would keep the tile that asked for the image from
 * loading, and MapLibre would then never report the map as loaded.
 */
export const MARKER_LIMIT_MS = 5000

/**
 * Settles like `work`, or rejects after `ms`. `work` is not cancelled: when the limit wins, its result is ignored, so
 * a promise that never settles is left behind here and nothing waits for it again.
 */
export function within<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} did not finish within ${ms} ms`)), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

const sprites = new Map<string, Promise<Document>>()

/**
 * The sprite file, fetched once. A fetch that fails or takes too long is dropped from the cache, so the next request
 * tries again instead of sharing a broken or pending promise.
 */
function loadSprite(name: string, limitMs: number) {
  let sprite = sprites.get(name)
  if (!sprite) {
    // the sprite of an icon set, read from the app's own origin (the allow list in no-direct-fetch.test.ts names this line)
    sprite = fetch(appUrl(`sprites/${name}-sprite.svg`))
      .then((res) => res.text())
      .then((text) => new DOMParser().parseFromString(text, 'image/svg+xml'))
    const job = within(sprite, limitMs, `the sprite file ${name}`)
    sprites.set(name, job)
    job.catch(() => {
      if (sprites.get(name) === job) sprites.delete(name)
    })
    sprite = job
  }
  return sprite
}

const PIN =
  'M 17,8 C 17,13 11,21 8.5,23.5 C 6,21 0,13 0,8 C 0,4 4,-0.5 8.5,-0.5 C 13,-0.5 17,4 17,8 z'

/** The icon at `px` pixels, decoded once: a pin and the bare icon of the same preset share it */
const icons = new Map<string, Promise<HTMLImageElement | undefined>>()

function decodeIcon(icon: string, px: number, limitMs: number) {
  const key = `${icon}@${px}`
  let job = icons.get(key)
  if (!job) {
    const made = within(makeIconImage(icon, px, limitMs), limitMs, `the icon ${icon}`)
    icons.set(key, made)
    // a failed or late decode is dropped, so the next request makes it again
    made.catch(() => {
      if (icons.get(key) === made) icons.delete(key)
    })
    job = made
  }
  return job
}

async function makeIconImage(icon: string, px: number, limitMs: number) {
  const spriteName = spriteOf(icon)
  if (!spriteName) return undefined
  const symbol = (await loadSprite(spriteName, limitMs)).getElementById(icon)
  if (!symbol) return undefined
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${symbol.getAttribute('viewBox')}" width="${px}" height="${px}" fill="#333">${symbol.innerHTML}</svg>`
  return loadDataImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, px)
}

/**
 * The image once it has loaded, or the error that stops it. `onload` and `onerror` settle a data URL; `decode()` is not
 * waited for, because drawing a loaded image on the canvas decodes it, and a second promise is one more that can hang.
 */
function loadDataImage(src: string, px: number) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(px, px)
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('the image failed to load'))
    image.src = src
  })
}

/**
 * One canvas for every marker image. Each image is drawn and read back in one synchronous run (no await between
 * `scratchContext` and `getImageData`), so the canvas is never shared by two images at once. `willReadFrequently`
 * keeps the canvas on the CPU, so the read-back does not wait for the GPU.
 */
const scratch: { canvas?: HTMLCanvasElement } = {}
function scratchContext(width: number, height: number) {
  const canvas = (scratch.canvas ??= document.createElement('canvas'))
  // setting the size clears the canvas and resets its state
  canvas.width = width
  canvas.height = height
  return canvas.getContext('2d', { willReadFrequently: true })!
}

const PIN_W = 19
const PIN_H = 26
const ICON_PX = 12

type Made = {
  data: ImageData
  pixelRatio: number
  stretchX?: [number, number][]
  stretchY?: [number, number][]
}

/**
 * Point markers: `pin-<preset icon>` is iD's pin with the preset icon from iD's SVG sprites on it (12px, #333).
 * Pin and icon are one image so that MapLibre places and hides them together.
 */
async function makePin(icon: string, ratio: number, limitMs: number): Promise<Made> {
  const image = await decodeIcon(icon, ICON_PX * ratio, limitMs)
  const ctx = scratchContext(PIN_W * ratio, PIN_H * ratio)
  ctx.scale(ratio, ratio)
  ctx.translate(1, 1.5)
  const path = new Path2D(PIN)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 1
  ctx.fill(path)
  ctx.stroke(path)
  if (image) ctx.drawImage(image, 2.5, 2.5, ICON_PX, ICON_PX)
  return {
    data: ctx.getImageData(0, 0, PIN_W * ratio, PIN_H * ratio),
    pixelRatio: ratio,
  }
}

/**
 * The shadow of a hovered or selected pin (PIN_SHADOW), as iD draws it: the pin's outline stroked twice SHADOW_PAD wide
 * and filled, in one colour. The layer sets its opacity. The image is the pin's, grown by SHADOW_PAD on each side.
 */
function makePinShadow(ratio: number): Made {
  const [w, h] = [PIN_W + 2 * SHADOW_PAD, PIN_H + 2 * SHADOW_PAD]
  const ctx = scratchContext(w * ratio, h * ratio)
  ctx.scale(ratio, ratio)
  // where makePin draws the pin, moved in by the pad
  ctx.translate(1 + SHADOW_PAD, 1.5 + SHADOW_PAD)
  const path = new Path2D(PIN)
  ctx.fillStyle = SHADOW_COLOUR
  ctx.strokeStyle = SHADOW_COLOUR
  ctx.lineWidth = 2 * SHADOW_PAD
  ctx.lineJoin = 'round'
  ctx.fill(path)
  ctx.stroke(path)
  return { data: ctx.getImageData(0, 0, w * ratio, h * ratio), pixelRatio: ratio }
}

/** `icon-<preset icon>`: the bare icon, for tagged vertices */
async function makeBareIcon(
  icon: string,
  ratio: number,
  limitMs: number,
): Promise<Made | undefined> {
  const image = await decodeIcon(icon, ICON_PX * ratio, limitMs)
  if (!image) return undefined
  const px = ICON_PX * ratio
  const ctx = scratchContext(px, px)
  ctx.drawImage(image, 0, 0, px, px)
  return { data: ctx.getImageData(0, 0, px, px), pixelRatio: ratio }
}

/**
 * The address plaque (iD's shield for an address node): a white rounded box with a grey edge,
 * 16px high, 36px wide. The layer stretches it to the house number (icon-text-fit), so the
 * middle may grow and the corners stay round.
 */
const PLAQUE_W = 36
const PLAQUE_H = 16
const PLAQUE_R = 3.5

function makePlaque(ratio: number): Made {
  const ctx = scratchContext(PLAQUE_W * ratio, PLAQUE_H * ratio)
  ctx.scale(ratio, ratio)
  ctx.translate(0.5, 0.5)
  const [w, h, r] = [PLAQUE_W - 1, PLAQUE_H - 1, PLAQUE_R]
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.arcTo(w, 0, w, h, r)
  ctx.arcTo(w, h, 0, h, r)
  ctx.arcTo(0, h, 0, 0, r)
  ctx.arcTo(0, 0, w, 0, r)
  ctx.closePath()
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 1
  ctx.fill()
  ctx.stroke()
  return {
    data: ctx.getImageData(0, 0, PLAQUE_W * ratio, PLAQUE_H * ratio),
    pixelRatio: ratio,
    // the middle of the box may stretch, the round ends may not (logical px)
    stretchX: [[PLAQUE_R + 1, PLAQUE_W - PLAQUE_R - 1]],
    stretchY: [[PLAQUE_R + 1, PLAQUE_H - PLAQUE_R - 1]],
  }
}

/**
 * The shadow of a hovered or selected address plaque (PLAQUE_SHADOW): a box in one colour with round ends, which the
 * layer stretches around the plaque as it stretches the plaque. Rounder than the plaque, as a 16 px stroke around it is.
 */
const PLAQUE_SHADOW_R = PLAQUE_R + SHADOW_PAD
const PLAQUE_SHADOW_W = 2 * PLAQUE_SHADOW_R + 4
function makePlaqueShadow(ratio: number): Made {
  const [w, h, r] = [PLAQUE_SHADOW_W, 2 * PLAQUE_SHADOW_R + 2, PLAQUE_SHADOW_R]
  const ctx = scratchContext(w * ratio, h * ratio)
  ctx.scale(ratio, ratio)
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, r)
  ctx.fillStyle = SHADOW_COLOUR
  ctx.fill()
  return {
    data: ctx.getImageData(0, 0, w * ratio, h * ratio),
    pixelRatio: ratio,
    // MapLibre reads the stretch zones in image pixels: the logical ones times the ratio
    stretchX: [[r * ratio, (w - r) * ratio]],
    stretchY: [[r * ratio, (h - r) * ratio]],
  }
}

async function makeMarker(
  marker: MarkerImage,
  ratio: number,
  limitMs: number,
): Promise<Made | undefined> {
  if (marker.kind === 'plaque') return makePlaque(ratio)
  if (marker.kind === 'shadow')
    return marker.of === 'pin' ? makePinShadow(ratio) : makePlaqueShadow(ratio)
  if (marker.kind === 'pin') return makePin(marker.icon, ratio, limitMs)
  return makeBareIcon(marker.icon, ratio, limitMs)
}

/** Marker images being made, by id: two tiles that ask for the same image wait for one job */
const making = new Map<string, Promise<void>>()
/** Ids that could not be drawn, with the reason. Not tried again in this session: MapLibre draws the symbol without them. */
const failed = new Map<string, string>()

async function addMarker(
  map: MapLibreMap,
  id: string,
  marker: MarkerImage,
  ratio: number,
  limitMs: number,
) {
  // the image is added here, after the limit: a result that comes later is dropped, not added behind MapLibre's back
  const made = await within(makeMarker(marker, ratio, limitMs), limitMs, `the image ${id}`)
  if (!made || map.hasImage(id)) return
  map.addImage(id, made.data, {
    pixelRatio: made.pixelRatio,
    stretchX: made.stretchX,
    stretchY: made.stretchY,
  })
}

export type MarkerOptions = {
  /** How long one marker image may take, in ms (default MARKER_LIMIT_MS) */
  limitMs?: number
  /** Where the warning for an image that could not be drawn goes (default console.warn) */
  warn?: (message: string) => void
}

/**
 * Makes marker images when MapLibre asks for them, instead of all of them when the map loads. MapLibre asks while it
 * lays out a tile (its worker requests the icons of the layers that are drawn at the tile's zoom, see
 * `iconImagesRequestedAt`), and the tile waits for the answer, so a symbol is never laid out without its image and
 * no placeholder or second layout is needed. An image added after the tile was laid out would not reach it reliably
 * (MapLibre only re-lays out tiles that already asked for it), which is why this is a resolver and not `styleimagemissing`.
 *
 * Every promise the resolver returns settles, within MARKER_LIMIT_MS, whatever the image does: a decode or a fetch that
 * never ends, an error, or a throw. A missing image resolves to nothing, which MapLibre draws without, as it does for
 * any missing image. Such an image is warned about once and not asked for again.
 *
 * Ids that are not markers (the direction arrows, the parking arrow) are left alone: their own handlers add them.
 * A style reload drops the images, and the next request makes them again.
 *
 * react-map-gl has no declarative resolver (its `onStyleImageMissing` is an event, which cannot resolve the image
 * of the current request), so this calls `map.setMissingStyleImageResolver`, as the renderer calls `map.addImage`.
 */
export function installMarkerImages(map: MapLibreMap, ratio = 2, options: MarkerOptions = {}) {
  const limitMs = options.limitMs ?? MARKER_LIMIT_MS
  const warn = options.warn ?? ((message: string) => console.warn(message))
  const fail = (id: string, error: unknown) => {
    if (failed.has(id)) return
    const reason = error instanceof Error ? error.message : String(error)
    failed.set(id, reason)
    warn(`Marker image ${id} is not drawn: ${reason}`)
  }
  map.setMissingStyleImageResolver(async (id) => {
    try {
      const marker = parseMarkerImage(id)
      if (!marker || map.hasImage(id) || failed.has(id)) return
      let job = making.get(id)
      if (!job) {
        job = addMarker(map, id, marker, ratio, limitMs)
          .catch((error: unknown) => fail(id, error))
          .finally(() => making.delete(id))
        making.set(id, job)
      }
      await job
    } catch (error) {
      fail(id, error)
    }
  })
}

/** What the marker images hold right now: the ids being made and the ids that failed, with the reason. For diagnostics. */
export function markerImageState() {
  return {
    pending: [...making.keys()],
    failed: [...failed].map(([id, reason]) => ({ id, reason })),
  }
}
