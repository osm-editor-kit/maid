import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ViewfinderCircleIcon,
} from '@heroicons/react/16/solid'
import type { Editor } from '@osm-editor-kit/maid-core'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { type DockViewProps, SidebarDisclosure, TagDiff } from '@osm-editor-kit/maid-ui'
import { type ReactNode, useSyncExternalStore } from 'react'
import { decide, stillApplied } from './editor-io.ts'
import { ACTION_COLOUR, toneOf } from './features.ts'
import { MAIN_KEYS } from './match.ts'
import { type Choice, choiceOf, type Conflict, fileChangeOf } from './merge.ts'
import { text } from './message-text.ts'
import { m } from './messages.ts'
import {
  type OsmChangeStore,
  useOsmChangeActions,
  useOsmChangeChoices,
  useOsmChangeCreated,
  useOsmChangeError,
  useOsmChangeHighlight,
  useOsmChangeLoaded,
  useOsmChangeLoading,
  useOsmChangeSession,
} from './osmchange-store.ts'
import { planOf, type PlanItem } from './plan.ts'
import type { Tags } from './types.ts'

const BUTTON =
  'cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-zinc-950/10 hover:bg-zinc-950/5 disabled:cursor-default disabled:opacity-50 dark:ring-white/15 dark:hover:bg-white/5'
const PRESSED = 'bg-blue-50 text-blue-800 ring-blue-500 dark:bg-blue-950/50 dark:text-blue-200'
// as the relation column's "Fly to" (packages/shell/src/modules/relations-column.tsx)
const FLY_BUTTON =
  'grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-blue-600 hover:bg-blue-600/10 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:text-zinc-300 dark:text-blue-400 dark:hover:bg-blue-400/10'

function typeName(type: PlanItem['change']['element']['type']) {
  return type === 'node'
    ? m.osmchange_type_node()
    : type === 'way'
      ? m.osmchange_type_way()
      : m.osmchange_type_relation()
}

/** A short name for a row: the name tag, else the main tag, else the first tag, else "Point without tags" */
function labelOf(item: PlanItem) {
  const current = item.server?.current
  const tags: Tags = {
    ...(current && current !== 'deleted' ? current.tags : {}),
    ...item.change.element.tags,
  }
  if (tags.name) return tags.name
  const key = MAIN_KEYS.find((k) => tags[k] !== undefined) ?? Object.keys(tags).sort()[0]
  return key
    ? `${key}=${tags[key]}`
    : m.osmchange_untagged({ type: typeName(item.change.element.type) })
}

function actionLabel(item: PlanItem) {
  if (item.status === 'skip') return m.osmchange_action_skip()
  return item.change.action === 'create'
    ? m.osmchange_action_create()
    : item.change.action === 'modify'
      ? m.osmchange_action_modify()
      : m.osmchange_action_delete()
}

/** The versions only where they differ: the file was made from an older one, or the server deleted it */
function versionsOf(item: PlanItem) {
  if (item.change.action === 'create') return undefined
  const current = item.server?.current
  if (current === 'deleted') return m.osmchange_version_deleted()
  const file = item.change.element.version
  if (file === undefined || current?.version === undefined || file === current.version)
    return undefined
  return m.osmchange_versions({ file, server: current.version })
}

