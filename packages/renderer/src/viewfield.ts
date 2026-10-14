/**
 * Viewfields ("Sichtkegel"): the wedge iD draws on a point or vertex that has a direction (a camera, a sign, a bench,
 * traffic signals). One wedge per direction, its narrow end just above the node, pointing that way.
 *
 * The builder puts the directions into the node's feature as `d0`, `d1` (see `addViewfields`). layers.ts draws one
 * symbol layer per slot on the vertex and point sources, rotating the cone image by that property. So a cone is part
 * of its node's feature. It follows the node through the edit tier, the selection copies and the filters, and a tag
 * change rebuilds it with the node. Nodes without a direction get no property and no work beyond `hasDirectionTags`.
 */
import type { Graph, OsmNode } from '@osm-editor-kit/maid-model'
import type { Tags } from '@osm-editor-kit/maid-style'

/**
 * MapLibre zoom from which cones are drawn. iD draws viewfields from OSM zoom 18 (iD's `zoom >= 18` in
 * svg/vertices.js and svg/points.js), and MapLibre's zoom is OSM zoom minus one (layers.ts).
 */
export const CONE_ZOOM = 17

/**
 * The number of directions per node that get a cone. One layer per slot (layers.ts), so the cost is layers, not
 * features. The fixtures have at most two per node, except one node with three in `medium`, which gets two cones.
 * ConeProps must list the same slots.
 */
export const CONE_SLOTS = 2

/** The cone image's id (direction-images.ts draws it) */
export const CONE_IMAGE = 'viewfield'

/** The direction properties of a point or vertex feature: the bearings of its cones, clockwise from north */
export type ConeProps = { d0?: number; d1?: number }

/**
 * The cheap test for every tagged node, before `directions()` runs. It checks the tags that `directions()` reads:
 * `direction`, `stop` (an all-way stop on an intersection) and any `*:direction`. Keys are matched without a regex.
 * OSM's direction keys are lower case, so an upper-case `:Direction` key is not seen here. iD's regex is
 * case-insensitive.
 */
export function hasDirectionTags(tags: Tags): boolean {
  if (tags.direction !== undefined || tags.stop !== undefined) return true
  for (const key in tags) if (key.endsWith(':direction')) return true
  return false
}

/**
 * Puts the first CONE_SLOTS bearings of a node into its feature's properties. Nothing is set for a node with no
 * usable direction. `directions()` (model OsmNode) gives true bearings: the model works in Mercator world
 * coordinates, which are conformal, and handles numbers, cardinals, `;` lists, `forward`/`backward` on a way's vertex
 * and `*:direction` keys, as iD and Rapid do.
 */
export function addViewfields(props: ConeProps, node: OsmNode, graph: Graph): void {
  const angles = node.directions(graph)
  if (angles.length > 0) props.d0 = angles[0]
  if (angles.length > 1) props.d1 = angles[1]
}
