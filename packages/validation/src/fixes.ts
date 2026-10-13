import {
  OsmNode,
  OsmRelation,
  actionDeleteNode,
  actionDeleteRelation,
  actionDeleteWay,
} from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'

/** "Delete this feature", the fix Rapid offers for features that have no tags or no connection */
export function deleteFeatureFix(entity: OsmEntity) {
  return {
    id: 'delete_feature',
    label: 'Delete this feature',
    annotation: 'Deleted a feature',
    actions: () => [deleteAction(entity)],
  }
}

function deleteAction(entity: OsmEntity) {
  if (entity instanceof OsmNode) return actionDeleteNode(entity.id)
  if (entity instanceof OsmRelation) return actionDeleteRelation(entity.id)
  return actionDeleteWay(entity.id)
}
