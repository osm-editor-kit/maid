// The inspector section "TILDA bike infrastructure" of a highway: how TILDA classifies the way and each side, the open
// question that makes an incomplete category exact, "Change to" with the tags to reach a chosen category, the
// checklist of the attributes the Radnetz dataset needs, reminders, and "Verified". The UX of the TILDA box of the iD
// Radnetz Berlin fork; the logic is in cards.ts and the @tilda-geo packages.
import type { Editor } from '@osm-editor-kit/maid-core'
import { getLocale } from '@osm-editor-kit/maid-i18n'
import { actionChangeTags, type OsmEntity } from '@osm-editor-kit/maid-model'
import { notify, TagDiff, type InspectorSectionProps } from '@osm-editor-kit/maid-ui'
import { isIncompleteCategoryId, type CategoryGap } from '@tilda-geo/bicycle-infrastructure'
import {
  ATTRIBUTE_STATE_TEXTS,
  MAPPING_OPTION_LABELS,
  MAPPING_TARGET_GROUP_LABELS,
  applyCategoryPlan,
  attributeFeedsText,
  attributeLabel,
  attributeNote,
  groupMappingKinds,
  lifecycleForSide,
  mappingChoiceForCategory,
  mappingChoiceLabel,
  mappingKindLabel,
  mappingOptionRows,
  normalizeMappingChoice,
  reminderText,
  renderPlanConflict,
  renderPlanReason,
  type MappingChoice,
  type RequiredAttribute,
  type RequirementsProfile,
  type ResultSide,
} from '@tilda-geo/bicycle-infrastructure-tagging'
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  attributeDone,
  attributeRank,
  attributeSeverity,
  attributeUpdate,
  bothSidesKey,
  buildCards,
  confirmed,
  gapAnswerCategory,
  gapKey,
  gapUpdate,
  mergeSides,
  onewayChoices,
  onewayToMove,
  openChoices,
  type OnewayMeaning,
  openCount,
  reminderCheck,
  toTagChange,
  TRAFFIC_MODE_FOOT_CHECK,
  VERIFIED,
  type CheckOf,
  type SideCard,
  type Tags,
  type TagsUpdate,
  type TildaCheck,
} from './cards.ts'
import { checkIn, tildaChecksActions, useTildaChecks } from './checks-store.ts'
import { footwayNextTo } from './footway.ts'
import { m } from './messages.ts'
import {
  categoryName,
  normalizeWidthInput,
  packageLanguage,
  planTextOptions,
  tildaValueLabel,
} from './texts.ts'

/** Values as buttons up to this many; more go into a free input with suggestions */
const MAX_BUTTONS = 6
/** Mixed traffic checklist: a missing tag that gets a one-click answer (no cycleway on either side) */
const MIXED_TRAFFIC_QUICK_VALUES: Readonly<Record<string, string>> = { 'cycleway:both': 'no' }

const STATE_ICON: Record<RequiredAttribute['state'], string> = {
  ok: '✓',
  inherited: '✓',
  guess: '?',
  assumed: 'i',
  ignored: '✗',
  missing: '!',
}

const BUTTON =
  'rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 aria-pressed:border-blue-500 aria-pressed:bg-blue-50 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:aria-pressed:bg-blue-500/20'
const PRIMARY =
  'rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
const CHECK =
  'inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 disabled:opacity-50 aria-pressed:border-emerald-500 aria-pressed:bg-emerald-50 aria-pressed:text-emerald-800 dark:border-zinc-600 dark:hover:bg-zinc-700 dark:aria-pressed:bg-emerald-500/20 dark:aria-pressed:text-emerald-300'
const QUESTION =
  'flex flex-col gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm dark:border-amber-700 dark:bg-amber-950/40'
const MUTED = 'text-xs text-zinc-600 dark:text-zinc-400'
const STATE_TONE: Record<string, string> = {
  required: 'text-orange-600 dark:text-orange-400',
  optional: 'text-yellow-600 dark:text-yellow-400',
  done: 'text-emerald-600 dark:text-emerald-400',
  info: 'text-blue-600 dark:text-blue-400',
}

export type TildaSectionProps = InspectorSectionProps & { profile: RequirementsProfile }

