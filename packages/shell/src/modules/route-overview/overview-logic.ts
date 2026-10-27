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
export function formatKm(metres: number, locale?: string) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(metres / 1000)
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
  if (row.kind === 'gap' || row.kind === 'junction' || row.kind === 'unplaced') return undefined
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

/** What a row is called: a name taken from the member's tags, or a fallback the component turns into a text */
export type RowLabel =
  | { name: string }
  | { text: TextName }
  | { junction: number }
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
  const named = memberLabel(memberTags?.get(info.member.id) as Record<string, string> | undefined)
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
      return { text: 'branch_start' }
    case 'branch-end':
      return { text: 'branch_end' }
    case 'junction': {
      const node = row.key.slice('junction:'.length)
      return { junction: analysis.junctions.find((j) => j.node === node)?.outside ?? 0 }
    }
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
