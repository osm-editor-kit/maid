import { TrashIcon } from '@heroicons/react/16/solid'
import { m } from '@osm-editor-kit/maid-i18n'
import {
  actionAddMember,
  actionChangeMember,
  actionDeleteMember,
  OsmRelation,
  type Action,
} from '@osm-editor-kit/maid-model'
import type { RelationRoles } from '@osm-editor-kit/maid-presets'
import { notify, PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
import { SidebarDisclosure, Tooltip, type InspectorSectionProps } from '@osm-editor-kit/maid-ui'
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react'
import { usePresets, useShell } from '../shell-context'
import { useRelatedWhileHovered, type RowHighlight } from './relations-hover.ts'
import {
  cannotTakeReason,
  colourOf,
  dotNeedsRing,
  joinableRelations,
  memberName,
  membershipHint,
  membershipsOf,
  multiMembershipsOf,
  newRelationActions,
  pasteOffersOf,
  pickerNames,
  placementOf,
  placementSentence,
  planAddOthers,
  planRemoveFrom,
  relationLabel,
  relationRolesOf,
  roleFromText,
  roleLabel,
  roleOptionsFor,
  roleSuggestions,
  roleToAdd,
  sessionFirst,
  type Membership,
  type MultiMembership,
  type PasteOffer,
  type RelationRules,
  type RoleOption,
} from './relations-logic.ts'
import { openRelationActions, useOpenRelationId } from './relations-open-store.ts'
import { pasteOfferActions, usePasteOrigins, usePasteSettled } from './relations-paste-store.ts'
import { relationSessionActions, useSessionRelationIDs } from './relations-session-store.ts'

type Props = InspectorSectionProps
type Editor = Props['editor']
/** Relations offered in the "Add to a relation" select. */
const RELATION_OPTION_LIMIT = 200
/**
 * The select's value for "New relation…", as iD's list starts with it. Not an element id (those start with
 * `r`), so it cannot be taken for a relation.
 */
const NEW_RELATION = 'new'

const ROW =
  'flex min-w-0 items-center gap-2 border-b border-zinc-950/5 py-1 text-xs last:border-0 dark:border-white/5'
/**
 * The section's grids: one column that may shrink below its content. Without it the column grows to the longest
 * relation name or picker option and the rows run out of the sidebar instead of truncating.
 */
const COLUMN = 'grid grid-cols-[minmax(0,1fr)]'
const LINK =
  'min-w-0 flex-1 cursor-pointer truncate rounded px-1 text-left hover:underline focus-visible:outline-2 focus-visible:outline-blue-500'
const SECONDARY = 'text-zinc-500 dark:text-zinc-400'
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
/** A warning under a membership: information only. */
const HINT = 'pb-1 pl-1 text-xs text-amber-700 dark:text-amber-400'
/** A quiet line under the list: what a load left out */
const SECONDARY_NOTE = `pt-1 text-xs ${SECONDARY}`
/**
 * A line of the multi-selection's list: the relation, its status and role, and the buttons. Flex-wrap, so a narrow sidebar
 * puts the buttons on a line of their own instead of cutting the name.
 */
const MULTI_ROW =
  'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-zinc-950/5 py-1 text-xs last:border-0 dark:border-white/5'

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

/** Runs the actions as one undo step, and keeps every selected feature selected when it is undone (several features). */
function editSelection(
  editor: Editor,
  actions: readonly Action[],
  annotation: string,
  selectedIDs: readonly EntityID[],
) {
  editor.history.perform(...actions)
  editor.history.commit({ annotation, selectedIDs: [...selectedIDs] })
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
        className={`${ICON_BUTTON} py-0.5`}
      >
        {/* a trash, as everywhere something is taken out of the data; × only clears an input or closes */}
        <TrashIcon aria-hidden="true" className="size-3.5" />
      </button>
    </Tooltip>
  )
}

/**
 * A relation's colour (its `colour` tag) as a small dot before its name. Nothing without a valid colour. A light
 * colour gets a hairline ring, so it shows on the white of the sidebar. Not in the picker: a native select cannot
 * show a dot.
 */
function ColourDot({ colour }: { colour: string | undefined }) {
  if (colour === undefined) return null
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: colour }}
      className={`mr-1.5 inline-block size-2.5 shrink-0 -translate-y-px rounded-full align-middle ${dotNeedsRing(colour) ? 'ring-1 ring-zinc-950/15 ring-inset dark:ring-white/25' : ''}`}
    />
  )
}