/** The section; keyed by the way, so a newly selected way starts with nothing chosen */
export function TildaSection(props: TildaSectionProps) {
  return <TildaBox key={props.entity.id} {...props} />
}

function stateText(id: string) {
  return ATTRIBUTE_STATE_TEXTS[packageLanguage()][id] ?? id
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(getLocale())
}

/** The category with its state when it is not built (`im Bau`, `temporär`) */
function categoryWithLifecycle(tags: Tags, card: SideCard) {
  const lifecycle = lifecycleForSide({ ...tags }, card.side, card.result.category)
  const labels: Record<string, string> = MAPPING_OPTION_LABELS[packageLanguage()]
  const state = lifecycle ? labels[lifecycle] : undefined
  const name = categoryName(card.result.category)
  return state ? `${name}, ${state}` : name
}

function sideTitle(card: SideCard) {
  if (card.twin) return m.tilda_side_both()
  if (card.side === 'left') return m.tilda_side_left()
  if (card.side === 'right') return m.tilda_side_right()
  return m.tilda_side_self()
}

/** Keys whose value differs from the downloaded data */
function editedKeys(editor: Editor, id: string, tags: Tags) {
  const base = editor.history.base.graph.hasEntity(id)
  const baseTags: Tags = base?.tags ?? {}
  return new Set(Object.keys(tags).filter((key) => tags[key] !== baseTags[key]))
}