/** What the file changes on the element, in words: "only moved, 2.1 m", "tags: surface", "nodes of the way" */
function changeWords(item: PlanItem) {
  const change = fileChangeOf(item.change, item.server)
  if (!change) return undefined
  const only = change.tags.length === 0 && !change.nodes && !change.members
  return [
    change.metres !== undefined
      ? only
        ? m.osmchange_change_only_moved({ metres: change.metres })
        : m.osmchange_change_moved({ metres: change.metres })
      : '',
    change.tags.length > 0 ? m.osmchange_change_tags({ keys: change.tags.join(', ') }) : '',
    change.nodes ? m.osmchange_change_nodes() : '',
    change.members ? m.osmchange_change_members() : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function conflictTitle(conflict: Conflict) {
  switch (conflict.kind) {
    case 'tag':
      return m.osmchange_conflict_tag({ key: conflict.key })
    case 'position':
      return m.osmchange_conflict_position({ metres: conflict.metres })
    case 'nodes':
      return m.osmchange_conflict_nodes()
    case 'members':
      return m.osmchange_conflict_members()
    case 'duplicate':
      return m.osmchange_conflict_duplicate({
        list: conflict.candidates
          .map((candidate) =>
            candidate.user
              ? m.osmchange_duplicate_by({
                  id: candidate.key,
                  metres: candidate.metres,
                  user: candidate.user,
                })
              : m.osmchange_duplicate({ id: candidate.key, metres: candidate.metres }),
          )
          .join(', '),
      })
    case 'delete':
      return [
        conflict.changed ? m.osmchange_conflict_delete_changed() : '',
        conflict.usedBy.length > 0
          ? m.osmchange_conflict_delete_used({ ids: conflict.usedBy.join(', ') })
          : '',
      ]
        .filter(Boolean)
        .join(' · ')
  }
}

function ChoiceButtons(props: {
  conflict: Conflict
  choice: Choice | undefined
  disabled: boolean
  onChoose: (choice: Choice) => void
}) {
  const { conflict, choice, disabled, onChoose } = props
  const labels: Record<Choice, string> =
    conflict.kind === 'delete'
      ? {
          // a node still used is also taken out of its ways (and a way left with one node goes): said on the button
          file:
            conflict.usedBy.length > 0
              ? m.osmchange_choose_delete_used({ ids: conflict.usedBy.join(', ') })
              : m.osmchange_choose_delete(),
          current: m.osmchange_choose_keep(),
        }
      : conflict.kind === 'duplicate'
        ? { file: m.osmchange_choose_create(), current: m.osmchange_choose_use_existing() }
        : {
            file:
              conflict.kind === 'tag'
                ? m.osmchange_choose_file_value({ value: conflict.file ?? m.osmchange_none() })
                : m.osmchange_choose_file(),
            current:
              conflict.kind === 'tag'
                ? m.osmchange_choose_current_value({
                    value: conflict.current ?? m.osmchange_none(),
                  })
                : m.osmchange_choose_current(),
          }
  return (
    <div role="radiogroup" aria-label={conflictTitle(conflict)} className="flex flex-wrap gap-1">
      {(['file', 'current'] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={choice === option}
          data-choice={option}
          disabled={disabled}
          onClick={() => onChoose(option)}
          className={`${BUTTON} max-w-full truncate ${choice === option ? PRESSED : ''}`}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  )
}

function tagsBefore(item: PlanItem): Tags {
  const current = item.server?.current
  return current && current !== 'deleted' ? current.tags : {}
}

function tagsAfter(item: PlanItem): Tags {
  if (item.change.action === 'delete') return {}
  if (item.result && item.result !== 'delete') return item.result.tags
  return item.change.action === 'create' ? item.change.element.tags : tagsBefore(item)
}

function ItemCard(props: {
  item: PlanItem
  choices: Readonly<Record<string, Choice>>
  canShow: boolean
  /** The file's changes were undone: no more decisions */
  locked: boolean
  onChoose: (id: string, choice: Choice) => void
  onShow: (item: PlanItem) => void
  onHover: (item: PlanItem | null) => void
}) {
  const { item, choices, canShow, locked, onChoose, onShow, onHover } = props
  const before = tagsBefore(item)
  const after = tagsAfter(item)
  const hasDiff = Object.keys({ ...before, ...after }).some((key) => before[key] !== after[key])
  const versions = versionsOf(item)
  const words = changeWords(item)
  const label = labelOf(item)
  const hasDetails = item.notes.length > 0 || item.conflicts.length > 0 || hasDiff
  const summary = (
    <>
      <span
        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-zinc-900"
        style={{ backgroundColor: ACTION_COLOUR[toneOf(item)] }}
      >
        {actionLabel(item)}
      </span>
      <span className="min-w-0 truncate font-medium">{label}</span>
      <span className="shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {item.key}
      </span>
      {words && (
        <span className="min-w-0 truncate text-xs text-zinc-600 dark:text-zinc-300">{words}</span>
      )}
      {versions && (
        <span className="ml-auto shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
          {versions}
        </span>
      )}
      <button
        type="button"
        className={`${FLY_BUTTON} ${versions ? '' : 'ml-auto'}`}
        aria-label={m.osmchange_show_label({ name: label })}
        title={m.osmchange_show()}
        disabled={!canShow}
        onClick={(event) => {
          event.preventDefault()
          onShow(item)
        }}
      >
        <ViewfinderCircleIcon className="size-4" />
      </button>
    </>
  )
  return (
    <li
      data-osmchange-item={item.key}
      data-status={item.status}
      onPointerEnter={() => onHover(item)}
      onPointerLeave={() => onHover(null)}
      className="rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/10"
    >
      {hasDetails ? (
        <details open={item.status === 'decide'}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-sm">
            {summary}
          </summary>
          <div className="flex flex-col gap-2 px-2.5 pt-1 pb-2.5">
            {item.notes.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-zinc-600 dark:text-zinc-300">
                {item.notes.map((note) => (
                  <li key={note.id}>{text(note)}</li>
                ))}
              </ul>
            )}
            {item.conflicts.map((conflict) => (
              <div key={conflict.id} data-conflict={conflict.id} className="flex flex-col gap-1">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                  {conflictTitle(conflict)}
                </p>
                {conflict.kind === 'tag' && conflict.base !== undefined && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {m.osmchange_conflict_was({ value: conflict.base })}
                  </p>
                )}
                <ChoiceButtons
                  conflict={conflict}
                  choice={choiceOf(conflict, choices)}
                  disabled={locked}
                  onChoose={(choice) => onChoose(conflict.id, choice)}
                />
              </div>
            ))}
            {hasDiff && <TagDiff before={before} after={after} />}
          </div>
        </details>
      ) : (
        <div className="flex items-center gap-2 px-2.5 py-1.5 text-sm">{summary}</div>
      )}
    </li>
  )
}

type GroupId = 'decide' | 'auto' | 'new' | 'clean' | 'skip'

/** Whether the file's changes are still in the editor (an undo of the load step takes them), read as the history changes */
function useStillApplied(
  editor: Editor,
  created: ReadonlyMap<string, string>,
  loaded: ReadonlySet<string>,
) {
  return useSyncExternalStore(
    (listener) => {
      const offs = [
        editor.history.on('stablechange', listener),
        editor.history.on('historyjump', listener),
      ]
      return () => offs.forEach((off) => off())
    },
    () => stillApplied(editor, created, loaded),
  )
}

/** A warning on what needs a decision, a green check on what is settled, a grey one on what is obsolete */
const GROUP_ICON: Record<GroupId, ReactNode> = {
  decide: (
    <ExclamationTriangleIcon
      aria-hidden="true"
      className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
    />
  ),
  auto: (
    <CheckCircleIcon
      aria-hidden="true"
      className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
    />
  ),
  new: (
    <CheckCircleIcon
      aria-hidden="true"
      className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
    />
  ),
  clean: (
    <CheckCircleIcon
      aria-hidden="true"
      className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
    />
  ),
  skip: (
    <CheckCircleIcon
      aria-hidden="true"
      className="size-4 shrink-0 text-zinc-400 dark:text-zinc-500"
    />
  ),
}

/** The groups of the review, as disclosures: only the one to decide starts open */
const GROUPS: { id: GroupId; title: () => string; of: (item: PlanItem) => boolean }[] = [
  { id: 'decide', title: () => m.osmchange_group_decide(), of: (item) => item.status === 'decide' },
  { id: 'auto', title: () => m.osmchange_group_auto(), of: (item) => item.status === 'auto' },
  {
    id: 'new',
    title: () => m.osmchange_group_new(),
    of: (item) => item.status === 'clean' && item.change.action === 'create',
  },
  {
    id: 'clean',
    title: () => m.osmchange_group_clean(),
    of: (item) => item.status === 'clean' && item.change.action !== 'create',
  },
  { id: 'skip', title: () => m.osmchange_group_skip(), of: (item) => item.status === 'skip' },
]

export function createReviewView(store: OsmChangeStore, shared: { engine?: MaidEngine }) {
  return function ReviewView({ editor, select, highlight }: DockViewProps) {
    const loading = useOsmChangeLoading(store)
    const error = useOsmChangeError(store)
    const session = useOsmChangeSession(store)
    const choices = useOsmChangeChoices(store)
    const created = useOsmChangeCreated(store)
    const shown = useOsmChangeHighlight(store)
    const actions = useOsmChangeActions(store)
    const loaded = useOsmChangeLoaded(store)
    const applied = useStillApplied(editor, created, loaded)

    if (loading) return <p className="p-3 text-sm">{m.osmchange_loading({ file: loading })}</p>
    if (!session)
      return (
        <div className="flex flex-col gap-2 p-3 text-sm">
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-2 text-red-800 dark:bg-red-950/40 dark:text-red-300"
            >
              {text(error)}
            </p>
          )}
          <p className="text-zinc-500 dark:text-zinc-400">{m.osmchange_empty()}</p>
        </div>
      )

    const plan = planOf(session.file, session.states, session.parents, choices, session.matches)
    const idOf = (item: PlanItem) =>
      item.change.action === 'create' ? created.get(item.key) : item.key
    const exists = (id: string | undefined): id is string =>
      id !== undefined && editor.history.staging.graph.hasEntity(id) !== undefined
    const show = (item: PlanItem) => {
      const id = idOf(item)
      if (!exists(id)) return
      select(id)
      shared.engine?.camera.fitTo([id])
    }
    const hover = (item: PlanItem | null) => {
      const id = item ? idOf(item) : undefined
      highlight(exists(id) ? [id] : null)
    }
    return (
      <div className="flex flex-col" data-osmchange-review="">
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3 pb-2">
          <h2 className="text-sm font-semibold">
            {session.fileName}
            {session.file.generator && (
              <span className="ml-1 font-normal text-zinc-500 dark:text-zinc-400">
                {m.osmchange_generator({ generator: session.file.generator })}
              </span>
            )}
          </h2>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              aria-pressed={shown}
              onClick={() => actions.toggleHighlight()}
              className={`${BUTTON} ${shown ? PRESSED : ''}`}
            >
              {m.osmchange_highlight()}
            </button>
          </div>
          {!applied && (
            <p
              role="alert"
              className="w-full rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              {m.osmchange_undone()}
            </p>
          )}
          <ul className="w-full list-disc pl-5 text-xs text-zinc-600 dark:text-zinc-300">
            <li>{m.osmchange_intro_clear()}</li>
            <li>{m.osmchange_intro_decide()}</li>
            <li>{m.osmchange_intro_undo()}</li>
          </ul>
        </div>
        {GROUPS.map((group) => {
          const items = plan.items.filter(group.of)
          if (items.length === 0) return null
          return (
            <section key={group.id} data-osmchange-group={group.id} className="contents">
              <SidebarDisclosure
                title={group.title()}
                detail={items.length}
                defaultOpen={group.id === 'decide'}
                icon={() => GROUP_ICON[group.id]}
                headingClassName={
                  group.id === 'decide' ? 'bg-amber-50 px-3 dark:bg-amber-950/40' : 'px-3'
                }
              >
                <ul className="flex flex-col gap-1.5 px-3">
                  {items.map((item) => (
                    <ItemCard
                      key={item.key}
                      item={item}
                      choices={choices}
                      canShow={exists(idOf(item))}
                      locked={!applied}
                      onChoose={(id, choice) => decide(editor, store, id, choice)}
                      onShow={show}
                      onHover={hover}
                    />
                  ))}
                </ul>
              </SidebarDisclosure>
            </section>
          )
        })}
      </div>
    )
  }
}
