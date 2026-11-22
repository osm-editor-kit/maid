/**
 * The images of the direction arrows and side markers, drawn in code (no image files): symbol icons of one
 * marker each (direction.ts). Colours are not tinted, so every colour has its own image.
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
  ARROW_WIDTH,
  arrowImageId,
  HOOK_HEIGHT,
  HOOK_REACH,
  KEEPOUT_IMAGE,
  LINE_ARROW_HEIGHT,
  LINE_ARROW_PREFIX,
  LINE_ARROW_SHAPES,
  LINE_ARROW_SPACING,
  lineArrowImageId,
  type LineArrowShape,
  KEEPOUT_SIZE,
  parseArrowImageId,
  SELECTED_ARROW_HEIGHT,
  SELECTED_ARROW_IMAGE,
  SELECTED_ARROW_PATTERN,
  SIDE_IMAGE_PREFIX,
  SIDE_KINDS,
  SIDE_UNIT,
  sideIconSize,
  type ArrowShape,
  type SideKind,
} from './direction'
import { CONE_GAP, CONE_GAP_WIDE, CONE_IMAGE, CONE_IMAGE_WIDE } from './viewfield'

type Built = { data: ImageData; options: { pixelRatio: number } }

const RATIO = 2
/** iD's arrow is drawn in a 10 x 5 box that is 12 x 6 px on the map (markers in strokeWidth units) */
const ARROW_D = 'M 6,3 L 0,3 L 0,2 L 6,2 L 5,0 L 10,2.5 L 5,5 z'
const ARROW_UNIT = 1.2
/**
 * The viewfield wedge (iD defs.ts `ideditor-viewfield-marker`): 16 units wide, its narrow end at y 14, 1.5 px a unit,
 * so 24 px wide and 21 px long on the map
 */
const CONE_D = 'M 6,14 C 8,13.4 8,13.4 10,14 L 16,3 C 12,0 4,0 0,3 z'
const CONE_UNIT = 1.5
const CONE_WIDTH = 16
const CONE_TIP = 14

function canvas(width: number, height: number) {
  const el = document.createElement('canvas')
  el.width = Math.ceil(width * RATIO)
  el.height = Math.ceil(height * RATIO)
  return el
}

/**
 * An arrow, in the given colours, centred in an image `width` px wide, at `offsetY` from its top.
 * `backward` is the arrow mirrored in its box, so it points against the way; `both` draws both on
 * the same place.
 */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  shape: ArrowShape,
  width: number,
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
  // the arrow's box starts this far from the image's left edge
  const left = (width - 10 * ARROW_UNIT) / 2
  for (const mirrored of pieces) {
    const x = mirrored ? left + 10 * ARROW_UNIT : left
    ctx.setTransform(mirrored ? -s : s, 0, 0, s, RATIO * x, RATIO * offsetY)
    ctx.fill(path)
    ctx.stroke(path)
  }
}

/** The hook of a `reversed` arrow is this wide (px) */
const HOOK_WIDTH = 12

/**
 * The hook of a line whose traffic runs against its drawing direction (direction.ts `reversed`): a stroke along the
 * line in its drawing direction (+x) from `left`, a half turn to one side (`up` in the image, else down), and back
 * with the arrowhead pointing against the line. `line` is the y of the line in px. With `outline`, a dark outline
 * goes under it first.
 */
