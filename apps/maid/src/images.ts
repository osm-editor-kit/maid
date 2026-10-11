import type { Map as MapLibreMap } from 'maplibre-gl'

/** Draws an SVG path into an image MapLibre can use. `ratio` keeps it sharp on HiDPI screens. */
function pathImage(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  ratio = 2,
) {
  const canvas = document.createElement('canvas')
  canvas.width = width * ratio
  canvas.height = height * ratio
  const ctx = canvas.getContext('2d')!
  ctx.scale(ratio, ratio)
  draw(ctx)
  return {
    image: ctx.getImageData(0, 0, canvas.width, canvas.height),
    options: { pixelRatio: ratio },
  }
}

/** iD's oneway arrow (modules/svg/defs.js) */
export function addBaseImages(map: MapLibreMap) {
  const arrow = pathImage(10, 10, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.fill(new Path2D('M 2.5,1 L 8,5 L 2.5,9 L 4,5 z'))
  })
  if (!map.hasImage('maid-oneway')) map.addImage('maid-oneway', arrow.image, arrow.options)
}

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

async function presetIconBitmap(icon: string, px: number) {
  const spriteName = SPRITE_OF_PREFIX[icon.slice(0, icon.indexOf('-'))]
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
 * Point markers: `pin-<preset icon>` is iD's pin with the preset icon from iD's SVG sprites
 * on it (12px, #333), `pin-none` the empty pin. Pin and icon are one image so that MapLibre
 * places and hides them together.
 */
const pending = new Map<string, Promise<void>>()

/** `icon-<preset icon>`: the bare icon, for tagged vertices */
async function addIcon(map: MapLibreMap, id: string, ratio: number) {
  const icon = await presetIconBitmap(id.slice(5), 12 * ratio)
  if (!icon) return
  const bitmap = await createImageBitmap(icon)
  if (!map.hasImage(id)) map.addImage(id, bitmap, { pixelRatio: ratio })
}

async function addPin(map: MapLibreMap, id: string, ratio: number) {
  const icon = id === 'pin-none' ? undefined : await presetIconBitmap(id.slice(4), 12 * ratio)
  const canvas = document.createElement('canvas')
  canvas.width = 19 * ratio
  canvas.height = 26 * ratio
  const ctx = canvas.getContext('2d')!
  ctx.scale(ratio, ratio)
  ctx.translate(1, 1.5)
  const path = new Path2D(PIN)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 1
  ctx.fill(path)
  ctx.stroke(path)
  if (icon) ctx.drawImage(icon, 2.5, 2.5, 12, 12)
  // several tiles can ask for the same marker at once
  if (!map.hasImage(id))
    map.addImage(id, ctx.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: ratio })
}

/**
 * Adds the images these ids need, unless they exist: `pin-<icon>` or `icon-<icon>`.
 * Resolves when all are usable.
 */
export function ensureImages(map: MapLibreMap, ids: Iterable<string>, ratio = 2) {
  const jobs: Promise<void>[] = []
  for (const id of ids) {
    if (map.hasImage(id)) continue
    let job = pending.get(id)
    if (!job) {
      job = (id.startsWith('pin-') ? addPin(map, id, ratio) : addIcon(map, id, ratio)).catch(
        (error) => console.error(`Could not make image ${id}`, error),
      )
      pending.set(id, job)
    }
    jobs.push(job)
  }
  return Promise.all(jobs).then(() => undefined)
}
