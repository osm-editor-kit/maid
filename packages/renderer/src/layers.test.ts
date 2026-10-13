import { describe, expect, test } from 'bun:test'
import type { LayerSpecification } from 'maplibre-gl'
import {
  ACTIVE_SOURCE,
  activePinIds,
  buildLayers,
  DETAIL_ZOOM,
  DRAW_ZOOM,
  EDIT_SOURCES,
  interactiveLayerIds,
  type LayerOptions,
  SELECT_SOURCES,
  SOURCES,
} from './layers'

const options: LayerOptions = {
  fill: 'partial',
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
  return layers
    .map(view)
    .filter(
      (l) =>
        l.source !== undefined && DATA_SOURCES.includes(l.source) && !/--(edit|select)$/.test(l.id),
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
    for (const layer of dataLayers(buildLayers(options)))
      expect(layer.layout?.visibility).toBeUndefined()
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