function drawHook(
  ctx: CanvasRenderingContext2D,
  left: number,
  line: number,
  up: boolean,
  colour: string,
  outline?: string,
) {
  const u = up ? -1 : 1
  const r = (HOOK_REACH - 1.5) / 2
  const turn = left + HOOK_WIDTH - r - 1
  const back = line + u * 2 * r
  const head = left + 4.5
  ctx.setTransform(RATIO, 0, 0, RATIO, 0, 0)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const stroke = (width: number, style: string) => {
    ctx.beginPath()
    ctx.moveTo(left + 0.5, line)
    ctx.lineTo(turn, line)
    // from the line around the turn to the leg that goes back
    ctx.arc(
      turn,
      line + u * r,
      r,
      up ? Math.PI / 2 : -Math.PI / 2,
      up ? -Math.PI / 2 : Math.PI / 2,
      up,
    )
    ctx.lineTo(head, back)
    ctx.strokeStyle = style
    ctx.lineWidth = width
    ctx.stroke()
  }
  const arrowhead = (fill: string, strokeStyle: string, width: number) => {
    ctx.beginPath()
    ctx.moveTo(left, back)
    ctx.lineTo(head + 0.5, back - 2.4)
    ctx.lineTo(head + 0.5, back + 2.4)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.strokeStyle = strokeStyle
    ctx.lineWidth = width
    ctx.stroke()
    ctx.fill()
  }
  if (outline) {
    stroke(3.2, outline)
    arrowhead(outline, outline, 1.6)
  }
  stroke(1.6, colour)
  arrowhead(colour, colour, outline ? 0.1 : 0.3)
}

/** The arrow of a one-way line, in the colour of its `ac` (or the default) */
function arrowImage(shape: ArrowShape, colour: string) {
  if (shape === 'reversed') {
    const el = canvas(ARROW_WIDTH, HOOK_HEIGHT)
    const ctx = el.getContext('2d')!
    drawHook(ctx, (ARROW_WIDTH - HOOK_WIDTH) / 2, HOOK_HEIGHT / 2, true, colour)
    return { data: ctx.getImageData(0, 0, el.width, el.height), options: { pixelRatio: RATIO } }
  }
  const el = canvas(ARROW_WIDTH, ARROW_HEIGHT)
  const ctx = el.getContext('2d')!
  drawArrow(ctx, shape, ARROW_WIDTH, 0, colour, colour, 0.3)
  return { data: ctx.getImageData(0, 0, el.width, el.height), options: { pixelRatio: RATIO } }
}

/**
 * A module's line arrow (direction.ts LINE_ARROW_PREFIX) as a line pattern: white with a dark outline, one arrow in
 * the middle of a tile LINE_ARROW_SPACING px long. The line runs through the middle of the tile; the hook of
 * `reversed` turns to the left of the line's direction (the bottom of the tile), `reversed-right` to its right.
 */
function lineArrowImage(shape: LineArrowShape) {
  const el = canvas(LINE_ARROW_SPACING, LINE_ARROW_HEIGHT)
  const ctx = el.getContext('2d')!
  const middle = LINE_ARROW_HEIGHT / 2
  const outline = '#1c1c1c'
  if (shape === 'reversed' || shape === 'reversed-right') {
    // MapLibre lays a line pattern with the top of the image on the right of the line's direction
    drawHook(
      ctx,
      (LINE_ARROW_SPACING - HOOK_WIDTH) / 2,
      middle,
      shape === 'reversed-right',
      '#fff',
      outline,
    )
  } else {
    drawStraight(
      ctx,
      (LINE_ARROW_SPACING - HOOK_WIDTH) / 2,
      middle,
      shape === 'both',
      '#fff',
      outline,
    )
  }
  return { data: ctx.getImageData(0, 0, el.width, el.height), options: { pixelRatio: RATIO } }
}

/**
 * A straight arrow on a module's line, drawn like the hook: one stroke HOOK_WIDTH px long along the line with its
 * arrowhead at the end (+x, the line's direction), with `both` one at each end.
 */
function drawStraight(
  ctx: CanvasRenderingContext2D,
  left: number,
  line: number,
  both: boolean,
  colour: string,
  outline: string,
) {
  const right = left + HOOK_WIDTH
  ctx.setTransform(RATIO, 0, 0, RATIO, 0, 0)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const draw = (fill: string, width: number, headWidth: number) => {
    ctx.beginPath()
    ctx.moveTo(both ? left + 3 : left + 0.5, line)
    ctx.lineTo(right - 3, line)
    ctx.strokeStyle = fill
    ctx.lineWidth = width
    ctx.stroke()
    const heads: [number, number][] = [[right, right - 4]]
    if (both) heads.push([left, left + 4])
    for (const [tip, base] of heads) {
      ctx.beginPath()
      ctx.moveTo(tip, line)
      ctx.lineTo(base, line - 2.4)
      ctx.lineTo(base, line + 2.4)
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.lineWidth = headWidth
      ctx.stroke()
      ctx.fill()
    }
  }
  draw(outline, 3.2, 1.6)
  draw(colour, 1.6, 0.1)
}

