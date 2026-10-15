import { Bars3Icon } from '@heroicons/react/16/solid'
import { m } from '@osm-editor-kit/maid-i18n'
import {
  actionAddMember,
  actionChangeMember,
  actionDeleteMember,
  actionMoveMember,
  OsmRelation,
  type Action,
} from '@osm-editor-kit/maid-model'
import type { RelationRoles } from '@osm-editor-kit/maid-presets'
import { notify, PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
import { Tooltip, UI_SPRING, type InspectorSectionProps } from '@osm-editor-kit/maid-ui'
import { Reorder, useDragControls, useReducedMotion } from 'motion/react'
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { usePresets, useShell } from '../shell-context'
import {
  cannotTakeReason,
  dropMoveOf,
  geometryOfEntity,
  joinableRelations,
  loadButtonLabel,
  loadFailureSentence,
  loadingLabel,
  loadResultSentence,
  memberLoadPath,
  memberName,
  memberRows,
  membershipHint,
  membershipsOf,
  moveTarget,
  newRelationActions,
  notLoadedCount,
  pickerNames,
  placementOf,
  placementSentence,
  relationLabel,
  relationRolesOf,
  roleFromText,
  roleLabel,
  roleOptionsFor,
  roleSuggestions,
  roleToAdd,
  routeGaps,
  sessionFirst,
  type LoadMember,
  type MemberRow,
  type Membership,
  type RelationRules,
  type RoleOption,
} from './relations-logic.ts'
import { relationSessionActions, useSessionRelationIDs } from './relations-session-store.ts'

type Props = InspectorSectionProps
type Editor = Props['editor']
type Member = OsmRelation['members'][number]

/** Members shown before the list says "Show all N". iD caps its member list at 1000. */
const MEMBER_LIMIT = 50
/** Relations offered in the "Add to a relation" select. */
const RELATION_OPTION_LIMIT = 200
/**
 * The select's value for "New relation…", as iD's list starts with it. Not an element id (those start with
 * `r`), so it cannot be taken for a relation.
 */
const NEW_RELATION = 'new'

const ROW =
  'flex min-w-0 items-center gap-2 border-b border-zinc-950/5 py-1 text-xs last:border-0 dark:border-white/5'
/** A member's row: its content. The list item around it carries the hairline and is what Reorder moves. */
const ROW_BODY = 'flex min-w-0 items-center gap-2 py-1 text-xs'
const MEMBER_ITEM = 'border-b border-zinc-950/5 last:border-0 dark:border-white/5'
const LINK =
  'min-w-0 flex-1 cursor-pointer truncate rounded px-1 text-left hover:underline focus-visible:outline-2 focus-visible:outline-blue-500'
const SECONDARY = 'text-zinc-500 dark:text-zinc-400'
/** A text button in a list, e.g. "Show all 120". */
const LINK_BUTTON =
  'cursor-pointer rounded px-1 text-xs text-zinc-500 hover:text-zinc-950 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:text-white'
/** Inline role input: looks like plain text until hovered or focused, as in TagRow. */
const ROLE_INPUT =
  'w-20 shrink-0 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-zinc-950/20 focus:border-blue-500 focus:bg-white focus:outline-none disabled:cursor-default disabled:text-zinc-400 disabled:hover:border-transparent dark:hover:border-white/20 dark:focus:bg-zinc-950'
const FIELD =
  'h-7 min-w-0 rounded-md border border-zinc-950/10 bg-white px-2 text-xs text-zinc-950 hover:border-zinc-950/20 focus-visible:outline-2 focus-visible:outline-blue-500 placeholder:text-zinc-400 disabled:cursor-default disabled:text-zinc-400 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:border-white/20 dark:placeholder:text-zinc-500 dark:[color-scheme:dark]'
const BUTTON =
  'inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md bg-white px-2 text-xs font-medium inset-ring-1 inset-ring-zinc-950/10 focus-visible:outline-2 focus-visible:outline-blue-500 enabled:hover:bg-zinc-50 disabled:cursor-default disabled:text-zinc-400 dark:bg-zinc-800 dark:inset-ring-white/10 dark:enabled:hover:bg-zinc-700 dark:disabled:text-zinc-500'
/** Icon buttons in a row: move, remove. Quiet until hovered, as the edit buttons are. */
const ICON_BUTTON =
  'shrink-0 cursor-pointer rounded px-1 text-zinc-400 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:text-zinc-300 disabled:hover:bg-transparent disabled:hover:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white dark:disabled:text-zinc-700 dark:disabled:hover:bg-transparent dark:disabled:hover:text-zinc-700'
/** The line between two members of a route whose ways do not meet. */
const GAP =
  'flex items-center gap-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400'
/** A warning under a membership: information only. */
const HINT = 'pb-1 pl-1 text-xs text-amber-700 dark:text-amber-400'
/** A quiet line under the list: what a load left out */
const SECONDARY_NOTE = `pt-1 text-xs ${SECONDARY}`

/** Runs the actions as one undo step and commits them with their annotation. */
function editAll(
  editor: Editor,
  actions: readonly Action[],
  annotation: string,
  selectedID: EntityID,
) {
  editor.history.perform(...actions)
  editor.history.commit({ annotation, selectedIDs: [selectedID] })
}

/** Runs one edit through the history and commits it with its annotation. */
function edit(editor: Editor, action: Action, annotation: string, selectedID: EntityID) {
  editAll(editor, [action], annotation, selectedID)
}

/** The id of the datalist that offers role suggestions: one per scope (members, membership, add) and entity. */
function roleOptionsID(scope: string, id: string) {
  return `${scope}-roles-${id}`
}

/**
 * Whether the edit controls of a section (role inputs, move, add and remove buttons) are off because the
 * features are read-only. The section root provides it, so the controls read it where they are. Zoom,
 * select and load stay on, as they do for read-only features.
 */
const ReadOnlyContext = createContext(false)

function useReadOnly() {
  return useContext(ReadOnlyContext)
}

/** One line of a list: the same spacing and hairline for members and memberships. */
function Row({ children, highlight }: { children: ReactNode; highlight?: RowHighlight }) {
  return (
    <li className={ROW} {...highlight}>
      {children}
    </li>
  )
}

type RowHighlight = ReturnType<typeof useRelatedWhileHovered>

/**
 * Highlights entities on the map while the pointer or the keyboard focus is on a row: a member
 * row its member, a relation row the relation and its members. Leaving clears it. A row that goes
 * away while highlighted (a member removed with its button) clears it too, so no halo stays behind.
 */
function useRelatedWhileHovered(ids: () => readonly string[]) {
  const { engine } = useShell()
  const on = useRef(false)
  useEffect(
    () => () => {
      if (on.current) engine.setRelated(null)
    },
    [engine],
  )
  const start = () => {
    on.current = true
    engine.setRelated(ids())
  }
  const stop = () => {
    on.current = false
    engine.setRelated(null)
  }
  return { onPointerEnter: start, onPointerLeave: stop, onFocus: start, onBlur: stop }
}

/**
 * The role suggestions as a datalist: the input shows them as the user types, and still takes any text. A role
 * with a label is offered by its label (the input shows the label, see roleLabel) and the key is the option's label.
 */
function RoleOptions({ id, options }: { id: string; options: readonly RoleOption[] }) {
  return (
    <datalist id={id}>
      {options.map(({ role, label }) => (
        <option key={role} value={label ?? role} label={label === undefined ? undefined : role} />
      ))}
    </datalist>
  )
}

/**
 * A role that is edited in place. It shows the role's label when the schema has one. Applied on Enter or when the
 * field loses focus; a typed label is stored as its role. Escape restores the shown text.
 */
function RoleInput({
  label,
  role,
  roles,
  list,
  onCommit,
}: {
  label: string
  role: string
  roles: RelationRoles
  list: string
  onCommit: (role: string) => void
}) {
  const readOnly = useReadOnly()
  const shown = roleLabel(roles, role)
  const [draft, setDraft] = useState(shown)
  const commit = () => {
    const next = roleFromText(roles, draft)
    if (next !== role) onCommit(next)
  }
  return (
    <input
      {...PLAIN_INPUT}
      aria-label={label}
      placeholder={m.relations_role_placeholder()}
      list={list}
      disabled={readOnly}
      className={ROLE_INPUT}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(shown)
          event.stopPropagation()
        }
      }}
    />
  )
}

