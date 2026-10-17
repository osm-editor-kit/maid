import { describe, expect, test } from 'bun:test'
import type { LayerSpecification } from 'maplibre-gl'
import {
  ACTIVE_SOURCE,
  activePinIds,
  buildLayers,
  displayOf,
  DETAIL_ZOOM,
  DRAW_ZOOM,
  EDIT_SOURCES,
  interactiveLayerIds,
  type LayerOptions,
  PIN_ZOOM,
  SELECT_SOURCES,
  SOURCES,
} from './layers'
import { CONE_ZOOM } from './viewfield'

const options: LayerOptions = {
  dashes: new Map(),
  lat: 52,
  labels: true,
  icons: true,
  pins: 'fit',
}

/** The fields the rules are about, read without the library's union type */
type View = {
  id: string
  type: string
  source?: string
  minzoom?: number
  maxzoom?: number
  layout?: { visibility?: string }
}
const view = (layer: LayerSpecification) => layer as unknown as View

const DATA_SOURCES: string[] = [SOURCES.areas, SOURCES.lines, SOURCES.points, SOURCES.vertices]

/** The layers of the OSM data itself, not their edit or selection copies */
function dataLayers(layers: LayerSpecification[]) {
  return layers.map(view).filter(
    (l) =>
      l.source !== undefined &&
      DATA_SOURCES.includes(l.source) &&
      !/--(edit|select)$/.test(l.id) &&
      // the viewfield cones have no selection twin (layers.ts coneLayers)
      !l.id.startsWith('cone-'),
  )
}

const twinOf = (layers: LayerSpecification[], id: string) => {
  const found = layers.map(view).find((l) => l.id === `${id}--select`)
  if (!found) throw new Error(`no selection twin for ${id}`)
  return found
}

describe('zoom floors of the data layers (MapLibre zoom: OSM minus one)', () => {
  test('lines, areas and points draw from OSM 12, vertices and symbols from the load zoom', () => {
    const data = dataLayers(buildLayers(options))
    expect(data.length).toBeGreaterThan(20)
    for (const layer of data) {
      const floor =
        layer.type === 'symbol' || layer.source === SOURCES.vertices ? DETAIL_ZOOM : DRAW_ZOOM
      expect(layer.minzoom).toBeGreaterThanOrEqual(floor)
    }
  })

  test('the floors are OSM 12 and OSM 16', () => {
    expect(DRAW_ZOOM).toBe(11)
    expect(DETAIL_ZOOM).toBe(15)
  })

  test('a layer keeps its own minzoom where that is higher (oneway arrows stay at OSM 16)', () => {
    const oneway = view(buildLayers(options).find((l) => view(l).id === 'line-oneway')!)
    expect(oneway.minzoom).toBe(15)
  })

  test('the highlight layers of the selection and the tools are not floored', () => {
    const layers = buildLayers(options).map(view)
    expect(layers.find((l) => l.id === 'highlight-midpoint')?.minzoom).toBeUndefined()
    expect(layers.find((l) => l.id === 'highlight-direction')?.minzoom).toBe(15)
  })
})

