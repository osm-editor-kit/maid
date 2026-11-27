// The shape points and direction glyphs of the selected ways, for the highlight source (the engine's refreshShape()).
// Pure over the data and the selection: the caller keeps the result and sends it.
import type { Feature } from 'geojson'
import { lineStrokeWidths, wayVertices } from './build'
import type { OsmData } from './data'
import { isLightGlyph, isTravelled, ridingOf } from './direction'
import type { GlyphShape } from './glyph'

/**
 * The shape points of the selection, in the small highlight source: all nodes of the selected
 * ways and, for a selected vertex, of the ways it belongs to, as iD shows them. They can be
 * picked and dragged like any vertex.
 *
 * A selected node among them gets iD's selection shadow here (`halo`, layers.ts highlight-halo-shape) unless
 * `hasHalo` says the map draws one for it already: a vertex in the data's vertex source has its own (the corner of a
 * building does not, as untagged vertices are drawn only as shape points).
 */
export function selectionShape(
  data: OsmData,
  selectedIds: readonly string[],
  hasHalo: (id: string) => boolean = () => false,
) {
  const selected = new Set(selectedIds)
  const ways = new Set<string>()
  for (const id of selectedIds) {
    switch (id.charAt(0)) {
      case 'w':
        ways.add(id)
        break
      case 'n':
        for (const wayId of data.nodeWays.get(id) ?? []) ways.add(wayId)
        break
    }
  }
  const shape = new Map<string, Feature>()
  for (const wayId of ways) {
    for (const vertex of wayVertices(data, wayId)) {
      const id = vertex.properties?.id
      if (typeof id !== 'string') continue
      vertex.properties =
        selected.has(id) && !hasHalo(id)
          ? { id, state: 'shape', halo: true }
          : { id, state: 'shape' }
      shape.set(id, vertex)
    }
  }
  // the direction glyphs of each selected way (not of the ways of a selected vertex: their own glyphs stay)
  const directions: Feature[] = []
  for (const id of selectedIds) {
    const feature = id.startsWith('w') ? directionFeature(data, id, 'direction') : undefined
    if (feature) directions.push(feature)
  }
  return { nodes: new Set(shape.keys()), features: [...shape.values(), ...directions] }
}

/**
 * The way's line with its active glyph (layers.ts highlight-direction): the riding direction with the drawing triangle
 * (glyph.ts), for a selected (`direction`) or the hovered way (`hover-direction`). iD shows neither; this is Maid's
 * (ADR 0021). A line traffic uses and that has no glyph of its own is two-way (`both`); any other open line shows its
 * drawing direction alone (`drawn`); a closed way that is neither (a building, a fenced area) shows nothing.
 */
export function directionFeature(
  data: OsmData,
  wayId: string,
  state: 'direction' | 'hover-direction',
): Feature | undefined {
  const way = data.way(wayId)
  if (!way) return undefined
  const closed = way.nodes[0] === way.nodes[way.nodes.length - 1]
  const g: GlyphShape | undefined =
    ridingOf(way.tags) ?? (isTravelled(way.tags) ? 'both' : closed ? undefined : 'drawn')
  if (g === undefined) return undefined
  const coordinates = wayVertices(data, wayId).map((vertex) => vertex.geometry.coordinates)
  if (coordinates.length < 2) return undefined
  return {
    type: 'Feature',
    // the stroke widths, so the glyph has the size it has on the data layer (layers.ts glyphSize)
    properties: {
      id: wayId,
      state,
      g,
      ...lineStrokeWidths(way.tags),
      ...(isLightGlyph(way.tags) ? { lt: 1 } : {}),
    },
    geometry: { type: 'LineString', coordinates },
  }
}