function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  const readOnly = useReadOnly()
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        disabled={readOnly}
        onClick={onRemove}
        className={ICON_BUTTON}
      >
        ×
      </button>
    </Tooltip>
  )
}

/** Zooms the map to an entity: an icon button with a tooltip, disabled when it is not loaded. */
function ZoomButton({
  label,
  disabled,
  onZoom,
}: {
  label: string
  disabled: boolean
  onZoom: () => void
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onZoom}
        className={ICON_BUTTON}
      >
        ◎
      </button>
    </Tooltip>
  )
}

/** Moves a member one place: an icon button with a tooltip, disabled at the ends and when read-only. */
function MoveButton({
  label,
  glyph,
  disabled,
  onMove,
}: {
  label: string
  glyph: string
  /** No move in this direction (the member is at the end) */
  disabled: boolean
  onMove: () => void
}) {
  const readOnly = useReadOnly()
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        disabled={readOnly || disabled}
        onClick={onMove}
        className={ICON_BUTTON}
      >
        {glyph}
      </button>
    </Tooltip>
  )
}

/**
 * Loads a member that is not in the data, as iD's "download" does. Busy until the load ends; the row
 * changes by itself when the data does (the section follows the engine's version).
 */
function DownloadButton({ id, load }: { id: EntityID; load: LoadMember }) {
  const [busy, setBusy] = useState(false)
  const label = m.relations_download_member({ id })
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        disabled={busy}
        className={`${LINK_BUTTON} disabled:cursor-default disabled:text-zinc-300`}
        onClick={() => {
          setBusy(true)
          load(id).then(
            () => setBusy(false),
            (error: unknown) => {
              setBusy(false)
              notify.failed(error)
            },
          )
        }}
      >
        {busy ? m.relations_downloading() : m.relations_download()}
      </button>
    </Tooltip>
  )
}

