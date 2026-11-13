import type {
  IssueCode,
  OverviewRow,
  OverviewSection,
  RouteAnalysis,
  RouteIssue,
} from '@osm-editor-kit/maid-route-analysis'
import { memberLabel } from '../relations-logic.ts'

/** Rows the diagram draws before "Show all (N)" (the rows are absolutely placed, so the cost is the DOM nodes) */
export const ROW_LIMIT = 300

export const ISSUE_CODES: readonly IssueCode[] = [
  'gap',
  'order',
  'not-loaded',
  'point-far',
  'out-of-sequence',
  'junction-without-guidepost',
  'no-guideposts',
  'unknown-role',
  'branch-detached',
  'duplicate',
  'empty',
]

/** The names of the three paraglide messages of an issue: title, what it is, what to do */
export function issueMessageKeys(code: IssueCode) {
  const base = `route_overview_issue_${code.replaceAll('-', '_')}`
  return { title: `${base}_title`, text: `${base}_text`, todo: `${base}_todo` }
}

/** The numbers and words the issue texts use, from `issue.detail` (missing values read as 0 or empty) */
export function issueParams(issue: RouteIssue) {
  const detail = issue.detail ?? {}
  const num = (key: string) => Number(detail[key] ?? 0)
  return {
    distance: num('distance'),
    moved: num('moved') || issue.members.length,
    count: num('count') || issue.members.length,
    ways: num('ways'),
    role: String(detail.role ?? ''),
  }
}

/** Kilometres with one decimal in the number format of the locale: `1234` is "1.2" (en) or "1,2" (de) */
const kmFormats = new Map<string, Intl.NumberFormat>()

export function formatKm(metres: number, locale?: string) {
  // one formatter per locale: a long route formats hundreds of rows
  const key = locale ?? ''
  let format = kmFormats.get(key)
  if (!format) {
    format = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    kmFormats.set(key, format)
  }
  return format.format(metres / 1000)
}

export type UnplacedGroup = 'unloaded' | 'subroute' | 'other' | 'points' | 'detached' | 'main'

/** Which group an unplaced row is (`unplaced:points` is "points"); undefined for any other row */
export function groupOf(row: Pick<OverviewRow, 'key' | 'kind'>): UnplacedGroup | undefined {
  if (row.kind !== 'unplaced') return undefined
  const name = row.key.slice('unplaced:'.length)
  return ['unloaded', 'subroute', 'other', 'points', 'detached', 'main'].includes(name)
    ? (name as UnplacedGroup)
    : undefined
}

/** The entity ids of member indexes */
export function idsOf(analysis: RouteAnalysis, indexes: readonly number[]) {
  const ids: string[] = []
  for (const index of indexes) {
    const info = analysis.members[index]
    if (info) ids.push(info.member.id)
  }
  return ids
}

/** Whether the entity under the pointer on the map is one of the ids */
export function includesHovered(ids: readonly string[], hovered: string | null | undefined) {
  return hovered != null && ids.includes(hovered)
}

/** Whether a section of the line is a way that the pointer is on */
export function sectionHovered(
  analysis: RouteAnalysis,
  section: Pick<OverviewSection, 'members'>,
  hovered: string | null | undefined,
) {
  return includesHovered(idsOf(analysis, section.members), hovered)
}

/**
 * The entity a click on the row selects: its only member. A gap or a junction selects nothing, nor does a row of
 * several members (a side line, a group).
 */
export function selectableId(analysis: RouteAnalysis, row: OverviewRow) {
  if (
    row.kind === 'gap' ||
    row.kind === 'junction' ||
    row.kind === 'junctions' ||
    row.kind === 'unplaced'
  )
    return undefined
  if (row.members.length !== 1) return undefined
  return idsOf(analysis, row.members)[0]
}

export type TextName =
  | 'start'
  | 'end'
  | 'stop'
  | 'platform'
  | 'guidepost'
  | 'milestone'
  | 'information'
  | 'station'
  | 'point'
  | 'branch_start'
  | 'branch_end'
  | 'excursion_start'
  | 'excursion_end'
  | 'loop_start'
  | 'loop_end'

