import { describe, expect, test } from 'bun:test'
import { iconImagesRequestedAt } from './icon-requests'
import { buildLayers, type LayerOptions, PIN_ZOOM } from './layers'

const options: LayerOptions = {
  dashes: new Map(),
  lat: 52,
  labels: true,
  icons: true,
  pins: 'fit',
}
const layers = buildLayers(options)

describe('the pin images a tile asks for (the worker rule of iconImagesRequestedAt)', () => {
  test('no pin is asked for below the pin layer: the hovered and selected pins do not ask for every point', () => {
    for (const zoom of [11, 14, 15, 16])
      expect(iconImagesRequestedAt(layers, zoom).has('pin-')).toBe(false)
  })

  test('the pin layer starts at PIN_ZOOM (18), and a tile at 17 asks for no pin: the layout floor is the pin zoom', () => {
    expect(PIN_ZOOM).toBe(18)
    for (const zoom of [15, 16, 17])
      expect(iconImagesRequestedAt(layers, zoom).has('pin-')).toBe(false)
    expect(iconImagesRequestedAt(layers, 18).has('pin-')).toBe(true)
  })

  test('the pins of a point are asked for at the pin zoom and not before, at the same zoom they are drawn', () => {
    const pin = layers.find((l) => l.id === 'point-pin')
    expect(pin?.minzoom).toBe(PIN_ZOOM)
    expect(layers.find((l) => l.id === 'point-dot')?.maxzoom).toBe(PIN_ZOOM)
  })

  test('the vertex icons are asked for from the load zoom, not the pins', () => {
    expect(iconImagesRequestedAt(layers, 16).has('icon-')).toBe(true)
    expect(iconImagesRequestedAt(layers, 15).has('icon-')).toBe(false)
  })
})
