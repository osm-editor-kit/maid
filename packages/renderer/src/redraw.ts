import { type Difference, type OsmEntity, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
// Rebuilds the features of the entities that changed, from the staging graph, and says what leaves the map.
// Pure over the data, the builder and the feature sources: nothing is sent to MapLibre here.
import type { Feature } from 'geojson'
import type { FeatureBatch, FeatureBuilder, SourceName } from './build'
import type { OsmData } from './data'

/** Whether an entity moved between the two sides of a change. A missing side or position counts as moved. */
function locMoved(base: OsmEntity | undefined, head: OsmEntity | undefined) {
  // only nodes have a position; a way gives undefined and counts as moved (ways are always rebuilt anyway)
  const from = base instanceof OsmNode ? base.loc : undefined
  const to = head instanceof OsmNode ? head.loc : undefined
  if (!from || !to) return true
  return from[0] !== to[0] || from[1] !== to[1]
}

export function movedOf(differences: readonly Difference[]) {
  // the union of all differences, each id once; a node that moved in any of them moves its ways
  const moved = new Map<string, boolean>()
  for (const difference of differences)
    for (const [id, { base, head }] of difference.changes) {
      moved.set(id, (moved.get(id) ?? false) || locMoved(base, head))
      // A way that came, went or changed its nodes changes what its nodes are: a vertex can
      // become a junction, an end or a standalone point. Those nodes are not in the difference.
      const from = base instanceof OsmWay ? base.nodes : undefined
      const to = head instanceof OsmWay ? head.nodes : undefined
      if (from !== to)
        for (const nodeId of [...(from ?? []), ...(to ?? [])])
          if (!moved.has(nodeId)) moved.set(nodeId, false)
    }
  return moved
}

/**
 * Rebuilds the features that show the given entities, from the current staging graph. Nothing
 * is sent to MapLibre: the caller removes the features in `remove` and sends `batch`.
 * A node rebuilds its vertex, or its point if it is standalone. If the node moved (`moved`), it
 * also rebuilds the ways that use it, because their shape depends on the position only.
 * A way rebuilds its line or area, a multipolygon relation its area. An id that is no longer in
 * the graph loses its feature. Each feature is built once, however many ids need it.
 */
export function redrawEntities(
  data: OsmData,
  builder: FeatureBuilder,
  featureSource: Map<string, SourceName>,
  entities: Iterable<{ id: string; moved: boolean }>,
) {
  const batch: FeatureBatch = { areas: [], lines: [], points: [], vertices: [] }
  const remove: [SourceName, string][] = []
  const placed = new Set<string>()
  // records what a feature is now: its source and feature, or nothing if it is no longer drawn
  const place = (id: string, drawn?: { source: SourceName; feature: Feature }) => {
    if (placed.has(id)) return
    placed.add(id)
    if (drawn) batch[drawn.source].push(drawn.feature)
    // a way can change between line and area, or stop being drawn
    const previous = featureSource.get(id)
    if (previous && previous !== drawn?.source) remove.push([previous, id])
  }
  // the entities may be an iterator: they are read twice, once for the multipolygons and once for the rest
  const list = [...entities]
  // the area of a multipolygon is drawn from its member ways: it follows when one of them changes
  const multipolygons = new Set<string>()
  const memberOf = (wayId: string) => {
    for (const relationId of data.wayMultipolygons.get(wayId) ?? []) multipolygons.add(relationId)
  }
  for (const { id, moved } of list) {
    switch (id.charAt(0)) {
      case 'n':
        if (moved && data.node(id) && data.nodeWays.has(id))
          for (const wayId of data.nodeWays.get(id) ?? []) memberOf(wayId)
        break
      case 'w':
        memberOf(id)
        break
      case 'r':
        multipolygons.add(id)
        break
    }
  }
  // before the ways: a multipolygon's build decides which of its untagged members are drawn as its outline,
  // and those are placed here, so the ways below leave them alone. The shape comes from the data, so the order
  // does not change what is drawn.
  for (const id of multipolygons) {
    const relation = data.relation(id)
    if (!relation || relation.tags.type !== 'multipolygon') {
      place(id)
      continue
    }
    // build() also returns multipolygons that were waiting for members, and their outlines: those are drawn too
    const out = builder.build({ nodes: [], ways: [], relations: [relation] })
    const area = out.areas.find((f) => f.id === id)
    place(id, area && { source: 'areas', feature: area })
    for (const f of out.areas) if (f.id !== id) batch.areas.push(f)
    for (const f of out.lines) place(String(f.id), { source: 'lines', feature: f })
  }
  for (const { id, moved } of list) {
    switch (id.charAt(0)) {
      case 'n': {
        const node = data.node(id)
        if (!node) {
          place(id)
        } else if (data.nodeWays.has(id)) {
          if (moved)
            for (const wayId of data.nodeWays.get(id) ?? []) {
              // a way that another node or a multipolygon already placed is built already: check before building
              if (!placed.has(wayId)) {
                const way = data.way(wayId)
                if (way) place(wayId, builder.buildWay(way))
              }
            }
          const vertex = builder.refreshVertex(node)
          place(id, vertex && { source: 'vertices', feature: vertex })
        } else {
          const point = builder.buildPoint(node)
          place(id, point && { source: 'points', feature: point })
        }
        break
      }
      case 'w':
        if (!placed.has(id)) {
          const way = data.way(id)
          place(id, way && builder.buildWay(way))
        }
        break
    }
  }
  // outlines that a complete multipolygon replaced and that were not placed above leave the map
  for (const [source, id] of builder.takeRemoved()) if (!placed.has(id)) remove.push([source, id])
  return { batch, remove }
}