/**
 * The arrow of the selected way: white with a dark outline, so it reads on the selection's glow.
 * `width` is ARROW_WIDTH for the icon, ARROW_SPACING for the line pattern.
 */
function selectedArrowImage(width: number) {
  const el = canvas(width, SELECTED_ARROW_HEIGHT)
  const ctx = el.getContext('2d')!
  drawArrow(ctx, 'forward', width, (SELECTED_ARROW_HEIGHT - ARROW_HEIGHT) / 2, '#fff', '#333', 0.5)
  return { data: ctx.getImageData(0, 0, el.width, el.height), options: { pixelRatio: RATIO } }
}

/** The vertices' keep-out square: transparent, only its size counts (layers.ts arrow-keepout) */
function keepoutImage() {
  const el = canvas(KEEPOUT_SIZE, KEEPOUT_SIZE)
  const ctx = el.getContext('2d')!
  return { data: ctx.getImageData(0, 0, el.width, el.height), options: { pixelRatio: RATIO } }
}

/**
 * A side marker in colour, one marker in its icon. Units run along the way (x) and to its right (y),
 * with the line at the middle of the image.
 */
function sideImage(kind: SideKind) {
  const { width, height } = sideIconSize(kind)
  const el = canvas(width, height)
  const ctx = el.getContext('2d')!
  const s = RATIO * SIDE_UNIT
  // the line runs through the middle of the canvas. MapLibre lays an icon on a line with its top on the right-hand
  // side, so the marker is mirrored (units to the right are up)
  ctx.setTransform(s, 0, 0, -s, (RATIO * width) / 2, (RATIO * height) / 2)
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
 * image at its bottom), and the narrow end of the wedge sits `gap` px above it: 3 px as in iD for a plain circle,
 * more for a disc with an icon or a pin's head (viewfield.ts). iD's colours: fill #333 and white stroke, both at
 * 0.75. iD has no other colours for viewfields, so the same image is used in the light and the dark map.
 */
function coneImage(gap: number) {
  const height = CONE_TIP * CONE_UNIT + gap
  const el = canvas(CONE_WIDTH * CONE_UNIT, height)
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
  } else if (id.startsWith(LINE_ARROW_PREFIX)) {
    const shape = id.slice(LINE_ARROW_PREFIX.length) as LineArrowShape
    if (LINE_ARROW_SHAPES.includes(shape)) image = lineArrowImage(shape)
  } else if (id === SELECTED_ARROW_IMAGE) {
    image = selectedArrowImage(ARROW_WIDTH)
  } else if (id === SELECTED_ARROW_PATTERN) {
    image = selectedArrowImage(ARROW_SPACING)
  } else if (id === KEEPOUT_IMAGE) {
    image = keepoutImage()
  } else if (id.startsWith(SIDE_IMAGE_PREFIX)) {
    const spec = SIDE_KINDS[id.slice(SIDE_IMAGE_PREFIX.length)]
    if (spec) image = sideImage(spec)
  } else if (id === CONE_IMAGE) {
    image = coneImage(CONE_GAP)
  } else if (id === CONE_IMAGE_WIDE) {
    image = coneImage(CONE_GAP_WIDE)
  }
  if (image) built.set(id, image)
  return image
}

/** The images that are built ahead: every arrow in the colours the layers use, every side marker */
function preloadIds() {
  const ids: string[] = [SELECTED_ARROW_IMAGE, SELECTED_ARROW_PATTERN, KEEPOUT_IMAGE]
  for (const colour of ARROW_COLOURS)
    ids.push(arrowImageId(1, colour), arrowImageId(-1, colour), arrowImageId(2, colour))
  for (const shape of LINE_ARROW_SHAPES) ids.push(lineArrowImageId(shape))
  for (const kind of Object.keys(SIDE_KINDS)) ids.push(`${SIDE_IMAGE_PREFIX}${kind}`)
  ids.push(CONE_IMAGE, CONE_IMAGE_WIDE)
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
