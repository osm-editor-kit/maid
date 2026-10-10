import type { Map as MapLibreMap } from 'maplibre-gl'

/** Draws an SVG path into an image MapLibre can use. `ratio` keeps it sharp on HiDPI screens. */
function pathImage(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void, ratio = 2) {
  const canvas = document.createElement('canvas')
  canvas.width = width * ratio
  canvas.height = height * ratio
  const ctx = canvas.getContext('2d')!
  ctx.scale(ratio, ratio)
  draw(ctx)
  return { image: ctx.getImageData(0, 0, canvas.width, canvas.height), options: { pixelRatio: ratio } }
}

/** iD's point marker (modules/svg/points.js) and oneway arrow (modules/svg/defs.js) */
export function addBaseImages(map: MapLibreMap) {
  const pin = pathImage(19, 26, (ctx) => {
    ctx.translate(1, 1.5)
    const path = new Path2D('M 17,8 C 17,13 11,21 8.5,23.5 C 6,21 0,13 0,8 C 0,4 4,-0.5 8.5,-0.5 C 13,-0.5 17,4 17,8 z')
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#444'
    ctx.lineWidth = 1
    ctx.fill(path)
    ctx.stroke(path)
  })
  if (!map.hasImage('maid-pin')) map.addImage('maid-pin', pin.image, pin.options)
  const arrow = pathImage(10, 10, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.fill(new Path2D('M 2.5,1 L 8,5 L 2.5,9 L 4,5 z'))
  })
  if (!map.hasImage('maid-oneway')) map.addImage('maid-oneway', arrow.image, arrow.options)
}

const SPRITE_OF_PREFIX: Record<string, string> = { maki: 'maki', temaki: 'temaki', fas: 'fa', far: 'fa', fab: 'fa', roentgen: 'roentgen', iD: 'iD' }
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

/**
 * Preset icons come from iD's SVG sprites and are rasterised when a feature first needs them.
 * iD draws them 12px wide in #333 on the pin.
 */
export function resolvePresetIcons(map: MapLibreMap, size = 12, ratio = 2) {
  map.setMissingStyleImageResolver(async (id) => {
    const spriteName = SPRITE_OF_PREFIX[id.slice(0, id.indexOf('-'))]
    if (!spriteName) return
    const symbol = (await loadSprite(spriteName)).getElementById(id)
    if (!symbol) return
    const px = size * ratio
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${symbol.getAttribute('viewBox')}" width="${px}" height="${px}" fill="#333">${symbol.innerHTML}</svg>`
    const image = new Image(px, px)
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    await image.decode()
    const bitmap = await createImageBitmap(image)
    // several tiles can ask for the same icon at once
    if (!map.hasImage(id)) map.addImage(id, bitmap, { pixelRatio: ratio })
  })
}