/**
 * The grip that drags a member. Pointer only: the move buttons are the keyboard way to the same move, so the grip is
 * not in the tab order. Hovering it says what it does.
 */
function DragHandle({
  label,
  onPointerDown,
}: {
  label: string
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
}) {
  return (
    <Tooltip label={label}>
      <span
        aria-hidden="true"
        onPointerDown={onPointerDown}
        className="shrink-0 cursor-grab touch-none rounded px-0.5 text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
      >
        <Bars3Icon className="size-4" />
      </span>
    </Tooltip>
  )
}

/**
 * A member's place in the list: a list item that Reorder moves when its handle is dragged. Only the handle starts a
 * drag, so the role input and the buttons of the row keep working. `onDrop` runs once the item is let go. Read-only
 * members get no handle and cannot be dragged.
 */
function MemberItem({
  value,
  editable,
  onDrop,
  children,
}: {
  value: MemberRow
  /** Whether the row gets a handle (not read-only) */
  editable: boolean
  onDrop: () => void
  /** The row, given the handle to draw where it goes (null when read-only) */
  children: (handle: ReactNode) => ReactNode
}) {
  const controls = useDragControls()
  // as the other motion in the inspector: no sliding when the person asks for reduced motion
  const reduced = useReducedMotion() === true
  const handle = editable ? (
    <DragHandle
      label={m.relations_drag_member({ id: value.id })}
      onPointerDown={(event) => controls.start(event.nativeEvent)}
    />
  ) : null
  return (
    <Reorder.Item
      as="li"
      value={value}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      transition={reduced ? { duration: 0 } : UI_SPRING}
      className={MEMBER_ITEM}
    >
      {children(handle)}
    </Reorder.Item>
  )
}

