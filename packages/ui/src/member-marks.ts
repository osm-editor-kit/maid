/**
 * What a module is changing in a relation's members, for the relation column to show in its list (Tobias, 2026-11-13:
 * the reroute's changes in the route's list of ways, not in a window over the map). The ways that joined get a plus,
 * the ways that left stay in the list struck through, where they were. Setting marks opens the column on that relation.
 * The column shows a mark only while it is true of the data: an undo that takes the change back takes its marks away.
 */
import { create } from 'zustand'

/** A member that left: shown after the member `after` (undefined: at the top), struck through */
export type RemovedMemberMark = { id: EntityID; after: EntityID | undefined }

export type RelationMemberMarks = {
  relationId: EntityID
  added: readonly EntityID[]
  removed: readonly RemovedMemberMark[]
}

const useMemberMarksStore = create<{ marks?: RelationMemberMarks }>(() => ({}))

/** Shows these marks in the relation column (and opens it on the relation), or takes them away with undefined */
export function setRelationMemberMarks(marks: RelationMemberMarks | undefined) {
  useMemberMarksStore.setState({ marks })
}

/** The marks now, for code outside React */
export function readRelationMemberMarks(): RelationMemberMarks | undefined {
  return useMemberMarksStore.getState().marks
}

/** The marks of every relation, for the column */
export const useRelationMemberMarks = () => useMemberMarksStore((state) => state.marks)
