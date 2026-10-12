/**
 * The images of the direction arrows and side markers, drawn in code (no image files).
 *
 * Imperative on purpose: MapLibre has no declarative way to give a style generated images, and
 * an image has to be in place before a tile is laid out, or the tile never shows it. This is the
 * only place in the renderer that adds images. The engine calls `installDirectionImages` on attach.
 * It is re-run on every new style, since a style change drops all images.
 */
import type { Map as MapLibreMap } from 'maplibre-gl'
import {
  ARROW_IMAGE,
  ARROW_BOTH_IMAGE,
  SIDE_IMAGE_PREFIX,
  SIDE_KINDS,
  type SideKind,
} from './direction'

type Built = { data: ImageData; options: { pixelRatio: number; sdf?: boolean } }

const RATIO = 2
/** iD's arrow is drawn in a 10 x 5 box that is 12 x 6 px on the map (markers in strokeWidth units) */
const ARROW_D = 'M 6,3 L 0,3 L 0,2 L 6,2 L 5,0 L 10,2.5 L 5,5 z'
const ARROW_UNIT = 1.2
/** Side markers: one unit is 4.5 px on the map (iD: markerWidth 1.5 of a 6 px stroke, 2 units wide) */
const SIDE_UNIT = 4.5
const SIDE_WIDTH = 10
const SIDE_HEIGHT = 26

function canvas(width: number, height: number) {
  const el = document.createElement('canvas')
  el.width = Math.ceil(width * RATIO)
  el.height = Math.ceil(height * RATIO)
  return el
}

/**
 * The arrow as a mask (SDF: colour comes from `icon-color`). The outline is stroked a little so
 * that MapLibre's threshold on the mask does not thin the thin shaft.
 */
function arrowImage(both: boolean): Built {
  const el = canvas(12, 6)
  const ctx = el.getContext('2d')!
  const s = RATIO * ARROW_UNIT
  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 0.3
  ctx.lineJoin = 'round'
  ctx.setTransform(s, 0, 0, s, 0, 0)
  const path = new Path2D(ARROW_D)
  ctx.fill(path)
  ctx.stroke(path)
  if (both) {
    // iD draws the arrow again in the other direction at the same place: mirror it on the box's centre
    ctx.setTransform(-s, 0, 0, s, 10 * s, 0)
    ctx.fill(path)
    ctx.stroke(path)
  }
  return {
    data: ctx.getImageData(0, 0, el.width, el.height),
    options: { pixelRatio: RATIO, sdf: true },
  }
}

/**
 * A side marker in colour. Units run along the way (x) and to its right (y, down on screen when
 * the way runs east), with the line at the middle of the image.
 */
function sideImage(kind: SideKind): Built {
  const el = canvas(SIDE_WIDTH, SIDE_HEIGHT)
  const ctx = el.getContext('2d')!
  const s = RATIO * SIDE_UNIT
  // the line runs through the middle of the canvas (device pixels)
  ctx.setTransform(s, 0, 0, s, (RATIO * SIDE_WIDTH) / 2, (RATIO * SIDE_HEIGHT) / 2)
  ctx.fillStyle = kind.color
  ctx.strokeStyle = kind.stroke ?? 'transparent'
  ctx.lineWidth = 0.1
  for (const shape of kind.shapes) {
    ctx.beginPath()
    if ('at' in shape) {
      ctx.arc(0, shape.at, 0.5, 0, 2 * Math.PI)
    } else {
      ctx.moveTo(-1, shape.base)
      ctx.lineTo(0, shape.apex)
      ctx.lineTo(1, shape.base)
      ctx.closePath()
    }
    ctx.fill()
    if (kind.stroke) ctx.stroke()
  }
  return { data: ctx.getImageData(0, 0, el.width, el.height), options: { pixelRatio: RATIO } }
}

let built: Map<string, Built> | undefined
/** Every image the layers name. Built once: the pixels are the same for every map. */
function allImages(): Map<string, Built> {
  if (!built) {
    built = new Map<string, Built>([
      [ARROW_IMAGE, arrowImage(false)],
      [ARROW_BOTH_IMAGE, arrowImage(true)],
    ])
    for (const [kind, spec] of Object.entries(SIDE_KINDS)) {
      built.set(`${SIDE_IMAGE_PREFIX}${kind}`, sideImage(spec))
    }
  }
  return built
}

function addMissing(map: MapLibreMap) {
  for (const [id, image] of allImages()) {
    if (!map.hasImage(id)) map.addImage(id, image.data, image.options)
  }
}

/**
 * Adds the arrow and side images to the map now, and again whenever a style is loaded (a new
 * style has none of them). Safe to call more than once.
 */
export function installDirectionImages(map: MapLibreMap) {
  addMissing(map)
  map.on('style.load', () => addMissing(map))
}