describe('the selection below the floor', () => {
  test('every data layer has a twin on the selection source that stops where the data starts', () => {
    const layers = buildLayers(options)
    const selectOf: Record<string, string> = {
      [SOURCES.areas]: SELECT_SOURCES.areas,
      [SOURCES.lines]: SELECT_SOURCES.lines,
      [SOURCES.points]: SELECT_SOURCES.points,
      [SOURCES.vertices]: SELECT_SOURCES.vertices,
    }
    for (const layer of dataLayers(layers)) {
      const twin = twinOf(layers, layer.id)
      expect(twin.source).toBe(selectOf[layer.source ?? ''])
      expect(twin.minzoom).toBeUndefined()
      // up to the data's floor: above it the data draws the selection
      expect(twin.maxzoom).toBeLessThanOrEqual(layer.minzoom ?? 0)
      if (layer.maxzoom !== undefined) expect(twin.maxzoom).toBeLessThanOrEqual(layer.maxzoom)
    }
  })

  test('the twin of a point dot stops at OSM 12, not at its own pin zoom', () => {
    const layers = buildLayers(options)
    const dot = twinOf(layers, 'point-dot')
    expect(dot.maxzoom).toBe(DRAW_ZOOM)
  })

  test('the twin of an icon on a vertex stops at the load zoom', () => {
    const layers = buildLayers(options)
    expect(twinOf(layers, 'vertex-icon').maxzoom).toBe(DETAIL_ZOOM)
  })

  test('the twin of an edited layer is on the same selection source, not the edit one', () => {
    const layers = buildLayers(options)
    const edit = layers.map(view).find((l) => l.id === 'vertex--edit')
    expect(edit?.source).toBe(EDIT_SOURCES.vertices)
    expect(twinOf(layers, 'vertex').source).toBe(SELECT_SOURCES.vertices)
  })

  test('the edit copies start at the same zoom as their layer', () => {
    const layers = buildLayers(options).map(view)
    for (const layer of layers.filter((l) => l.id.endsWith('--edit'))) {
      const original = layers.find((l) => l.id === layer.id.replace(/--edit$/, ''))
      expect(layer.minzoom).toBe(original?.minzoom)
    }
  })

  test('the selection copies are interactive, so the selection can be picked below the floor', () => {
    const ids = interactiveLayerIds(buildLayers(options))
    expect(ids).toContain('vertex--select')
    expect(ids).toContain('point-dot--select')
    expect(ids).toContain('area-fill-partial--select')
  })
})

describe('show only the selection', () => {
  const only = { ...options, selectionOnly: true }

  test('hides every data layer and its edit copy at any zoom', () => {
    for (const layer of buildLayers(only).map(view)) {
      const isData = layer.source !== undefined && DATA_SOURCES.includes(layer.source)
      if (isData && !layer.id.endsWith('--select')) expect(layer.layout?.visibility).toBe('none')
    }
  })

  test('draws the selection copies at every zoom their layer has, without a floor', () => {
    const layers = buildLayers(only)
    for (const layer of dataLayers(layers)) {
      const twin = twinOf(layers, layer.id)
      expect(twin.minzoom).toBeUndefined()
      // its own bound, or MapLibre's maximum: always set, so that a toggle back can set it again
      expect(twin.maxzoom).toBe(layer.maxzoom ?? 24)
    }
  })

  test('leaves the highlight layers visible', () => {
    const layers = buildLayers(only).map(view)
    expect(layers.find((l) => l.id === 'highlight-midpoint')?.layout?.visibility).toBeUndefined()
  })

  test('is off by default: the data layers are visible', () => {
    // the edit halos are hidden by the display (see the display tests), not by this switch
    const data = dataLayers(buildLayers(options)).filter((l) => !l.id.startsWith('edit-halo'))
    for (const layer of data) expect(layer.layout?.visibility ?? 'visible').toBe('visible')
  })
})