/** The letter for a member's type, as the locale writes it (N, W, R in English). */
function typeLetter(type: Member['type']) {
  if (type === 'node') return m.relations_type_node_letter()
  if (type === 'way') return m.relations_type_way_letter()
  return m.relations_type_relation_letter()
}

/** The name of a member's type, for the title of its letter. */
function typeName(type: Member['type']) {
  if (type === 'node') return m.relations_type_node()
  if (type === 'way') return m.relations_type_way()
  return m.relations_type_relation()
}

/** A member of the selected relation: its position, type, label, role, moves and a remove button. */
function MemberRowView({
  editor,
  relation,
  row,
  roles,
  suggestions,
  select,
  load,
  handle,
}: {
  editor: Editor
  relation: OsmRelation
  row: MemberRow
  /** The relation's roles with their labels (none without a schema) */
  roles: RelationRoles
  /** roleSuggestions of the relation, shared by its rows */
  suggestions: readonly string[]
  select: Props['select']
  /** Loads a member that is not in the data; undefined while the engine has no such call */
  load: LoadMember | undefined
  /** The drag handle, drawn first (null when read-only) */
  handle: ReactNode
}) {
  const { engine } = useShell()
  const highlight = useRelatedWhileHovered(() => [row.id])
  // the member as the relation holds it: its id and type come from the row, the role from the member
  const member = relation.members[row.index]
  if (!member) return null
  // the role suggestions follow the member's geometry, as iD's member editor (one list per row)
  const roleList = roleOptionsID('members', `${relation.id}-${row.index}`)
  const options = roleOptionsFor(
    suggestions,
    roles,
    geometryOfEntity(editor.history.staging.graph, row.id),
  )
  const count = relation.members.length
  const move = (direction: 'up' | 'down') => {
    const target = moveTarget(count, row.index, direction)
    if (target === undefined) return
    const annotation =
      direction === 'up'
        ? m.relations_undo_move_up({ relation: relationLabel(relation) })
        : m.relations_undo_move_down({ relation: relationLabel(relation) })
    edit(editor, actionMoveMember(relation.id, row.index, target), annotation, relation.id)
  }
  const up = moveTarget(count, row.index, 'up')
  const down = moveTarget(count, row.index, 'down')
  return (
    <div className={ROW_BODY} {...highlight}>
      {handle}
      <span className={`w-6 shrink-0 text-right font-mono tabular-nums ${SECONDARY}`}>
        {row.index + 1}
      </span>
      <span
        title={typeName(row.type)}
        className={`w-3 shrink-0 text-center font-mono ${SECONDARY}`}
      >
        {typeLetter(row.type)}
      </span>
      {row.loaded ? (
        <button type="button" className={LINK} onClick={() => select(row.id)}>
          <span className="font-mono">{row.id}</span>
          {row.label && <span className={`ml-2 ${SECONDARY}`}>{row.label}</span>}
        </button>
      ) : (
        <span className={`min-w-0 flex-1 truncate px-1 font-mono ${SECONDARY}`}>
          {row.id} <span className="italic">{m.relations_not_loaded()}</span>
        </span>
      )}
      {!row.loaded && load && memberLoadPath(row.id) !== undefined && (
        <DownloadButton id={row.id} load={load} />
      )}
      <ZoomButton
        label={m.relations_zoom_member({ id: row.id })}
        disabled={!row.loaded}
        onZoom={() => engine.fitTo([row.id])}
      />
      <MoveButton
        label={m.relations_move_up({ id: row.id })}
        glyph="↑"
        disabled={up === undefined}
        onMove={() => move('up')}
      />
      <MoveButton
        label={m.relations_move_down({ id: row.id })}
        glyph="↓"
        disabled={down === undefined}
        onMove={() => move('down')}
      />
      <RoleInput
        label={m.relations_role_of({ id: row.id })}
        role={member.role}
        roles={roles}
        list={roleList}
        onCommit={(role) =>
          edit(
            editor,
            actionChangeMember(relation.id, { ...member, role }, row.index),
            m.relations_undo_role(),
            relation.id,
          )
        }
      />
      <RoleOptions id={roleList} options={options} />
      <RemoveButton
        label={m.relations_remove_member({ id: row.id })}
        onRemove={() => {
          edit(
            editor,
            actionDeleteMember(relation.id, row.index),
            m.relations_undo_remove(),
            relation.id,
          )
          // removing the last member deletes the relation
          if (!editor.history.staging.graph.hasEntity(relation.id)) select(null)
        }}
      />
    </div>
  )
}

