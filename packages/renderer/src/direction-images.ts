/**
 * The images of the direction arrows and side markers, drawn in code (no image files). They are
 * line patterns (layers.ts): one marker per image, the image as wide as the spacing and as high
 * as the layer's line-width. Colours are not tinted, so every colour has its own image.
 *
 * Imperative on purpose: MapLibre has no declarative way to give a style generated images, and
 * an image has to be in place before a tile is laid out, or the tile never shows it. This is the
 * only place in the renderer that adds images. The engine calls `installDirectionImages` on attach.
 * It is re-run on every new style, since a style change drops all images.
 */
import type { Map as MapLibreMap } from 'maplibre-gl'
import {
  ARROW_COLOURS,
  ARROW_HEIGHT,
  ARROW_SPACING,
  arrowImageId,
  parseArrowImageId,
  SELECTED_ARROW_HEIGHT,
  SELECTED_ARROW_IMAGE,
  SIDE_HEIGHT,
  SIDE_IMAGE_PREFIX,
  SIDE_KINDS,
  SIDE_SPACING,
  type ArrowShape,
  type SideKind,
} from './direction'
import { CONE_IMAGE } from './viewfield'

type Built = { data: ImageData; options: { pixelRatio: number } }

const RATIO = 2
/** iD's arrow is drawn in a 10 x 5 box that is 12 x 6 px on the map (markers in strokeWidth units) */
const ARROW_D = 'M 6,3 L 0,3 L 0,2 L 6,2 L 5,0 L 10,2.5 L 5,5 z'
const ARROW_UNIT = 1.2
/** The arrow's box starts this far from the image's left edge: the arrow is centred in its spacing */
const ARROW_X = (ARROW_SPACING - 10 * ARROW_UNIT) / 2
/** Side markers: one unit is 4.5 px on the map (iD: markerWidth 1.5 of a 6 px stroke, 2 units wide) */
const SIDE_UNIT = 4.5
/** The viewfield wedge (iD defs.ts `ideditor-viewfield-marker`): a 16-unit box, 1.5 px a unit, so 24 px on the map */
const CONE_D = 'M 6,14 C 8,13.4 8,13.4 10,14 L 16,3 C 12,0 4,0 0,3 z'
const CONE_UNIT = 1.5
const CONE_BOX = 16

function canvas(width: number, height: number) {
  const el = document.createElement('canvas')
  el.width = Math.ceil(width * RATIO)
  el.height = Math.ceil(height * RATIO)
  return el
}

/**
 * An arrow, in the given colours, at `offsetY` from the top of the image. `backward` is the
 * arrow mirrored in its box, so it points against the way; `both` draws both on the same place.
 */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  shape: ArrowShape,
  offsetY: number,
  fill: string,
  stroke: string,
  strokeWidth: number,
) {
  const path = new Path2D(ARROW_D)
  const s = RATIO * ARROW_UNIT
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = strokeWidth
  ctx.lineJoin = 'round'
  const pieces = shape === 'forward' ? [false] : shape === 'backward' ? [true] : [false, true]
  for (const mirrored of pieces) {
    const x = mirrored ? ARROW_X + 10 * ARROW_UNIT : ARROW_X
    ctx.setTransform(mirrored ? -s : s, 0, 0, s, RATIO * x, RATIO * offsetY)
    ctx.fill(path)
    ctx.stroke(path)
  }
}

/** The arrow of a one-way line, in the colour of its `ac` (or the default) */
function arrowImage(shape: ArrowShape, colour: string) {
  const el = canvas(ARROW_SPACING, ARROW_HEIGHT)
  const ctx = el.getContext('2d')!
  drawArrow(ctx, shape, 0, colour, colour, 0.3)
  return { data: ctx.getImageData(0, 0, el.width, el.height), options: { pixelRatio: RATIO } }
}

/** The arrow of the selected way: white with a dark outline, so it reads on the selection's glow */
function selectedArrowImage() {
  const el = canvas(ARROW_SPACING, SELECTED_ARROW_HEIGHT)
  const ctx = el.getContext('2d')!
  drawArrow(ctx, 'forward', (SELECTED_ARROW_HEIGHT - ARROW_HEIGHT) / 2, '#fff', '#333', 0.5)
  return { data: ctx.getImageData(0, 0, el.width, el.height), options: { pixelRatio: RATIO } }
}

