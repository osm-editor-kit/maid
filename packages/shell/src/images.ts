import { ADDRESS_PLAQUE } from '@osm-editor-kit/maid-renderer'
import type { Map as MapLibreMap } from 'maplibre-gl'

/** Which of iD's sprite files holds an icon, by the prefix of its name */
export const SPRITE_OF_PREFIX: Record<string, string> = {
  maki: 'maki',
  temaki: 'temaki',
  fas: 'fa',
  far: 'fa',
  fab: 'fa',
  roentgen: 'roentgen',
  iD: 'iD',
}

/** A marker image as its id names it: `pin-<preset icon>` (`pin-none` is the empty pin), `icon-<preset icon>`, the plaque */
export type MarkerImage =
  | { kind: 'pin'; icon: string }
  | { kind: 'icon'; icon: string }
  | { kind: 'plaque' }

/** Reads a marker image id. Any other id (the direction arrows, the parking arrow) is not a marker: undefined. */
export function parseMarkerImage(id: string): MarkerImage | undefined {
  if (id === ADDRESS_PLAQUE) return { kind: 'plaque' }
  if (id.startsWith('pin-')) return { kind: 'pin', icon: id.slice(4) }
  if (id.startsWith('icon-')) return { kind: 'icon', icon: id.slice(5) }
  return undefined
}

/** The sprite file an icon is in, by its prefix: `maki-restaurant` is in `maki`. Undefined for an unknown prefix. */
export function spriteOf(icon: string): string | undefined {
  const dash = icon.indexOf('-')
  if (dash < 0) return undefined
  const prefix = icon.slice(0, dash)
  return Object.hasOwn(SPRITE_OF_PREFIX, prefix) ? SPRITE_OF_PREFIX[prefix] : undefined
}

const sprites = new Map<string, Promise<Document>>()

function loadSprite(name: string) {
  let sprite = sprites.get(name)
  if (!sprite) {
    sprite = fetch(`/sprites/${name}-sprite.svg`)
      .then((res) => res.text())
      .then((text) => new DOMParser().parseFromString(text, 'image/svg+xml'))
    sprites.set(name, sprite)
  }
  return sprite
}

const PIN =
  'M 17,8 C 17,13 11,21 8.5,23.5 C 6,21 0,13 0,8 C 0,4 4,-0.5 8.5,-0.5 C 13,-0.5 17,4 17,8 z'

/** The icon at `px` pixels, decoded once: a pin and the bare icon of the same preset share it */
const icons = new Map<string, Promise<HTMLImageElement | undefined>>()

function decodeIcon(icon: string, px: number) {
  const key = `${icon}@${px}`
  let job = icons.get(key)
  if (!job) {
    job = makeIconImage(icon, px).catch((error) => {
      icons.delete(key)
      throw error
    })
    icons.set(key, job)
  }
  return job
}

async function makeIconImage(icon: string, px: number) {
  const spriteName = spriteOf(icon)
  if (!spriteName) return undefined
  const symbol = (await loadSprite(spriteName)).getElementById(icon)
  if (!symbol) return undefined
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${symbol.getAttribute('viewBox')}" width="${px}" height="${px}" fill="#333">${symbol.innerHTML}</svg>`
  const image = new Image(px, px)
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await image.decode()
  return image
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
async function makePin(icon: string, ratio: number): Promise<Made> {
  const image = await decodeIcon(icon, ICON_PX * ratio)
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

/** `icon-<preset icon>`: the bare icon, for tagged vertices */
async function makeBareIcon(icon: string, ratio: number): Promise<Made | undefined> {
  const image = await decodeIcon(icon, ICON_PX * ratio)
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

/** Markers being made, by id: two tiles that ask for the same image wait for one job */
const making = new Map<string, Promise<void>>()

async function addMarker(map: MapLibreMap, id: string, marker: MarkerImage, ratio: number) {
  const made =
    marker.kind === 'plaque'
      ? makePlaque(ratio)
      : marker.kind === 'pin'
        ? await makePin(marker.icon, ratio)
        : await makeBareIcon(marker.icon, ratio)
  if (!made || map.hasImage(id)) return
  map.addImage(id, made.data, {
    pixelRatio: made.pixelRatio,
    stretchX: made.stretchX,
    stretchY: made.stretchY,
  })
}

/**
 * Makes marker images when MapLibre asks for them, instead of all of them when the map loads. MapLibre asks while it
 * lays out a tile (its worker requests the icons of the layers that are drawn at the tile's zoom, see
 * `iconImagesRequestedAt`), and the tile waits for the answer, so a symbol is never laid out without its image and
 * no placeholder or second layout is needed. An image added after the tile was laid out would not reach it reliably
 * (MapLibre only re-lays out tiles that already asked for it), which is why this is a resolver and not `styleimagemissing`.
 *
 * Ids that are not markers (the direction arrows, the parking arrow) are left alone: their own handlers add them.
 * A style reload drops the images, and the next request makes them again. A failed image is logged; MapLibre then
 * draws the symbol without it, as it does for any missing image.
 *
 * react-map-gl has no declarative resolver (its `onStyleImageMissing` is an event, which cannot resolve the image
 * of the current request), so this calls `map.setMissingStyleImageResolver`, as the renderer calls `map.addImage`.
 */
export function installMarkerImages(map: MapLibreMap, ratio = 2) {
  map.setMissingStyleImageResolver(async (id) => {
    const marker = parseMarkerImage(id)
    if (!marker || map.hasImage(id)) return
    let job = making.get(id)
    if (!job) {
      job = addMarker(map, id, marker, ratio)
        .catch((error) => console.error(`Could not make image ${id}`, error))
        .finally(() => making.delete(id))
      making.set(id, job)
    }
    await job
  })
}
