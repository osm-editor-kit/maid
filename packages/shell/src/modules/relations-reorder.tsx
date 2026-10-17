import { m } from '@osm-editor-kit/maid-i18n'
import { actionMoveMember, type OsmRelation } from '@osm-editor-kit/maid-model'
import { UI_SPRING } from '@osm-editor-kit/maid-ui'
import { Reorder, useDragControls, useReducedMotion, type DragControls } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { useShell } from '../shell-context'
import {
  groupDropMove,
  moveTargets,
  relationLabel,
  type MemberGroup,
  type MemberGroupKey,
  type MemberRow,
} from './relations-logic.ts'

type Editor = ReturnType<typeof useShell>['editor']

/** A drag in progress: the group it is in, and the rows of that group in the order the drag leaves them */
type DragState = { group: MemberGroupKey; rows: MemberRow[] }

/** The attribute of a handle that says whose it is, so the focus can find it after a move: `<relation>:<member index>` */
const HANDLE_ATTRIBUTE = 'data-member-handle'

/**
 * Reordering the members of a relation in the relation column. While a member is dragged its group shows the order of
 * the drag (`orderOf`); the data changes once, at the drop, as one undo step. `moveMember` moves one place within the
 * group (the keyboard way) and keeps the focus on the moved member's handle. `rows` are all members and `groups`
 * their groups; `selection` is what each undo step keeps selected.
 */
export function useMemberReorder({
  editor,
  relation,
  rows,
  groups,
  selection,
}: {
  editor: Editor
  relation: OsmRelation
  rows: readonly MemberRow[]
  groups: readonly MemberGroup[]
  selection: () => readonly string[]
}) {
  // the targets follow the groups of the whole relation, not only the rows shown
  const moves = moveTargets(rows, relation.tags)
  const [dragged, setDragged] = useState<DragState | null>(null)
  const draggedOrder = useRef<DragState | null>(null)
  // the index a moved member ends at: its handle gets the focus once the list has been drawn with the new order
  const focusIndex = useRef<number | null>(null)
  useEffect(function focusTheMovedMember() {
    const index = focusIndex.current
    if (index === null) return
    focusIndex.current = null
    document.querySelector<HTMLElement>(`[${HANDLE_ATTRIBUTE}="${relation.id}:${index}"]`)?.focus()
  })

  function commit(from: number, to: number, annotation: string) {
    editor.history.perform(actionMoveMember(relation.id, from, to))
    editor.history.commit({ annotation, selectedIDs: [...selection()] })
  }
  return {
    /** Whether a drag is in progress (the gaps between members are in data order, so they hide) */
    dragging: dragged !== null,
    /** The rows of the group in the order to show: the order of the drag while it is dragged */
    orderOf: (group: MemberGroup) => (dragged?.group === group.key ? dragged.rows : group.rows),
    /** Reorder.Group's onReorder for a group */
    reorder: (group: MemberGroupKey, next: MemberRow[]) => {
      const drag: DragState = { group, rows: next }
      draggedOrder.current = drag
      setDragged(drag)
    },
    /** The one edit a drop makes: the dragged member moves to its place in its group (one undo step) */
    drop: (row: MemberRow) => {
      const drag = draggedOrder.current
      draggedOrder.current = null
      setDragged(null)
      const group = groups.find((item) => item.key === drag?.group)
      const move = drag && group ? groupDropMove(rows, group.rows, drag.rows, row.index) : undefined
      if (move)
        commit(move.from, move.to, m.relations_undo_move({ relation: relationLabel(relation) }))
    },
    /** Moves a member one place within its group; false when it is at that end */
    moveMember: (row: MemberRow, direction: 'up' | 'down') => {
      const target = moves.get(row.index)?.[direction]
      if (target === undefined) return false
      const label = relationLabel(relation)
      commit(
        row.index,
        target,
        direction === 'up'
          ? m.relations_undo_move_up({ relation: label })
          : m.relations_undo_move_down({ relation: label }),
      )
      // the member ends at the target's place
      focusIndex.current = target
      return true
    },
  }
}

/**
 * A list item that Reorder moves when its handle is dragged: `children` gets the function that starts the drag, for
 * the handle's pointer-down. `onDrop` runs once the item is let go. Without reduced motion it slides on a spring.
 */
export function ReorderRow({
  value,
  onDrop,
  rowId,
  children,
}: {
  value: MemberRow
  onDrop: () => void
  /** Sets data-row on the item */
  rowId?: string
  children: (startDrag: DragControls['start']) => ReactNode
}) {
  const controls = useDragControls()
  // as the other motion in the inspector: no sliding when the person asks for reduced motion
  const reduced = useReducedMotion() === true
  return (
    <Reorder.Item
      as="li"
      value={value}
      data-row={rowId}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      transition={reduced ? { duration: 0 } : UI_SPRING}
    >
      {children((event) => controls.start(event))}
    </Reorder.Item>
  )
}

/**
 * The handle of a member in the relation column: a button, quiet until the row is hovered or focused. Dragging
 * moves the member; Alt+ArrowUp and Alt+ArrowDown move it one place.
 */
export function ColumnDragHandle({
  relationId,
  row,
  startDrag,
  onMove,
  children,
}: {
  relationId: string
  row: MemberRow
  startDrag: DragControls['start']
  onMove: (direction: 'up' | 'down') => void
  children: ReactNode
}) {
  const label = m.relations_drag_member({ id: row.id })
  return (
    <button
      type="button"
      {...{ [HANDLE_ATTRIBUTE]: `${relationId}:${row.index}` }}
      aria-label={label}
      title={label}
      onPointerDown={(event) => startDrag(event.nativeEvent)}
      onKeyDown={(event) => {
        if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
        event.preventDefault()
        event.stopPropagation()
        onMove(event.key === 'ArrowUp' ? 'up' : 'down')
      }}
      className="relative z-10 grid h-6 w-5 shrink-0 cursor-grab touch-none place-items-center rounded text-zinc-400 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-zinc-950 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:text-white"
    >
      {children}
    </button>
  )
}