/**
 * A side marker in colour. Units run along the way (x) and to its right (y, down on screen when
 * the way runs east), with the line at the middle of the image.
 */
function sideImage(kind: SideKind) {
  const el = canvas(SIDE_SPACING, SIDE_HEIGHT)
  const ctx = el.getContext('2d')!
  const s = RATIO * SIDE_UNIT
  // the line runs through the middle of the canvas, and the marker through the middle of its spacing
  ctx.setTransform(s, 0, 0, s, (RATIO * SIDE_SPACING) / 2, (RATIO * SIDE_HEIGHT) / 2)
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

/**
 * The viewfield of a node, pointing up (north) at rotation 0. Its box's bottom edge is the node (the layer anchors the
 * image at its bottom, and the tip sits 2 units above it, as in iD). iD's colours: fill #333 and white stroke, both at
 * 0.75. iD has no other colours for viewfields, so the same image is used in the light and the dark map.
 */
function coneImage() {
  const el = canvas(CONE_BOX * CONE_UNIT, CONE_BOX * CONE_UNIT)
  const ctx = el.getContext('2d')!
  const s = RATIO * CONE_UNIT
  ctx.setTransform(s, 0, 0, s, 0, 0)
  ctx.fillStyle = 'rgba(51, 51, 51, 0.75)'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)'
  ctx.lineWidth = 0.5
  const path = new Path2D(CONE_D)
  ctx.fill(path)
  ctx.stroke(path)
  return { data: ctx.getImageData(0, 0, el.width, el.height), options: { pixelRatio: RATIO } }
}

/** Built images by id. The pixels are the same for every map, so they are built once. */
const built = new Map<string, Built>()

/** The image with this id, built now if it is one of ours (undefined for any other id) */
function imageFor(id: string) {
  const known = built.get(id)
  if (known) return known
  let image: Built | undefined
  const arrow = parseArrowImageId(id)
  if (arrow) {
    image = arrowImage(arrow.shape, arrow.colour)
  } else if (id === SELECTED_ARROW_IMAGE) {
    image = selectedArrowImage()
  } else if (id.startsWith(SIDE_IMAGE_PREFIX)) {
    const spec = SIDE_KINDS[id.slice(SIDE_IMAGE_PREFIX.length)]
    if (spec) image = sideImage(spec)
  } else if (id === CONE_IMAGE) {
    image = coneImage()
  }
  if (image) built.set(id, image)
  return image
}

/** The images that are built ahead: every arrow in the colours the layers use, every side marker */
function preloadIds() {
  const ids: string[] = [SELECTED_ARROW_IMAGE]
  for (const colour of ARROW_COLOURS)
    ids.push(arrowImageId(1, colour), arrowImageId(-1, colour), arrowImageId(2, colour))
  for (const kind of Object.keys(SIDE_KINDS)) ids.push(`${SIDE_IMAGE_PREFIX}${kind}`)
  ids.push(CONE_IMAGE)
  return ids
}

function addMissing(map: MapLibreMap) {
  for (const id of preloadIds()) {
    if (map.hasImage(id)) continue
    const image = imageFor(id)
    if (image) map.addImage(id, image.data, image.options)
  }
}

/** Maps that already listen for missing images (installDirectionImages may run more than once) */
const listening = new WeakSet<MapLibreMap>()

/**
 * Adds the arrow and side images to the map now, and again whenever a style is loaded (a new
 * style has none of them). An arrow in a colour that is not built ahead (the lens dims the arrows,
 * so their colour is `rgba(...)`) is built when the map first asks for it. Safe to call more than once.
 */
export function installDirectionImages(map: MapLibreMap) {
  addMissing(map)
  if (listening.has(map)) return
  listening.add(map)
  map.on('style.load', () => addMissing(map))
  map.on('styleimagemissing', ({ id }) => {
    if (map.hasImage(id)) return
    const image = imageFor(id)
    if (image) map.addImage(id, image.data, image.options)
  })
}