function TildaBox({ entity, editor, readOnly, onFieldFocus, profile }: TildaSectionProps) {
  const wayId = entity.id
  const tags = entity.tags
  const [choices, setChoices] = useState<ReadonlyMap<ResultSide, MappingChoice>>(new Map())
  const [editing, setEditing] = useState<ReadonlySet<ResultSide>>(new Set())
  const [selfExpanded, setSelfExpanded] = useState<boolean | undefined>(undefined)
  const [showIntro, setShowIntro] = useState(false)
  const [showDone, setShowDone] = useState<ReadonlySet<string>>(new Set())

  const checks = useTildaChecks()
  const checkOf: CheckOf = (check) => checkIn(checks, wayId, check)
  const graph = editor.history.staging.graph
  const current: OsmEntity | undefined = graph.hasEntity(wayId)
  const version = current?.version === undefined ? undefined : String(current.version)
  // a new way has no OSM id yet: a check would not find it again after the upload
  const isNew = wayId.startsWith('w-')
  const locked = readOnly?.(wayId) ?? entity.readOnly
  const checkDisabled = isNew ? m.tilda_disabled_new_way() : undefined

  // the footway next to a cycleway: walks the loaded ways, so only when the data or the tags change
  // the staging graph changes in place: its version says when the data changed
  const graphVersion = graph.v
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- graphVersion stands for the graph's content
  const footway = useMemo(() => footwayNextTo(graph, wayId), [graph, graphVersion, wayId])

  // choices that the tags reach now are done: the card shows the new category
  const open = openChoices(tags, choices)
  const list = buildCards(tags, {
    profile,
    choices: open,
    edited: editedKeys(editor, wayId, tags),
    ...(footway
      ? {
          footway: {
            side: footway.side,
            answered: checkOf(TRAFFIC_MODE_FOOT_CHECK) !== undefined,
          },
        }
      : {}),
  })
  const cards = mergeSides(list, checkOf, (card) => categoryWithLifecycle(tags, card), editing)

  /** One undo step for the way; refused on a read-only way */
  const change = (update: TagsUpdate) => {
    if (locked) {
      notify.failed(m.tilda_read_only())
      return
    }
    const latest = editor.history.staging.graph.hasEntity(wayId)
    if (!latest) return
    const { set, remove } = toTagChange(update)
    const next: Record<string, string> = { ...latest.tags, ...set }
    for (const key of remove) delete next[key]
    editor.history.perform(actionChangeTags(wayId, next))
    editor.history.commit({ annotation: m.tilda_annotation(), selectedIDs: [wayId] })
  }

  const toggleCheck = (check: string, answer: string) =>
    tildaChecksActions.toggle(wayId, check, answer, version)

  const showSide = (card: SideCard | undefined) => {
    if (!onFieldFocus) return
    if (card && !card.twin && (card.side === 'left' || card.side === 'right'))
      onFieldFocus({
        fieldId: 'tilda',
        key: `cycleway:${card.side}`,
        value: undefined,
        side: card.side,
      })
    else onFieldFocus(null)
  }

  const setChoice = (side: ResultSide, next: MappingChoice | undefined) => {
    const copy = new Map(choices)
    if (next) copy.set(side, normalizeMappingChoice(next, side))
    else copy.delete(side)
    setChoices(copy)
  }

  const toggleEditing = (card: SideCard) => {
    const copy = new Set(editing)
    if (copy.has(card.side) || card.choice) {
      copy.delete(card.side)
      setChoice(card.side, undefined)
    } else {
      copy.add(card.side)
      if (card.collapsible) setSelfExpanded(true)
    }
    setEditing(copy)
  }

  const toggleDone = (listId: string) => {
    const copy = new Set(showDone)
    if (copy.has(listId)) copy.delete(listId)
    else copy.add(listId)
    setShowDone(copy)
  }

  const verified = checkOf(VERIFIED)
  const changedSince =
    verified?.wayVersion !== undefined && version !== undefined && verified.wayVersion !== version

  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="tilda-section">
      <div className="flex justify-end">
        <button
          type="button"
          className="text-xs text-blue-700 hover:underline dark:text-blue-400"
          aria-expanded={showIntro}
          onClick={() => setShowIntro(!showIntro)}
        >
          {m.tilda_info()}
        </button>
      </div>
      {showIntro && (
        <div className="rounded-md bg-blue-50 p-2 text-xs dark:bg-blue-950/40">
          <p>{m.tilda_intro()}</p>
          <p className="mt-1">{m.tilda_checks_local()}</p>
        </div>
      )}
      {cards.map((card) => {
        const collapsed = card.collapsible && !(selfExpanded ?? !!card.choice)
        const count = openCount(card, checkOf)
        const isEditing = editing.has(card.side) || !!card.choice
        return (
          <div
            key={card.twin ? 'both' : card.side}
            data-tilda-card={card.twin ? 'both' : card.side}
            className="rounded-lg border border-zinc-950/10 dark:border-white/15"
            onPointerEnter={() => showSide(card)}
            onPointerLeave={() => showSide(undefined)}
          >
            <CardHeader
              card={card}
              tags={tags}
              collapsed={collapsed}
              count={count}
              isEditing={isEditing}
              onToggleCollapsed={() => card.collapsible && setSelfExpanded(collapsed)}
              onEdit={() => toggleEditing(card)}
            />
            {!collapsed && (
              <div className="flex flex-col gap-2 p-2">
                {card.footway && (
                  <FootwayQuestion
                    card={card}
                    stored={checkOf(TRAFFIC_MODE_FOOT_CHECK)}
                    disabled={checkDisabled}
                    onAnswer={(side) => change({ [`traffic_mode:${side}`]: 'foot' })}
                    onNo={() => toggleCheck(TRAFFIC_MODE_FOOT_CHECK, 'no')}
                  />
                )}
                {card.gaps.map((gap) => (
                  <GapQuestion
                    key={gap.key}
                    gap={gap}
                    card={card}
                    tags={tags}
                    onAnswer={(value) => change(gapUpdate(gap, card, value))}
                  />
                ))}
                {isEditing && (
                  <ChangeTo
                    card={card}
                    tags={tags}
                    onChoice={(next) => setChoice(card.side, next)}
                    onApply={change}
                  />
                )}
                <Checklist
                  attributes={card.attributes}
                  card={card}
                  tags={tags}
                  checkOf={checkOf}
                  header={
                    card.target && card.target !== card.result.category
                      ? m.tilda_required_for({ category: categoryName(card.target) })
                      : m.tilda_required()
                  }
                  showDone={showDone.has(`${card.side}-attributes`)}
                  onToggleDone={() => toggleDone(`${card.side}-attributes`)}
                  checkDisabled={checkDisabled}
                  onChange={change}
                  onCheck={toggleCheck}
                />
                <Checklist
                  attributes={card.roadAttributes}
                  card={card}
                  tags={tags}
                  checkOf={checkOf}
                  quickValues={MIXED_TRAFFIC_QUICK_VALUES}
                  showDone={showDone.has(`${card.side}-road`)}
                  onToggleDone={() => toggleDone(`${card.side}-road`)}
                  checkDisabled={checkDisabled}
                  onChange={change}
                  onCheck={toggleCheck}
                />
                {card.reminders.map((id) => (
                  <Reminder
                    key={id}
                    id={id}
                    stored={checkOf(reminderCheck(id))}
                    disabled={checkDisabled}
                    onCheck={() => toggleCheck(reminderCheck(id), '')}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={CHECK}
          aria-pressed={!!verified}
          disabled={checkDisabled !== undefined}
          title={
            checkDisabled ?? (verified ? m.tilda_unverify_tooltip() : m.tilda_verify_tooltip())
          }
          onClick={() => toggleCheck(VERIFIED, '')}
        >
          ✓ {m.tilda_verify()}
        </button>
        <span className={MUTED}>
          {verified
            ? m.tilda_verified_on({ date: formatDate(verified.at) }) +
              (changedSince ? ` (${m.tilda_changed_since()})` : '')
            : m.tilda_not_verified()}
        </span>
      </div>
    </div>
  )
}

function CardHeader({
  card,
  tags,
  collapsed,
  count,
  isEditing,
  onToggleCollapsed,
  onEdit,
}: {
  card: SideCard
  tags: Tags
  collapsed: boolean
  count: number
  isEditing: boolean
  onToggleCollapsed: () => void
  onEdit: () => void
}) {
  const category = card.result.category
  const choiceLabel = card.choice ? mappingChoiceLabel(card.choice, packageLanguage()) : undefined
  const tone =
    category === 'needsClarification' || isIncompleteCategoryId(category)
      ? 'text-amber-700 dark:text-amber-400'
      : card.result._infrastructureExists
        ? 'text-zinc-950 dark:text-white'
        : 'text-zinc-500 dark:text-zinc-400'
  return (
    <div className="flex flex-col gap-0.5 rounded-t-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-800/60">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="text-xs font-semibold tracking-wide text-zinc-600 uppercase disabled:cursor-default dark:text-zinc-400"
          disabled={!card.collapsible}
          aria-expanded={card.collapsible ? !collapsed : undefined}
          onClick={onToggleCollapsed}
        >
          {card.collapsible ? (collapsed ? '▸ ' : '▾ ') : ''}
          {sideTitle(card)}
        </button>
        {collapsed && <span className={MUTED}>{m.tilda_collapsed_hint()}</span>}
        <span className="ml-auto" />
        <span
          className={`text-xs font-medium ${count ? STATE_TONE.required : STATE_TONE.done}`}
          title={count ? undefined : m.tilda_nothing_open()}
          data-tilda-open={count}
        >
          {count ? m.tilda_open_count({ n: count }) : '✓'}
        </span>
        <button
          type="button"
          className={BUTTON}
          aria-pressed={isEditing}
          title={m.tilda_edit()}
          aria-label={m.tilda_edit()}
          onClick={onEdit}
        >
          ✎
        </button>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1">
        <span
          className={`font-medium ${tone}`}
          title={
            category
              ? `${categoryName(category)}\n${m.tilda_category_id({ id: category })}`
              : undefined
          }
        >
          {category ? categoryWithLifecycle(tags, card) : m.tilda_mixed_traffic()}
        </span>
        {choiceLabel && (
          <span className="text-blue-700 dark:text-blue-400" title={choiceLabel}>
            → {choiceLabel}
          </span>
        )}
      </div>
    </div>
  )
}

/** The open question about the footway next to the cycleway: it makes the category, so it sits first */
function FootwayQuestion({
  card,
  stored,
  disabled,
  onAnswer,
  onNo,
}: {
  card: SideCard
  stored: TildaCheck | undefined
  disabled: string | undefined
  onAnswer: (side: 'left' | 'right') => void
  onNo: () => void
}) {
  const question = card.footway
  if (!question) return null
  const noButton = (
    <button
      type="button"
      className={CHECK}
      aria-pressed={!!stored}
      disabled={disabled !== undefined}
      title={disabled ?? (stored ? m.tilda_uncheck_tooltip() : m.tilda_foot_no_tooltip())}
      onClick={onNo}
    >
      {m.tilda_foot_no()}
    </button>
  )
  if (question.answered && stored)
    return (
      <div className={`flex flex-wrap items-center gap-2 ${MUTED}`}>
        {noButton}
        <span>{m.tilda_checked_on({ date: formatDate(stored.at) })}</span>
      </div>
    )
  const sideText =
    question.side === 'left'
      ? m.tilda_foot_side_left()
      : question.side === 'right'
        ? m.tilda_foot_side_right()
        : m.tilda_foot_side_unknown()
  const sides: ('left' | 'right')[] =
    question.side === 'left' ? ['left', 'right'] : ['right', 'left']
  return (
    <div className={QUESTION} data-tilda-question="footway">
      <div className="font-medium">{m.tilda_foot_title()}</div>
      <div className="text-xs">{m.tilda_foot_text({ side: sideText })}</div>
      <div className="flex flex-wrap gap-1">
        {sides.map((side) => (
          <button
            key={side}
            type="button"
            className={BUTTON}
            title={
              side === 'left'
                ? `traffic_mode:left=foot\n${m.tilda_foot_left_hint()}`
                : 'traffic_mode:right=foot'
            }
            onClick={() => onAnswer(side)}
          >
            {side === 'left' ? m.tilda_foot_left() : m.tilda_foot_right()}
          </button>
        ))}
        {noButton}
      </div>
      {question.side === 'left' && <div className={MUTED}>{m.tilda_foot_left_hint()}</div>}
    </div>
  )
}

/** The open question that makes an incomplete category exact: one button per answer, named by its category */
function GapQuestion({
  gap,
  card,
  tags,
  onAnswer,
}: {
  gap: CategoryGap
  card: SideCard
  tags: Tags
  onAnswer: (value: string) => void
}) {
  const labels = gap.values.map((value) => {
    const category = gapAnswerCategory(tags, gap, card, value)
    return category ? categoryName(category) : value
  })
  // a start all answers share (`Getrennter Rad- und Gehweg, `) is left out
  const first = labels[0] ?? ''
  const cut = first.lastIndexOf(', ') + 2
  const shared =
    cut > 1 && labels.length > 1 && labels.every((label) => label.startsWith(first.slice(0, cut)))
  const key = gapKey(gap, card)
  return (
    <div
      className={QUESTION}
      data-tilda-question="gap"
      // the package adds a note about its internal key names; not useful here
      title={gap.reason.replace(/\s*\(transformed from [^)]*\)/, '')}
    >
      <div className="font-medium">{m.tilda_gap_title()}</div>
      <div className="flex flex-wrap gap-1">
        {gap.values.map((value, i) => (
          <button
            key={value}
            type="button"
            className={BUTTON}
            title={`${key}=${value}`}
            onClick={() => onAnswer(value)}
          >
            {shared ? (labels[i] ?? value).slice(cut) : (labels[i] ?? value)}
          </button>
        ))}
      </div>
      <div className={MUTED}>{m.tilda_gap_key({ key })}</div>
    </div>
  )
}

/** "Change to": the kind of infrastructure, its options as buttons, and the tags that reach it */
function ChangeTo({
  card,
  tags,
  onChoice,
  onApply,
}: {
  card: SideCard
  tags: Tags
  onChoice: (choice: MappingChoice | undefined) => void
  onApply: (update: TagsUpdate) => void
}) {
  const lang = packageLanguage()
  const choice = card.choice && normalizeMappingChoice(card.choice, card.side)
  const currentKind = mappingChoiceForCategory(card.result.category)?.kind
  const rows = choice ? mappingOptionRows(choice, card.side, lang) : []
  const plan = card.plan
  const textOptions = planTextOptions()
  const after = plan ? applyCategoryPlan({ ...tags }, plan) : undefined
  const afterTags: Record<string, string> = {}
  if (after)
    for (const [key, value] of Object.entries(after))
      if (value !== undefined) afterTags[key] = value
  const changes = plan
    ? [
        ...plan.remove.map((key) => ({ key, reason: m.tilda_remove_reason() })),
        ...plan.add
          .filter((entry) => tags[entry.key] !== entry.value)
          .map((entry) => ({ key: entry.key, reason: renderPlanReason(entry, lang, textOptions) })),
        ...plan.change.map((entry) => ({
          key: entry.key,
          reason: renderPlanReason(entry, lang, textOptions),
        })),
      ]
    : []
  const update: TagsUpdate = {}
  for (const key of new Set([...Object.keys(tags), ...Object.keys(afterTags)]))
    if (tags[key] !== afterTags[key]) update[key] = afterTags[key]
  const canApply = !!plan && plan.aligned && Object.keys(update).length > 0

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-blue-200 p-2 dark:border-blue-900">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold">{m.tilda_target()}</span>
        <select
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={choice?.kind ?? ''}
          onChange={(event) => {
            const kind = event.currentTarget.value
            // the options that are still possible stay
            onChoice(kind ? { kind, sign: choice?.sign, lifecycle: choice?.lifecycle } : undefined)
          }}
        >
          <option value="">{m.tilda_choose_kind()}</option>
          {groupMappingKinds().map((group) => (
            <optgroup key={group.id} label={MAPPING_TARGET_GROUP_LABELS[lang][group.id]}>
              {group.kinds.map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {mappingKindLabel(kind.id, lang)}
                  {kind.id === currentKind ? ` (${m.tilda_current()})` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {choice &&
        rows.map((row) => (
          <div
            key={row.axis}
            role="group"
            aria-label={row.label}
            className="flex flex-wrap items-center gap-1"
          >
            <span className={`${MUTED} w-full`}>{row.label}</span>
            {row.values.map((value) => (
              <button
                key={value.value ?? ''}
                type="button"
                className={BUTTON}
                aria-pressed={value.value === row.current}
                onClick={() => onChoice({ ...choice, [row.axis]: value.value })}
              >
                {value.label}
              </button>
            ))}
          </div>
        ))}
      {plan && (
        <>
          {after && Object.keys(update).length > 0 && (
            <div title={changes.map((entry) => `${entry.key}: ${entry.reason}`).join('\n')}>
              <TagDiff before={tags} after={afterTags} />
            </div>
          )}
          {plan.conflicts.map((conflict) => (
            <div
              key={conflict.key}
              className="rounded-md bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300"
            >
              {renderPlanConflict(conflict, lang, textOptions)}
            </div>
          ))}
          {canApply && (
            <button
              type="button"
              className={`${PRIMARY} self-start`}
              onClick={() => onApply(update)}
            >
              {m.tilda_apply_all()}
            </button>
          )}
        </>
      )}
    </div>
  )
}

/**
 * The checklist of tags the dataset needs: open rows first (what TILDA cannot use or misses, then guesses, then
 * defaults to confirm); rows in order fold into one line. A missing tag gets the values TILDA accepts as buttons, a
 * free input when there are none or too many.
 */
function Checklist({
  attributes,
  card,
  tags,
  checkOf,
  header,
  quickValues = {},
  showDone,
  onToggleDone,
  checkDisabled,
  onChange,
  onCheck,
}: {
  attributes: RequiredAttribute[]
  card: SideCard
  tags: Tags
  checkOf: CheckOf
  header?: string
  quickValues?: Readonly<Record<string, string>>
  showDone: boolean
  onToggleDone: () => void
  checkDisabled: string | undefined
  onChange: (update: TagsUpdate) => void
  onCheck: (check: string, answer: string) => void
}) {
  if (attributes.length === 0) return null
  const open = attributes
    .filter((attribute) => !attributeDone(attribute, checkOf))
    .sort((a, b) => attributeRank(a) - attributeRank(b))
  const done = attributes.filter((attribute) => attributeDone(attribute, checkOf))
  const rows = showDone ? [...open, ...done] : open
  return (
    <div className="flex flex-col gap-1">
      {header && <div className="text-xs font-semibold">{header}</div>}
      {rows.map((attribute) => (
        <AttributeRow
          key={`${attribute.id}-${attribute.key}`}
          attribute={attribute}
          twin={card.twins?.get(attribute)}
          side={card.side}
          tags={tags}
          checkOf={checkOf}
          quickValue={quickValues[attribute.key]}
          checkDisabled={checkDisabled}
          onChange={onChange}
          onCheck={onCheck}
        />
      ))}
      {done.length > 0 && (
        <button
          type="button"
          className="self-start text-xs text-zinc-600 hover:underline dark:text-zinc-400"
          aria-expanded={showDone}
          onClick={onToggleDone}
        >
          {showDone ? m.tilda_done_hide() : m.tilda_done_rows({ n: done.length })}
        </button>
      )}
    </div>
  )
}

function AttributeRow({
  attribute,
  twin,
  side,
  tags,
  checkOf,
  quickValue,
  checkDisabled,
  onChange,
  onCheck,
}: {
  attribute: RequiredAttribute
  twin: RequiredAttribute | undefined
  side: ResultSide
  tags: Tags
  checkOf: CheckOf
  quickValue: string | undefined
  checkDisabled: string | undefined
  onChange: (update: TagsUpdate) => void
  onCheck: (check: string, answer: string) => void
}) {
  const lang = packageLanguage()
  const check = confirmed(attribute, checkOf)
  const severity = attributeSeverity(attribute)
  const isDone = attributeDone(attribute, checkOf)
  const moved = onewayToMove(attribute)
  const tone = check || isDone ? STATE_TONE.done : severity ? STATE_TONE[severity] : STATE_TONE.info
  const tagged = [...attribute.tagged, ...(twin?.tagged ?? [])]
    .map((tag) => `${tag.key}=${tag.value}`)
    .filter((tag, i, all) => all.indexOf(tag) === i)
  const bothKey = twin ? bothSidesKey(attribute.key, twin.key) : undefined
  const note = attributeNote(
    { ...attribute, tilda: tildaValueLabel(attribute.id, attribute.tilda) },
    lang,
  )
  const needsInputs = attribute.state !== 'ok' && attribute.state !== 'inherited'
  const quick = attribute.state === 'missing' ? quickValue : undefined
  // oneway: only the values that make sense here, each with what it means
  const oneway = moved || quick || !needsInputs ? undefined : onewayChoices(attribute, side)
  const buttons: string[] = moved
    ? [moved]
    : quick
      ? [quick]
      : oneway
        ? []
        : needsInputs
          ? attribute.options.slice(0, MAX_BUTTONS)
          : []
  const freeInput =
    needsInputs &&
    attribute.state !== 'assumed' &&
    !moved &&
    !quick &&
    (attribute.options.length === 0 || attribute.options.length > MAX_BUTTONS)
  const write = (value: string) => onChange(attributeUpdate(tags, attribute, value, twin))
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value.trim()
    if (event.key !== 'Enter' || !value) return
    event.preventDefault()
    write(normalizeWidthInput(attribute.key, value))
    event.currentTarget.value = ''
  }
  const listId = `tilda-options-${attribute.key.replace(/[^\w-]/g, '_')}`

  return (
    <div
      className="flex gap-2 rounded-md px-1 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
      data-tilda-attribute={attribute.key}
      data-tilda-state={check ? 'checked' : attribute.state}
      title={attributeFeedsText(attribute, lang)}
    >
      <span className={`w-3 shrink-0 text-center font-bold ${tone}`} aria-hidden="true">
        {check ? STATE_ICON.ok : STATE_ICON[attribute.state]}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span>
          <span className="font-medium">{attributeLabel(attribute.id, lang)}</span>
          {tagged.length === 0 && attribute.state !== 'inherited' && (
            <span className={tone}>
              {' '}
              {stateText(attribute.state === 'assumed' ? 'not_tagged' : 'missing')}
            </span>
          )}
        </span>
        <span className="flex flex-wrap gap-1 font-mono text-xs break-all">
          {tagged.length > 0 ? (
            tagged.map((tag) => <code key={tag}>{tag}</code>)
          ) : (
            <code>{bothKey ?? attribute.key}</code>
          )}
        </span>
        {(note || check) && (
          <span className={MUTED}>
            {check ? `${m.tilda_checked_on({ date: formatDate(check.at) })}. ` : ''}
            {note}
          </span>
        )}
        {(buttons.length > 0 || oneway || freeInput || attribute.state === 'assumed') && (
          <span className="flex flex-wrap items-center gap-1">
            {attribute.state === 'assumed' && (
              <button
                type="button"
                className={CHECK}
                aria-pressed={!!check}
                disabled={checkDisabled !== undefined}
                title={
                  checkDisabled ?? (check ? m.tilda_uncheck_tooltip() : m.tilda_check_tooltip())
                }
                onClick={() => {
                  if (attribute.default) onCheck(attribute.key, attribute.default)
                  if (twin?.default && !!confirmed(twin, checkOf) === !!check)
                    onCheck(twin.key, twin.default)
                }}
              >
                ✓ {m.tilda_check()}
              </button>
            )}
            {oneway?.map((choice) => (
              <OnewayButton
                key={choice.value}
                value={choice.value}
                meaning={choice.meaning}
                // the left side alone: the right side keeps its default
                onClick={() =>
                  onChange(
                    attributeUpdate(
                      tags,
                      attribute,
                      choice.value,
                      choice.meaning === 'left_with_line' ? undefined : twin,
                    ),
                  )
                }
              />
            ))}
            {buttons.map((value) => (
              <ValueButton
                key={value}
                value={value}
                moved={moved === value ? attribute.key : undefined}
                onClick={() => write(value)}
              />
            ))}
            {freeInput && (
              <>
                <input
                  type="text"
                  className="w-32 rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs dark:border-zinc-600 dark:bg-zinc-900"
                  placeholder={m.tilda_enter_value()}
                  aria-label={attributeLabel(attribute.id, lang)}
                  list={attribute.options.length ? listId : undefined}
                  onKeyDown={onKey}
                />
                {attribute.options.length > 0 && (
                  <datalist id={listId}>
                    {attribute.options.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                )}
              </>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

const ONEWAY_TEXTS: Record<OnewayMeaning, { label: () => string; tooltip: () => string }> = {
  with_line: { label: m.tilda_oneway_with_line, tooltip: m.tilda_oneway_with_line_tooltip },
  both: { label: m.tilda_oneway_both, tooltip: m.tilda_oneway_both_tooltip },
  left_with_line: {
    label: m.tilda_oneway_left_with_line,
    tooltip: m.tilda_oneway_left_with_line_tooltip,
  },
}

/** A oneway value with what it means here: the value, and the meaning in words */
function OnewayButton({
  value,
  meaning,
  onClick,
}: {
  value: string
  meaning: OnewayMeaning
  onClick: () => void
}) {
  const texts = ONEWAY_TEXTS[meaning]
  return (
    <button type="button" className={BUTTON} title={texts.tooltip()} onClick={onClick}>
      <code>{value}</code> · {texts.label()}
    </button>
  )
}

function ValueButton({
  value,
  moved,
  onClick,
}: {
  value: string
  /** The key `oneway` moves to, when this button moves it */
  moved: string | undefined
  onClick: () => void
}): ReactNode {
  const tag = moved ? `${moved}=${value}` : undefined
  return (
    <button
      type="button"
      className={BUTTON}
      title={tag ? m.tilda_move_oneway_tooltip({ tag, old: `oneway=${value}` }) : undefined}
      onClick={onClick}
    >
      {tag ? m.tilda_move_oneway({ tag }) : value}
    </button>
  )
}

/** A hint without a tag to check: look for it; "Checked" says someone looked */
function Reminder({
  id,
  stored,
  disabled,
  onCheck,
}: {
  id: string
  stored: TildaCheck | undefined
  disabled: string | undefined
  onCheck: () => void
}) {
  const text = reminderText(id, packageLanguage())
  return (
    <div className="flex gap-2 px-1 py-1" data-tilda-reminder={id}>
      <span
        className={`w-3 shrink-0 text-center font-bold ${stored ? STATE_TONE.done : STATE_TONE.info}`}
        aria-hidden="true"
      >
        {stored ? STATE_ICON.ok : STATE_ICON.assumed}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{text?.title ?? id}</span>
        <span className={MUTED}>
          {stored ? m.tilda_checked_on({ date: formatDate(stored.at) }) : (text?.text ?? '')}
        </span>
        <span>
          <button
            type="button"
            className={CHECK}
            aria-pressed={!!stored}
            disabled={disabled !== undefined}
            title={disabled ?? (stored ? m.tilda_uncheck_tooltip() : m.tilda_reminder_tooltip())}
            onClick={onCheck}
          >
            ✓ {m.tilda_check()}
          </button>
        </span>
      </div>
    </div>
  )
}