describe('the layer list', () => {
  test('ids are unique', () => {
    const ids = buildLayers(options)
      .map(view)
      .map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('the active pin (the hovered and selected points)', () => {
  const active = (layers: LayerSpecification[]) => {
    const found = layers.find((l) => l.id === 'active-point-pin')
    if (!found) throw new Error('no active-point-pin layer')
    return found as unknown as {
      source: string
      minzoom?: number
      filter: unknown
      paint?: unknown
      layout: { 'icon-image': unknown }
    }
  }

  test('draws from its own source, which holds only the hovered and selected points', () => {
    const layer = active(buildLayers(options))
    expect(layer.source).toBe(ACTIVE_SOURCE)
    expect(ACTIVE_SOURCE).not.toBe(SOURCES.points)
    expect(layer.filter).toEqual(['!', ['has', 'addr']])
    expect(layer.layout['icon-image']).toEqual([
      'concat',
      'pin-',
      ['coalesce', ['get', 'icon'], 'none'],
    ])
  })

  test('needs no feature state: no opacity from hover or selection, so no pin is requested for the others', () => {
    const layer = active(buildLayers(options))
    expect(layer.paint).toBeUndefined()
    expect(JSON.stringify(layer)).not.toContain('feature-state')
  })

  test('starts at the symbol floor, as before (below it the selected pins are the point-pin twin)', () => {
    const layer = active(buildLayers(options))
    expect(layer.minzoom).toBe(DETAIL_ZOOM)
    expect(layer.minzoom).toBe(15)
  })

  test('has no edit or selection twin: the source holds the copies the engine keeps current', () => {
    const ids = buildLayers(options).map((l) => l.id)
    expect(ids).not.toContain('active-point-pin--edit')
    expect(ids).not.toContain('active-point-pin--select')
  })

  test('is not picked: a pin never takes a press from the point under it, as before', () => {
    expect(interactiveLayerIds(buildLayers(options))).not.toContain('active-point-pin')
  })

  test('is hidden with the data in selection-only mode, where the selection pins are the twin of point-pin', () => {
    const layers = buildLayers({ ...options, selectionOnly: true })
    expect(active(layers).layout).toMatchObject({ visibility: 'none' })
    // the selected pins are drawn by the twin on the selection source, at every zoom
    expect(twinOf(layers, 'point-pin').layout?.visibility).toBeUndefined()
  })

  test('without icons there is no active pin layer', () => {
    const ids = buildLayers({ ...options, icons: false }).map((l) => l.id)
    expect(ids).not.toContain('active-point-pin')
  })
})

describe('activePinIds', () => {
  test('the hovered node and the selected nodes, each once', () => {
    expect(activePinIds('n1', ['n2', 'n1'])).toEqual(['n1', 'n2'])
    expect(activePinIds(null, ['n3'])).toEqual(['n3'])
    expect(activePinIds('n4', [])).toEqual(['n4'])
  })

  test('nothing when nothing is hovered or selected', () => {
    expect(activePinIds(null, [])).toEqual([])
  })

  test('ways and relations have no pin', () => {
    expect(activePinIds('w5', ['r6', 'w7'])).toEqual([])
    expect(activePinIds('w5', ['r6', 'n8'])).toEqual(['n8'])
  })
})

describe('the pin zoom (PIN_ZOOM = 18: the dot below, the pin from 18)', () => {
  test('the pin layer starts at PIN_ZOOM, an integer, so its tiles are laid out from that zoom only', () => {
    expect(PIN_ZOOM).toBe(18)
    expect(Number.isInteger(PIN_ZOOM)).toBe(true)
    const pin = buildLayers(options)
      .map(view)
      .find((l) => l.id === 'point-pin')
    expect(pin?.minzoom).toBe(PIN_ZOOM)
  })

  test('the dot is drawn up to PIN_ZOOM, so between 17 and 18 a point is a dot as before 17.5', () => {
    const dot = buildLayers(options)
      .map(view)
      .find((l) => l.id === 'point-dot')
    expect(dot?.maxzoom).toBe(PIN_ZOOM)
  })

  test('with pins: all, the pin layer has no zoom range and the dot is hidden at every zoom with icons', () => {
    const layers = buildLayers({ ...options, pins: 'all' }).map(view)
    expect(layers.find((l) => l.id === 'point-pin')?.minzoom).toBe(DETAIL_ZOOM)
    expect(layers.find((l) => l.id === 'point-dot')?.maxzoom).toBe(0.1)
  })

  test('the active pin and the selection pin keep their own zoom: they do not start at PIN_ZOOM', () => {
    const layers = buildLayers(options).map(view)
    expect(layers.find((l) => l.id === 'active-point-pin')?.minzoom).toBe(DETAIL_ZOOM)
    expect(layers.find((l) => l.id === 'point-pin--select')?.maxzoom).toBe(DETAIL_ZOOM)
  })
})

describe('the selection twins when nothing is selected (selectTwins)', () => {
  // the edit halos' twins are hidden by the display (the look shows no edits), not by the selection: left out here
  const selectTwinIds = (layers: LayerSpecification[]) =>
    layers
      .map(view)
      .filter((l) => l.id.endsWith('--select') && !l.id.startsWith('edit-halo'))
      .map((l) => l.id)
  const hidden = (layers: LayerSpecification[], id: string) =>
    view(layers.find((l) => view(l).id === id)!).layout?.visibility === 'none'

  test('by default every selection twin is shown, as before', () => {
    const layers = buildLayers(options)
    expect(selectTwinIds(layers).length).toBeGreaterThan(20)
    for (const id of selectTwinIds(layers)) expect(hidden(layers, id)).toBe(false)
  })

  test('with nothing selected the twins are hidden, and so is nothing else', () => {
    const layers = buildLayers({ ...options, selectTwins: false })
    const twins = selectTwinIds(layers)
    expect(twins.length).toBeGreaterThan(20)
    for (const id of twins) expect(hidden(layers, id)).toBe(true)
    // the data, its edit copies and the highlight layers are as they are with a selection
    const shown = buildLayers(options)
    expect(layers.map(view).map((l) => l.id)).toEqual(shown.map(view).map((l) => l.id))
    for (const layer of layers.map(view).filter((l) => !l.id.endsWith('--select')))
      expect(layer.layout?.visibility).toBe(
        shown.map(view).find((l) => l.id === layer.id)?.layout?.visibility,
      )
  })

  test('a hidden twin keeps its zoom range, so it is also shown with the right floor when a selection comes', () => {
    const shown = buildLayers(options)
    const hiddenList = buildLayers({ ...options, selectTwins: false })
    for (const id of selectTwinIds(shown))
      expect(view(hiddenList.find((l) => view(l).id === id)!).maxzoom).toBe(
        view(shown.find((l) => view(l).id === id)!).maxzoom,
      )
  })

  test('with selectionOnly the twins are shown whatever selectTwins says (the data is hidden)', () => {
    const layers = buildLayers({ ...options, selectionOnly: true, selectTwins: false })
    for (const id of selectTwinIds(layers)) expect(hidden(layers, id)).toBe(false)
  })

  test('the ids are the same in every state and unique', () => {
    const states = [
      options,
      { ...options, selectTwins: false },
      { ...options, selectionOnly: true },
      { ...options, selectTwins: true, selectionOnly: true },
    ]
    const lists = states.map((o) => buildLayers(o).map((l) => view(l).id))
    const first = lists[0] ?? []
    for (const list of lists) {
      expect(new Set(list).size).toBe(list.length)
      expect(list).toEqual(first)
    }
  })

  test('the interactive layers are the same in every state: a hidden twin is picked only when it is shown', () => {
    const ids = interactiveLayerIds(buildLayers({ ...options, selectTwins: false }))
    expect(ids).toEqual(interactiveLayerIds(buildLayers(options)))
    expect(ids).toContain('vertex--select')
    expect(ids).toContain('point-dot--select')
  })

  test('the twins are shown again when the selection comes back', () => {
    const layers = buildLayers({ ...options, selectTwins: true })
    for (const id of selectTwinIds(layers)) expect(hidden(layers, id)).toBe(false)
  })
})

describe('the viewfield cones', () => {
  test('one layer per slot on the vertex and the point source, from the cone zoom, with no selection twin', () => {
    const layers = buildLayers(options).map(view)
    const cones = layers.filter((l) => l.id.startsWith('cone-'))
    expect(cones.map((l) => l.id).sort()).toEqual([
      'cone-p0',
      'cone-p0--edit',
      'cone-p1',
      'cone-p1--edit',
      'cone-v0',
      'cone-v0--edit',
      'cone-v1',
      'cone-v1--edit',
    ])
    for (const layer of cones) expect(layer.minzoom).toBe(CONE_ZOOM)
    expect(layers.some((l) => l.id === 'cone-v0--select' || l.id === 'cone-p0--select')).toBe(false)
  })

  test('each cone layer turns its image by the bearing of its own slot and is not interactive', () => {
    const layers = buildLayers(options)
    const cone = layers.find((l) => l.id === 'cone-p1') as unknown as {
      filter: unknown
      layout: Record<string, unknown>
    }
    expect(cone.filter).toEqual(['has', 'd1'])
    expect(cone.layout['icon-rotate']).toEqual(['get', 'd1'])
    expect(cone.layout['icon-rotation-alignment']).toBe('map')
    expect(interactiveLayerIds(layers).some((id) => id.startsWith('cone-'))).toBe(false)
  })

  test('the cones are drawn after the lines and before the vertices and points', () => {
    const ids = buildLayers(options).map((l) => l.id)
    const at = (id: string) => ids.indexOf(id)
    expect(at('cone-v0')).toBeGreaterThan(at('area-stroke'))
    expect(at('cone-v0')).toBeLessThan(at('vertex'))
    expect(at('cone-p0')).toBeLessThan(at('point-dot'))
  })
})

describe('display: the wireframe and the changes in colour (iD)', () => {
  const ids = (layers: LayerSpecification[]) => layers.map((l) => l.id)
  const byId = (layers: LayerSpecification[], id: string) =>
    layers.find((l) => l.id === id) as unknown as
      | {
          paint?: Record<string, unknown>
          layout?: { visibility?: string }
          filter?: unknown
          source?: string
        }
      | undefined
  // the layers stay in the list in every display (a layer added later would be drawn on top): hidden by visibility
  const visible = (layers: LayerSpecification[], id: string) =>
    (byId(layers, id)?.layout?.visibility ?? 'visible') === 'visible'

  test('the look shows the area band and the casings; the wireframe hides them, and keeps them in the list', () => {
    const look = buildLayers(options)
    expect(visible(look, 'area-fill-partial')).toBe(true)
    expect(visible(look, 'line-casing-0')).toBe(true)
    const wire = buildLayers({ ...options, display: 'wireframe' })
    expect(visible(wire, 'area-fill-partial')).toBe(false)
    expect(visible(wire, 'line-casing-0')).toBe(false)
    expect(ids(wire)).toContain('area-fill-partial')
  })

  test('the wireframe strokes are 1px at half opacity, and it hides the direction markers', () => {
    const wire = buildLayers({ ...options, display: 'wireframe' })
    const stroke = byId(wire, 'line-stroke-0')
    expect(stroke?.paint?.['line-width']).toBe(1)
    // the opacity is wrapped by the edit copy's rule (0 while the feature is being edited), so read it as text
    expect(JSON.stringify(stroke?.paint?.['line-opacity'])).toContain('0.5')
    expect(byId(wire, 'area-stroke')?.paint?.['line-width']).toBe(1)
    expect(JSON.stringify(byId(wire, 'area-stroke')?.paint?.['line-opacity'])).toContain('0.5')
    expect(visible(wire, 'line-oneway')).toBe(false)
    expect(visible(wire, 'area-sided')).toBe(false)
    expect(visible(buildLayers(options), 'line-oneway')).toBe(true)
  })

  test('the wireframe keeps the points and the vertices', () => {
    const wire = buildLayers({ ...options, display: 'wireframe' })
    expect(visible(wire, 'vertex')).toBe(true)
    expect(visible(wire, 'point-dot')).toBe(true)
  })

  test('the changes in colour draw a halo under the edited features, in the colour of their edit', () => {
    expect(visible(buildLayers(options), 'edit-halo')).toBe(false)
    const edits = buildLayers({ ...options, display: 'edits' })
    const halo = byId(edits, 'edit-halo')
    expect(halo?.source).toBe(SOURCES.lines)
    expect(halo?.filter).toEqual(['has', 'ed'])
    expect(JSON.stringify(halo?.paint)).toContain('#85ff67')
    expect(JSON.stringify(halo?.paint)).toContain('#fcde5a')
    expect(visible(edits, 'edit-halo')).toBe(true)
    expect(visible(edits, 'edit-halo-areas')).toBe(true)
    expect(visible(edits, 'edit-halo-vertex')).toBe(true)
    expect(visible(edits, 'edit-halo-points')).toBe(true)
  })

  test('the edit halos have their selection and edit copies, as the layers they sit under', () => {
    const edits = ids(buildLayers({ ...options, display: 'edits' }))
    expect(edits).toContain('edit-halo--select')
    expect(edits).toContain('edit-halo--edit')
  })

  test('one display at a time, and an unknown value is the look', () => {
    const wire = buildLayers({ ...options, display: 'wireframe' })
    expect(visible(wire, 'edit-halo')).toBe(false)
    expect(visible(buildLayers({ ...options, display: 'edits' }), 'area-fill-partial')).toBe(true)
    expect(displayOf('wireframe')).toBe('wireframe')
    expect(displayOf('edits')).toBe('edits')
    expect(displayOf('full')).toBe('normal')
    expect(displayOf(null)).toBe('normal')
  })

  test('a dashed stroke keeps a data-driven dasharray in every display: the wireframe changes only its outputs', () => {
    // a constant at runtime breaks the layer in MapLibre (layers.ts dashMatch), so the type must not change
    const dashed = { ...options, dashes: new Map([['dashed', [4, 3]]]) }
    for (const id of ['line-stroke-dashed-0', 'area-stroke-dashed']) {
      for (const display of ['normal', 'wireframe'] as const) {
        const value = byId(buildLayers({ ...dashed, display }), id)?.paint?.['line-dasharray']
        expect(Array.isArray(value) && value[0]).toBe('match')
      }
      const solid = JSON.stringify(
        byId(buildLayers({ ...dashed, display: 'wireframe' }), id)?.paint?.['line-dasharray'],
      )
      expect(solid).toContain('[1,0]')
      expect(solid).not.toContain('[4,3]')
    }
  })
})

describe('the focus glow (a relation open beside the inspector)', () => {
  type Painted = { id: string; paint?: Record<string, unknown> }
  const find = (layers: LayerSpecification[], id: string) =>
    layers.find((l) => l.id === id) as unknown as Painted | undefined
  const FOCUS_LAYERS = [
    'focus-halo-areas',
    'focus-halo',
    'focus-halo-vertex',
    'focus-halo-points',
    'focus-halo-pin',
  ]

  test('is violet, reads the focus state and nothing else for its opacity', () => {
    const layers = buildLayers(options)
    for (const id of FOCUS_LAYERS) {
      const layer = find(layers, id)!
      expect(layer).toBeDefined()
      const colour = layer.paint?.['line-color'] ?? layer.paint?.['circle-color']
      expect(colour).toBe('#7c3aed')
      const opacity = JSON.stringify(
        layer.paint?.['line-opacity'] ?? layer.paint?.['circle-opacity'],
      )
      expect(opacity).toContain('"feature-state","focus"')
      expect(opacity).not.toContain('related')
      expect(opacity).not.toContain('hover')
    }
  })

  test('is wider and more opaque than the related halo', () => {
    const layers = buildLayers(options)
    const related = find(layers, 'highlight-halo-areas')!
    const focus = find(layers, 'focus-halo-areas')!
    expect(JSON.stringify(focus.paint?.['line-width'])).toContain('2.2')
    expect(JSON.stringify(related.paint?.['line-width'])).not.toContain('2.2')
    expect(JSON.stringify(focus.paint?.['line-opacity'])).toContain('0.55')
  })

  test('each glow layer has its edit and selection twins, so it follows a dragged node', () => {
    const layers = buildLayers(options)
    for (const id of FOCUS_LAYERS) {
      expect(find(layers, `${id}--select`)).toBeDefined()
      expect(find(layers, `${id}--edit`)).toBeDefined()
    }
  })

  test('sits under the data layers, above the related halo', () => {
    const ids = buildLayers(options).map((l) => l.id)
    expect(ids.indexOf('focus-halo')).toBeGreaterThan(ids.indexOf('highlight-halo'))
    expect(ids.indexOf('focus-halo')).toBeLessThan(ids.indexOf('vertex'))
    expect(ids.indexOf('focus-halo-points')).toBeLessThan(ids.indexOf('point-pin'))
  })
})
