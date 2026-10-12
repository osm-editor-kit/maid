import { defineModule, type MaidModule } from '@osm-editor-kit/maid-core'
import {
  actionAddMember,
  actionChangeMember,
  actionDeleteMember,
  OsmRelation,
  type Action,
} from '@osm-editor-kit/maid-model'
import type { InspectorSection, InspectorSectionProps } from '@osm-editor-kit/maid-ui'
import { useState, type ReactNode } from 'react'
import {
  joinableRelations,
  memberLabel,
  membershipsOf,
  relationLabel,
  type Membership,
} from './relations-logic.ts'

type Props = InspectorSectionProps
type Editor = Props['editor']
type Member = OsmRelation['members'][number]

/** Members shown before the list says "and N more". */
const MEMBER_LIMIT = 50
/** Relations offered in the "Add to a relation" select. */
const RELATION_OPTION_LIMIT = 200

const ROW =
  'flex min-w-0 items-center gap-2 border-b border-zinc-950/5 py-1 text-xs last:border-0 dark:border-white/5'
const LINK =
  'min-w-0 flex-1 cursor-pointer truncate rounded px-1 text-left hover:underline focus-visible:outline-2 focus-visible:outline-blue-500'
const SECONDARY = 'text-zinc-500 dark:text-zinc-400'
/** Inline role input: looks like plain text until hovered or focused, as in TagRow. */
const ROLE_INPUT =
  'w-20 shrink-0 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-zinc-950/20 focus:border-blue-500 focus:bg-white focus:outline-none dark:hover:border-white/20 dark:focus:bg-zinc-950'
const FIELD =
  'h-7 min-w-0 rounded-md border border-zinc-950/10 bg-white px-2 text-xs text-zinc-950 hover:border-zinc-950/20 focus-visible:outline-2 focus-visible:outline-blue-500 placeholder:text-zinc-400 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:border-white/20 dark:placeholder:text-zinc-500 dark:[color-scheme:dark]'
const BUTTON =
  'inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md bg-white px-2 text-xs font-medium inset-ring-1 inset-ring-zinc-950/10 focus-visible:outline-2 focus-visible:outline-blue-500 enabled:hover:bg-zinc-50 disabled:cursor-default disabled:text-zinc-400 dark:bg-zinc-800 dark:inset-ring-white/10 dark:enabled:hover:bg-zinc-700 dark:disabled:text-zinc-500'

/** Runs one edit through the history and commits it with its annotation. */
function edit(editor: Editor, action: Action, annotation: string, selectedID: EntityID) {
  editor.history.perform(action)
  editor.history.commit({ annotation, selectedIDs: [selectedID] })
}

/** One line of a list: the same spacing and hairline for members and memberships. */
function Row({ children }: { children: ReactNode }) {
  return <li className={ROW}>{children}</li>
}

/** A role that is edited in place. Applied on Enter or when the field loses focus; Escape restores it. */
function RoleInput({
  label,
  role,
  onCommit,
}: {
  label: string
  role: string
  onCommit: (role: string) => void
}) {
  const [draft, setDraft] = useState(role)
  const commit = () => {
    const next = draft.trim()
    if (next !== role) onCommit(next)
  }
  return (
    <input
      aria-label={label}
      placeholder="role"
      className={ROLE_INPUT}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(role)
          event.stopPropagation()
        }
      }}
    />
  )
}

function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onRemove}
      className="shrink-0 cursor-pointer rounded px-1 text-zinc-400 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/10 dark:hover:text-white"
    >
      ×
    </button>
  )
}

/** A member of the selected relation, with its role and a remove button. */
function MemberRow({
  editor,
  relation,
  member,
  index,
  select,
}: {
  editor: Editor
  relation: OsmRelation
  member: Member
  index: number
  select: Props['select']
}) {
  const target = editor.history.staging.graph.hasEntity(member.id)
  const label = memberLabel(target?.tags)
  const name = `${member.type} ${member.id}`
  return (
    <Row>
      {target ? (
        <button type="button" className={LINK} onClick={() => select(member.id)}>
          <span className="font-mono">{name}</span>
          {label && <span className={`ml-2 ${SECONDARY}`}>{label}</span>}
        </button>
      ) : (
        <span className={`min-w-0 flex-1 truncate px-1 font-mono ${SECONDARY}`}>
          {name} <span className="italic">not loaded</span>
        </span>
      )}
      <RoleInput
        label={`Role of ${member.id}`}
        role={member.role}
        onCommit={(role) =>
          edit(
            editor,
            actionChangeMember(relation.id, { ...member, role }, index),
            'Changed a role',
            relation.id,
          )
        }
      />
      <RemoveButton
        label={`Remove member ${member.id}`}
        onRemove={() => {
          edit(editor, actionDeleteMember(relation.id, index), 'Removed a member', relation.id)
          // removing the last member deletes the relation
          if (!editor.history.staging.graph.hasEntity(relation.id)) select(null)
        }}
      />
    </Row>
  )
}

