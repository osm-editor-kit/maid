/**
 * The MapLibre layers that draw OSM data in iD's look. Pure data: no map calls here.
 * Paint values come from feature properties set by the builder (build.ts).
 */
import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl'
import {
  ARROW_DEFAULT_COLOUR,
  ARROW_HEIGHT,
  ARROW_IMAGE_PREFIX,
  SELECTED_ARROW_HEIGHT,
  SELECTED_ARROW_IMAGE,
  SIDE_HEIGHT,
  SIDE_IMAGE_PREFIX,
} from './direction'

export const SOURCES = {
  areas: 'osm-areas',
  lines: 'osm-lines',
  points: 'osm-points',
  vertices: 'osm-vertices',
  highlight: 'osm-highlight',
} as const

/**
 * Small twin sources for the features that are being changed right now. While a vertex is
 * dragged, its ways live here, so each step re-tiles a handful of features and not the scene.
 */
export const EDIT_SOURCES = {
  areas: 'osm-areas-edit',
  lines: 'osm-lines-edit',
  points: 'osm-points-edit',
  vertices: 'osm-vertices-edit',
} as const
const EDIT_OF: Record<string, string> = {
  [SOURCES.areas]: EDIT_SOURCES.areas,
  [SOURCES.lines]: EDIT_SOURCES.lines,
  [SOURCES.points]: EDIT_SOURCES.points,
  [SOURCES.vertices]: EDIT_SOURCES.vertices,
}

export type LayerOptions = {
  /** iD's fill setting. 'partial' shows a band along the inside edge of areas. */
  fill: 'partial' | 'full' | 'wireframe'
  /** Dash patterns seen so far (build.ts dashPatterns) */
  dashes: Map<string, number[]>
  /** Latitude of the scene, for converting metres to pixels */
  lat: number
  labels: boolean
  icons: boolean
  /** 'fit': pins where there is room (dots always). 'all': every pin, overlapping, like iD when it does not hide them. */
  pins: 'fit' | 'all'
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
  const layers = buildMainLayers(options)
  // Each layer is followed by its twin on the edit source, so stacking stays the same.
  // The original of a feature that is being edited is hidden through feature state, which
  // costs nothing; taking it out of the big source would re-tile the whole source.
  const editing: ExpressionSpecification = ['boolean', ['feature-state', 'editing'], false]
  const OPACITY: Record<string, string[]> = {
    line: ['line-opacity'],
    fill: ['fill-opacity'],
    circle: ['circle-opacity', 'circle-stroke-opacity'],
    symbol: ['icon-opacity', 'text-opacity'],
  }
  return layers.flatMap((layer) => {
    const editSource = 'source' in layer ? EDIT_OF[layer.source as string] : undefined
    if (!editSource) return [layer]
    const paint: Record<string, unknown> = { ...(layer.paint as Record<string, unknown>) }
    for (const prop of OPACITY[layer.type] ?? [])
      paint[prop] = ['case', editing, 0, paint[prop] ?? 1]
    const original = { ...layer, paint } as LayerSpecification
    return [
      original,
      { ...layer, id: `${layer.id}--edit`, source: editSource } as LayerSpecification,
    ]
  })
}

