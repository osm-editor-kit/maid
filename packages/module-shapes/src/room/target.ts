/**
 * The building a room is drawn into: the one selected building, as a closed way (for a multipolygon building, its outer
 * way). The button of the tool asks this on each change of the selection, and the mode starts with its answer.
 */
import { OsmRelation, OsmWay, type Graph } from '@osm-editor-kit/maid-model'
import { cutCheck, type CutRefusal } from '../cut/cut.ts'

/** A building tag that says it is one: `building` or `building:part`, not `no` */
function isBuilding(tags: Readonly<Record<string, string>>): boolean {
  const value = tags.building ?? tags['building:part']
  return value !== undefined && value !== 'no'
}

/**
 * The way a room is drawn into, or why there is none.
 * @param   graph    - The graph that holds the selection
 * @param   selected - The selected ids
 * @return  `{ wayId }` for one selected building whose outline a line can cross; `{ refused }` when its outline cannot
 *          take a room (the same reasons as the cut); `{ select: true }` when the selection is not one building
 */
export function roomTargetOf(
  graph: Graph,
  selected: readonly string[],
): { wayId: string } | { refused: CutRefusal } | { select: true } {
  if (selected.length !== 1) return { select: true }
  const entity = graph.hasEntity(selected[0]!)
  let wayId: string | undefined
  if (entity instanceof OsmWay && entity.isClosed() && isBuilding(entity.tags)) wayId = entity.id
  if (entity instanceof OsmRelation && entity.isMultipolygon() && isBuilding(entity.tags))
    wayId = entity.membersByRole('outer')[0]?.id
  if (wayId === undefined) return { select: true }
  const refused = cutCheck(graph, wayId)
  return refused ?? { wayId }
}