/** What a row is called: a name taken from the member's tags, or a fallback the component turns into a text */
export type RowLabel =
  | { name: string }
  | { text: TextName }
  | { junction: number }
  | { junctions: number }
  | { gap: number }
  | { way: string }
  | { relation: string }
  | { group: UnplacedGroup; count: number }
  | { empty: true }

type Tags = Readonly<Record<string, string>>

/** The label of a member by its tags, else by its type and id */
export function memberName(
  analysis: RouteAnalysis,
  index: number,
  memberTags: ReadonlyMap<string, Tags> | undefined,
): RowLabel {
  const info = analysis.members[index]
  if (!info) return { text: 'point' }
  const tags = memberTags?.get(info.member.id) as Record<string, string> | undefined
  // a point without a name is called by what it is ("Guidepost"), not by its main tag ("tourism=information")
  const kind = info.pointKind && info.pointKind !== 'other' ? info.pointKind : undefined
  const named = kind ? tags?.name?.trim() || tags?.ref?.trim() : memberLabel(tags)
  if (named) return { name: named }
  if (info.member.type === 'way') return { way: info.member.id }
  if (info.member.type === 'relation') return { relation: info.member.id }
  return { text: info.pointKind && info.pointKind !== 'other' ? info.pointKind : 'point' }
}

export function rowLabel(
  analysis: RouteAnalysis,
  row: OverviewRow,
  memberTags: ReadonlyMap<string, Tags> | undefined,
): RowLabel {
  switch (row.kind) {
    case 'start':
    case 'end':
      return { text: row.kind }
    case 'branch-start':
      return { text: branchText(analysis, row, 'start') }
    case 'branch-end':
      return { text: branchText(analysis, row, 'end') }
    case 'junction': {
      const node = row.key.slice('junction:'.length)
      return { junction: analysis.junctions.find((j) => j.node === node)?.outside ?? 0 }
    }
    case 'junctions':
      return { junctions: row.folded?.count ?? 0 }
    case 'gap': {
      const after = Number(row.key.slice('gap:'.length))
      return { gap: Math.round(analysis.chain.gaps[after]?.distance ?? 0) }
    }
    case 'unplaced': {
      const group = groupOf(row)
      return group ? { group, count: row.members.length } : { empty: true }
    }
    case 'stop':
    case 'platform':
    case 'point': {
      const first = row.members[0]
      const label = first === undefined ? undefined : memberName(analysis, first, memberTags)
      if (label && 'name' in label) return label
      if (row.kind !== 'point') return { text: row.kind }
      return label ?? { text: 'point' }
    }
  }
}

/** The role in small text next to a row: the role of its only member, if it has one */
export function rowRole(analysis: RouteAnalysis, row: OverviewRow) {
  if (row.members.length !== 1 || row.kind === 'gap' || row.kind === 'junction') return ''
  const first = row.members[0]
  return first === undefined ? '' : (analysis.members[first]?.member.role ?? '')
}

/** The rows the diagram draws: the placed ones up to `limit`; the unplaced groups are listed apart, always */
export function splitRows(rows: readonly OverviewRow[], limit: number) {
  const placed = rows.filter((row) => row.kind !== 'unplaced')
  return {
    placed,
    shown: placed.slice(0, limit),
    unplaced: rows.filter((row) => row.kind === 'unplaced'),
  }
}

/** Whether every member of a row or a stretch comes from the preview (none is loaded): drawn muted, loaded on a click */
export function fromPreview(
  analysis: RouteAnalysis,
  members: readonly number[],
  previewed: ReadonlySet<string>,
) {
  return members.length > 0 && idsOf(analysis, members).every((id) => previewed.has(id))
}

/**
 * A relation that groups routes: a `superroute` (the stages of a long trail) or a `route_master` (the variants of a
 * bus line), with at least one relation member. Its overview lists the routes as groups.
 */
export function isRouteGroup(relation: {
  tags: Readonly<Record<string, string>>
  members: readonly { type: string }[]
}) {
  const type = relation.tags.type?.trim()
  return (
    (type === 'superroute' || type === 'route_master') &&
    relation.members.some((member) => member.type === 'relation')
  )
}