/** The inspected relation's members, in order. */
export function MembersSection({ entity, editor }: Props) {
  const { engine } = useShell()
  // loading members merges them into the data: the rows follow the engine's version, not the editor's
  useSyncExternalStore(engine.subscribe, engine.getVersion)
  const openID = useOpenRelationId()
  const relation = editor.history.staging.graph.hasEntity(entity.id)
  if (!(relation instanceof OsmRelation)) return null
  // open beside the inspector, the column lists the members: nothing here then
  if (openID === entity.id) return null
  return (
    <ReadOnlyContext value={entity.readOnly}>
      <div className="flex justify-end">
        <button
          type="button"
          className={BUTTON}
          aria-label={m.relations_open_label({ relation: relationLabel(relation) })}
          onClick={() => openRelationActions.open(entity.id)}
        >
          {m.relations_open()}
        </button>
      </div>
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
}: {
  editor: Editor
  entityID: EntityID
  membership: Membership
  /** The roles of the membership's relation, with their labels */
  roles: RelationRoles
  roleList: string
}) {
  const { engine } = useShell()
  const { relation, index, role } = membership
  const highlight = useRelatedWhileHovered(() => [relation.id, ...engine.relatedOf(relation.id)])
  // the relation beside the inspector: its name opens it, the button at the end closes it
  const open = useOpenRelationId() === relation.id
  const member = relation.members[index]
  if (!member) return null
  const hint = membershipHint(relation, index)
  return (
    <>
      <Row highlight={highlight}>
        <Tooltip label={relation.id}>
          <button
            type="button"
            className={LINK}
            onClick={() => openRelationActions.open(relation.id)}
          >
            <ColourDot colour={colourOf(relation)} />
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
        {open ? (
          <button
            type="button"
            className={BUTTON}
            aria-label={m.relations_close_label()}
            onClick={() => openRelationActions.close()}
          >
            {m.relations_close()}
          </button>
        ) : (
          <button
            type="button"
            className={BUTTON}
            aria-label={m.relations_open_label({ relation: relationLabel(relation) })}
            onClick={() => openRelationActions.open(relation.id)}
          >
            {m.relations_open()}
          </button>
        )}
      </Row>
      {hint && <li className={HINT}>{hint}</li>}
    </>
  )
}

/**
 * An "Also add" offer after a paste (iD issue 9359): the relation the copied feature's original is in, with the role the
 * original had there. "Add" makes the copy a member with that role, in one undo step, and says where it went, as an add
 * does. The × leaves the offer out. Either way the offer is settled: nothing is added unasked.
 */
