/**
 * The look of the handles the shapes draw themselves (Extrude, Resize): a grip, a short bar with three lines across it,
 * for a handle that takes a side, and a small square for a corner of Resize's box. Round dots stay what they are on
 * the rest of the map: nodes. The images are made once on a canvas and put on the map with `addImage`, and added again
 * when a new style asks for one (`styleimagemissing`); a symbol layer turns the grip along its side (`icon-rotate`).
 * The `addImage` call is imperative MapLibre, as the bike infrastructure's signs: react-map-gl has no image component.
 */
import { useEffect } from 'react'
import { useMap } from 'react-map-gl/maplibre'
import type { Pt } from './vector.ts'

/** The image ids, for a symbol layer's `icon-image` */
export const GRIP_IMAGE = 'maid-shapes-grip'
export const CORNER_IMAGE = 'maid-shapes-corner'

const COLOUR = '#2563eb'
/** Device pixels per CSS pixel the images are drawn at: sharp on a phone */
const RATIO = 2

/** The grip: 24 by 12 CSS pixels, white with a blue rim, three blue lines across the middle */
function drawGrip(context: CanvasRenderingContext2D) {
  const w = 24
  const h = 12
  context.scale(RATIO, RATIO)
  context.beginPath()
  context.roundRect(1, 1, w - 2, h - 2, (h - 2) / 2)
  context.fillStyle = '#ffffff'
  context.fill()
  context.lineWidth = 2
  context.strokeStyle = COLOUR
  context.stroke()
  context.lineWidth = 1.5
  context.lineCap = 'round'
  for (const dx of [-3.5, 0, 3.5]) {
    context.beginPath()
    context.moveTo(w / 2 + dx, 3.5)
    context.lineTo(w / 2 + dx, h - 3.5)
    context.stroke()
  }
  return { width: w, height: h }
}

/** The corner: a 12 by 12 CSS pixel square, white with a blue rim, as in a graphics program */
function drawCorner(context: CanvasRenderingContext2D) {
  const s = 12
  context.scale(RATIO, RATIO)
  context.fillStyle = '#ffffff'
  context.fillRect(1, 1, s - 2, s - 2)
  context.lineWidth = 2
  context.strokeStyle = COLOUR
  context.strokeRect(1, 1, s - 2, s - 2)
  return { width: s, height: s }
}

const DRAWN: Record<string, { draw: typeof drawGrip; size: { width: number; height: number } }> = {
  [GRIP_IMAGE]: { draw: drawGrip, size: { width: 24, height: 12 } },
  [CORNER_IMAGE]: { draw: drawCorner, size: { width: 12, height: 12 } },
}

const made = new Map<string, ImageData>()

/** The image's pixels, made on first use; undefined where there is no canvas */
function imageOf(id: string): ImageData | undefined {
  const cached = made.get(id)
  if (cached) return cached
  const spec = DRAWN[id]
  if (!spec || typeof document === 'undefined') return undefined
  const canvas = document.createElement('canvas')
  canvas.width = spec.size.width * RATIO
  canvas.height = spec.size.height * RATIO
  const context = canvas.getContext('2d')
  if (!context) return undefined
  spec.draw(context)
  const data = context.getImageData(0, 0, canvas.width, canvas.height)
  made.set(id, data)
  return data
}

/** Puts the handle images on the map while the component that draws handles is mounted */
export function useHandleImages() {
  const { current: ref } = useMap()
  useEffect(() => {
    const map = ref?.getMap()
    if (!map) return
    const add = (id: string) => {
      const data = imageOf(id)
      if (data && !map.hasImage(id)) map.addImage(id, data, { pixelRatio: RATIO })
    }
    for (const id of Object.keys(DRAWN)) add(id)
    const missing = (event: { id: string }) => {
      if (event.id in DRAWN) add(event.id)
    }
    map.on('styleimagemissing', missing)
    return () => {
      map.off('styleimagemissing', missing)
    }
  }, [ref])
}

/**
 * The `icon-rotate` that lays the grip along a direction on the map (degrees clockwise from the image's own long axis,
 * which points east), for `icon-rotation-alignment: map`.
 * @param   dir - The direction in metres, x east and y north
 * @return  Degrees
 */
export function gripRotation(dir: Pt): number {
  return (-Math.atan2(dir.y, dir.x) * 180) / Math.PI
}
