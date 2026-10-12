import { OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import { deleteFeatureFix } from '../fixes.ts'
import { locationOf } from '../geo.ts'
import { descriptiveKeys } from '../tags.ts'
import type { Issue, Rule } from '../types.ts'

function kindOf(entity: OsmEntity, graph: Graph): string {
  if (entity instanceof OsmNode) return 'point'
  if (entity instanceof OsmWay) return entity.geometry(graph) === 'area' ? 'area' : 'line'
  return 'relation'
}

/** Rapid's `missing_tag` checks, in its order. Returns the message, or `undefined` when all is well. */
function problemOf(entity: OsmEntity, graph: Graph): string | undefined {
  const tags = entity.tags
  const isVertex = entity instanceof OsmNode && graph.parentWays(entity).length > 0
  const isRelation = entity instanceof OsmRelation

  // A vertex is part of a way, and a member of a relation says what it is through the relation
  if (!isVertex && !entity.hasParentRelations(graph)) {
    const kind = kindOf(entity, graph)
    if (Object.keys(tags).length === 0) return `This ${kind} has no tags`
    // A multipolygon whose only descriptive tag is `type` is fine: its outer way may have the tags
    const descriptive = descriptiveKeys(tags)
    const bareMultipolygon = isRelation && descriptive.length === 1 && tags.type === 'multipolygon'
    if (descriptive.length === 0 || bareMultipolygon) return `This ${kind} has no descriptive tags`
    if (isRelation && !tags.type) return 'This relation has no type'
  }

  // Flagged even as a member of a relation: `highway=road` says nothing about the road
  if (entity instanceof OsmWay && tags.highway === 'road')
    return 'This road has no specific highway type'
  return undefined
}

/** Features that have no tag saying what they are */
export const missingTag: Rule = {
  id: 'missing_tag',
  label: 'Missing tags',
  validate(entity, { graph }): Issue[] {
    const message = problemOf(entity, graph)
    if (message === undefined) return []
    const loc = locationOf(entity, graph)
    return [
      {
        id: `missing_tag:${entity.id}`,
        rule: 'missing_tag',
        severity: 'warning',
        message,
        entityIds: [entity.id],
        ...(loc ? { loc } : {}),
        fixes: [deleteFeatureFix(entity)],
      },
    ]
  },
}