/** The inspected relation's members, in order. */
function MembersSection({ entity, editor, select }: Props) {
  const relation = editor.history.staging.graph.hasEntity(entity.id)
  if (!(relation instanceof OsmRelation)) return null
  const count = relation.members.length
  const shown = Math.min(count, MEMBER_LIMIT)
  return (
    <ul>
      {count === 0 && <li className={`py-1 text-xs ${SECONDARY}`}>No members.</li>}
      {relation.members.slice(0, MEMBER_LIMIT).map((member, index) => (
        <MemberRow
          key={`${index}:${member.id}:${member.role}`}
          editor={editor}
          relation={relation}
          member={member}
          index={index}
          select={select}
        />
      ))}
      {count > shown && <li className={`py-1 text-xs ${SECONDARY}`}>and {count - shown} more</li>}
    </ul>
  )
}

/** One place where the entity is a member: the relation, and the role in it. */
function MembershipRow({
  editor,
  entityID,
  membership,
  select,
}: {
  editor: Editor
  entityID: EntityID
  membership: Membership
  select: Props['select']
}) {
  const { relation, index, role } = membership
  const member = relation.members[index]
  if (!member) return null
  return (
    <Row>
      <button type="button" className={LINK} onClick={() => select(relation.id)}>
        <span>{relationLabel(relation)}</span>
        <span className={`ml-2 font-mono ${SECONDARY}`}>{relation.id}</span>
      </button>
      <RoleInput
        label={`Role in ${relation.id}`}
        role={role}
        onCommit={(next) =>
          edit(
            editor,
            actionChangeMember(relation.id, { ...member, role: next }, index),
            'Changed a role',
            entityID,
          )
        }
      />
      <RemoveButton
        label={`Remove from ${relation.id}`}
        onRemove={() =>
          edit(editor, actionDeleteMember(relation.id, index), 'Removed a member', entityID)
        }
      />
    </Row>
  )
}

/** Adds the inspected entity to a loaded relation, with a role. Keyed by entity, so it starts empty for each one. */
function AddToRelation({
  editor,
  entity,
  candidates,
}: {
  editor: Editor
  entity: Props['entity']
  candidates: OsmRelation[]
}) {
  const [targetID, setTargetID] = useState('')
  const [role, setRole] = useState('')
  const offered = candidates.slice(0, RELATION_OPTION_LIMIT)
  const add = () => {
    if (!targetID) return
    const member = { id: entity.id, type: entity.type, role: role.trim() }
    edit(editor, actionAddMember(targetID, member), 'Added a member', entity.id)
    setTargetID('')
    setRole('')
  }
  return (
    <div className="grid gap-1.5 pt-2">
      <span className={`text-xs ${SECONDARY}`}>Add to a relation</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <select
          aria-label="Relation to add to"
          className={`${FIELD} min-w-0 flex-1 cursor-pointer`}
          value={targetID}
          onChange={(event) => setTargetID(event.target.value)}
        >
          <option value="">Choose a relation</option>
          {offered.map((relation) => (
            <option key={relation.id} value={relation.id}>
              {relationLabel(relation)} ({relation.id})
            </option>
          ))}
        </select>
        <input
          aria-label="Role for the new membership"
          placeholder="role"
          className={`${FIELD} w-20 shrink-0`}
          value={role}
          onChange={(event) => setRole(event.target.value)}
        />
        <button type="button" className={BUTTON} disabled={!targetID} onClick={add}>
          Add
        </button>
      </div>
      {candidates.length > offered.length && (
        <span className={`text-xs ${SECONDARY}`}>
          Showing {offered.length} of {candidates.length} relations.
        </span>
      )}
    </div>
  )
}

/** The relations the inspected entity belongs to, and a way to add it to another loaded relation. */
function RelationsSection({ entity, editor, select }: Props) {
  const graph = editor.history.staging.graph
  const memberships = membershipsOf(graph, entity.id)
  const candidates = joinableRelations(graph, entity.id)
  if (memberships.length === 0 && candidates.length === 0) {
    return <p className={`text-xs ${SECONDARY}`}>Not in a relation.</p>
  }
  return (
    <div className="grid gap-1">
      {memberships.length > 0 && (
        <ul>
          {memberships.map((membership) => (
            <MembershipRow
              key={`${membership.relation.id}:${membership.index}:${membership.role}`}
              editor={editor}
              entityID={entity.id}
              membership={membership}
              select={select}
            />
          ))}
        </ul>
      )}
      {candidates.length > 0 && (
        <AddToRelation key={entity.id} editor={editor} entity={entity} candidates={candidates} />
      )}
    </div>
  )
}

/** Adds "Members" (for relations) and "Relations" (for every element) to the inspector. */
export function relations(): MaidModule {
  return defineModule({
    id: 'relations',
    setup(api) {
      const members: InspectorSection = {
        id: 'relation-members',
        title: 'Members',
        when: (entity) => entity.type === 'relation',
        disclosure: 'open',
        detail: (entity) => (entity.type === 'relation' ? entity.size : undefined),
        component: MembersSection,
      }
      const memberships: InspectorSection = {
        id: 'relation-memberships',
        title: 'Relations',
        // most features are in no relation: folded, with the number in the headline
        disclosure: 'closed',
        detail: (entity, editor) => membershipsOf(editor.history.staging.graph, entity.id).length,
        component: RelationsSection,
      }
      api.register('inspector.section', members)
      api.register('inspector.section', memberships)
    },
  })
}
