import { XMarkIcon } from '@heroicons/react/16/solid'
import { m } from '@osm-editor-kit/maid-i18n'
import { OsmRelation } from '@osm-editor-kit/maid-model'
import { RELATION_ICON, Tooltip } from '@osm-editor-kit/maid-ui'
import { useSyncExternalStore } from 'react'
import { relationBarActions, useRelationBarIDs } from '../modules/relations-bar-store'
import { colourOf, dotNeedsRing, relationLabel } from '../modules/relations-logic'
import { openRelationActions, useOpenRelationId } from '../modules/relations-open-store'
import { useSelection } from '../selection'
import { useShell } from '../shell-context'
import { PresetIcon } from './PresetIcon'

// The bar hangs from the map's bottom left corner, the pills side by side; a long bar scrolls sideways. The right edge
// stays free for the imagery's attribution. The bar lets the pointer through to the map, its pills take it.
const BAR =
  'pointer-events-none absolute right-24 bottom-2 left-2 z-10 flex items-center gap-1.5 overflow-x-auto p-0.5'
const PILL =
  'pointer-events-auto flex h-8 max-w-48 shrink-0 items-center rounded-full text-xs font-medium shadow-sm ring-1 touch:h-10'
const PILL_IDLE =
  'bg-white text-zinc-900 ring-zinc-950/10 hover:bg-violet-50 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10 dark:hover:bg-zinc-700'
const PILL_OPEN =
  'bg-violet-100 text-violet-950 ring-violet-500/50 dark:bg-violet-950 dark:text-violet-100 dark:ring-violet-400/40'

/**
 * The relations the person works on (relations-bar-store.ts), as pills over the map: a click opens the relation beside
 * the inspector again, the × takes it out of the bar. The open relation's pill is violet, as its column is. A relation
 * the data does not hold (deleted, not loaded) has no pill until it is there.
 */
export function RelationBar() {
  const { engine, editor } = useShell()
  // labels and colours follow the data: an edit of the name shows in the pill
  useSyncExternalStore(engine.subscribe, engine.getVersion)
  const ids = useRelationBarIDs()
  const open = useOpenRelationId()
  const { ids: selected, select } = useSelection()
  const graph = editor.history.staging.graph
  const relations = ids.flatMap((id) => {
    const relation = graph.hasEntity(id)
    return relation instanceof OsmRelation ? [relation] : []
  })
  if (relations.length === 0) return null

  // a selected member of the relation stays selected, as when the relation is opened from its member; otherwise the
  // relation itself is selected, so the column has a selection to stand beside (nothing selected closes it)
  const jumpTo = (relation: OsmRelation) => {
    const memberSelected =
      selected.length > 0 &&
      selected.every((id) => relation.members.some((member) => member.id === id))
    if (!memberSelected) select(relation.id)
    openRelationActions.open(relation.id)
  }

  return (
    <div role="toolbar" aria-label={m.relations_bar_label()} className={BAR}>
      {relations.map((relation) => {
        const label = relationLabel(relation)
        const isOpen = relation.id === open
        const colour = colourOf(relation)
        return (
          <div
            key={relation.id}
            data-relation-pill={relation.id}
            className={`${PILL} ${isOpen ? PILL_OPEN : PILL_IDLE}`}
          >
            <Tooltip label={relation.id} placement="top">
              <button
                type="button"
                aria-pressed={isOpen}
                aria-label={m.relations_bar_jump({ relation: label })}
                onClick={() => jumpTo(relation)}
                className="flex h-full min-w-0 cursor-pointer items-center gap-1.5 rounded-l-full py-1 pr-1 pl-1 focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <span
                  aria-hidden="true"
                  className={`grid size-6 shrink-0 place-items-center rounded-full ${RELATION_ICON}`}
                >
                  <PresetIcon icon={engine.entity(relation.id)?.preset?.icon} className="size-4" />
                </span>
                {colour && (
                  <span
                    aria-hidden="true"
                    style={{ backgroundColor: colour }}
                    className={`size-2.5 shrink-0 rounded-full ${dotNeedsRing(colour) ? 'ring-1 ring-zinc-950/15 ring-inset dark:ring-white/25' : ''}`}
                  />
                )}
                <span className="truncate">{label}</span>
              </button>
            </Tooltip>
            <button
              type="button"
              aria-label={m.relations_bar_remove({ relation: label })}
              title={m.relations_bar_remove({ relation: label })}
              onClick={() => relationBarActions.remove(relation.id)}
              className="grid h-full shrink-0 cursor-pointer place-items-center rounded-r-full pr-2 pl-1 text-zinc-400 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-500 dark:hover:text-white"
            >
              <XMarkIcon className="size-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
