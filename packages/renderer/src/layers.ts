/**
 * The MapLibre layers that draw OSM data in iD's look. Pure data: no map calls here.
 * Paint values come from feature properties set by the builder (build.ts).
 */
import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl'

export const SOURCES = {
  areas: 'osm-areas',
  lines: 'osm-lines',
  points: 'osm-points',
  vertices: 'osm-vertices',
  highlight: 'osm-highlight',
} as const

export type LayerOptions = {
  /** iD's fill setting. 'partial' shows a band along the inside edge of areas. */
  fill: 'partial' | 'full' | 'wireframe'
  /** Dash patterns seen so far (build.ts dashPatterns) */
  dashes: Map<string, number[]>
  /** Latitude of the scene, for converting metres to pixels */
  lat: number
  /**
   * How hover and selection are shown.
   * 'source': a small extra source that holds only the highlighted features.
   * 'state': feature state on the big sources; halo layers cover every feature at zero opacity.
   */
  highlight: 'source' | 'state'
  labels: boolean
  icons: boolean
}

/**
 * iD switches to thinner lines at "low zoom": up to OSM zoom ~17.2 at Berlin's latitude
 * (renderer/map.js). MapLibre zoom is OSM zoom minus one.
 */
function lowZoomThreshold(lat: number) {
  const a = Math.min(Math.abs(lat), 60)
  return 18.5 - (a / 60) * 1.5 - 1
}

const HOVER = '#f6634f'