/** The loading of the missing members: idle, busy, done (with what is still missing), or failed */
type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; added: number; left: number }
  | { status: 'failed'; message: string }

/**
 * The members of a relation in order: the first MEMBER_LIMIT, then "Show all N". Members that are
 * not loaded keep their rows. A route shows a gap line where two of its ways do not meet.
 */
function MemberList({
  editor,
  relation,
  select,
  presets,
}: {
  editor: Editor
  relation: OsmRelation
  select: Props['select']
  presets: RelationRules | undefined
}) {
  const { engine } = useShell()
  const graph = editor.history.staging.graph
  const rows = memberRows(graph, relation)
  const gaps = new Set(routeGaps(graph, relation))
  const missing = notLoadedCount(rows)
  const [showAll, setShowAll] = useState(false)
  const [load, setLoad] = useState<LoadState>({ status: 'idle' })
  const shown = showAll ? rows : rows.slice(0, MEMBER_LIMIT)
  const readOnly = useReadOnly()
  // while a member is dragged the list shows the order of the drag; the data changes once, at the drop
  const [dragged, setDragged] = useState<MemberRow[] | null>(null)
  const draggedOrder = useRef<MemberRow[] | null>(null)
  const order = dragged ?? shown
  // the one edit a drop makes: the dragged member moves to its place in the list (one undo step)
  const drop = (row: MemberRow) => {
    const list = draggedOrder.current
    draggedOrder.current = null
    setDragged(null)
    const move = list ? dropMoveOf(list, row.index) : undefined
    if (move)
      edit(
        editor,
        actionMoveMember(relation.id, move.from, move.to),
        m.relations_undo_move({ relation: relationLabel(relation) }),
        relation.id,
      )
  }
  const roles = relationRolesOf(presets, relation.tags)
  const suggestions = roleSuggestions(relation)
  // one request per click: the relation in full, merged like a map tile (engine.loadRelation)
  const loadMembers = () => {
    setLoad({ status: 'loading' })
    engine.loadRelation(relation.id).then(
      ({ added }) => {
        const left = notLoadedCount(memberRows(editor.history.staging.graph, relation))
        setLoad({ status: 'done', added, left })
      },
      (error: unknown) =>
        setLoad({
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        }),
    )
  }
  const result = load.status === 'done' ? loadResultSentence(load.added, load.left) : undefined
  return (
    <div className="grid gap-1">
      {rows.length > 0 && (
        <div className="flex justify-end">
          <Tooltip label={m.relations_zoom_members_tip()}>
            <button
              type="button"
              className={`${LINK_BUTTON} disabled:cursor-default disabled:text-zinc-300`}
              disabled={!rows.some((row) => row.loaded)}
              onClick={() => engine.fitTo([relation.id])}
            >
              ◎ {m.relations_zoom_relation()}
            </button>
          </Tooltip>
        </div>
      )}
      <Reorder.Group
        as="ul"
        axis="y"
        values={order}
        onReorder={(next) => {
          draggedOrder.current = next
          setDragged(next)
        }}
      >
        {rows.length === 0 && (
          <li className={`py-1 text-xs ${SECONDARY}`}>{m.relations_no_members()}</li>
        )}
        {order.map((row) => (
          <MemberItem
            key={`${row.index}:${row.id}:${row.role}`}
            value={row}
            editable={!readOnly}
            onDrop={() => drop(row)}
          >
            {(handle) => (
              <>
                <MemberRowView
                  editor={editor}
                  relation={relation}
                  row={row}
                  roles={roles}
                  suggestions={suggestions}
                  select={select}
                  load={(id) => engine.loadEntity(id)}
                  handle={handle}
                />
                {/* the gaps are between members in data order: hidden while the drag shows another order */}
                {dragged === null &&
                  gaps.has(row.index) && (
                    // a title, not a Tooltip: a line that cannot take focus
                    <div className={GAP} title={m.relations_gap_title()}>
                      <span className="h-px flex-1 border-t border-dashed border-amber-500/60" />
                      {m.relations_gap()}
                      <span className="h-px flex-1 border-t border-dashed border-amber-500/60" />
                    </div>
                  )}
              </>
            )}
          </MemberItem>
        ))}
        {!showAll && rows.length > shown.length && (
          <li className="py-1">
            <button type="button" className={LINK_BUTTON} onClick={() => setShowAll(true)}>
              {m.relations_show_all({ count: rows.length })}
            </button>
          </li>
        )}
      </Reorder.Group>
      {load.status === 'failed' ? (
        <p className={HINT}>
          {loadFailureSentence(load.message)}{' '}
          <button type="button" className={LINK_BUTTON} onClick={loadMembers}>
            {m.relations_retry()}
          </button>
        </p>
      ) : (
        (missing > 0 || load.status === 'loading') && (
          <button
            type="button"
            disabled={load.status === 'loading'}
            onClick={loadMembers}
            className={`${BUTTON} justify-self-start`}
          >
            {load.status === 'loading' ? loadingLabel(missing) : loadButtonLabel(missing)}
          </button>
        )
      )}
      {result && <p className={SECONDARY_NOTE}>{result}</p>}
    </div>
  )
}

