/**
 * The images of the direction glyphs and side markers, drawn in code (no image files): symbol icons of one marker
 * each (direction.ts), and the line patterns of the bicycle lens. The glyphs' paths come from glyph.ts.
 *
 * Imperative on purpose: MapLibre has no declarative way to give a style generated images, and
 * an image has to be in place before a tile is laid out, or the tile never shows it. This is the
 * only place in the renderer that adds images. The engine calls `installDirectionImages` on attach.
 * It is re-run on every new style, since a style change drops all images.
 */
import type { Map as MapLibreMap } from 'maplibre-gl'
import {
  GLYPH_BOX_HEIGHT,
  GLYPH_BOX_WIDTH,
  GLYPH_MIN_SCALE,
  glyphImageIds,
  KEEPOUT_IMAGE,
  KEEPOUT_SIZE,
  LINE_GLYPH_HEIGHT,
  LINE_GLYPH_KINDS,
  LINE_GLYPH_PREFIX,
  LINE_GLYPH_SPACING,
  lineGlyphImageId,
  type LineGlyphKind,
  parseGlyphImageId,
  SELECTED_ARROW_HEIGHT,
  SELECTED_ARROW_PATTERN,
  SELECTED_ARROW_SPACING,
  SIDE_IMAGE_PREFIX,
  SIDE_KINDS,
  SIDE_UNIT,
  sideIconSize,
  type SideKind,
} from './direction'
import {
  GLYPH_EDGE,
  glyphPaths,
  type GlyphPath,
  type GlyphShape,
  type GlyphState,
  type GlyphTone,
} from './glyph'
import { CONE_GAP, CONE_GAP_WIDE, CONE_IMAGE, CONE_IMAGE_WIDE } from './viewfield'

type Built = { data: ImageData; options: { pixelRatio: number } }

const RATIO = 2
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

/** Paints a glyph's paths centred at (cx, cy) in px, `scale` times its large size: each part's edge, then its fill */
function paintGlyph(
  ctx: CanvasRenderingContext2D,
  paths: readonly GlyphPath[],
  cx: number,
  cy: number,
  scale: number,
) {
  ctx.setTransform(RATIO * scale, 0, 0, RATIO * scale, RATIO * cx, RATIO * cy)
  ctx.lineJoin = 'round'
  ctx.lineWidth = GLYPH_EDGE
  for (const part of paths) {
    const shape = new Path2D(part.d)
    ctx.strokeStyle = part.edge
    ctx.stroke(shape)
  }
  for (const part of paths) {
    ctx.fillStyle = part.fill
    ctx.fill(new Path2D(part.d))
  }
}

/** A glyph of the map (direction.ts glyphImageId), at its large size; layers.ts scales it with the line */
function glyphImage(kind: GlyphShape, state: GlyphState, tone: GlyphTone) {
  const el = canvas(GLYPH_BOX_WIDTH, GLYPH_BOX_HEIGHT)
  const ctx = el.getContext('2d')!
  paintGlyph(ctx, glyphPaths(kind, state, tone), GLYPH_BOX_WIDTH / 2, GLYPH_BOX_HEIGHT / 2, 1)
  return { data: ctx.getImageData(0, 0, el.width, el.height), options: { pixelRatio: RATIO } }
}

/**
 * A module's line glyph (direction.ts LINE_GLYPH_PREFIX) as a line pattern: the rest glyph at the small size in the
 * middle of a tile LINE_GLYPH_SPACING px long. MapLibre lays a pattern along the line's direction, so east is the
 * drawing direction, as in every glyph.
 */
function lineGlyphImage(kind: LineGlyphKind) {
  const el = canvas(LINE_GLYPH_SPACING, LINE_GLYPH_HEIGHT)
  const ctx = el.getContext('2d')!
  paintGlyph(
    ctx,
    glyphPaths(kind, 'rest'),
    LINE_GLYPH_SPACING / 2,
    LINE_GLYPH_HEIGHT / 2,
    GLYPH_MIN_SCALE,
  )
  return { data: ctx.getImageData(0, 0, el.width, el.height), options: { pixelRatio: RATIO } }
}

/**
 * The selected way's direction for the relations map (a line pattern, SELECTED_ARROW_PATTERN): the drawing triangle,
 * white with a dark edge, one per tile.
 */
function selectedArrowPattern() {
  const el = canvas(SELECTED_ARROW_SPACING, SELECTED_ARROW_HEIGHT)
  const ctx = el.getContext('2d')!
  paintGlyph(
    ctx,
    glyphPaths('drawn', 'active', 'light'),
    SELECTED_ARROW_SPACING / 2,
    SELECTED_ARROW_HEIGHT / 2,
    0.9,
  )
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
  const glyph = parseGlyphImageId(id)
  if (glyph) {
    image = glyphImage(glyph.kind, glyph.state, glyph.tone)
  } else if (id.startsWith(LINE_GLYPH_PREFIX)) {
    const kind = id.slice(LINE_GLYPH_PREFIX.length) as LineGlyphKind
    if (LINE_GLYPH_KINDS.includes(kind)) image = lineGlyphImage(kind)
  } else if (id === SELECTED_ARROW_PATTERN) {
    image = selectedArrowPattern()
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

/** The images that are built ahead: every glyph, every line glyph, every side marker */
function preloadIds() {
  const ids: string[] = [SELECTED_ARROW_PATTERN, KEEPOUT_IMAGE, ...glyphImageIds()]
  for (const kind of LINE_GLYPH_KINDS) ids.push(lineGlyphImageId(kind))
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
 * Adds the glyph and side images to the map now, and again whenever a style is loaded (a new style has none of them),
 * and any of ours the map asks for that is missing. Safe to call more than once.
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
