import type { Tags } from '@osm-editor-kit/maid-style'
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
  glyphs: GlyphContext = {},
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
    const feature = id.startsWith('w') ? directionFeature(data, id, 'direction', glyphs) : undefined
    if (feature) directions.push(feature)
  }
  return { nodes: new Set(shape.keys()), features: [...shape.values(), ...directions] }
}

/** What the map knows of a way's line, for its glyph: whether it is drawn as a line, its stroke widths (with a lens) */
export type GlyphContext = {
  isLine?: (wayId: string) => boolean
  widths?: (tags: Tags) => { sw: number; swl: number }
}

/**
 * The way's line with its active glyph (layers.ts highlight-direction): the riding direction with the drawing triangle
 * (glyph.ts), for a selected (`direction`) or the hovered way (`hover-direction`). iD shows neither; this is Maid's
 * (ADR 0017). A line traffic uses and that has no glyph of its own is two-way (`both`); any other open line shows its
 * drawing direction alone (`drawn`). A way the map draws as an area shows nothing.
 */
export function directionFeature(
  data: OsmData,
  wayId: string,
  state: 'direction' | 'hover-direction',
  { isLine, widths = lineStrokeWidths }: GlyphContext = {},
): Feature | undefined {
  const way = data.way(wayId)
  if (!way) return undefined
  // only a way the map draws as a line has glyphs: a closed one may be an area (a plaza, a platform) or a line (a
  // roundabout); without the map's answer, an open way is a line and a closed one is a line if it has a riding direction
  const closed = way.nodes[0] === way.nodes[way.nodes.length - 1]
  const riding = ridingOf(way.tags)
  if (!(isLine ? isLine(wayId) : !closed || riding !== undefined)) return undefined
  const g: GlyphShape = riding ?? (isTravelled(way.tags) ? 'both' : 'drawn')
  const coordinates = wayVertices(data, wayId).map((vertex) => vertex.geometry.coordinates)
  if (coordinates.length < 2) return undefined
  return {
    type: 'Feature',
    // the stroke widths, so the glyph has the size it has on the data layer (layers.ts glyphSize)
    properties: {
      id: wayId,
      state,
      g,
      ...widths(way.tags),
      ...(isLightGlyph(way.tags) ? { lt: 1 } : {}),
    },
    geometry: { type: 'LineString', coordinates },
  }
}