/** The inspected relation's members, in order. */
export function MembersSection({ entity, editor, select }: Props) {
  const { engine } = useShell()
  // loading members merges them into the data: the rows follow the engine's version, not the editor's
  useSyncExternalStore(engine.subscribe, engine.getVersion)
  // the roles of the relation come from the presets, which arrive after the first picture
  const presets = usePresets()
  const relation = editor.history.staging.graph.hasEntity(entity.id)
  if (!(relation instanceof OsmRelation)) return null
  return (
    <ReadOnlyContext value={entity.readOnly}>
      <MemberList
        key={relation.id}
        editor={editor}
        relation={relation}
        select={select}
        presets={presets}
      />
    </ReadOnlyContext>
  )
}

/** One place where the entity is a member: the relation, the role in it, and a warning if removing it breaks something. */
function MembershipRow({
  editor,
  entityID,
  membership,
  roles,
  roleList,
  select,
}: {
  editor: Editor
  entityID: EntityID
  membership: Membership
  /** The roles of the membership's relation, with their labels */
  roles: RelationRoles
  roleList: string
  select: Props['select']
}) {
  const { engine } = useShell()
  const { relation, index, role } = membership
  const highlight = useRelatedWhileHovered(() => [relation.id, ...engine.relatedOf(relation.id)])
  const member = relation.members[index]
  if (!member) return null
  const hint = membershipHint(relation, index)
  return (
    <>
      <Row highlight={highlight}>
        <Tooltip label={relation.id}>
          <button type="button" className={LINK} onClick={() => select(relation.id)}>
            <span>{relationLabel(relation)}</span>
          </button>
        </Tooltip>
        <RoleInput
          label={m.relations_role_in({ id: relation.id })}
          role={role}
          roles={roles}
          list={roleList}
          onCommit={(next) =>
            edit(
              editor,
              actionChangeMember(relation.id, { ...member, role: next }, index),
              m.relations_undo_role(),
              entityID,
            )
          }
        />
        <RemoveButton
          label={m.relations_remove_from({ id: relation.id })}
          onRemove={() =>
            edit(
              editor,
              actionDeleteMember(relation.id, index),
              m.relations_undo_remove(),
              entityID,
            )
          }
        />
      </Row>
      {hint && <li className={HINT}>{hint}</li>}
    </>
  )
}

