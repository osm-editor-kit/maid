import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  NoSymbolIcon,
  ArrowsUpDownIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from '@heroicons/react/16/solid'
import { getLocale, m } from '@osm-editor-kit/maid-i18n'
import { actionDeleteMember, type OsmRelation } from '@osm-editor-kit/maid-model'
import {
  analyzeRoute,
  layoutOverview,
  type IssueCode,
  type Linear,
  type OverviewLayout,
  type OverviewMode,
  type OverviewRow,
  type RouteAnalysis,
  type RouteInput,
  type RouteIssue,
} from '@osm-editor-kit/maid-route-analysis'
import {
  Fragment,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { useSelection } from '../../selection'
import { useShell } from '../../shell-context'
import { useRelatedWhileHovered } from '../relations-hover.ts'
import { colourOf } from '../relations-logic.ts'
import { dataVersion } from './data-version.ts'
import {
  formatKm,
  groupOf,
  idsOf,
  includesHovered,
  issueParams,
  memberName,
  ROW_LIMIT,
  rowLabel,
  rowRole,
  sectionHovered,
  selectableId,
  splitRows,
  type RowLabel,
  type UnplacedGroup,
} from './overview-logic.ts'
import { markSelectedFromOverview } from './overview-selection.ts'
import { routeInputOf } from './route-input.ts'

type Select = ReturnType<typeof useSelection>['select']

const ROW_HEIGHT = 28
const KM_WIDTH = 44
const LANE_STEP = 14
const MAIN_X = 14
const NEUTRAL = '#7c3aed'
const RED = '#dc2626'
const ROW_HOVER = 'bg-amber-100/60 dark:bg-amber-500/10'
const ROW_PLAIN =
  'rounded-lg hover:bg-amber-100/60 focus-within:bg-amber-100/60 dark:hover:bg-amber-500/10 dark:focus-within:bg-amber-500/10'
const ICON_BUTTON =
  'grid size-6 shrink-0 cursor-pointer place-items-center rounded-md hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/10'
const TOGGLE =
  'cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-blue-500'

const STATE_TEXT: Record<Linear, () => string> = {
  yes: () => m.route_overview_state_yes(),
  sorted: () => m.route_overview_state_sorted(),
  no: () => m.route_overview_state_no(),
  empty: () => m.route_overview_state_empty(),
}

type Texts = { title: string; text: string; todo: string }
/** The three texts of an issue, with its numbers */
function issueTexts(issue: RouteIssue): Texts {
  const p = issueParams(issue)
  const t = (code: IssueCode): Texts => {
    switch (code) {
      case 'gap':
        return {
          title: m.route_overview_issue_gap_title(),
          text: m.route_overview_issue_gap_text({ distance: p.distance }),
          todo: m.route_overview_issue_gap_todo(),
        }
      case 'order':
        return {
          title: m.route_overview_issue_order_title(),
          text: m.route_overview_issue_order_text({ moved: p.moved }),
          todo: m.route_overview_issue_order_todo(),
        }
      case 'not-loaded':
        return {
          title: m.route_overview_issue_not_loaded_title(),
          text: m.route_overview_issue_not_loaded_text({ count: p.count }),
          todo: m.route_overview_issue_not_loaded_todo(),
        }
      case 'point-far':
        return {
          title: m.route_overview_issue_point_far_title(),
          text: m.route_overview_issue_point_far_text({ distance: p.distance }),
          todo: m.route_overview_issue_point_far_todo(),
        }
      case 'out-of-sequence':
        return {
          title: m.route_overview_issue_out_of_sequence_title(),
          text: m.route_overview_issue_out_of_sequence_text(),
          todo: m.route_overview_issue_out_of_sequence_todo(),
        }
      case 'junction-without-guidepost':
        return {
          title: m.route_overview_issue_junction_without_guidepost_title(),
          text: m.route_overview_issue_junction_without_guidepost_text({ ways: p.ways }),
          todo: m.route_overview_issue_junction_without_guidepost_todo(),
        }
      case 'no-guideposts':
        return {
          title: m.route_overview_issue_no_guideposts_title(),
          text: m.route_overview_issue_no_guideposts_text(),
          todo: m.route_overview_issue_no_guideposts_todo(),
        }
      case 'unknown-role':
        return {
          title: m.route_overview_issue_unknown_role_title(),
          text: m.route_overview_issue_unknown_role_text({ role: p.role }),
          todo: m.route_overview_issue_unknown_role_todo(),
        }
      case 'branch-detached':
        return {
          title: m.route_overview_issue_branch_detached_title(),
          text: m.route_overview_issue_branch_detached_text(),
          todo: m.route_overview_issue_branch_detached_todo(),
        }
      case 'duplicate':
        return {
          title: m.route_overview_issue_duplicate_title(),
          text: m.route_overview_issue_duplicate_text(),
          todo: m.route_overview_issue_duplicate_todo(),
        }
      case 'empty':
        return {
          title: m.route_overview_issue_empty_title(),
          text: m.route_overview_issue_empty_text(),
          todo: m.route_overview_issue_empty_todo(),
        }
    }
  }
  return t(issue.code)
}

const GROUP_TEXT: Record<UnplacedGroup, (count: number) => string> = {
  unloaded: (count) => m.route_overview_group_unloaded({ count }),
  subroute: (count) => m.route_overview_group_subroute({ count }),
  other: (count) => m.route_overview_group_other({ count }),
  points: (count) => m.route_overview_group_points({ count }),
  detached: (count) => m.route_overview_group_detached({ count }),
  main: (count) => m.route_overview_group_main({ count }),
}

function labelText(label: RowLabel): string {
  if ('name' in label) return label.name
  if ('junction' in label) return m.route_overview_label_junction({ ways: label.junction })
  if ('gap' in label)
    return m.route_overview_label_gap({ distance: m.route_overview_metres({ count: label.gap }) })
  if ('way' in label) return m.route_overview_label_way({ id: label.way })
  if ('relation' in label) return m.route_overview_label_relation({ id: label.relation })
  if ('group' in label) return GROUP_TEXT[label.group](label.count)
  if ('empty' in label) return m.route_overview_state_empty()
  switch (label.text) {
    case 'start':
      return m.route_overview_label_start()
    case 'end':
      return m.route_overview_label_end()
    case 'stop':
      return m.route_overview_label_stop()
    case 'platform':
      return m.route_overview_label_platform()
    case 'guidepost':
      return m.route_overview_label_guidepost()
    case 'milestone':
      return m.route_overview_label_milestone()
    case 'information':
      return m.route_overview_label_information()
    case 'station':
      return m.route_overview_label_station()
    case 'branch_start':
      return m.route_overview_label_branch_start()
    case 'branch_end':
      return m.route_overview_label_branch_end()
    case 'point':
      return m.route_overview_label_point()
  }
}

const STATE_ICON: Record<Linear, ReactNode> = {
  yes: <CheckCircleIcon className="size-4 text-emerald-600 dark:text-emerald-400" />,
  sorted: <ArrowsUpDownIcon className="size-4 text-amber-600 dark:text-amber-400" />,
  no: <ExclamationTriangleIcon className="size-4 text-amber-600 dark:text-amber-400" />,
  empty: <NoSymbolIcon className="size-4 text-zinc-400" />,
}

// The analysis of the relation as it is now, and its layout per spacing. The graph is mutable and keeps its identity,
// so the cache is keyed on the relation object and the data version (edits and arriving data, not selection or hover).
type Cached = {
  version: number
  input: RouteInput
  analysis: RouteAnalysis
  layouts: Partial<Record<OverviewMode, OverviewLayout>>
}
const analyses = new WeakMap<OsmRelation, Cached>()

// Open or folded, for the whole session: a person who folds it away to work on the members keeps it folded
let overviewOpen = true

/**
 * The route as a vertical line diagram (like the line sidebars of Wikipedia): the km column, the line with its stops
 * and points, side lines as lanes beside it, and the members the line cannot place in groups at the bottom.
 * The diagram draws the first 300 rows and a "Show all (N)" button (like the member groups of the column), because a
 * scroll listener would have to find the scrolling ancestor; the groups at the bottom are always there.
 */
export function RouteOverview({ relation, select }: { relation: OsmRelation; select: Select }) {
  'use no memo'
  // not compiled: it reads the graph and the engine, objects that stay the same when data arrives
  const { engine, editor } = useShell()
  const graph = editor.history.staging.graph
  const version = dataVersion(editor.history)
  let cached = analyses.get(relation)
  if (!cached || cached.version !== version) {
    const input = routeInputOf(graph, relation)
    cached = { version, input, analysis: analyzeRoute(input), layouts: {} }
    analyses.set(relation, cached)
  }
  const { analysis, input } = cached
  const [expanded, setExpanded] = useState(overviewOpen)
  const [mode, setMode] = useState<OverviewMode>('schematic')
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const layout = (cached.layouts[mode] ??= layoutOverview(analysis, mode))
  const readOnly = engine.isReadOnly(relation.id)
  const colour = colourOf(relation) ?? NEUTRAL

  const { placed, shown, unplaced } = splitRows(layout.rows, showAll ? Infinity : ROW_LIMIT)
  const cut = shown.length < placed.length
  const lastShown = shown[shown.length - 1]
  const diagramHeight = lastShown ? lastShown.y + ROW_HEIGHT : 0
  const maxLane = layout.rows.reduce((top, row) => Math.max(top, row.lane), 0)
  const gutter = 40 + LANE_STEP * maxLane
  const left = KM_WIDTH + gutter
  const laneX = (lane: number) => MAIN_X + LANE_STEP * lane

  // the column keeps its scroll for a selection made here (overview-selection.ts)
  function selectId(id: string) {
    markSelectedFromOverview(id)
    select(id)
  }
  function toggle() {
    overviewOpen = !expanded
    setExpanded(!expanded)
  }
  function removeDuplicate(issue: RouteIssue) {
    const index = issue.members[1]
    if (index !== undefined) editor.history.perform(actionDeleteMember(relation.id, index))
    setOpen(null)
  }

  const popover = (row: OverviewRow, flow: boolean) => {
    const issue = row.issues
      .map((i) => ({ i, issue: analysis.issues[i] }))
      .find((x) => `${row.key}#${x.i}` === open)?.issue
    if (!issue) return null
    return (
      <IssuePopover
        issue={issue}
        flow={flow}
        top={row.y + ROW_HEIGHT}
        canRemove={issue.code === 'duplicate' && issue.members.length > 1 && !readOnly}
        onSelect={() => {
          const first = issue.members[0]
          const id = first === undefined ? undefined : analysis.members[first]?.member.id
          selectId(id && graph.hasEntity(id) ? id : relation.id)
          setOpen(null)
        }}
        onRemove={() => removeDuplicate(issue)}
        onClose={() => setOpen(null)}
      />
    )
  }

  return (
    <section aria-label={m.route_overview_title()} className="px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-2 text-xs">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={toggle}
          className="-ml-1 flex cursor-pointer items-center gap-1 rounded text-[11px] font-semibold tracking-wide text-zinc-700 uppercase focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-300"
        >
          <ChevronDownIcon
            aria-hidden="true"
            className={`size-4 text-zinc-400 transition-transform motion-reduce:transition-none ${expanded ? '' : '-rotate-90'}`}
          />
          {m.route_overview_title()}
        </button>
        <span className="flex items-center gap-1 font-medium" data-testid="route-overview-state">
          <span aria-hidden="true">{STATE_ICON[analysis.chain.linear]}</span>
          {STATE_TEXT[analysis.chain.linear]()}
        </span>
        <span className="text-zinc-500 tabular-nums dark:text-zinc-400">
          {m.route_overview_km({ km: formatKm(analysis.chain.length, getLocale()) })}
        </span>
        {expanded ? (
          <span
            role="group"
            aria-label={m.route_overview_mode_label()}
            className="ml-auto flex rounded-lg bg-zinc-950/5 p-0.5 dark:bg-white/10"
          >
            {(['schematic', 'scaled'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={`${TOGGLE} ${mode === value ? 'bg-white shadow-sm dark:bg-zinc-700' : 'text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'}`}
              >
                {value === 'schematic'
                  ? m.route_overview_mode_schematic()
                  : m.route_overview_mode_scaled()}
              </button>
            ))}
          </span>
        ) : null}
      </div>

      {expanded ? (
        <>
          {/* a long route scrolls inside the overview, so the members below stay within reach */}
          <div className="relative max-h-[60vh] overflow-y-auto">
            <div
              role="list"
              aria-label={m.route_overview_list()}
              className="relative"
              style={{ height: diagramHeight }}
            >
              <svg
                aria-hidden="true"
                width={gutter}
                height={diagramHeight}
                className="pointer-events-none absolute top-0"
                style={{ left: KM_WIDTH }}
              >
                <Diagram
                  layout={layout}
                  shown={shown}
                  analysis={analysis}
                  colour={colour}
                  laneX={laneX}
                  limitY={diagramHeight}
                />
              </svg>
              {shown.map((row) => (
                <Row
                  key={row.key}
                  row={row}
                  analysis={analysis}
                  input={input}
                  left={left}
                  select={selectId}
                  open={open}
                  setOpen={setOpen}
                />
              ))}
            </div>
            {/* the notes sit beside the list, not in it: a list holds only its rows */}
            {open
              ? shown.map((row) =>
                  row.issues.length > 0 ? (
                    <Fragment key={row.key}>{popover(row, false)}</Fragment>
                  ) : null,
                )
              : null}
          </div>
          {cut ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-1 cursor-pointer rounded text-xs font-medium text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-400"
            >
              {m.route_overview_show_all({ count: placed.length })}
            </button>
          ) : null}

          {unplaced.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-0.5">
              {unplaced.map((row) => {
                const group = groupOf(row)
                const label = labelText(rowLabel(analysis, row, input.memberTags))
                const expanded = openGroup === row.key
                return (
                  <li key={row.key} data-group-key={row.key}>
                    <div
                      className={`flex items-center gap-1 px-1 ${ROW_PLAIN}`}
                      style={{ minHeight: ROW_HEIGHT }}
                    >
                      {row.members.length > 0 ? (
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={(expanded
                            ? m.route_overview_group_close
                            : m.route_overview_group_open)({ group: label })}
                          onClick={() => setOpenGroup(expanded ? null : row.key)}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded py-1 text-left text-sm focus-visible:outline-2 focus-visible:outline-blue-500"
                        >
                          <ChevronRightIcon
                            aria-hidden="true"
                            className={`size-4 shrink-0 text-zinc-400 ${expanded ? 'rotate-90' : ''}`}
                          />
                          <span className="truncate">{label}</span>
                        </button>
                      ) : (
                        <span className="flex-1 truncate py-1 pl-5 text-sm">{label}</span>
                      )}
                      <IssueButtons
                        row={row}
                        analysis={analysis}
                        label={label}
                        open={open}
                        setOpen={setOpen}
                      />
                    </div>
                    {popover(row, true)}
                    {expanded && group !== undefined ? (
                      <ul className="mb-1 ml-5 flex flex-col">
                        {row.members.map((index) => {
                          const info = analysis.members[index]
                          if (!info) return null
                          const name = labelText(memberName(analysis, index, input.memberTags))
                          return (
                            <li key={index}>
                              <MemberButton
                                ids={[info.member.id]}
                                name={name}
                                role={info.member.role}
                                disabled={!graph.hasEntity(info.member.id)}
                                onClick={() => selectId(info.member.id)}
                              />
                            </li>
                          )
                        })}
                      </ul>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

/** The small button of a member in an expanded group: hovers the member on the map, selects it on click */
function MemberButton({
  ids,
  name,
  role,
  disabled,
  onClick,
}: {
  ids: string[]
  name: string
  role: string
  disabled: boolean
  onClick: () => void
}) {
  const hover = useRelatedWhileHovered(() => ids)
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={m.route_overview_select_row({ name })}
      onClick={onClick}
      {...hover}
      className={`flex w-full cursor-pointer items-baseline gap-2 py-1 pr-1 pl-2 text-left text-sm disabled:cursor-default disabled:opacity-60 ${ROW_PLAIN} focus-visible:outline-2 focus-visible:outline-blue-500`}
    >
      <span className="min-w-0 truncate">{name}</span>
      {role ? (
        <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">{role}</span>
      ) : null}
    </button>
  )
}

/** The (i) buttons of a row, amber for a warning and zinc for an info */
function IssueButtons({
  row,
  analysis,
  label,
  open,
  setOpen,
}: {
  row: OverviewRow
  analysis: RouteAnalysis
  label: string
  open: string | null
  setOpen: (key: string | null) => void
}) {
  return (
    <>
      {row.issues.map((i) => {
        const issue = analysis.issues[i]
        if (!issue) return null
        const key = `${row.key}#${i}`
        return (
          <button
            key={key}
            type="button"
            data-issue-button
            aria-label={m.route_overview_issue_button({
              name: `${label}: ${issue.severity === 'warning' ? m.route_overview_severity_warning() : m.route_overview_severity_info()}, ${issueTexts(issue).title}`,
            })}
            aria-expanded={open === key}
            onClick={() => setOpen(open === key ? null : key)}
            className={`${ICON_BUTTON} ${issue.severity === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400 dark:text-zinc-500'}`}
          >
            <InformationCircleIcon aria-hidden="true" className="size-4" />
          </button>
        )
      })}
    </>
  )
}

/** One row of the diagram, at its `y` */
function Row({
  row,
  analysis,
  input,
  left,
  select,
  open,
  setOpen,
}: {
  row: OverviewRow
  analysis: RouteAnalysis
  input: RouteInput
  left: number
  select: (id: string) => void
  open: string | null
  setOpen: (key: string | null) => void
}) {
  const { engine } = useShell()
  const ids = idsOf(analysis, row.members)
  const related = useRelatedWhileHovered(() => ids)
  // lit while the pointer or the focus is on the row itself (a row of several members lights them as `related`,
  // which the hover target does not show), or while one of its members is hovered on the map
  const [self, setSelf] = useState(false)
  const fromMap = useSyncExternalStore(engine.subscribeHover, () =>
    includesHovered(ids, engine.hoverTarget()),
  )
  const hover = {
    onPointerEnter: () => {
      setSelf(true)
      related.onPointerEnter()
    },
    onPointerLeave: () => {
      setSelf(false)
      related.onPointerLeave()
    },
    onFocus: () => {
      setSelf(true)
      related.onFocus()
    },
    onBlur: () => {
      setSelf(false)
      related.onBlur()
    },
  }
  const label = labelText(rowLabel(analysis, row, input.memberTags))
  const role = rowRole(analysis, row)
  const target = selectableId(analysis, row)
  const lit = self || fromMap
  const km = row.at === undefined ? '' : formatKm(row.at, getLocale())
  return (
    <div
      role="listitem"
      data-row-key={row.key}
      data-lit={lit || undefined}
      className={`absolute right-0 flex items-center gap-1 pr-1 ${lit ? ROW_HOVER : ROW_PLAIN}`}
      style={{ top: row.y, height: ROW_HEIGHT, left: 0 }}
      {...hover}
    >
      <span
        aria-hidden="true"
        className="shrink-0 pr-2 text-right text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400"
        style={{ width: KM_WIDTH }}
      >
        {km}
      </span>
      <span className="shrink-0" style={{ width: left - KM_WIDTH - 4 }} aria-hidden="true" />
      {target ? (
        <button
          type="button"
          aria-label={m.route_overview_select_row({ name: label })}
          onClick={() => select(target)}
          className="flex min-w-0 flex-1 cursor-pointer items-baseline gap-2 rounded text-left text-sm focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <span className="min-w-0 truncate">{label}</span>
          {role ? (
            <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">{role}</span>
          ) : null}
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 items-baseline gap-2 text-sm">
          <span className="min-w-0 truncate">{label}</span>
          {role ? (
            <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">{role}</span>
          ) : null}
        </span>
      )}
      <IssueButtons row={row} analysis={analysis} label={label} open={open} setOpen={setOpen} />
    </div>
  )
}

/** The panel of one issue: what it is, what to do, and the two buttons */
function IssuePopover({
  issue,
  flow,
  top,
  canRemove,
  onSelect,
  onRemove,
  onClose,
}: {
  issue: RouteIssue
  flow: boolean
  top: number
  canRemove: boolean
  onSelect: () => void
  onRemove: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // the latest onClose, so the effect below runs once per opening: re-running it on each render (a hover on the map
  // draws the overview again) would pull the focus back from the note's buttons
  const close = useEffectEvent(onClose)
  useEffect(function focusTheNoteAndCloseOnEscapeOrOutsideClick() {
    // the (i) button that opened the note gets the focus back when it closes
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const note = ref.current
    note?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
      }
    }
    const down = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (ref.current?.contains(target) || target?.closest('[data-issue-button]')) return
      close()
    }
    document.addEventListener('keydown', key, true)
    document.addEventListener('pointerdown', down, true)
    return () => {
      document.removeEventListener('keydown', key, true)
      document.removeEventListener('pointerdown', down, true)
      // only when the focus went down with the note: a click elsewhere keeps its own focus
      const lost = document.activeElement === null || document.activeElement === document.body
      if (opener?.isConnected && (lost || note?.contains(document.activeElement))) opener.focus()
    }
  }, [])
  const texts = issueTexts(issue)
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={texts.title}
      tabIndex={-1}
      className={`z-20 w-72 max-w-[calc(100%-1rem)] rounded-lg bg-white p-3 text-sm shadow-lg ring-1 ring-zinc-950/10 outline-none dark:bg-zinc-900 dark:ring-white/15 ${flow ? 'relative mt-1 ml-5' : 'absolute'}`}
      style={flow ? undefined : { top, left: 40 }}
    >
      <p
        className={`font-semibold ${issue.severity === 'warning' ? 'text-amber-700 dark:text-amber-400' : ''}`}
      >
        {texts.title}
      </p>
      <p className="mt-1">{texts.text}</p>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">{texts.todo}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSelect}
          className="cursor-pointer rounded-md bg-zinc-950/5 px-2 py-1 text-xs font-medium hover:bg-zinc-950/10 focus-visible:outline-2 focus-visible:outline-blue-500 dark:bg-white/10 dark:hover:bg-white/15"
        >
          {m.route_overview_issue_select()}
        </button>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="cursor-pointer rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            {m.route_overview_issue_remove_duplicate()}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto cursor-pointer rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/10"
        >
          {m.route_overview_issue_close()}
        </button>
      </div>
    </div>
  )
}

/** The line, the side lanes and the symbols of the rows, in SVG */
function Diagram({
  layout,
  shown,
  analysis,
  colour,
  laneX,
  limitY,
}: {
  layout: OverviewLayout
  shown: OverviewRow[]
  analysis: RouteAnalysis
  colour: string
  laneX: (lane: number) => number
  limitY: number
}) {
  const { engine } = useShell()
  // only the line listens to the map's hover: the rows have their own
  const hovered = useSyncExternalStore(engine.subscribeHover, engine.hoverTarget)
  const half = ROW_HEIGHT / 2
  const x0 = laneX(0)
  const shownRows = new Set(shown)
  return (
    <g>
      {layout.sections.map((section) => {
        const from = layout.rows[section.fromRow]
        const to = layout.rows[section.toRow]
        if (!from || !to || !shownRows.has(from)) return null
        const lit = sectionHovered(analysis, section, hovered)
        const y1 = from.y + half
        const y2 = shownRows.has(to) ? to.y + half : limitY
        return (
          <g key={`${section.fromRow}-${section.toRow}`}>
            {lit ? (
              <line
                x1={x0}
                x2={x0}
                y1={y1}
                y2={y2}
                stroke={colour}
                strokeOpacity={0.3}
                strokeWidth={9}
                strokeLinecap="round"
              />
            ) : null}
            {section.gap ? (
              <line
                x1={x0}
                x2={x0}
                y1={Math.min(section.y, limitY)}
                y2={Math.min(section.y + section.height, limitY)}
                stroke={RED}
                strokeWidth={2}
                strokeDasharray="3 3"
              />
            ) : (
              <line x1={x0} x2={x0} y1={y1} y2={y2} stroke={colour} strokeWidth={3} />
            )}
          </g>
        )
      })}
      {layout.lanes.map((lane) => {
        const x = laneX(lane.lane)
        const a = lane.fromY + half
        const b = Math.min(lane.toY + half, limitY)
        if (a >= limitY) return null
        const end = lane.toY + half <= limitY
        // a lane that comes back bends twice, one that runs past the cut once: the bends never overlap
        const bend = Math.min(10, (b - a) / (end ? 4 : 2))
        const d = end
          ? `M ${x0} ${a} C ${x0} ${a + bend}, ${x} ${a + bend}, ${x} ${a + 2 * bend} L ${x} ${b - 2 * bend} C ${x} ${b - bend}, ${x0} ${b - bend}, ${x0} ${b}`
          : `M ${x0} ${a} C ${x0} ${a + bend}, ${x} ${a + bend}, ${x} ${a + 2 * bend} L ${x} ${b}`
        return (
          <path
            key={`lane-${lane.branch}`}
            d={d}
            fill="none"
            stroke={colour}
            strokeWidth={2}
            strokeOpacity={0.7}
          />
        )
      })}
      {shown.map((row) => (
        <RowSymbol
          key={row.key}
          row={row}
          x={laneX(row.lane)}
          y={row.y + half}
          colour={colour}
          guidepost={analysis.members[row.members[0] ?? -1]?.pointKind === 'guidepost'}
        />
      ))}
    </g>
  )
}

/** The mark of a row: filled circle (start, end), circle with a ring (stop, platform), triangle (guidepost), dot, open circle (junction), break (gap) */
function RowSymbol({
  row,
  x,
  y,
  colour,
  guidepost,
}: {
  row: OverviewRow
  x: number
  y: number
  colour: string
  guidepost: boolean
}) {
  // the hole of a ring takes the panel's colour, light and dark
  const hole = 'fill-white dark:fill-zinc-900'
  switch (row.kind) {
    case 'start':
    case 'end':
      return <circle cx={x} cy={y} r={6} fill={colour} />
    case 'stop':
    case 'platform':
      return (
        <>
          <circle cx={x} cy={y} r={7} className={hole} stroke={colour} strokeWidth={2} />
          <circle cx={x} cy={y} r={3.5} fill={colour} />
        </>
      )
    case 'junction':
      return <circle cx={x} cy={y} r={4.5} className={hole} stroke={colour} strokeWidth={2} />
    case 'gap':
      return (
        <g stroke={RED} strokeWidth={2} strokeLinecap="round">
          <line x1={x - 6} x2={x + 6} y1={y - 3} y2={y - 3} />
          <line x1={x - 6} x2={x + 6} y1={y + 3} y2={y + 3} />
        </g>
      )
    case 'branch-start':
    case 'branch-end':
      return <circle cx={x} cy={y} r={3.5} fill={colour} />
    case 'point':
      return guidepost ? (
        <path d={`M ${x} ${y - 5} L ${x + 5} ${y + 4} L ${x - 5} ${y + 4} Z`} fill={colour} />
      ) : (
        <circle cx={x} cy={y} r={3} fill={colour} />
      )
    case 'unplaced':
      return <circle cx={x} cy={y} r={3} fill={colour} />
  }
}
