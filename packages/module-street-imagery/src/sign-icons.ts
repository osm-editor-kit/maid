/**
 * The icons of Mapillary's traffic signs on the map: one SVG per sign value from the sprite source iD and Rapid use
 * (`@rapideditor/mapillary_sprite_source`, MIT), loaded when MapLibre first misses the image of a value
 * (`styleimagemissing`). The package draws signs as dots only (it shows the icons in its own HTML).
 *
 * Imperative MapLibre calls (`addImage`, the event) on purpose: an image per value, only for the values in view, is
 * not something react-map-gl declares (AGENTS.md, stack).
 */
import { mapillaryIconUrl } from '@osm-editor-kit/street-imagery'
import type { Map as MapLibreMap, MapStyleImageMissingEvent } from 'maplibre-gl'
import { useEffect } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'

/** The symbol layer of the icons, above the package's sign dots */
export const SIGN_ICONS_LAYER_ID = 'maid-mapillary-sign-icons'

/** The icons' size on the map in px at icon size 1 (the SVGs are drawn at this size, sharp on a 2× screen) */
const ICON_PX = 28

/** A Mapillary value (`regulatory--maximum-speed-limit-30--g1`): the images the module answers for */
export function isSignImageId(id: string) {
  return /^[a-z-]+--[a-z0-9-]+--[a-z0-9-]+$/.test(id)
}

/** An empty image for a value without an icon: MapLibre asks only once, and the dot under it shows */
const EMPTY = { width: 1, height: 1, data: new Uint8Array(4) }

/** Draws one SVG into the map's images in place of the empty one; the empty one stays when it does not load */
function loadIcon(map: MapLibreMap, id: string) {
  const image = new Image(ICON_PX, ICON_PX)
  image.crossOrigin = 'anonymous'
  image.onload = () => {
    // drawn on a canvas at twice the size: an SVG image of its own has no pixels MapLibre can read at a pixel ratio
    const canvas = document.createElement('canvas')
    canvas.width = ICON_PX * 2
    canvas.height = ICON_PX * 2
    const context = canvas.getContext('2d')
    if (context === null) return
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    // the map may have been removed meanwhile (a new style, the editor closed)
    if (!map.style) return
    if (map.hasImage(id)) map.removeImage(id)
    map.addImage(id, context.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: 2 })
  }
  image.src = mapillaryIconUrl(id)
}

/**
 * Loads a sign's icon when the map first misses it, while the signs are shown. An image is asked for once per value
 * and page: one that loads stays in the map's images, one that does not is an empty image.
 */
export function useSignIcons(mapRef: MapRef | undefined, on: boolean) {
  useEffect(
    function loadMissingSignIcons() {
      const map = mapRef?.getMap()
      if (!map || !on) return
      const asked = new Set<string>()
      const missing = (event: MapStyleImageMissingEvent) => {
        if (!isSignImageId(event.id) || asked.has(event.id)) return
        asked.add(event.id)
        // MapLibre needs an image in this event to draw the frame without a warning; the icon replaces it once loaded
        map.addImage(event.id, EMPTY)
        loadIcon(map, event.id)
      }
      map.on('styleimagemissing', missing)
      return () => {
        map.off('styleimagemissing', missing)
      }
    },
    [mapRef, on],
  )
}