/**
 * Adds the selected features to a relation, with a role: an existing one, or a new one ("New relation…").
 * Keyed by the selection, so it starts empty for each one. After an add, a toast says where a single way went.
 */
function AddToRelation({
  editor,
  entities,
  candidates,
  readOnly,
  presets,
  select,
}: {
  editor: Editor
  /** The selected features, in selection order: all of them become members */
  entities: readonly Props['entity'][]
  candidates: OsmRelation[]
  readOnly: boolean
  presets: RelationRules | undefined
  select: Props['select']
}) {
  const [targetID, setTargetID] = useState('')
  const [role, setRole] = useState('')
  const [first] = entities
  const offered = candidates.slice(0, RELATION_OPTION_LIMIT)
  // a native select cannot hold a tooltip: the id is in the name only where two relations share a label
  const names = pickerNames(offered)
  const target = candidates.find((relation) => relation.id === targetID)
  const roles = target ? relationRolesOf(presets, target.tags) : {}
  // as iD: the suggestions follow the geometry of the one feature selected; several may differ, so none is filtered
  const geometry = entities.length === 1 ? first?.geometry : undefined
  const roleList = roleOptionsID('add', first?.id ?? '')
  // a relation that cannot take the selection is listed, disabled, with the reason (iD)
  const reasonOf = (relation: OsmRelation) => cannotTakeReason(relation, entities, presets)
  const targetReason = target ? reasonOf(target) : undefined
  const add = () => {
    if (!targetID || !first || targetReason !== undefined) return
    const members = entities.map((entity) => ({ id: entity.id, type: entity.type }))
    const trimmed = role.trim()
    if (targetID === NEW_RELATION) {
      // as iD: an empty relation with the features as members, one undo step. The new relation is selected,
      // and its type picker opens by itself (an untagged feature with a new id asks for its type, see Inspector)
      const { relation, actions } = newRelationActions(
        editor.history.staging.graph,
        members,
        trimmed,
      )
      editAll(editor, actions, m.relations_undo_create(), relation.id)
      relationSessionActions.touch([relation.id])
      select(relation.id)
    } else {
      const before = editor.history.staging.graph.hasEntity(targetID)
      const beforeMembers = before instanceof OsmRelation ? before.members : []
      // each feature gets the typed role, or the one role that fits it when none is typed (roleToAdd)
      editAll(
        editor,
        entities.map((entity) =>
          actionAddMember(targetID, {
            id: entity.id,
            type: entity.type,
            role: roleToAdd(roles, trimmed, entity),
          }),
        ),
        members.length === 1 ? m.relations_undo_add() : m.relations_undo_add_many(),
        first.id,
      )
      relationSessionActions.touch([targetID])
      if (members.length === 1) {
        const graph = editor.history.staging.graph
        const after = graph.hasEntity(targetID)
        const placement =
          after instanceof OsmRelation
            ? placementOf(beforeMembers, after.members, first.id)
            : undefined
        // an event with its result: a toast, not a line that stays in the section (Toast.tsx)
        if (placement) notify.done(placementSentence(placement, (ref) => memberName(graph, ref)))
      } else {
        notify.done(m.relations_added_features({ count: members.length }))
      }
    }
    setTargetID('')
    setRole('')
  }
  return (
    <div className="grid gap-1.5 pt-2">
      <span className={`text-xs ${SECONDARY}`}>{m.relations_add_to()}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <select
          aria-label={m.relations_add_to_label()}
          disabled={readOnly}
          className={`${FIELD} min-w-0 flex-1 cursor-pointer`}
          value={targetID}
          onChange={(event) => setTargetID(event.target.value)}
        >
          <option value="">{m.relations_choose_relation()}</option>
          <option value={NEW_RELATION}>{m.relations_new_relation()}</option>
          {offered.map((relation) => {
            // a disabled entry stays in the list, with its reason, and cannot be picked
            const reason = reasonOf(relation)
            const name = names.get(relation.id) ?? relationLabel(relation)
            return (
              <option key={relation.id} value={relation.id} disabled={reason !== undefined}>
                {reason === undefined ? name : `${name}: ${reason}`}
              </option>
            )
          })}
        </select>
        <input
          {...PLAIN_INPUT}
          aria-label={m.relations_new_membership_role()}
          placeholder={m.relations_role_placeholder()}
          list={roleList}
          disabled={readOnly}
          className={`${FIELD} w-20 shrink-0`}
          value={role}
          onChange={(event) => setRole(event.target.value)}
        />
        <button
          type="button"
          className={BUTTON}
          disabled={readOnly || !targetID || targetReason !== undefined}
          onClick={add}
        >
          {m.relations_add()}
        </button>
      </div>
      <RoleOptions
        id={roleList}
        options={target ? roleOptionsFor(roleSuggestions(target), roles, geometry) : []}
      />
      {candidates.length > offered.length && (
        <span className={`text-xs ${SECONDARY}`}>
          {m.relations_showing({ shown: offered.length, total: candidates.length })}
        </span>
      )}
    </div>
  )
}

