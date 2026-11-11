/**
 * The images of the traffic signs on the map: one image per `traffic_sign` value, the signs of the value stacked as on
 * the post (the main sign above its additional signs, `DE:239,1022-10`). The SVGs are the bundled ones of the traffic
 * sign field (`@osm-editor-kit/osm-traffic-sign-field`, no request to OSM infrastructure); a value whose signs have no
 * SVG gets no image, and its sign point is not drawn.
 *
 * MapLibre needs an image before a layer names it (an image added later is not used by the symbols placed already), so
 * the component asks for the images of the values in the data first, adds them to the map, and only then puts the
 * sign points that name them into their source (BikeInfraOnMap).
 */
import {
  type Country,
  loadCatalogue,
  loadSvgUrl,
  parseSignValue,
  resolveCountry,
} from '@osm-editor-kit/osm-traffic-sign-field'

/** The country of a value without a prefix (`240`): the editor is a German one for now */
const FALLBACK_COUNTRY: Country = 'DE'
/** Height of the main sign on the map, in CSS px; an additional sign is as wide as the main sign */
const SIGN_HEIGHT = 22
/** Drawn at this pixel ratio, so the image is sharp on a high-density screen */
export const SIGN_PIXEL_RATIO = 2

/** The name of the map image of a sign value */
export function signImageId(value: string) {
  return `bike-sign:${value}`
}

function loadImage(url: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(undefined)
    image.src = url
  })
}

/** The image of a value as pixels for `map.addImage`, or undefined when none of its signs has an SVG */
export async function signImage(value: string): Promise<ImageData | undefined> {
  const country = resolveCountry(value, FALLBACK_COUNTRY)
  const catalogue = await loadCatalogue(country)
  const entries = parseSignValue(value, country, catalogue).filter((entry) => entry.sign)
  const images: HTMLImageElement[] = []
  for (const entry of entries) {
    const url = await loadSvgUrl(country, entry.part)
    const image = url ? await loadImage(url) : undefined
    if (image && image.naturalWidth > 0 && image.naturalHeight > 0) images.push(image)
  }
  const first = images[0]
  if (!first) return undefined
  const ratio = SIGN_PIXEL_RATIO
  const width = Math.round(((SIGN_HEIGHT * first.naturalWidth) / first.naturalHeight) * ratio)
  const heights = images.map((image) =>
    Math.round((width * image.naturalHeight) / image.naturalWidth),
  )
  const gap = Math.round(1 * ratio)
  const height = heights.reduce((sum, h) => sum + h, 0) + gap * (images.length - 1)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return undefined
  let y = 0
  images.forEach((image, i) => {
    const h = heights[i] ?? 0
    context.drawImage(image, 0, y, width, h)
    y += h + gap
  })
  return context.getImageData(0, 0, width, height)
}
