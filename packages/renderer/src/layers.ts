/**
 * The MapLibre layers that draw OSM data in iD's look. Pure data: no map calls here.
 * Paint values come from feature properties set by the builder (build.ts).
 */
import { NEIGHBOUR_RANGE } from '@osm-editor-kit/maid-levels'
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
import { CONE_IMAGE, CONE_SLOTS, CONE_ZOOM } from './viewfield'

export const SOURCES = {
  areas: 'osm-areas',
  lines: 'osm-lines',
  points: 'osm-points',
  vertices: 'osm-vertices',
  highlight: 'osm-highlight',
  /** Guide lines of a constraint while a node is drawn or dragged (engine.setGuides); not interactive */
  guides: 'osm-guides',
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

/**
 * Small sources for the selection: a copy of every selected feature, whatever tier it is in. The layers draw
 * them below the floor of the data (see `buildLayers`), so the selection stays on the map when the rest is hidden.
 */
export const SELECT_SOURCES = {
  areas: 'osm-areas-select',
  lines: 'osm-lines-select',
  points: 'osm-points-select',
  vertices: 'osm-vertices-select',
} as const
const SELECT_OF: Record<string, string> = {
  [SOURCES.areas]: SELECT_SOURCES.areas,
  [SOURCES.lines]: SELECT_SOURCES.lines,
  [SOURCES.points]: SELECT_SOURCES.points,
  [SOURCES.vertices]: SELECT_SOURCES.vertices,
}

/**
 * The hovered and the selected points, as copies on a source of their own: the pin of `active-point-pin` is drawn
 * from it. A few features, sent whole on each change (engine.ts `syncActive`), so MapLibre lays out and asks for the
 * pin images of those points only. Not in SOURCES: the layer has no feature state, no edit twin and no selection
 * twin (buildLayers). Below the layer's floor the selection's pins are drawn by the `point-pin--select` twin.
 */
export const ACTIVE_SOURCE = 'osm-points-active'

/**
 * The ids whose pin the active source holds: the hovered point and the selected ones, each once. Only nodes have
 * pins; a way or a relation is left out. A node that is a vertex is left out by the engine, which knows the ways.
 */
export function activePinIds(hoverId: string | null, selectedIds: readonly string[]): string[] {
  const out = new Set<string>()
  if (hoverId?.startsWith('n')) out.add(hoverId)
  for (const id of selectedIds) if (id.startsWith('n')) out.add(id)
  return [...out]
}

/**
 * MapLibre zoom (512 px) from which lines, areas and points are drawn: OSM 12, the lowest zoom the data is drawn
 * at (docs/research/zoom-study.md, D3). Below it only the selection is drawn.
 */
export const DRAW_ZOOM = 11
/**
 * MapLibre zoom from which vertices and symbols (labels, icons) are drawn: OSM 16, the load zoom. Below it only the
 * selection is drawn. Chosen without a measurement: symbols are placed for everything in view, so they are the
 * first thing to measure at OSM 12 to 15 (see the notes in docs/research/zoom-study.md).
 */
export const DETAIL_ZOOM = 15
/** MapLibre's largest zoom (OSM 24) */
const MAX_ZOOM = 24

/**
 * What the map shows of the data, one at a time (iD's wireframe and highlight-edits, W and G): `normal` the look
 * (a band along the inside edge of areas), `wireframe` the outlines alone, `edits` the features created or changed here
 * in colour. The engine holds it (`engine.display`); a URL or stored value names it (`displayOf`).
 */
export const DISPLAYS = ['normal', 'wireframe', 'edits'] as const
export type MapDisplay = (typeof DISPLAYS)[number]

/** The display a URL or stored value names; anything else is the normal look */
export function displayOf(value: string | null | undefined): MapDisplay {
  return value === 'wireframe' || value === 'edits' ? value : 'normal'
}

/** The map's global state with the level being edited (engine.setLevel) as text, `none` for the features without a level; unset: no level mode */
export const LEVEL_STATE = 'level'
/** The same level as a number, for the levels next to it (NEIGHBOUR_RANGE) */
export const LEVEL_NUMBER_STATE = 'levelNumber'
/** Whether the features without a level show while a level is edited (engine.setUnleveledVisible) */
export const UNLEVELED_STATE = 'unleveled'
/** The level whose button the pointer is on, as text (engine.hoverLevel); unset: none */
export const LEVEL_HOVER_STATE = 'levelHover'
/** How visible a feature is that shows but is locked: on a level next to the edited one, or without a level */
const OFF_LEVEL_OPACITY = 0.2
/** How visible the other features are while a level's button is hovered, so that its features stand out */
const HOVER_OTHERS_OPACITY = 0.1

const chosenLevel: ExpressionSpecification = [
  'to-string',
  ['coalesce', ['global-state', LEVEL_STATE], ''],
]
const chosenNumber: ExpressionSpecification = [
  'to-number',
  ['coalesce', ['global-state', LEVEL_NUMBER_STATE], 0],
]
const unleveledShown: ExpressionSpecification = [
  'to-boolean',
  ['coalesce', ['global-state', UNLEVELED_STATE], true],
]
const hoveredLevel: ExpressionSpecification = [
  'to-string',
  ['coalesce', ['global-state', LEVEL_HOVER_STATE], ''],
]
const isOn = (level: ExpressionSpecification): ExpressionSpecification => [
  '>=', ['index-of', ['concat', ';', level, ';'], ['get', 'lv']], 0,
] // prettier-ignore

/**
 * The level mode's rule (packages/levels shown.ts), without a hover: 1 for a feature on the edited level, or for every
 * feature when no level is edited; OFF_LEVEL_OPACITY (shown, locked) for a feature on a level up to NEIGHBOUR_RANGE
 * away and for a feature without a level while those show; 0 (hidden) for the others. While the features without a
 * level are edited (`none`), they are 1 and every feature with a level is hidden. A feature carries its levels as
 * `lv`, `;-1;0;`, and its lowest and highest as `lo` and `hi` (build.ts).
 */
const LEVEL_SHOWN: ExpressionSpecification = [
  'case',
  ['==', chosenLevel, ''], 1,
  ['!', ['has', 'lv']], ['case', ['==', chosenLevel, 'none'], 1, unleveledShown, OFF_LEVEL_OPACITY, 0],
  ['==', chosenLevel, 'none'], 0,
  isOn(chosenLevel), 1,
  ['all',
    ['<=', ['to-number', ['get', 'lo']], ['+', chosenNumber, NEIGHBOUR_RANGE]],
    ['>=', ['to-number', ['get', 'hi']], ['-', chosenNumber, NEIGHBOUR_RANGE]],
  ], OFF_LEVEL_OPACITY,
  0,
] // prettier-ignore

/** True for a feature of the hovered level (`none`: a feature without a level) */
const onHoveredLevel: ExpressionSpecification = [
  'case',
  ['==', hoveredLevel, 'none'], ['!', ['has', 'lv']],
  ['has', 'lv'], isOn(hoveredLevel),
  false,
] // prettier-ignore

/**
 * LEVEL_SHOWN, and while a level is hovered (its button in the picker, an offer of the "Set level" menu) its features
 * at full opacity, also a hidden level's, and the others faint. The picker hovers only the levels that show.
 * It reads the global state in paint only: a level change repaints the loaded tiles and builds nothing again (a
 * global state in a filter or layout would reload the source).
 */
const LEVEL_DIM: ExpressionSpecification = [
  'let', 'shown', LEVEL_SHOWN,
  ['case',
    ['==', hoveredLevel, ''], ['var', 'shown'],
    onHoveredLevel, 1,
    ['min', ['var', 'shown'], HOVER_OTHERS_OPACITY],
  ],
] // prettier-ignore

/** The labels: on the edited level only (and on the hovered one); a dimmed label cannot be read and is noise (Tobias, 2026-10-21) */
const LEVEL_TEXT: ExpressionSpecification = [
  'case',
  ['==', chosenLevel, ''], 1,
  ['all', ['!=', hoveredLevel, ''], onHoveredLevel], 1,
  ['!', ['has', 'lv']], ['case', ['==', chosenLevel, 'none'], 1, 0],
  ['==', chosenLevel, 'none'], 0,
  isOn(chosenLevel), 1,
  0,
] // prettier-ignore

/**
 * An opacity times LEVEL_DIM. A zoom curve stays on top (MapLibre takes `zoom` only as the input of a top-level
 * `interpolate` or `step`), so each of its outputs is multiplied instead.
 */
function dimmedByLevel(value: unknown, factor: ExpressionSpecification = LEVEL_DIM): unknown {
  if (Array.isArray(value) && JSON.stringify(value).includes('"zoom"')) {
    if (value[0] === 'interpolate')
      return value.map((item, index) =>
        index >= 4 && index % 2 === 0 ? ['*', item, factor] : item,
      )
    if (value[0] === 'step')
      return value.map((item, index) =>
        index >= 2 && index % 2 === 0 ? ['*', item, factor] : item,
      )
  }
  return ['*', value ?? 1, factor]
}

/** iD's visual diff colours (css/20_map.css): created, retagged, moved or re-noded. Read from a feature's `ed` property. */
const EDIT_COLOUR: ExpressionSpecification = [
  'match', ['get', 'ed'], 'added', '#85ff67', 'retagged', '#fcde5a', '#ff7e2e',
] // prettier-ignore

export type LayerOptions = {
  /** What the map shows of the data (MapDisplay). Absent: the normal look. */
  display?: MapDisplay
  /** Dash patterns seen so far (build.ts dashPatterns) */
  dashes: Map<string, number[]>
  /** Latitude of the scene, for converting metres to pixels */
  lat: number
  labels: boolean
  icons: boolean
  /** 'fit': pins where there is room (dots always). 'all': every pin, overlapping, like iD when it does not hide them. */
  pins: 'fit' | 'all'
  /** Hides all of the OSM data at every zoom, and draws only the selection. Off by default. */
  selectionOnly?: boolean
  /**
   * Whether anything is selected, so the selection's copies have something to draw. Default true (all twins shown).
   * False hides the twins (`visibility: none`): MapLibre gives no tiles to a source that no visible layer uses
   * (`TileManager.update`), so an empty selection source costs no worker round trips per zoom step. The zoom is not an
   * input: a twin above its floor is hidden by its own maxzoom, which costs as little.
   */
  selectTwins?: boolean
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
/** The relation column's colour (the focus glow of a relation open beside the inspector) */
const FOCUS = '#7c3aed'
/** The focus glow is this many times the halo width (the `related` halo is 1x) */
const FOCUS_GLOW = 2.2
/**
 * MapLibre zoom from which points are pins (OSM zoom 19); below it they are dots. Chosen on the dense scene: at OSM
 * zoom 17 all its pins cover the map. It is an integer on purpose: MapLibre lays a layer out from floor(minzoom), so a
 * tile at the zoom below would ask for every pin image before one is drawn (see docs/research/performance-2026-10-13.md).
 */
export const PIN_ZOOM = 18
/** The address plaque image (packages/shell/src/images.ts) */
export const ADDRESS_PLAQUE = 'addr-plaque'

/**
 * The layers of the map, bottom to top. The data layers (the OSM sources) draw from their floor (DRAW_ZOOM, or
 * DETAIL_ZOOM for vertices and symbols) and not below it: there only the selection is drawn, by the twin on the
 * selection source. The highlight layers (the selection's shape, the tools) are never floored.
 */
export function buildLayers(options: LayerOptions) {
  const selectionOnly = options.selectionOnly === true
  // with selectionOnly the data is hidden, so the selection's copies are always drawn (at every zoom their layer has)
  const twinsShown = selectionOnly || options.selectTwins !== false
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
  const out: LayerSpecification[] = []
  for (const layer of buildMainLayers(options)) {
    const source = 'source' in layer ? layer.source : undefined
    if (typeof source !== 'string' || source === SOURCES.highlight) {
      out.push(layer)
      continue
    }
    const floor = floorOf(layer)
    // the OSM data is dimmed on other levels than the one being edited (LEVEL_DIM); the active points are hovered or
    // selected, and a feature on another level is neither
    const dimmed = source === ACTIVE_SOURCE ? [] : (OPACITY[layer.type] ?? [])
    const leveled: Record<string, unknown> = { ...layer.paint }
    for (const prop of dimmed)
      leveled[prop] = dimmedByLevel(leveled[prop], prop === 'text-opacity' ? LEVEL_TEXT : LEVEL_DIM)
    const floored = {
      ...layer,
      ...(dimmed.length > 0 ? { paint: leveled } : {}),
      minzoom: Math.max(layer.minzoom ?? 0, floor),
    } as LayerSpecification
    const shown = selectionOnly
      ? ({
          ...floored,
          layout: { ...floored.layout, visibility: 'none' as const },
        } as LayerSpecification)
      : floored
    // the active source holds only the hovered and selected points: it has no edit or selection twin
    if (source === ACTIVE_SOURCE) {
      out.push(shown)
      continue
    }
    const editSource = EDIT_OF[source]
    if (editSource) {
      const paint: Record<string, unknown> = { ...floored.paint }
      for (const prop of OPACITY[layer.type] ?? [])
        paint[prop] = ['case', editing, 0, paint[prop] ?? 1]
      out.push(
        { ...shown, paint } as LayerSpecification,
        { ...shown, id: `${layer.id}--edit`, source: editSource } as LayerSpecification,
      )
    } else out.push(shown)
    // Cones (coneLayers) are drawn above the data floor only. Nothing is kept below it, so a cone has no selection twin.
    if (!layer.id.startsWith('cone-'))
      out.push(selectionTwin(layer, source, floor, selectionOnly, twinsShown))
  }
  return out
}

/**
 * The viewfield cones (viewfield.ts): one symbol layer per slot on each of the vertex and the point source.
 * Each feature with a `d<slot>` bearing gets its cone, rotated to that bearing about its node. The image's
 * bottom edge is the anchor, so the narrow end of the wedge sits 2 units above the node. Drawn under the vertices
 * and points (they are listed after these layers), above the lines and areas, as iD does. The `--edit` twins come
 * from buildLayers, like those of the data, so a cone follows a node that is being dragged.
 */
function coneLayers(): LayerSpecification[] {
  const out: LayerSpecification[] = []
  for (let slot = 0; slot < CONE_SLOTS; slot++) {
    const prop = `d${slot}`
    for (const [source, kind] of [
      [SOURCES.vertices, 'v'],
      [SOURCES.points, 'p'],
    ] as const) {
      out.push({
        id: `cone-${kind}${slot}`,
        type: 'symbol',
        source,
        minzoom: CONE_ZOOM,
        filter: ['has', prop],
        layout: {
          'icon-image': CONE_IMAGE,
          'icon-rotate': ['get', prop],
          // the bearing is on the map, so a turned map turns the cone with it
          'icon-rotation-alignment': 'map',
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      })
    }
  }
  return out
}

/** The MapLibre zoom from which a data layer draws: vertices and symbols at the load zoom, the rest from OSM 12 */
function floorOf(layer: LayerSpecification) {
  const source = 'source' in layer ? layer.source : undefined
  return layer.type === 'symbol' || source === SOURCES.vertices ? DETAIL_ZOOM : DRAW_ZOOM
}

/**
 * The selection's copy of a data layer: the same look, on the selection source. It is drawn below the layer's
 * floor, where the data itself is hidden, so the selection is drawn at every zoom down to the lowest one. Above
 * the floor the data layer draws the selection, so the twin stops there (its own maxzoom still applies). With
 * `selectionOnly` the data layers are hidden, so the twin draws at every zoom its layer has.
 */
function selectionTwin(
  layer: LayerSpecification,
  source: string,
  floor: number,
  selectionOnly: boolean,
  shown: boolean,
): LayerSpecification {
  // With selectionOnly the bound is always set, to MapLibre's maximum where the layer has none: MapLibre keeps the
  // old bound when a zoom range is set to undefined, so a switch back would leave the twin stopped at the floor.
  const maxzoom = selectionOnly
    ? (layer.maxzoom ?? MAX_ZOOM)
    : Math.min(floor, layer.maxzoom ?? floor)
  const twin = withoutZoomRange(layer)
  return {
    ...twin,
    id: `${layer.id}--select`,
    source: SELECT_OF[source],
    maxzoom,
    // nothing selected: hidden, so its source is not used and asks for no tiles (see LayerOptions.selectTwins)
    ...(shown ? {} : { layout: { ...twin.layout, visibility: 'none' as const } }),
  } as LayerSpecification
}

/** The layer's properties without its zoom range (minzoom and maxzoom) */
function withoutZoomRange(layer: LayerSpecification): LayerSpecification {
  return Object.fromEntries(
    Object.entries(layer).filter(([key]) => key !== 'minzoom' && key !== 'maxzoom'),
  ) as LayerSpecification
}

function buildMainLayers(options: LayerOptions) {
  const low = lowZoomThreshold(options.lat)
  const byZoom = (lowProp: string, prop: string): ExpressionSpecification => [
    'step', ['zoom'], ['get', lowProp], low, ['get', prop],
  ] // prettier-ignore

  // The dash of a stroke by its `prop`. `solid` (the wireframe draws dashes solid, as iD does) keeps the same match with
  // solid outputs: the dasharray stays data-driven in both displays. A data-driven dasharray that becomes a constant
  // at runtime breaks its layer: MapLibre's constant dash positions do not reach the buckets built for the match, so
  // the uniform stays undefined and every frame throws (layers.test.ts pins the shape).
  const dashMatch = (prop: string, solid = false): ExpressionSpecification => {
    const cases: (string | ExpressionSpecification)[] = []
    for (const [key, pattern] of options.dashes)
      cases.push(key, ['literal', solid ? [1, 0] : pattern])
    if (cases.length === 0) return ['literal', [1, 0]]
    // KEEP: the library types match as one fixed tuple with a label and an output at least once; a spread of
    // pairs (possibly empty before the early return) does not fit it, so the cast stays here
    return [
      'match',
      ['get', prop],
      ...cases,
      ['literal', [1, 0]],
    ] as unknown as ExpressionSpecification
  }

  const layers: LayerSpecification[] = []

  // The wireframe (iD's fill-wireframe): no area fills, no casings and no direction markers, and strokes of 1px at
  // half opacity. Points and vertices stay as they are. The edits highlight (iD's highlight-edited) adds halos.
  // Every layer stays in the list, and the display only changes its paint and visibility: MapLibre puts a layer that
  // is added later on top of the others, so a layer that came and went would be drawn in the wrong place.
  const wire = options.display === 'wireframe'
  const edits = options.display === 'edits'
  const strokeOpacity = wire ? 0.5 : 1
  const shownIn = (on: boolean) => (on ? 'visible' : 'none') as 'visible' | 'none'
  // --- Areas -------------------------------------------------------------
  // Band along the inside edge: a line offset to the inside by half its width. Its width is
  // capped by the area's own size so that it never spills over the far edge of small areas.
  const metresPerPixelAtZ0 = (40075016.686 * Math.cos((options.lat * Math.PI) / 180)) / 512
  const band = (zoom: number) => [
    'min', ['get', 'fw'], ['*', ['get', 'r'], 2 ** zoom / metresPerPixelAtZ0],
  ] satisfies ExpressionSpecification // prettier-ignore
  const stops = (scale: number) => {
    const out: (number | ExpressionSpecification)[] = []
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
    layout: { 'line-join': 'miter', 'line-miter-limit': 4, visibility: shownIn(!wire) },
    paint: {
      // Opaque colour plus layer opacity: where the band overlaps itself in corners and
      // narrow shapes it does not get darker, as it would with a translucent colour.
      'line-color': ['get', 'fo'],
      'line-layer-opacity': 0.3,
      'line-width': ['interpolate', ['exponential', 2], ['zoom'], ...stops(1)],
      'line-offset': ['interpolate', ['exponential', 2], ['zoom'], ...stops(0.5)],
    },
  })
  layers.push(
    {
      id: 'area-stroke',
      type: 'line',
      source: SOURCES.areas,
      filter: ['all', ['has', 'sc'], ['!', ['has', 'sd']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'sc'],
        'line-width': wire ? 1 : ['get', 'sw'],
        'line-opacity': strokeOpacity,
      },
    },
    {
      id: 'area-stroke-dashed',
      type: 'line',
      source: SOURCES.areas,
      filter: ['all', ['has', 'sc'], ['has', 'sd']],
      paint: {
        'line-color': ['get', 'sc'],
        'line-width': wire ? 1 : ['get', 'sw'],
        'line-opacity': strokeOpacity,
        // the wireframe draws a dashed outline solid, as iD does (dashMatch)
        'line-dasharray': dashMatch('sd', wire),
      },
    },
  )

  // --- Focus: the relation open beside the inspector (engine.setFocus) ---
  // A wide, blurred violet glow under its members, drawn under the narrow `related` halo below, and only
  // where the `focus` state is set (0 everywhere else, so the layers cost nothing for other features).
  // The width is the halo width times FOCUS_GLOW, by zoom as byZoom does it. Each layer gets its
  // `--edit` and `--select` twins from buildLayers, like the halos above.
  const focusOpacity: ExpressionSpecification = [
    'case',
    ['boolean', ['feature-state', 'focus'], false],
    0.55,
    0,
  ]
  const glowByZoom = (scale: number): ExpressionSpecification => [
    'step', ['zoom'], ['*', scale, ['get', 'hwl']], low, ['*', scale, ['get', 'hw']],
  ] // prettier-ignore
  layers.push(
    {
      id: 'focus-halo-areas',
      type: 'line',
      source: SOURCES.areas,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': FOCUS,
        'line-width': ['*', FOCUS_GLOW, ['get', 'hw']],
        'line-blur': 2,
        'line-opacity': focusOpacity,
      },
    },
    {
      id: 'focus-halo',
      type: 'line',
      source: SOURCES.lines,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': FOCUS,
        'line-width': glowByZoom(FOCUS_GLOW),
        'line-blur': 2,
        'line-opacity': focusOpacity,
      },
    },
  )

  // --- Hover and selection halo, under the lines like iD's shadow paths ---
  // `related` (members of a relation, a row of the relation UI): a narrow violet halo, the colour of relation editing
  // (ui relation-tone.ts). It stays crisp over the wide, blurred focus glow of the open relation, so a hovered
  // member still stands out there. Hover and selection keep iD's colour and win over it.
  const opacity: ExpressionSpecification = [
    'case',
    ['boolean', ['feature-state', 'selected'], false], 0.7,
    ['boolean', ['feature-state', 'hover'], false], 0.4,
    ['boolean', ['feature-state', 'related'], false], 0.6,
    0,
  ] // prettier-ignore
  const haloColour: ExpressionSpecification = [
    'case',
    ['boolean', ['feature-state', 'selected'], false], HOVER,
    ['boolean', ['feature-state', 'hover'], false], HOVER,
    ['boolean', ['feature-state', 'related'], false], FOCUS,
    HOVER,
  ] // prettier-ignore
  layers.push(
    {
      id: 'highlight-halo-areas',
      type: 'line',
      source: SOURCES.areas,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': haloColour, 'line-width': ['get', 'hw'], 'line-opacity': opacity },
    },
    {
      id: 'highlight-halo',
      type: 'line',
      source: SOURCES.lines,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': haloColour,
        'line-width': byZoom('hwl', 'hw'),
        'line-opacity': opacity,
      },
    },
  )

  // The edits highlight: a halo under each edited line and area, in the colour of its edit (EDIT_COLOUR)
  layers.push(
    {
      id: 'edit-halo-areas',
      type: 'line',
      source: SOURCES.areas,
      filter: ['has', 'ed'],
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: shownIn(edits) },
      paint: { 'line-color': EDIT_COLOUR, 'line-width': ['get', 'hw'], 'line-opacity': 0.6 },
    },
    {
      id: 'edit-halo',
      type: 'line',
      source: SOURCES.lines,
      filter: ['has', 'ed'],
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: shownIn(edits) },
      paint: { 'line-color': EDIT_COLOUR, 'line-width': byZoom('hwl', 'hw'), 'line-opacity': 0.6 },
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
      // the wireframe has no casings: the layers stay, hidden, so the stacking of the others is kept
      const hidden = wire && p.part === 'casing' ? 'none' : 'visible'
      layers.push(
        {
          id: `line-${p.part}-${band}`,
          type: 'line',
          source: SOURCES.lines,
          filter: ['all', inBand, ['has', p.color], ['!', ['has', p.dash]]],
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
            'line-sort-key': ['get', 'z'],
            visibility: hidden,
          },
          paint: {
            'line-color': ['get', p.color],
            'line-width': wire ? 1 : byZoom(p.widthLow, p.width),
            'line-opacity': strokeOpacity,
          },
        },
        {
          id: `line-${p.part}-dashed-${band}`,
          type: 'line',
          source: SOURCES.lines,
          filter: ['all', inBand, ['has', p.color], ['has', p.dash]],
          layout: { 'line-join': 'round', 'line-sort-key': ['get', 'z'], visibility: hidden },
          paint: {
            'line-color': ['get', p.color],
            'line-width': wire ? 1 : byZoom(p.widthLow, p.width),
            'line-opacity': strokeOpacity,
            // the wireframe draws a dashed line solid, as iD does (dashMatch)
            'line-dasharray': dashMatch(p.dash, wire),
          },
        },
      )
    }
  }

  // direction markers, hidden in the wireframe (iD hides its oneway paths there)
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
        layout: { 'line-cap': 'butt', visibility: shownIn(!wire) },
        paint: { 'line-width': ARROW_HEIGHT, 'line-pattern': arrow },
      },
      {
        id: 'line-sided',
        type: 'line',
        source: SOURCES.lines,
        filter: ['has', 'side'],
        minzoom: 15,
        layout: { 'line-cap': 'butt', visibility: shownIn(!wire) },
        paint: { 'line-width': SIDE_HEIGHT, 'line-pattern': side },
      },
      // closed barriers and coastline rings: their outline is the area's (build.ts areaFeature)
      {
        id: 'area-sided',
        type: 'line',
        source: SOURCES.areas,
        filter: ['has', 'side'],
        minzoom: 15,
        layout: { 'line-cap': 'butt', visibility: shownIn(!wire) },
        paint: { 'line-width': SIDE_HEIGHT, 'line-pattern': side },
      },
    )
  }

  // --- Viewfields: under the vertices and points, above the lines (coneLayers) ----
  layers.push(...coneLayers())

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
    // the focus glow of a relation open beside the inspector (see the focus layers above)
    {
      id: 'focus-halo-vertex',
      type: 'circle',
      source: SOURCES.vertices,
      paint: {
        'circle-radius': ['step', ['zoom'], 9, 16, ['case', hasIcon, 18, 12]],
        'circle-color': FOCUS,
        'circle-blur': 0.6,
        'circle-opacity': focusOpacity,
      },
    },
    {
      id: 'edit-halo-vertex',
      type: 'circle',
      source: SOURCES.vertices,
      filter: ['has', 'ed'],
      layout: { visibility: shownIn(edits) },
      paint: {
        'circle-radius': ['step', ['zoom'], 6, 16, ['case', hasIcon, 12, 8]],
        'circle-color': EDIT_COLOUR,
        'circle-opacity': 0.8,
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
        // upright on the screen when the map is turned (point symbols; labels on lines follow the line)
        'icon-rotation-alignment': 'viewport',
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
  // The midpoint handles of the selected ways (midpoints.ts): a press on one adds a node there. Drawn
  // under the vertices. Not in interactiveLayerIds: the engine finds them itself (midpointAt).
  layers.push({
    id: 'highlight-midpoint',
    type: 'circle',
    source: SOURCES.highlight,
    filter: ['==', ['get', 'state'], 'midpoint'],
    paint: {
      // smaller and fainter than a vertex: a place where a node could be, not a node
      'circle-radius': 2.5,
      'circle-color': '#fff',
      'circle-opacity': 0.55,
      'circle-stroke-color': '#666',
      'circle-stroke-width': 1,
      'circle-stroke-opacity': 0.55,
    },
  })

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

  // The field that has the focus or the pointer on it (field-overlay.ts). A side is a blue line a few
  // pixels off the way: MapLibre's line-offset is in pixels, positive to the right of the direction.
  // A band is a polygon in metres, so its width on the ground is right at every zoom; its label sits in its middle.
  const FIELD_BLUE = '#2563eb'
  const FIELD_SIDE_OFFSET = 5
  const isField = (state: string): ExpressionSpecification => ['==', ['get', 'state'], state]
  layers.push(
    {
      id: 'field-side-left',
      type: 'line',
      source: SOURCES.highlight,
      filter: ['all', isField('field-side'), ['==', ['get', 'side'], 'left']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': FIELD_BLUE, 'line-width': 3, 'line-offset': -FIELD_SIDE_OFFSET },
    },
    {
      id: 'field-side-right',
      type: 'line',
      source: SOURCES.highlight,
      filter: ['all', isField('field-side'), ['==', ['get', 'side'], 'right']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': FIELD_BLUE, 'line-width': 3, 'line-offset': FIELD_SIDE_OFFSET },
    },
    {
      id: 'field-band',
      type: 'fill',
      source: SOURCES.highlight,
      filter: isField('field-band'),
      paint: { 'fill-color': FIELD_BLUE, 'fill-opacity': 0.22 },
    },
    {
      id: 'field-label',
      type: 'symbol',
      source: SOURCES.highlight,
      filter: isField('field-label'),
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Open Sans Semibold'],
        'text-size': 12,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#1e3a8a', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
    },
  )

  // The measuring tape (engine.ts startMeasure, measure.ts): a dashed dark line on a white casing, so it
  // reads on dark and on light ground, and its distance as a label with a white halo.
  layers.push(
    {
      id: 'measure-casing',
      type: 'line',
      source: SOURCES.highlight,
      filter: ['==', ['get', 'state'], 'measure-line'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#fff', 'line-width': 5, 'line-opacity': 0.9 },
    },
    {
      id: 'measure-line',
      type: 'line',
      source: SOURCES.highlight,
      filter: ['==', ['get', 'state'], 'measure-line'],
      layout: { 'line-cap': 'butt' },
      paint: { 'line-color': '#111827', 'line-width': 2, 'line-dasharray': [3, 2] },
    },
    {
      id: 'measure-label',
      type: 'symbol',
      source: SOURCES.highlight,
      filter: ['==', ['get', 'state'], 'measure-label'],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Open Sans Semibold'],
        // above the line and over everything else, so the number is readable on a busy map
        'text-size': 15,
        'text-offset': [0, -1.1],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: { 'text-color': '#111827', 'text-halo-color': '#fff', 'text-halo-width': 3 },
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
  layers.push({
    id: 'focus-halo-points',
    type: 'circle',
    source: SOURCES.points,
    paint: {
      'circle-radius': 16,
      'circle-color': FOCUS,
      'circle-blur': 0.6,
      'circle-opacity': focusOpacity,
    },
  })
  layers.push({
    id: 'edit-halo-points',
    type: 'circle',
    source: SOURCES.points,
    filter: ['has', 'ed'],
    layout: { visibility: shownIn(edits) },
    paint: { 'circle-radius': 9, 'circle-color': EDIT_COLOUR, 'circle-opacity': 0.8 },
  })
  // Address nodes are not pins: iD draws a rounded plaque with the house number on the node, at
  // every zoom it draws points (svg/points.js markerPath, svg/labels.js). The plaque is one symbol
  // whose icon stretches to the text (the image is ADDRESS_PLAQUE in packages/shell/src/images.ts).
  // Maid differs from iD here: a plaque shows only together with its number. Where numbers would
  // overlap (a row of houses), iD keeps every plaque and drops the text, which leaves empty white
  // cards. Here the whole plaque gives way and the address stays a small dot, which the plaque
  // covers where it is drawn. An address without a number or name is a dot only.
  layers.push({
    id: 'point-address-dot',
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
  layers.push({
    id: 'point-address',
    type: 'symbol',
    source: SOURCES.points,
    filter: ['all', ['has', 'addr'], ['!=', ['get', 'addr'], '']],
    layout: {
      'icon-image': ADDRESS_PLAQUE,
      // upright on the screen when the map is turned or tilted: the plaque and its text
      'icon-rotation-alignment': 'viewport',
      'icon-pitch-alignment': 'viewport',
      'text-rotation-alignment': 'viewport',
      'text-pitch-alignment': 'viewport',
      'icon-text-fit': 'both',
      'icon-text-fit-padding': [2, 4, 2, 4],
      'icon-anchor': 'center',
      // neither is optional: the icon and the text are placed together or not at all
      'icon-allow-overlap': false,
      'text-field': ['get', 'addr'],
      'text-font': ['Open Sans Semibold'],
      'text-size': 10,
      'text-anchor': 'center',
      'text-allow-overlap': false,
      'symbol-sort-key': 1,
    },
    paint: {
      'text-color': '#333',
      'text-halo-color': 'rgba(255,255,255,0.7)',
      'text-halo-width': 2.5,
    },
  })
  // As in iD the pin is the point: from PIN_ZOOM on every point is a pin, none is thinned out and
  // no dot is drawn under it. Further out, where pins would cover the map (iD hides all points
  // beyond a count there), a point is a small dot; the hovered or selected one still shows its pin.
  layers.push({
    id: 'point-dot',
    type: 'circle',
    source: SOURCES.points,
    filter: ['!', ['has', 'addr']],
    // without icons there are no pins, so the dots stay at every zoom
    ...(options.icons && options.pins !== 'all'
      ? { maxzoom: PIN_ZOOM }
      : { maxzoom: options.icons ? 0.1 : 24 }),
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
      ...(options.pins === 'all' ? {} : { minzoom: PIN_ZOOM }),
      layout: {
        // one image per preset icon, pin and icon drawn together (see the app's image resolver)
        'icon-image': ['concat', 'pin-', ['coalesce', ['get', 'icon'], 'none']],
        'icon-rotation-alignment': 'viewport',
        'icon-pitch-alignment': 'viewport',
        'icon-anchor': 'bottom',
        // every pin is drawn; a pin further down the screen is in front, as iD sorts them
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-padding': 0,
        'symbol-z-order': 'viewport-y',
      },
    })
    // The hovered or selected point always shows its pin, also where pins are thinned out for
    // room, with a glow behind the pin's head. The glow is a feature state of the point (invisible
    // for every other point). The pin is drawn from the active source, which holds only those points
    // (engine.ts `syncActive`): no feature state, so MapLibre asks for the pins of a few points, not
    // of every point from the zoom where the layer starts (see docs/research/performance-2026-10-13.md).
    layers.push({
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
    })
    // the focus glow behind a pin's head, as highlight-halo-pin (a point of the relation that is drawn as a pin)
    layers.push({
      id: 'focus-halo-pin',
      type: 'circle',
      source: SOURCES.points,
      filter: ['!', ['has', 'addr']],
      paint: {
        'circle-radius': 22,
        'circle-translate': [0, -15],
        'circle-blur': 0.5,
        'circle-color': FOCUS,
        'circle-opacity': focusOpacity,
      },
    })
    layers.push({
      id: 'active-point-pin',
      type: 'symbol',
      source: ACTIVE_SOURCE,
      filter: ['!', ['has', 'addr']],
      layout: {
        'icon-image': ['concat', 'pin-', ['coalesce', ['get', 'icon'], 'none']],
        'icon-rotation-alignment': 'viewport',
        'icon-pitch-alignment': 'viewport',
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-padding': 0,
      },
    })
  }

  // --- Labels ----------------------------------------------------------------
  if (options.labels) {
    const text = {
      'text-font': ['Open Sans Semibold'],
      'text-field': ['get', 'name'] satisfies ExpressionSpecification,
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
        id: 'label-point',
        type: 'symbol',
        source: SOURCES.points,
        filter: ['has', 'name'],
        layout: {
          ...text,
          'text-size': 10,
          'text-anchor': 'top',
          'text-offset': [0, 0.3],
          'text-rotation-alignment': 'viewport',
          'text-pitch-alignment': 'viewport',
        },
        paint,
      },
    )
  }
  // The guide lines of a constraint (ADR 0011): dashed blue, like iD's guide. Last in the list, so they draw above
  // the OSM data and the labels. Not in interactiveLayerIds: a guide never takes the pointer.
  // Their labels (a length in metres, engine.setGuides) are points of the same source, in the rectangle's size label style.
  layers.push(
    {
      id: 'guides',
      type: 'line',
      source: SOURCES.guides,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#2b8ff0', 'line-width': 1.5, 'line-dasharray': [4, 3] },
    },
    {
      id: 'guides-label',
      type: 'symbol',
      source: SOURCES.guides,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Open Sans Semibold'],
        'text-size': 12,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': '#2b8ff0', 'text-halo-width': 2 },
    },
  )
  return layers
}

/** Layers a pointer can hit, in iD's picking priority: vertex, point, line, area */
export function interactiveLayerIds(layers: LayerSpecification[]) {
  const wanted =
    /^(highlight-vertex|vertex|point-pin|point-dot|point-address|line-(casing|stroke)(-dashed)?--?\d|area-stroke|area-fill)/ // also matches the `--edit` twins
  return layers.filter((l) => wanted.test(l.id)).map((l) => l.id)
}
