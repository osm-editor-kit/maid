import {
  ArrowDownTrayIcon,
  ArrowsPointingOutIcon,
  Bars3Icon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  TrashIcon,
  ViewfinderCircleIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { m } from '@osm-editor-kit/maid-i18n'
import { actionAddMember, actionDeleteMember, OsmRelation } from '@osm-editor-kit/maid-model'
import type { RelationRoles } from '@osm-editor-kit/maid-presets'
import type { EntityInfo } from '@osm-editor-kit/maid-renderer'
import {
  notify,
  SidebarDisclosure,
  stackedHeadingsCover,
  useStackedHeadings,
  RELATION_HEADING,
} from '@osm-editor-kit/maid-ui'
import { motion, Reorder, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { useMap } from 'react-map-gl/maplibre'
import { PresetIcon } from '../components/PresetIcon'
import { useSelection } from '../selection'
import { useEngine, usePresets, useShell } from '../shell-context'
import { useRelatedWhileHovered } from './relations-hover.ts'
import {
  cannotTakeReason,
  loadButtonLabel,
  loadingLabel,
  loadResultSentence,
  memberGroups,
  memberLoadPath,
  memberRows,
  notLoadedCount,
  relationLabel,
  relationPath,
  relationRolesOf,
  roleLabel,
  roleToAdd,
  routeGaps,
  wouldContainItself,
  type MemberGroup,
  type MemberRow,
} from './relations-logic.ts'
import { openRelationActions, useOpenRelationFrom } from './relations-open-store.ts'
import { ColumnDragHandle, ReorderRow, useMemberReorder } from './relations-reorder.tsx'
import { relationSessionActions } from './relations-session-store.ts'

/** Members a group lists before its own "Show all N"; iD's member list stops at 1000 */
const GROUP_LIMIT = 1000
/** A row (or the head) that is selected: white as the inspector card that shows it */
const SELECTED =
  'mr-2 pr-2 rounded-lg bg-white font-medium ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10'
/** A row that is not selected: inset from the card, rounded, lit by hover */
const PLAIN =
  'mr-2 pr-2 rounded-lg hover:bg-amber-100/60 focus-within:bg-amber-100/60 dark:hover:bg-amber-500/10 dark:focus-within:bg-amber-500/10'
const GAP =
  'flex items-center gap-2 px-3 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400'
const LINK =
  'cursor-pointer rounded text-xs font-medium text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-400'
const ICON_BUTTON =
  'grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'
const FLY_BUTTON =
  'grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-blue-600 hover:bg-blue-600/10 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-400 dark:hover:bg-blue-400/10'

type Editor = ReturnType<typeof useShell>['editor']
type Select = ReturnType<typeof useSelection>['select']

// The map's moves, read by useSyncExternalStore: the Fly buttons ask again after the map has moved. Module-level so
// the subscribe function and the read stay the same between renders.
let mapMoves = 0
const mapMoveListeners = new Set<() => void>()
function mapMoved() {
  mapMoves += 1
  for (const listener of mapMoveListeners) listener()
}
function subscribeMapMoves(listener: () => void) {
  mapMoveListeners.add(listener)
  return () => {
    mapMoveListeners.delete(listener)
  }
}
function mapMoveCount() {
  return mapMoves
}

/**
 * The relation open beside the inspector: its tab (the head), a note when the selection is not in it, and its members
 * in groups (SidebarDisclosure, with sticky headings). Selecting a row selects the feature; the map shows what is
 * hovered or focused here (engine.setRelated).
 */
export function RelationColumn({ id }: { id: EntityID }) {
  const { editor } = useShell()
  // the relation and the graph are read inside the engine's subscription: edits, undo and arriving data draw the
  // column again. Read outside it, the React Compiler would keep the first answer (a link's relation not loaded yet)
  const relation = useEngine(() => editor.history.staging.graph.hasEntity(id))
  const { id: selected, select } = useSelection()
  const { mainMap } = useMap()
  const scroller = useRef<HTMLDivElement>(null)
  // the group headings stack at the top of the list (the headings are the SidebarDisclosure of each group)
  useStackedHeadings(scroller)
  // "Show all" of one long group, kept with its key (`<relation>/<group>`), so another relation starts short
  const [showAllFor, setShowAllFor] = useState<string | null>(null)
  // the Fly buttons follow the map: a move of the map draws the column again
  useSyncExternalStore(subscribeMapMoves, mapMoveCount)
  useEffect(
    function redrawWhenTheMapMoves() {
      if (!mainMap) return
      mainMap.on('moveend', mapMoved)
      return () => {
        mainMap.off('moveend', mapMoved)
      }
    },
    [mainMap],
  )
  useEffect(
    function scrollTheSelectedRowIntoView() {
      const list = scroller.current
      if (!selected || !list) return
      const row = list.querySelector<HTMLElement>(`[data-row="${CSS.escape(selected)}"]`)
      if (!row) return
      // only the list scrolls: scrollIntoView would also scroll the page's frame, which hides its overflow
      const top =
        row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop
      const bottom = top + row.offsetHeight
      // the stuck group headings cover the top of the list
      const covered = stackedHeadingsCover(list)
      if (top - covered < list.scrollTop) list.scrollTop = top - covered
      else if (bottom > list.scrollTop + list.clientHeight)
        list.scrollTop = bottom - list.clientHeight
    },
    [selected],
  )

  // a link's relation arrives with the data: the column shows at once and says what it waits for
  if (!(relation instanceof OsmRelation))
    return (
      <aside
        aria-label={m.relations_column_label()}
        aria-busy="true"
        className="flex w-[22rem] shrink-0 items-start px-3 py-3 text-sm text-violet-900 dark:text-violet-200"
      >
        {m.relations_loading({ members: id })}
      </aside>
    )
  return (
    <ColumnBody
      relation={relation}
      selected={selected}
      select={select}
      scroller={scroller}
      showAllFor={showAllFor}
      setShowAllFor={setShowAllFor}
    />
  )
}

/** The column once its relation is there: head, hint and the members in groups (split off so the hooks come first). */
function ColumnBody({
  relation,
  selected,
  select,
  scroller,
  showAllFor,
  setShowAllFor,
}: {
  relation: OsmRelation
  selected: EntityID | null
  select: Select
  scroller: RefObject<HTMLDivElement | null>
  showAllFor: string | null
  setShowAllFor: (key: string) => void
}) {
  'use no memo'
  // not compiled: it reads the graph and the engine, objects that stay the same when data arrives or a member loads
  const { engine, editor } = useShell()
  const presets = usePresets()
  const reduce = useReducedMotion()
  const id = relation.id
  const graph = editor.history.staging.graph

  const info = engine.entity(id)
  const rows = memberRows(graph, relation)
  const groups = memberGroups(rows, relation.tags)
  const readOnly = engine.isReadOnly(id)
  // an edit here keeps the selection for its undo step: undoing a move leaves the member selected
  const selection = () => [...engine.selection]
  const reorder = useMemberReorder({ editor, relation, rows, groups, selection })
  const missing = notLoadedCount(rows)
  // the relations above this one, the way the person came first; the others it is also in on a line of their own
  const from = useOpenRelationFrom()
  const { path, others } = relationPath(graph, relation, from)
  // going up opens the parent with the relation we came from selected in its list
  function openParent(parent: OsmRelation, child: EntityID) {
    openRelationActions.open(parent.id)
    select(child)
  }
  const gaps = new Set(routeGaps(graph, relation))
  const roles = relationRolesOf(presets, relation.tags)
  const members = new Set(relation.members.map((member) => member.id))
  const selectedEntity = selected && selected !== id ? engine.entity(selected) : undefined
  const showHint = selectedEntity !== undefined && !members.has(selectedEntity.id) && !readOnly
  // why the selection cannot be added: the relation would contain itself, or the schema refuses it (duplicate, no role)
  const refusal =
    selectedEntity === undefined
      ? undefined
      : wouldContainItself(graph, id, selectedEntity.id)
        ? m.relations_reason_cycle()
        : cannotTakeReason(relation, [selectedEntity], presets)
  function removeMember(row: MemberRow) {
    editor.history.perform(actionDeleteMember(id, row.index))
    editor.history.commit({ annotation: m.relations_undo_remove(), selectedIDs: selection() })
  }

  return (
    <motion.aside
      aria-label={m.relations_column_label()}
      className="relative flex min-h-0 w-[22rem] shrink-0 flex-col overflow-hidden"
      initial={reduce ? false : { width: 0, opacity: 0 }}
      animate={{ width: '22rem', opacity: 1 }}
      transition={reduce ? { duration: 0 } : { duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <div className="flex h-8 shrink-0 items-center gap-2 pr-2 pl-3">
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide text-violet-900 uppercase dark:text-violet-200">
          {m.relations_column_label()}
          <span className="ml-2 font-mono font-normal tracking-normal text-violet-700/70 normal-case dark:text-violet-300/70">
            {id}
          </span>
        </span>
        <button
          type="button"
          className={ICON_BUTTON}
          aria-label={m.relations_close_label()}
          title={m.relations_close_label()}
          onClick={() => openRelationActions.close()}
        >
          <XMarkIcon className="size-4" />
        </button>
      </div>
      {path.length > 0 && (
        <nav
          aria-label={m.relations_column_path()}
          className="flex shrink-0 flex-wrap items-center gap-x-1 px-3 pb-1 text-xs text-zinc-600 dark:text-zinc-400"
        >
          {path.map((parent, index) => (
            <span key={parent.id} className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                className="max-w-40 cursor-pointer truncate rounded hover:text-zinc-950 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:text-white"
                title={relationLabel(parent)}
                onClick={() => openParent(parent, path[index + 1]?.id ?? id)}
              >
                {relationLabel(parent)}
              </button>
              <ChevronRightIcon aria-hidden className="size-3 shrink-0 text-zinc-400" />
            </span>
          ))}
        </nav>
      )}
      <RelationHead
        relationId={id}
        title={relationLabel(relation)}
        icon={info?.preset?.icon}
        selected={selected === id}
        select={select}
        relatedIds={engine.relatedOf(id)}
      />
      {others.length > 0 && (
        <p className="shrink-0 px-3 pb-1 text-xs text-zinc-600 dark:text-zinc-400">
          {m.relations_column_also_in()}{' '}
          {others.map((parent, index) => (
            <span key={parent.id}>
              {index > 0 && ', '}
              <button type="button" className={LINK} onClick={() => openParent(parent, id)}>
                {relationLabel(parent)}
              </button>
            </span>
          ))}
        </p>
      )}
      {showHint && selectedEntity && (
        <div className="mx-2 mb-2 flex shrink-0 items-start gap-2 rounded-md bg-white px-2.5 py-2 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-white/10">
          <InformationCircleIcon className="mt-px size-4 shrink-0 text-zinc-500" />
          <span className="min-w-0">
            {m.relations_column_not_member({
              name: selectedEntity.tags.name || selectedEntity.id,
            })}{' '}
            {refusal === undefined ? (
              <button
                type="button"
                className={LINK}
                onClick={() => addAsMember(editor, relation, roles, selectedEntity)}
              >
                {m.relations_column_add_it()}
              </button>
            ) : (
              <span className="text-zinc-500 dark:text-zinc-400">{refusal}</span>
            )}
          </span>
        </div>
      )}
      {missing > 0 && !readOnly && <LoadMissingMembers relationId={id} missing={missing} />}
      <div
        ref={scroller}
        data-stack-scroll
        // the first group's heading has no line above it, under the head
        className="relative flex min-h-0 flex-1 [scrollbar-width:none] flex-col overflow-y-auto pb-2 pl-2 [&::-webkit-scrollbar]:hidden [&>:first-child>[data-stack-heading]]:border-t-0"
      >
        {rows.length === 0 && (
          <p className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
            {m.relations_no_members()}
          </p>
        )}
        {groups.map((group) => {
          const count = group.rows.length
          // the ways (or the only group) carry the fit: the route on the map
          const fitHere = group.key === 'ways' || groups.length === 1
          // the order this group is shown in: the order of the drag while it is dragged
          const order = reorder.orderOf(group)
          const fitIds = group.rows.filter((row) => row.loaded).map((row) => row.id)
          // a very long group lists its first GROUP_LIMIT, and always reaches the selected member
          const groupKey = `${id}/${group.key}`
          const reach = order.findIndex((row) => row.id === selected) + 1
          const visible =
            showAllFor === groupKey ? order : order.slice(0, Math.max(GROUP_LIMIT, reach))
          return (
            <SidebarDisclosure
              key={group.key}
              title={groupLabel(group)}
              defaultOpen
              // the scroller's left padding is the heading's; the text keeps its 12px from the column's edge
              headingClassName={`${RELATION_HEADING} pl-1 pr-2`}
              detail={count}
              actions={
                fitHere && fitIds.length > 0 ? (
                  <button
                    type="button"
                    className={ICON_BUTTON}
                    aria-label={m.relations_column_fit()}
                    title={m.relations_column_fit()}
                    onClick={() => engine.fitTo(fitIds)}
                  >
                    <ArrowsPointingOutIcon className="size-4" />
                  </button>
                ) : undefined
              }
            >
              <Reorder.Group
                as="ul"
                axis="y"
                values={visible}
                onReorder={(next) =>
                  reorder.reorder(group.key, [...next, ...order.slice(visible.length)])
                }
              >
                {visible.map((row, position) => {
                  const previous = visible[position - 1]
                  const hairline =
                    previous !== undefined &&
                    row.id !== selected &&
                    previous.id !== selected &&
                    !gaps.has(previous.index)
                  return (
                    <MemberItem
                      key={`${row.index}:${row.id}:${row.role}`}
                      row={row}
                      roles={roles}
                      selected={row.id === selected}
                      hairline={hairline}
                      warn={gaps.has(row.index) || gaps.has(row.index - 1)}
                      select={select}
                      editable={!readOnly}
                      onDrop={() => reorder.drop(row)}
                      onMove={(direction) => reorder.moveMember(row, direction)}
                      onRemove={() => removeMember(row)}
                      // the gaps are between members in data order: hidden while the drag shows another order
                      relationId={id}
                      gapBelow={
                        !reorder.dragging && gaps.has(row.index) && position < visible.length - 1
                      }
                    />
                  )
                })}
              </Reorder.Group>
              {visible.length < order.length && (
                <button
                  type="button"
                  className={`${LINK} mx-3 mt-1 text-left`}
                  onClick={() => setShowAllFor(groupKey)}
                >
                  {m.relations_show_all({ count: order.length })}
                </button>
              )}
            </SidebarDisclosure>
          )
        })}
      </div>
    </motion.aside>
  )
}

/** The relation's own tab: its icon and title; selects the relation. */
function RelationHead({
  relationId,
  title,
  icon,
  selected,
  select,
  relatedIds,
}: {
  relationId: EntityID
  title: string
  icon: string | undefined
  selected: boolean
  select: Select
  relatedIds: readonly string[]
}) {
  const highlight = useRelatedWhileHovered(() => relatedIds)
  return (
    <div className="shrink-0 pt-1 pb-1 pl-2">
      <div
        {...highlight}
        className={`group relative flex min-h-12 items-center gap-2.5 py-2 pl-1 ${selected ? SELECTED : PLAIN}`}
      >
        <button
          type="button"
          className="absolute inset-0 cursor-pointer rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500"
          aria-label={title}
          aria-current={selected || undefined}
          title={m.relations_column_show_relation()}
          onClick={() => select(relationId)}
        />
        <span className="pointer-events-none relative grid size-8 shrink-0 place-items-center rounded-md bg-zinc-950/5 text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
          <PresetIcon icon={icon} className="size-5" />
        </span>
        <span className="pointer-events-none relative line-clamp-2 min-w-0 flex-1 text-sm leading-[1.125rem] font-semibold [overflow-wrap:anywhere]">
          {title}
        </span>
        <ChevronRightIcon
          className={`pointer-events-none size-4 shrink-0 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 ${selected ? 'invisible' : ''}`}
        />
      </div>
    </div>
  )
}

/** One member row: the whole row selects it (an overlay button), the Fly button and the warning sit above it. */
function MemberItem({
  row,
  roles,
  selected,
  hairline,
  warn,
  select,
  editable,
  onDrop,
  onMove,
  onRemove,
  gapBelow,
  relationId,
}: {
  row: MemberRow
  roles: RelationRoles
  selected: boolean
  hairline: boolean
  warn: boolean
  select: Select
  /** Whether the row has a drag handle (the relation is not read-only) */
  editable: boolean
  /** The member was let go after a drag */
  onDrop: () => void
  /** Alt+ArrowUp or Alt+ArrowDown on the row */
  onMove: (direction: 'up' | 'down') => void
  /** Takes the member out of the relation (one undo step); also for a member that is not loaded */
  onRemove: () => void
  /** A line under the row for the gap to the next way */
  gapBelow: boolean
  relationId: EntityID
}) {
  'use no memo'
  // not compiled: whether the member is in view and loaded is read from the engine, which stays the same object
  const { engine } = useShell()
  // a relation member also tells the map which sub-route is pointed at (relations-map.tsx)
  const highlight = useRelatedWhileHovered(
    () => [row.id],
    row.type === 'relation' ? row.id : undefined,
  )
  const [busy, setBusy] = useState(false)
  const name = row.label ?? row.id
  const flyable = row.loaded && !engine.inView([row.id])
  const loadable = !row.loaded && memberLoadPath(row.id) !== undefined
  const downloadLabel = m.relations_download_member({ id: row.id })
  function loadMember(then?: () => void) {
    setBusy(true)
    engine.loadEntity(row.id).then(
      () => {
        setBusy(false)
        then?.()
      },
      (error: unknown) => {
        setBusy(false)
        notify.failed(error)
      },
    )
  }
  return (
    <ReorderRow value={row} rowId={row.id} onDrop={onDrop}>
      {(startDrag) => (
        <>
          <div
            {...highlight}
            onKeyDown={(event) => {
              if (!editable || !event.altKey) return
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
              event.preventDefault()
              onMove(event.key === 'ArrowUp' ? 'up' : 'down')
            }}
            className={`group relative flex min-h-9 items-center gap-2 py-1 pl-1 text-xs ${selected ? SELECTED : PLAIN}`}
          >
            {hairline && (
              <span
                aria-hidden
                className="pointer-events-none absolute top-0 right-0 left-2 h-px bg-zinc-950/5 dark:bg-white/10"
              />
            )}
            {(row.loaded || loadable) && (
              <button
                type="button"
                className="absolute inset-0 cursor-pointer rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500"
                aria-label={name}
                aria-current={selected || undefined}
                onClick={() => {
                  // a sub-route is entered: the column shows its members, the path leads back
                  if (row.loaded && row.type === 'relation') {
                    openRelationActions.open(row.id, relationId)
                    select(row.id)
                  } else if (row.loaded) select(row.id)
                  else
                    loadMember(() => {
                      select(row.id)
                      engine.fitTo([row.id])
                    })
                }}
              />
            )}
            {editable && (
              <ColumnDragHandle
                relationId={relationId}
                row={row}
                startDrag={startDrag}
                onMove={onMove}
              >
                <Bars3Icon className="size-4" />
              </ColumnDragHandle>
            )}
            <span className="min-w-0 flex-1 truncate">
              {row.loaded ? (
                name
              ) : (
                <span className="text-zinc-500 dark:text-zinc-400">{row.id}</span>
              )}
            </span>
            {row.role && (
              <span className="shrink-0 rounded px-1 text-[11px] text-zinc-600 ring-1 ring-zinc-950/10 dark:text-zinc-300 dark:ring-white/10">
                {roleLabel(roles, row.role)}
              </span>
            )}
            {editable && (
              <button
                type="button"
                className={`${ICON_BUTTON} relative z-10 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100`}
                aria-label={m.relations_column_remove({ name })}
                title={m.relations_column_remove({ name })}
                onClick={onRemove}
              >
                <TrashIcon className="size-3.5" />
              </button>
            )}
            {warn && (
              <span
                title={m.relations_gap_title()}
                className="shrink-0 text-amber-600 dark:text-amber-400"
              >
                <ExclamationTriangleIcon className="size-4" />
              </span>
            )}
            {/* the action slot is as wide in every row, so the icons line up */}
            <span className="relative z-10 grid size-6 shrink-0 place-items-center">
              {flyable && (
                <button
                  type="button"
                  className={FLY_BUTTON}
                  aria-label={m.relations_column_fly_label({ name })}
                  title={m.relations_column_fly()}
                  onClick={() => engine.fitTo([row.id])}
                >
                  <ViewfinderCircleIcon className="size-4" />
                </button>
              )}
              {loadable && (
                <button
                  type="button"
                  className={`${ICON_BUTTON} disabled:cursor-default disabled:text-zinc-300`}
                  aria-label={downloadLabel}
                  title={busy ? m.relations_downloading() : downloadLabel}
                  disabled={busy}
                  onClick={() => loadMember()}
                >
                  <ArrowDownTrayIcon className="size-4" />
                </button>
              )}
            </span>
            {row.loaded || loadable ? (
              <ChevronRightIcon
                className={`size-4 shrink-0 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 ${selected ? 'invisible' : ''}`}
              />
            ) : (
              <span aria-hidden className="size-4 shrink-0" />
            )}
          </div>
          {gapBelow && (
            // a title, not a Tooltip: a line that cannot take focus
            <div className={GAP} title={m.relations_gap_title()}>
              <span className="h-px flex-1 border-t border-dashed border-amber-500/60" />
              {m.relations_gap()}
              <span className="h-px flex-1 border-t border-dashed border-amber-500/60" />
            </div>
          )}
        </>
      )}
    </ReorderRow>
  )
}

/** The heading's name: Stops, Ways, Routes (a superrelation) or Members */
function groupLabel(group: MemberGroup) {
  if (group.key === 'stops') return m.relations_group_stops()
  if (group.key === 'ways') return m.relations_group_ways()
  const allRelations = group.rows.length > 0 && group.rows.every((row) => row.type === 'relation')
  return allRelations ? m.relations_group_routes() : m.relations_section_members()
}

/** Adds the feature as a member of the relation, in one undo step (the role the feature fits, as the section does) */
function addAsMember(
  editor: Editor,
  relation: OsmRelation,
  roles: RelationRoles,
  entity: EntityInfo,
) {
  const role = roleToAdd(roles, '', entity)
  editor.history.perform(actionAddMember(relation.id, { id: entity.id, type: entity.type, role }))
  editor.history.commit({
    annotation: m.relations_undo_add(),
    selectedIDs: [entity.id],
  })
  relationSessionActions.touch([relation.id])
}

/**
 * "Load the N missing members": the whole relation from the API in one request (engine.loadRelation). Says what is
 * still missing afterwards (members outside what the API gives), or why it failed.
 */
function LoadMissingMembers({ relationId, missing }: { relationId: EntityID; missing: number }) {
  const { engine, editor } = useShell()
  const [busy, setBusy] = useState(false)
  function load() {
    setBusy(true)
    engine.loadRelation(relationId).then(
      ({ added }) => {
        setBusy(false)
        const relation = editor.history.staging.graph.hasEntity(relationId)
        const left =
          relation instanceof OsmRelation
            ? notLoadedCount(memberRows(editor.history.staging.graph, relation))
            : 0
        const sentence = loadResultSentence(added, left)
        if (sentence) notify.info(sentence)
      },
      (error: unknown) => {
        setBusy(false)
        notify.failed(error)
      },
    )
  }
  return (
    <div className="shrink-0 px-3 pb-1">
      <button type="button" className={LINK} disabled={busy} onClick={load}>
        {busy ? loadingLabel(missing) : loadButtonLabel(missing)}
      </button>
    </div>
  )
}