export function buildLayers(options: LayerOptions): LayerSpecification[] {
  const low = lowZoomThreshold(options.lat)
  const byZoom = (lowProp: string, prop: string): ExpressionSpecification => [
    'step', ['zoom'], ['get', lowProp], low, ['get', prop],
  ] // prettier-ignore

  const dashMatch = (prop: string): ExpressionSpecification => {
    const cases: unknown[] = []
    for (const [key, pattern] of options.dashes) cases.push(key, ['literal', pattern])
    if (cases.length === 0) return ['literal', [1, 0]]
    return ['match', ['get', prop], ...cases, ['literal', [1, 0]]] as unknown as ExpressionSpecification
  }

  const layers: LayerSpecification[] = []

  // --- Areas -------------------------------------------------------------
  if (options.fill === 'full') {
    layers.push({
      id: 'area-fill',
      type: 'fill',
      source: SOURCES.areas,
      filter: ['has', 'fc'],
      paint: { 'fill-color': ['get', 'fc'], 'fill-antialias': false },
    })
  }
  if (options.fill === 'partial') {
    // Band along the inside edge: a line offset to the inside by half its width. Its width is
    // capped by the area's own size so that it never spills over the far edge of small areas.
    const metresPerPixelAtZ0 = (40075016.686 * Math.cos((options.lat * Math.PI) / 180)) / 512
    const band = (zoom: number): ExpressionSpecification => [
      'min', ['get', 'fw'], ['*', ['get', 'r'], 2 ** zoom / metresPerPixelAtZ0],
    ] // prettier-ignore
    const stops = (scale: number) => {
      const out: unknown[] = []
      for (let z = 12; z <= 24; z++) out.push(z, ['*', scale, band(z)])
      return out
    }
    layers.push({
      id: 'area-fill-partial',
      type: 'line',
      source: SOURCES.areas,
      filter: ['has', 'fc'],
      layout: { 'line-join': 'round' },
      paint: {
        // Opaque colour plus layer opacity: where the band overlaps itself in corners and
        // narrow shapes it does not get darker, as it would with a translucent colour.
        'line-color': ['get', 'fo'],
        'line-layer-opacity': 0.3,
        'line-width': ['interpolate', ['exponential', 2], ['zoom'], ...stops(1)] as ExpressionSpecification,
        'line-offset': ['interpolate', ['exponential', 2], ['zoom'], ...stops(0.5)] as ExpressionSpecification,
      },
    })
  }
  layers.push(
    {
      id: 'area-stroke',
      type: 'line',
      source: SOURCES.areas,
      filter: ['all', ['has', 'sc'], ['!', ['has', 'sd']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'sc'], 'line-width': ['get', 'sw'] },
    },
    {
      id: 'area-stroke-dashed',
      type: 'line',
      source: SOURCES.areas,
      filter: ['all', ['has', 'sc'], ['has', 'sd']],
      paint: { 'line-color': ['get', 'sc'], 'line-width': ['get', 'sw'], 'line-dasharray': dashMatch('sd') },
    },
  )

  // --- Hover and selection halo, under the lines like iD's shadow paths ---
  if (options.highlight === 'source') {
    layers.push({
      id: 'highlight-halo',
      type: 'line',
      source: SOURCES.highlight,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': HOVER,
        'line-width': byZoom('hwl', 'hw'),
        'line-opacity': ['match', ['get', 'state'], 'selected', 0.7, 0.4],
      },
    })
  } else {
    const opacity: ExpressionSpecification = [
      'case',
      ['boolean', ['feature-state', 'selected'], false], 0.7,
      ['boolean', ['feature-state', 'hover'], false], 0.4,
      0,
    ] // prettier-ignore
    layers.push(
      {
        id: 'highlight-halo-areas',
        type: 'line',
        source: SOURCES.areas,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': HOVER, 'line-width': ['get', 'hw'], 'line-opacity': opacity },
      },
      {
        id: 'highlight-halo',
        type: 'line',
        source: SOURCES.lines,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': HOVER, 'line-width': byZoom('hwl', 'hw'), 'line-opacity': opacity },
      },
    )
  }

  // --- Lines: three stacking bands, each with casing below stroke ---------
  for (const band of [-1, 0, 1]) {
    const inBand: ExpressionSpecification = ['==', ['get', 'b'], band]
    const parts = [
      { part: 'casing', color: 'cc', width: 'cw', widthLow: 'cwl', dash: 'cd' },
      { part: 'stroke', color: 'sc', width: 'sw', widthLow: 'swl', dash: 'sd' },
    ]
    for (const p of parts) {
      layers.push(
        {
          id: `line-${p.part}-${band}`,
          type: 'line',
          source: SOURCES.lines,
          filter: ['all', inBand, ['has', p.color], ['!', ['has', p.dash]]],
          layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'z'] },
          paint: { 'line-color': ['get', p.color], 'line-width': byZoom(p.widthLow, p.width) },
        },
        {
          id: `line-${p.part}-dashed-${band}`,
          type: 'line',
          source: SOURCES.lines,
          filter: ['all', inBand, ['has', p.color], ['has', p.dash]],
          layout: { 'line-join': 'round', 'line-sort-key': ['get', 'z'] },
          paint: {
            'line-color': ['get', p.color],
            'line-width': byZoom(p.widthLow, p.width),
            'line-dasharray': dashMatch(p.dash),
          },
        },
      )
    }
  }

  if (options.icons) {
    layers.push({
      id: 'line-oneway',
      type: 'symbol',
      source: SOURCES.lines,
      filter: ['has', 'oneway'],
      minzoom: 15,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 35,
        'icon-image': 'maid-oneway',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-rotation-alignment': 'map',
      },
    })
  }

  // --- Vertices ------------------------------------------------------------
  const vertexRadius = (lowR: number, r: number): ExpressionSpecification => ['step', ['zoom'], lowR, 16, r]
  if (options.highlight === 'source') {
    layers.push({
      id: 'highlight-vertex-halo',
      type: 'circle',
      source: SOURCES.highlight,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': vertexRadius(6, 7.5),
        'circle-color': HOVER,
        'circle-opacity': ['match', ['get', 'state'], 'selected', 0.7, 'hover', 0.5, 0],
      },
    })
  }
  layers.push(
    {
      id: 'vertex',
      type: 'circle',
      source: SOURCES.vertices,
      paint: {
        'circle-radius': vertexRadius(2.5, 3.5),
        'circle-color': ['case', ['==', ['get', 's'], 1], '#bbb', '#fff'],
        'circle-stroke-color': '#666',
        'circle-stroke-width': 1,
      },
    },
    {
      id: 'vertex-tagged',
      type: 'circle',
      source: SOURCES.vertices,
      filter: ['==', ['get', 't'], 1],
      paint: { 'circle-radius': vertexRadius(1, 1.5), 'circle-color': '#000' },
    },
  )
  if (options.highlight === 'source') {
    // the shape points of a selected way
    layers.push({
      id: 'highlight-vertex',
      type: 'circle',
      source: SOURCES.highlight,
      filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'state'], 'shape']],
      paint: {
        'circle-radius': vertexRadius(2.5, 3.5),
        'circle-color': '#fff',
        'circle-stroke-color': '#666',
        'circle-stroke-width': 1,
      },
    })
  }

  // --- Points ----------------------------------------------------------------
  if (options.icons) {
    layers.push(
      {
        id: 'point-pin',
        type: 'symbol',
        source: SOURCES.points,
        layout: {
          'icon-image': 'maid-pin',
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'symbol-z-order': 'viewport-y',
        },
      },
      {
        id: 'point-icon',
        type: 'symbol',
        source: SOURCES.points,
        filter: ['has', 'icon'],
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-anchor': 'center',
          'icon-offset': [0, -15],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'symbol-z-order': 'viewport-y',
        },
      },
    )
  } else {
    layers.push({
      id: 'point-dot',
      type: 'circle',
      source: SOURCES.points,
      paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': '#444', 'circle-stroke-width': 1 },
    })
  }

  // --- Labels ----------------------------------------------------------------
  if (options.labels) {
    const text = {
      'text-font': ['Open Sans Semibold'],
      'text-field': ['get', 'name'] as ExpressionSpecification,
      'text-size': 12,
    }
    const paint = { 'text-color': '#333', 'text-halo-color': 'rgba(255,255,255,0.7)', 'text-halo-width': 2.5 }
    layers.push(
      {
        id: 'label-line',
        type: 'symbol',
        source: SOURCES.lines,
        filter: ['has', 'name'],
        layout: { ...text, 'symbol-placement': 'line', 'symbol-spacing': 400, 'text-max-angle': 30 },
        paint,
      },
      {
        id: 'label-area',
        type: 'symbol',
        source: SOURCES.areas,
        filter: ['all', ['has', 'name'], ['>', ['get', 'r'], 6]],
        layout: { ...text, 'text-max-width': 8 },
        paint,
      },
      {
        id: 'label-point',
        type: 'symbol',
        source: SOURCES.points,
        filter: ['has', 'name'],
        layout: { ...text, 'text-size': 10, 'text-anchor': 'top', 'text-offset': [0, 0.3] },
        paint,
      },
    )
  }
  return layers
}

/** Layers a pointer can hit, in iD's picking priority: vertex, point, line, area */
export function interactiveLayerIds(layers: LayerSpecification[]) {
  const wanted = /^(vertex|point-pin|point-dot|line-(casing|stroke)(-dashed)?--?\d|area-stroke|area-fill)/
  return layers.filter((l) => wanted.test(l.id)).map((l) => l.id)
}
