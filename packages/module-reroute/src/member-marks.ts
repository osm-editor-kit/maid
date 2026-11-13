/**
 * The reroute's changes as marks in the route's list of members (Tobias, 2026-11-13: the changes in the list on the
 * left, not in a window over the map): the ways that are members now and were not when the mode began get a plus, the
 * ways that were and are not any more stay in the list struck through, after the member before them that is still
 * there. Worked out from the members alone, so an undo or a redo shows what is true after it. Pure.
 */
import type { OsmRelation } from '@osm-editor-kit/maid-model'
import type { RelationMemberMarks, RemovedMemberMark } from '@osm-editor-kit/maid-ui'

/** The way members of a relation, in order */
export function wayMembers(relation: OsmRelation | undefined): EntityID[] {
  return (relation?.members ?? [])
    .filter((member) => member.type === 'way')
    .map((member) => member.id)
}

/** The marks of the change from the way members `before` (when the mode began) to the relation now */
export function memberMarks(
  relationId: EntityID,
  before: readonly EntityID[],
  now: readonly EntityID[],
): RelationMemberMarks {
  const was = new Set(before)
  const is = new Set(now)
  const added = [...new Set(now.filter((id) => !was.has(id)))]
  const removed: RemovedMemberMark[] = []
  const seen = new Set<EntityID>()
  let after: EntityID | undefined
  for (const id of before) {
    if (is.has(id)) {
      after = id
      continue
    }
    if (seen.has(id)) continue
    seen.add(id)
    removed.push({ id, after })
  }
  return { relationId, added, removed }
}
