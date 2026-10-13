import { describe, expect, test } from 'bun:test'
import { iconImagesRequestedAt } from './icon-requests'
import { buildLayers, type LayerOptions } from './layers'

const options: LayerOptions = {
  fill: 'partial',
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

  test('the pin layer lays out from floor(17.5) = 17, so a tile at 17 asks for the pins (the layout floor)', () => {
    expect(iconImagesRequestedAt(layers, 16).has('pin-')).toBe(false)
    expect(iconImagesRequestedAt(layers, 17).has('pin-')).toBe(true)
  })

  test('the vertex icons are asked for from the load zoom, not the pins', () => {
    expect(iconImagesRequestedAt(layers, 16).has('icon-')).toBe(true)
    expect(iconImagesRequestedAt(layers, 15).has('icon-')).toBe(false)
  })
})