/**
 * The names of the ways of a stretch, in travel order, the same name only once: "Freiheit", "Footway". `nameOf` gives
 * a way's name (its `name`, `ref`, or the preset's name); a way without any is left out.
 */
export function stretchNames(
  analysis: RouteAnalysis,
  members: readonly number[],
  nameOf: (id: string) => string | undefined,
  travelOrder: ReadonlyMap<number, number>,
) {
  const ordered = [...members].sort(
    (a, b) => (travelOrder.get(a) ?? Infinity) - (travelOrder.get(b) ?? Infinity) || a - b,
  )
  const names: string[] = []
  for (const index of ordered) {
    const info = analysis.members[index]
    if (!info) continue
    const name = nameOf(info.member.id)
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

/** The place of each main way on the line (member index to step number), to list a stretch's ways in travel order */
export function travelOrderOf(analysis: RouteAnalysis) {
  const order = new Map<number, number>()
  for (const piece of analysis.chain.pieces)
    for (const step of piece.steps) if (!order.has(step.index)) order.set(step.index, order.size)
  return order
}

/** The metres of each main way along the line, by member index */
export function stepLengthsOf(analysis: RouteAnalysis) {
  const lengths = new Map<number, number>()
  for (const piece of analysis.chain.pieces)
    for (const step of piece.steps) lengths.set(step.index, step.length)
  return lengths
}

/**
 * Where the selected entity is in the overview: the stretches (sections, by index) that hold it as a way, and the
 * rows that stand for it alone (a point, a stop). Both empty when it is no member on the line.
 */
export function selectedInLayout(
  analysis: RouteAnalysis,
  sections: readonly Pick<OverviewSection, 'members'>[],
  rows: readonly OverviewRow[],
  selected: string | null | undefined,
) {
  const result = { sections: [] as number[], rows: [] as string[] }
  if (!selected) return result
  const indexes = new Set<number>()
  for (const info of analysis.members) if (info.member.id === selected) indexes.add(info.index)
  if (indexes.size === 0) return result
  sections.forEach((section, i) => {
    if (section.members.some((member) => indexes.has(member))) result.sections.push(i)
  })
  for (const row of rows) {
    if (row.kind === 'unplaced' || row.kind === 'branch-end') continue
    if (row.members.length === 1 && indexes.has(row.members[0] ?? -1)) result.rows.push(row.key)
    else if (row.kind === 'branch-start' && row.members.some((member) => indexes.has(member)))
      result.rows.push(row.key)
  }
  return result
}

/** The two ways on either side of a gap row (its members), as entity ids: a click shows the gap between them */
export function gapIds(analysis: RouteAnalysis, row: Pick<OverviewRow, 'kind' | 'members'>) {
  return row.kind === 'gap' ? idsOf(analysis, row.members) : []
}

/** The node of a junction row (`junction:n123`), which a click selects; undefined for any other row */
export function junctionNode(row: Pick<OverviewRow, 'kind' | 'key'>) {
  return row.kind === 'junction' ? row.key.slice('junction:'.length) : undefined
}

/**
 * The ways before and after the selected one along the line (travel order, across gaps): member indexes, undefined at
 * either end or when the selection is no way of the main line.
 */
export function neighboursOnLine(analysis: RouteAnalysis, selected: string | null | undefined) {
  const steps = analysis.chain.pieces.flatMap((piece) => piece.steps)
  const at = selected ? steps.findIndex((step) => step.wayId === selected) : -1
  if (at < 0) return undefined
  return { previous: steps[at - 1]?.index, next: steps[at + 1]?.index }
}

/** The text of a side line's start or end row: a spur out and back and a side loop are told apart from a side line */
function branchText(
  analysis: RouteAnalysis,
  row: Pick<OverviewRow, 'branch'>,
  side: 'start' | 'end',
): TextName {
  const branch = row.branch === undefined ? undefined : analysis.branches[row.branch]
  if (branch?.loop) return side === 'start' ? 'loop_start' : 'loop_end'
  if (branch?.spur) return side === 'start' ? 'excursion_start' : 'excursion_end'
  return side === 'start' ? 'branch_start' : 'branch_end'
}
