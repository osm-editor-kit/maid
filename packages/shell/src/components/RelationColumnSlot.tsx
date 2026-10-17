import { m } from '@osm-editor-kit/maid-i18n'
import { OsmRelation } from '@osm-editor-kit/maid-model'
import { lazyComponent } from '@osm-editor-kit/maid-ui'
import { useEffect } from 'react'
import { openRelationActions } from '../modules/relations-open-store'
import { useShell } from '../shell-context'

/** The frame of the column while its code loads: the same width, so the inspector card does not move */
const columnFrame = <aside aria-label={m.relations_column_label()} className="w-[22rem] shrink-0" />
const RelationColumn = lazyComponent(
  () =>
    import('../modules/relations-column').then((module) => ({ default: module.RelationColumn })),
  columnFrame,
)

/**
 * The open relation beside the inspector (Shell's `sidebarStart`). It closes when the relation is gone (deleted, or
 * undone after it was made): only once it was there, as a link's relation arrives with the data. Nothing selected
 * closes it too (url/open-relation.ts).
 */
export function RelationColumnSlot({ id }: { id: EntityID }) {
  const { engine, editor } = useShell()
  useEffect(
    function closeWhenTheRelationIsGone() {
      let seen = engine.entity(id) !== undefined
      const unsubscribe = engine.subscribe(() => {
        if (engine.entity(id)) seen = true
        else if (seen) openRelationActions.close()
      })
      return () => {
        unsubscribe()
      }
    },
    [engine, id],
  )
  useEffect(
    function glowTheRelationOnTheMap() {
      // the relation and its members, again when they change (a member added or removed, a sub-route loaded): the
      // engine tells of every change, a drag frame too, so the members are only walked when one of these objects differs
      let seen: readonly unknown[] = []
      const focus = () => {
        const graph = editor.history.staging.graph
        const relation = graph.hasEntity(id)
        const now = [
          relation,
          ...(relation instanceof OsmRelation
            ? relation.members
                .filter((member) => member.type === 'relation')
                .map((member) => graph.hasEntity(member.id))
            : []),
        ]
        if (now.length === seen.length && now.every((item, index) => item === seen[index])) return
        seen = now
        engine.setFocus([id, ...engine.relatedOf(id)])
      }
      focus()
      const unsubscribe = engine.subscribe(focus)
      return () => {
        unsubscribe()
        engine.setFocus(null)
      }
    },
    [engine, editor, id],
  )
  return <RelationColumn id={id} />
}
