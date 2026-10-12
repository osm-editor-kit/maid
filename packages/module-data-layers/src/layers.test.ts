import { describe, expect, test } from 'bun:test'
import type { DataLayer, DataLayerConfig, FileLayer } from './config.ts'
import type { GeoJsonData } from './geojson.ts'
import { allowedWhenAutomated, layerDraw, layersOf, visibleLayers } from './layers.ts'

const FEATURES: GeoJsonData = { type: 'FeatureCollection', features: [] }

/** The layer props as the tests read them: the renderer's type is a union of every layer kind */
type Spec = {
  id: string
  type: string
  filter?: unknown
  paint?: Record<string, unknown>
  'source-layer'?: string
}

function layer(overrides: Partial<DataLayer>): DataLayer {
  return {
    id: 'a',
    name: 'A',
    kind: 'geojson',
    url: 'https://example.org/a.geojson',
    color: '#d6007a',
    origin: 'config',
    ...overrides,
  }
}

describe('layerDraw', () => {
  test('a GeoJSON URL is one source with a fill, a line and a circle layer, filtered by geometry', () => {
    const draw = layerDraw(layer({ id: 'g' }))
    expect(draw?.sourceId).toBe('data-layer:g')
    expect(draw?.source).toEqual({ type: 'geojson', data: 'https://example.org/a.geojson' })
    const layers = (draw?.sets.flatMap((set) => set.layers) ?? []) as Spec[]
    expect(layers.map((spec) => [spec.id, spec.type])).toEqual([
      ['data-layer:g:fill', 'fill'],
      ['data-layer:g:line', 'line'],
      ['data-layer:g:circle', 'circle'],
    ])
    expect(layers[0]?.filter).toEqual(['==', ['geometry-type'], 'Polygon'])
    expect(layers[2]?.filter).toEqual(['==', ['geometry-type'], 'Point'])
    // polygons keep an outline through the line layer
    expect(layers[1]?.filter).toEqual([
      'match',
      ['geometry-type'],
      ['LineString', 'Polygon'],
      true,
      false,
    ])
    expect(layers.every((spec) => spec['source-layer'] === undefined)).toBe(true)
  })

  test('a file layer is drawn from its data, not from a URL', () => {
    const draw = layerDraw(layer({ id: 'f', url: '', origin: 'file', data: FEATURES }))
    expect(draw?.source).toEqual({ type: 'geojson', data: FEATURES })
  })

  test('the layers take the colour of the layer', () => {
    const paints = (layerDraw(layer({ color: '#00a6c7' }))?.sets[0]?.layers ?? []).map(
      (spec) => (spec as Spec).paint,
    )
    expect(paints?.[0]).toMatchObject({ 'fill-color': '#00a6c7' })
    expect(paints?.[1]).toMatchObject({ 'line-color': '#00a6c7' })
    expect(paints?.[2]).toMatchObject({ 'circle-color': '#00a6c7' })
  })

  test('vector tiles: one set per source layer, with the source layer in each', () => {
    const draw = layerDraw(
      layer({
        id: 'v',
        kind: 'vector',
        url: 'https://t.example.org/{z}/{x}/{y}.pbf',
        sourceLayers: ['roads', 'water'],
      }),
    )
    expect(draw?.source).toEqual({
      type: 'vector',
      tiles: ['https://t.example.org/{z}/{x}/{y}.pbf'],
    })
    expect(draw?.sets.map((set) => set.sourceLayer)).toEqual(['roads', 'water'])
    expect(draw?.sets[1]?.layers.map((spec) => (spec as Spec).id)).toEqual([
      'data-layer:v/water:fill',
      'data-layer:v/water:line',
      'data-layer:v/water:circle',
    ])
    expect(
      (draw?.sets[1]?.layers ?? []).every((spec) => (spec as Spec)['source-layer'] === 'water'),
    ).toBe(true)
  })

  test('PMTiles: the source is the pmtiles protocol, and the source layers come from the file', () => {
    const draw = layerDraw(
      layer({
        id: 'p',
        kind: 'pmtiles',
        url: 'https://x.org/a.pmtiles',
        sourceLayers: ['buildings'],
      }),
    )
    expect(draw?.source).toEqual({ type: 'vector', url: 'pmtiles://https://x.org/a.pmtiles' })
    expect(draw?.sets.map((set) => set.sourceLayer)).toEqual(['buildings'])
  })

  test('PMTiles whose names are not read yet draws nothing', () => {
    expect(layerDraw(layer({ kind: 'pmtiles', url: 'https://x.org/a.pmtiles' }))).toBeUndefined()
    expect(
      layerDraw(layer({ kind: 'pmtiles', url: 'https://x.org/a.pmtiles', sourceLayers: [] })),
    ).toBeUndefined()
  })
})

describe('layersOf', () => {
  const config: DataLayerConfig[] = [
    {
      id: 'c1',
      name: 'Config one',
      kind: 'geojson',
      url: 'https://a.org/1.geojson',
      color: '#ff7a00',
    },
    { id: 'c2', name: 'Config two', kind: 'geojson', url: 'https://a.org/2.geojson' },
  ]
  const added: DataLayerConfig[] = [
    {
      id: 'user-1',
      name: 'Added',
      kind: 'geojson',
      url: 'https://b.org/x.geojson',
      color: '#7bc31a',
    },
  ]
  const files: FileLayer[] = [{ id: 'file-1', name: 'Local', color: '#7c4dff', data: FEATURES }]

  test('lists the config first, then the added layers, then the files', () => {
    expect(layersOf(config, added, files).map((l) => [l.id, l.origin])).toEqual([
      ['c1', 'config'],
      ['c2', 'config'],
      ['user-1', 'added'],
      ['file-1', 'file'],
    ])
  })

  test('a config layer without a colour gets the next free palette colour', () => {
    const colors = layersOf(config, added, files).map((l) => l.color)
    expect(colors).toEqual(['#ff7a00', '#d6007a', '#7bc31a', '#7c4dff'])
  })

  test('a file layer has no URL', () => {
    expect(layersOf([], [], files)[0]?.url).toBe('')
  })
})

describe('visibility and the automated-run rule', () => {
  const remote = layer({ id: 'remote', origin: 'config', url: 'https://example.org/r.geojson' })
  const local = layer({ id: 'local', origin: 'config', url: 'http://localhost:8080/l.geojson' })
  const stored = layer({ id: 'stored', origin: 'added', url: 'http://localhost:8080/s.geojson' })
  const file = layer({ id: 'file', origin: 'file', url: '', data: FEATURES })
  const all = [remote, local, stored, file]

  test('hidden layers are not drawn, the others are', () => {
    expect(visibleLayers(all, ['remote', 'file'], false).map((l) => l.id)).toEqual([
      'local',
      'stored',
    ])
  })

  test('an automated run loads no stored layer and no remote config layer; local config and files stay', () => {
    expect(visibleLayers(all, [], true).map((l) => l.id)).toEqual(['local', 'file'])
  })

  test('the rule by origin', () => {
    expect(allowedWhenAutomated(stored)).toBe(false)
    expect(allowedWhenAutomated(remote)).toBe(false)
    expect(allowedWhenAutomated(local)).toBe(true)
    expect(allowedWhenAutomated(file)).toBe(true)
  })
})