function buildMainLayers(options: LayerOptions): LayerSpecification[] {
  const low = lowZoomThreshold(options.lat)
  const byZoom = (lowProp: string, prop: string): ExpressionSpecification => [
    'step', ['zoom'], ['get', lowProp], low, ['get', prop],
  ] // prettier-ignore

  const dashMatch = (prop: string): ExpressionSpecification => {
    const cases: unknown[] = []
    for (const [key, pattern] of options.dashes) cases.push(key, ['literal', pattern])
    if (cases.length === 0) return ['literal', [1, 0]]
    return [
      'match',
      ['get', prop],
      ...cases,
      ['literal', [1, 0]],
    ] as unknown as ExpressionSpecification
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
      // Mitred, so the band reaches into the corners of the area. A round join leaves the
      // corners empty, which shows as soon as the band is wider than a small building.
      layout: { 'line-join': 'miter', 'line-miter-limit': 4 },
      paint: {
        // Opaque colour plus layer opacity: where the band overlaps itself in corners and
        // narrow shapes it does not get darker, as it would with a translucent colour.
        'line-color': ['get', 'fo'],
        'line-layer-opacity': 0.3,
        'line-width': [
          'interpolate',
          ['exponential', 2],
          ['zoom'],
          ...stops(1),
        ] as ExpressionSpecification,
        'line-offset': [
          'interpolate',
          ['exponential', 2],
          ['zoom'],
          ...stops(0.5),
        ] as ExpressionSpecification,
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
      paint: {
        'line-color': ['get', 'sc'],
        'line-width': ['get', 'sw'],
        'line-dasharray': dashMatch('sd'),
      },
    },
  )

  // --- Hover and selection halo, under the lines like iD's shadow paths ---
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

  // Direction arrows and side markers, as iD draws them over the lines (svg/lines.js): one arrow
  // every 36 px, side markers every 30 px. They are line patterns, not symbols: MapLibre drops
  // symbols on some crowded lines, a pattern is drawn on every line. Images come from
  // direction-images.ts; each image is as high as the layer's line-width, so it is not stretched.
  if (options.icons) {
    // the arrow's shape from `oneway` (1 forward, -1 mirrored, 2 both), in the colour of `ac`
    const arrow: ExpressionSpecification = [
      'concat',
      ARROW_IMAGE_PREFIX,
      [
        'case',
        ['==', ['get', 'oneway'], 2],
        'both',
        ['==', ['get', 'oneway'], -1],
        'backward',
        'forward',
      ],
      '-',
      ['coalesce', ['get', 'ac'], ARROW_DEFAULT_COLOUR],
    ]
    const side: ExpressionSpecification = ['concat', SIDE_IMAGE_PREFIX, ['get', 'side']]
    layers.push(
      {
        id: 'line-oneway',
        type: 'line',
        source: SOURCES.lines,
        filter: ['has', 'oneway'],
        minzoom: 15,
        layout: { 'line-cap': 'butt' },
        paint: { 'line-width': ARROW_HEIGHT, 'line-pattern': arrow },
      },
      {
        id: 'line-sided',
        type: 'line',
        source: SOURCES.lines,
        filter: ['has', 'side'],
        minzoom: 15,
        layout: { 'line-cap': 'butt' },
        paint: { 'line-width': SIDE_HEIGHT, 'line-pattern': side },
      },
      // closed barriers and coastline rings: their outline is the area's (build.ts areaFeature)
      {
        id: 'area-sided',
        type: 'line',
        source: SOURCES.areas,
        filter: ['has', 'side'],
        minzoom: 15,
        layout: { 'line-cap': 'butt' },
        paint: { 'line-width': SIDE_HEIGHT, 'line-pattern': side },
      },
    )
  }

  // --- Vertices ------------------------------------------------------------
  const vertexRadius = (lowR: number, r: number): ExpressionSpecification => [
    'step',
    ['zoom'],
    lowR,
    16,
    r,
  ]
  // From OSM zoom 17 iD draws a tagged vertex with a preset icon as a larger disc with the icon in it.
  const hasIcon: ExpressionSpecification = ['has', 'icon']
  layers.push(
    // hover and selection of a vertex: iD's shadow circle under it
    {
      id: 'highlight-halo-vertex',
      type: 'circle',
      source: SOURCES.vertices,
      paint: {
        'circle-radius': ['step', ['zoom'], 6, 16, ['case', hasIcon, 12, 8]],
        'circle-color': HOVER,
        'circle-opacity': opacity,
      },
    },
    {
      id: 'vertex',
      type: 'circle',
      source: SOURCES.vertices,
      paint: {
        'circle-radius': ['step', ['zoom'], 2.5, 16, ['case', hasIcon, 8, 3.5]],
        'circle-color': ['case', ['==', ['get', 's'], 1], '#bbb', '#fff'],
        'circle-stroke-color': '#666',
        'circle-stroke-width': 1,
      },
    },
    {
      id: 'vertex-tagged',
      type: 'circle',
      source: SOURCES.vertices,
      filter: ['all', ['==', ['get', 't'], 1], ['!', hasIcon]],
      paint: { 'circle-radius': vertexRadius(1, 1.5), 'circle-color': '#000' },
    },
  )
  if (options.icons) {
    layers.push({
      id: 'vertex-icon',
      type: 'symbol',
      source: SOURCES.vertices,
      filter: hasIcon,
      minzoom: 16,
      layout: {
        'icon-image': ['concat', 'icon-', ['get', 'icon']],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    })
  } else {
    layers.push({
      id: 'vertex-tagged-icon-dot',
      type: 'circle',
      source: SOURCES.vertices,
      filter: hasIcon,
      paint: { 'circle-radius': vertexRadius(1, 1.5), 'circle-color': '#000' },
    })
  }
  // the shape points of a selected way: iD shows all vertices of the selection
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

  // The direction of the selected highway (engine.ts refreshShape): white arrows with a dark outline,
  // on the selection's glow. iD does not show a way's direction; Maid does, as the product owner asked.
  if (options.icons) {
    layers.push({
      id: 'highlight-direction',
      type: 'line',
      source: SOURCES.highlight,
      filter: ['==', ['get', 'state'], 'direction'],
      minzoom: 15,
      layout: { 'line-cap': 'butt' },
      paint: { 'line-width': SELECTED_ARROW_HEIGHT, 'line-pattern': SELECTED_ARROW_IMAGE },
    })
  }

  // what a command would do to the selection, while its button is hovered: a dashed outline
  // in iD's selection red on a white glow, so it reads on any background
  const isPreview: ExpressionSpecification = ['==', ['get', 'state'], 'preview']
  layers.push(
    {
      id: 'preview-glow',
      type: 'line',
      source: SOURCES.highlight,
      filter: isPreview,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#fff', 'line-width': 5, 'line-opacity': 0.7, 'line-blur': 2 },
    },
    {
      id: 'preview-line',
      type: 'line',
      source: SOURCES.highlight,
      filter: isPreview,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#f6634f', 'line-width': 2, 'line-dasharray': [3, 2] },
    },
  )

  // --- Points ----------------------------------------------------------------
  // Hover and selection: a glow under the dot, as iD's shadow under a point (0.5 on hover, 0.7
  // when selected)
  layers.push({
    id: 'highlight-halo-points',
    type: 'circle',
    source: SOURCES.points,
    paint: { 'circle-radius': 9, 'circle-color': HOVER, 'circle-opacity': opacity },
  })
  // Address nodes: a small marker, with the house number from OSM zoom 19 on (iD draws a label shield)
  layers.push({
    id: 'point-address',
    type: 'circle',
    source: SOURCES.points,
    filter: ['has', 'addr'],
    paint: {
      'circle-radius': 3,
      'circle-color': '#fff',
      'circle-stroke-color': '#444',
      'circle-stroke-width': 1,
    },
  })
  // Every point is always on the map as a small dot. Pins with the preset icon are drawn on top
  // where there is room for them, more of them the closer you zoom. iD instead hides all points
  // once there are more than 200 in view.
  layers.push({
    id: 'point-dot',
    type: 'circle',
    source: SOURCES.points,
    filter: ['!', ['has', 'addr']],
    paint: {
      'circle-radius': 3,
      'circle-color': '#fff',
      'circle-stroke-color': '#444',
      'circle-stroke-width': 1,
    },
  })
  if (options.icons) {
    layers.push({
      id: 'point-pin',
      type: 'symbol',
      source: SOURCES.points,
      filter: ['!', ['has', 'addr']],
      layout: {
        // one image per preset icon, pin and icon drawn together (see the app's image resolver)
        'icon-image': ['concat', 'pin-', ['coalesce', ['get', 'icon'], 'none']],
        'icon-anchor': 'bottom',
        'icon-allow-overlap': options.pins === 'all',
        'icon-ignore-placement': options.pins === 'all',
        'icon-padding': 0,
        'symbol-sort-key': ['case', ['has', 'name'], 0, 1],
      },
    })
    // The hovered or selected point always shows its pin, also where pins are thinned out for
    // room, with a glow behind the pin's head. Both are invisible for every other point.
    const active: ExpressionSpecification = [
      'case',
      ['boolean', ['feature-state', 'selected'], false], 1,
      ['boolean', ['feature-state', 'hover'], false], 1,
      0,
    ] // prettier-ignore
    layers.push(
      {
        id: 'highlight-halo-pin',
        type: 'circle',
        source: SOURCES.points,
        filter: ['!', ['has', 'addr']],
        paint: {
          'circle-radius': 16,
          'circle-translate': [0, -15],
          'circle-blur': 0.4,
          'circle-color': HOVER,
          'circle-opacity': opacity,
        },
      },
      {
        id: 'active-point-pin',
        type: 'symbol',
        source: SOURCES.points,
        filter: ['!', ['has', 'addr']],
        layout: {
          'icon-image': ['concat', 'pin-', ['coalesce', ['get', 'icon'], 'none']],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-padding': 0,
        },
        paint: { 'icon-opacity': active },
      },
    )
  }

  // --- Labels ----------------------------------------------------------------
  if (options.labels) {
    const text = {
      'text-font': ['Open Sans Semibold'],
      'text-field': ['get', 'name'] as ExpressionSpecification,
      'text-size': 12,
    }
    const paint = {
      'text-color': '#333',
      'text-halo-color': 'rgba(255,255,255,0.7)',
      'text-halo-width': 2.5,
    }
    layers.push(
      {
        id: 'label-line',
        type: 'symbol',
        source: SOURCES.lines,
        filter: ['has', 'name'],
        layout: {
          ...text,
          'symbol-placement': 'line',
          'symbol-spacing': 400,
          'text-max-angle': 30,
        },
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
        id: 'label-address',
        type: 'symbol',
        source: SOURCES.points,
        filter: ['has', 'addr'],
        minzoom: 18,
        layout: {
          ...text,
          'text-field': ['get', 'addr'],
          'text-size': 10,
          'text-anchor': 'top',
          'text-offset': [0, 0.4],
        },
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
  const wanted =
    /^(highlight-vertex|vertex|point-pin|point-dot|point-address|line-(casing|stroke)(-dashed)?--?\d|area-stroke|area-fill)/ // also matches the `--edit` twins
  return layers.filter((l) => wanted.test(l.id)).map((l) => l.id)
}