/**
 * The relations the inspected feature belongs to, and a way to add the selection to a loaded relation or to a new
 * one. With several features selected (`entities`), all of them become members; the list of memberships is the
 * first feature's.
 */
export function RelationsSection({ entity, entities, editor, select }: Props) {
  const presets = usePresets()
  const graph = editor.history.staging.graph
  const selection = entities ?? [entity]
  const memberships = membershipsOf(graph, entity.id)
  // the relations that got a member in this session stay at the top of the picker, also when they are far away
  const sessionIDs = useSessionRelationIDs()
  const candidates = sessionFirst(
    joinableRelations(
      graph,
      selection.map((item) => item.id),
    ),
    sessionIDs,
  )
  // one datalist per relation the entity is in, even when it is in that relation twice
  const parents = [
    ...new Map(
      memberships.map((membership) => [membership.relation.id, membership.relation]),
    ).values(),
  ]
  // as iD: the role suggestions follow the geometry of the inspected feature when it is the only one selected
  const geometry = selection.length === 1 ? entity.geometry : undefined
  const readOnly = selection.some((item) => item.readOnly)
  return (
    <div className="grid gap-1">
      {memberships.length === 0 && (
        <p className={`text-xs ${SECONDARY}`}>{m.relations_not_in_relation()}</p>
      )}
      {memberships.length > 0 && (
        // the memberships follow the inspected feature, the add below the whole selection
        <ReadOnlyContext value={entity.readOnly}>
          <ul>
            {memberships.map((membership) => (
              <MembershipRow
                key={`${membership.relation.id}:${membership.index}:${membership.role}`}
                editor={editor}
                entityID={entity.id}
                membership={membership}
                roles={relationRolesOf(presets, membership.relation.tags)}
                roleList={roleOptionsID('membership', membership.relation.id)}
                select={select}
              />
            ))}
          </ul>
        </ReadOnlyContext>
      )}
      {parents.map((relation) => (
        <RoleOptions
          key={relation.id}
          id={roleOptionsID('membership', relation.id)}
          options={roleOptionsFor(
            roleSuggestions(relation),
            relationRolesOf(presets, relation.tags),
            geometry,
          )}
        />
      ))}
      <AddToRelation
        key={selection.map((item) => item.id).join(',')}
        editor={editor}
        entities={selection}
        candidates={candidates}
        readOnly={readOnly}
        presets={presets}
        select={select}
      />
    </div>
  )
}