function PasteOfferRow({
  editor,
  entity,
  offer,
  roles,
  readOnly,
}: {
  editor: Editor
  entity: Props['entity']
  offer: PasteOffer
  /** The relation's roles with their labels (none without a schema) */
  roles: RelationRoles
  readOnly: boolean
}) {
  const { relation, role } = offer
  const label = relationLabel(relation)
  const add = () => {
    const before = relation.members
    edit(
      editor,
      actionAddMember(relation.id, { id: entity.id, type: entity.type, role }),
      m.relations_undo_add(),
      entity.id,
    )
    relationSessionActions.touch([relation.id])
    pasteOfferActions.settle(entity.id, relation.id)
    const graph = editor.history.staging.graph
    const after = graph.hasEntity(relation.id)
    const placement =
      after instanceof OsmRelation ? placementOf(before, after.members, entity.id) : undefined
    if (placement) notify.done(placementSentence(placement, (ref) => memberName(graph, ref)))
  }
  return (
    <Row>
      <ColourDot colour={colourOf(relation)} />
      <span className="min-w-0 flex-1 truncate">
        {label}{' '}
        <span className={SECONDARY}>
          —{' '}
          {role === ''
            ? m.relations_also_add()
            : m.relations_also_add_as({ role: roleLabel(roles, role) })}
        </span>
      </span>
      <button type="button" className={BUTTON} disabled={readOnly} onClick={add}>
        {m.relations_add()}
      </button>
      <Tooltip label={m.relations_also_dismiss({ relation: label })}>
        <button
          type="button"
          aria-label={m.relations_also_dismiss({ relation: label })}
          onClick={() => pasteOfferActions.settle(entity.id, relation.id)}
          className={ICON_BUTTON}
        >
          ×
        </button>
      </Tooltip>
    </Row>
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
    <div className={`${COLUMN} gap-1.5 pt-2`}>
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
  // after a paste: the relations the copied feature's original is in, as offers (see pasteOffersOf)
  const pasted = { origins: usePasteOrigins(), settled: usePasteSettled() }
  const origin = pasted.origins.get(entity.id)
  const offers =
    origin === undefined
      ? []
      : pasteOffersOf(
          graph,
          entity.id,
          origin.original,
          origin.copied,
          pasted.settled.get(entity.id) ?? [],
        ).filter((offer) => cannotTakeReason(offer.relation, [entity], presets) === undefined)
  return (
    <div className={`${COLUMN} gap-1`}>
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
      {offers.length > 0 && (
        <ul>
          {offers.map((offer) => (
            <PasteOfferRow
              key={offer.relation.id}
              editor={editor}
              entity={entity}
              offer={offer}
              roles={relationRolesOf(presets, offer.relation.tags)}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
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

/** A dot that is full when every selected feature is in the relation, half full when only some of them are. */
function PartialMark({ all }: { all: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-2.5 shrink-0 rounded-full ring-1 ring-zinc-500 ring-inset dark:ring-zinc-400 ${
        all
          ? 'bg-zinc-500 dark:bg-zinc-400'
          : 'bg-[linear-gradient(to_right,#71717a_50%,transparent_50%)] dark:bg-[linear-gradient(to_right,#a1a1aa_50%,transparent_50%)]'
      }`}
    />
  )
}

/**
 * A relation of the multi-selection: "all" or "some (N of M)" with its mark, the role (or "mixed"), "Add the others" for a
 * partial relation (the features it does not hold, each with its role; one undo step), and "Remove all" (the features it
 * holds leave it; one undo step). A read-only feature, or a refusal by the relation, disables the buttons, and says why.
 */
function MultiMembershipRow({
  editor,
  selection,
  membership,
  presets,
  select,
}: {
  editor: Editor
  selection: readonly Props['entity'][]
  membership: MultiMembership
  presets: RelationRules | undefined
  select: Props['select']
}) {
  const { engine } = useShell()
  const readOnly = useReadOnly()
  const { relation, count, total, roles } = membership
  const highlight = useRelatedWhileHovered(() => [relation.id, ...engine.relatedOf(relation.id)])
  const all = count === total
  const ids = selection.map((item) => item.id)
  const relationRoles = relationRolesOf(presets, relation.tags)
  // one role for every held feature shows as it does in the single list; several show as "mixed"
  const roleText =
    roles.length > 1 ? m.relations_role_mixed() : roleLabel(relationRoles, roles[0] ?? '')
  const addOthers = planAddOthers(relation, selection, presets)
  const addOthersClick = () => {
    if (addOthers.reason !== undefined || addOthers.actions.length === 0) return
    editSelection(editor, addOthers.actions, m.relations_undo_add_many(), ids)
    relationSessionActions.touch([relation.id])
    notify.done(m.relations_added_features({ count: addOthers.missing }))
  }
  const removeAllClick = () => {
    const actions = planRemoveFrom(relation, ids)
    if (actions.length === 0) return
    editSelection(editor, actions, m.relations_undo_remove_many(), ids)
  }
  return (
    <>
      <li className={MULTI_ROW} {...highlight}>
        <Tooltip label={relation.id}>
          <button type="button" className={LINK} onClick={() => select(relation.id)}>
            <ColourDot colour={colourOf(relation)} />
            <span>{relationLabel(relation)}</span>
          </button>
        </Tooltip>
        <span className={`flex shrink-0 items-center gap-1.5 ${SECONDARY}`}>
          <PartialMark all={all} />
          {all ? m.relations_all() : m.relations_some({ count, total })}
        </span>
        {roleText !== '' && <span className={`shrink-0 ${SECONDARY}`}>{roleText}</span>}
        {!all && (
          <button
            type="button"
            className={BUTTON}
            disabled={readOnly || addOthers.reason !== undefined}
            onClick={addOthersClick}
          >
            {m.relations_add_others()}
          </button>
        )}
        <button type="button" className={BUTTON} disabled={readOnly} onClick={removeAllClick}>
          {m.relations_remove_all()}
        </button>
      </li>
      {!all && addOthers.reason !== undefined && (
        <li className={SECONDARY_NOTE}>{addOthers.reason}</li>
      )}
    </>
  )
}

/**
 * The relations of several selected features (iD PR 11949): every relation that holds at least one of them, "all" or
 * "some (N of M)" for each, and under them the "Add to a relation" picker, which adds all of them as it does for one.
 * Folded, with the number of relations in the headline, as the list of one feature is. Read-only features lock the
 * buttons, and the section says so. The inspector passes `readOnly` (engine.isReadOnly).
 */
export function MultiRelationsSection({ entities, editor, select, readOnly }: Props) {
  const presets = usePresets()
  const selection = entities ?? []
  const graph = editor.history.staging.graph
  const ids = selection.map((item) => item.id)
  const memberships = multiMembershipsOf(graph, ids)
  // the relations that got a member in this session stay at the top of the picker, also when they are far away
  const sessionIDs = useSessionRelationIDs()
  const candidates = sessionFirst(joinableRelations(graph, ids), sessionIDs)
  const locked = selection.filter((item) => (readOnly ? readOnly(item.id) : item.readOnly)).length
  if (selection.length === 0) return null
  return (
    <SidebarDisclosure
      title={m.relations_section_relations()}
      detail={memberships.length}
      defaultOpen={false}
    >
      <div className={`${COLUMN} gap-1`}>
        {locked > 0 && <p className={`text-xs ${SECONDARY}`}>{m.relations_locked_hint()}</p>}
        {memberships.length === 0 && (
          <p className={`text-xs ${SECONDARY}`}>{m.relations_none_of_selected()}</p>
        )}
        {memberships.length > 0 && (
          <ReadOnlyContext value={locked > 0}>
            <ul>
              {memberships.map((membership) => (
                <MultiMembershipRow
                  key={membership.relation.id}
                  editor={editor}
                  selection={selection}
                  membership={membership}
                  presets={presets}
                  select={select}
                />
              ))}
            </ul>
          </ReadOnlyContext>
        )}
        <AddToRelation
          key={ids.join(',')}
          editor={editor}
          entities={selection}
          candidates={candidates}
          readOnly={locked > 0}
          presets={presets}
          select={select}
        />
      </div>
    </SidebarDisclosure>
  )
}
