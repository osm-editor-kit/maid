import type { EngineOptions, LayerOptions } from '@maid/renderer'
import { PORTS } from '../../../tools/ports'

/**
 * Everything that can be switched from the URL, so that experiments and the benchmark
 * run the same build. Example: /?scene=dense&update=setData&fill=full#map=17/52.4845/13.433
 */
export type Config = {
  scene: string
  apiUrl: string
  /** Live OSM data is a manual mode for people. It is refused under automation. */
  live: boolean
  update: EngineOptions['update']
  highlight: EngineOptions['highlight']
  serialUpdates: boolean
  coalesce: boolean
  edit: EngineOptions['edit']
  fill: LayerOptions['fill']
  /** Inspector, controls and status bar. `ui=0` leaves only the map. */
  ui: boolean
  labels: boolean
  icons: boolean
  pins: LayerOptions['pins']
  minDataZoom: number
  tolerance: number
  sourceMaxZoom: number
  /** MapLibre's label fade in ms. 0 makes it place symbols on every frame. */
  fade: number
  /** OSM zoom (256px tiles), like iD's #map= */
  camera?: { zoom: number; lat: number; lng: number }
}

const param = <T extends string>(params: URLSearchParams, name: string, allowed: readonly T[], fallback: T) => {
  const value = params.get(name) as T | null
  return value && allowed.includes(value) ? value : fallback
}

export function readConfig(location: Location): Config {
  const params = new URLSearchParams(location.search)
  const scene = params.get('scene') ?? 'small'
  const live = params.get('live') === '1' && !navigator.webdriver
  const map = location.hash.match(/map=([\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)/)
  return {
    scene,
    live,
    apiUrl: live ? 'https://api.openstreetmap.org' : `http://localhost:${PORTS.mockApi}/s/${scene}`,
    update: param(params, 'update', ['diff', 'setData'] as const, 'diff'),
    highlight: param(params, 'highlight', ['state', 'source'] as const, 'state'),
    serialUpdates: params.get('serial') !== '0',
    coalesce: params.get('coalesce') !== '0',
    edit: param(params, 'edit', ['split', 'inline'] as const, 'split'),
    fill: param(params, 'fill', ['partial', 'full', 'wireframe'] as const, 'partial'),
    ui: params.get('ui') !== '0',
    labels: params.get('labels') !== '0',
    icons: params.get('icons') !== '0',
    pins: param(params, 'pins', ['fit', 'all'] as const, 'fit'),
    minDataZoom: Number(params.get('minDataZoom') ?? 16),
    tolerance: Number(params.get('tolerance') ?? 0),
    sourceMaxZoom: Number(params.get('sourceMaxZoom') ?? 17),
    fade: Number(params.get('fade') ?? 150),
    camera: map ? { zoom: Number(map[1]), lat: Number(map[2]), lng: Number(map[3]) } : undefined,
  }
}
