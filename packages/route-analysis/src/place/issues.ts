import { isWaymarked } from '../roles.ts'
import type {
  AnalysisOptions,
  Branch,
  Chain,
  Junction,
  LonLat,
  MemberInfo,
  PlacedPoint,
  RouteInput,
  RouteIssue,
} from '../types.ts'

/** A point further than this many metres from the line is reported */
const DEFAULT_POINT_RADIUS_M = 30

/**
 * The problems of the route, as the overview shows them: sorted by `at`, issues without a place last. Each rule
 * reports on its own; a rule that finds nothing adds nothing.
 */
export function collectIssues(
  input: RouteInput,
  members: readonly MemberInfo[],
  chain: Chain,
  points: readonly PlacedPoint[],
  branches: readonly Branch[],
  junctions: readonly Junction[],
  options: AnalysisOptions,
): RouteIssue[] {
  const pointRadius = options.pointRadius ?? DEFAULT_POINT_RADIUS_M
  const waymarked = isWaymarked(input.tags)
  const isGuidepost = (m: MemberInfo) =>
    m.member.role.trim() === 'guidepost' || (m.kind === 'point' && m.pointKind === 'guidepost')
  const hasGuidepost = members.some(isGuidepost)
  // a guidepost that is not loaded may stand at any junction: then no junction can be judged
  const guidepostsLoaded = !members.some((m) => m.kind === 'unloaded' && isGuidepost(m))
  const issues: RouteIssue[] = [
    ...gapIssues(input, chain),
    ...orderIssues(members, chain),
    ...notLoadedIssues(members),
    ...pointIssues(points, pointRadius),
    ...junctionIssues(input, junctions, waymarked && hasGuidepost && guidepostsLoaded),
    ...noGuidepostIssues(junctions, waymarked, hasGuidepost),
    ...unknownRoleIssues(members),
    ...branchIssues(branches),
    ...duplicateIssues(input),
    ...emptyIssues(members, chain),
  ]
  return issues.sort(byAt)
}

/** One warning per break in the line: the last main way before it and the first after it */
function gapIssues(input: RouteInput, chain: Chain): RouteIssue[] {
  return chain.gaps.flatMap((gap): RouteIssue[] => {
    const before = chain.pieces[gap.after]?.steps.at(-1)
    const after = chain.pieces[gap.after + 1]?.steps[0]
    if (!before || !after) return []
    const a = input.nodes.get(gap.from)
    const b = input.nodes.get(gap.to)
    return [
      {
        code: 'gap',
        severity: 'warning',
        members: [before.index, after.index],
        at: gap.at,
        loc: a && b ? midpoint(a, b) : undefined,
        detail: { distance: Math.round(gap.distance) },
      },
    ]
  })
}

/** Once, when the ways only join in another order: the main ways whose place differs from their place in the relation */
function orderIssues(members: readonly MemberInfo[], chain: Chain): RouteIssue[] {
  if (chain.linear !== 'sorted') return []
  const main = members.filter((m) => m.kind === 'main').map((m) => m.index)
  const sortedPlace = new Map<number, number>(
    chain.sortedOrder.map((idx, place) => [idx, place] as const),
  )
  const moved = main.filter((idx, relationPlace) => sortedPlace.get(idx) !== relationPlace)
  if (moved.length === 0) return []
  return [{ code: 'order', severity: 'warning', members: moved, detail: { moved: moved.length } }]
}

/** Once, when some members are not loaded */
function notLoadedIssues(members: readonly MemberInfo[]): RouteIssue[] {
  const unloaded = members.filter((m) => m.kind === 'unloaded').map((m) => m.index)
  if (unloaded.length === 0) return []
  return [
    { code: 'not-loaded', severity: 'info', members: unloaded, detail: { count: unloaded.length } },
  ]
}

/** Per point that lies further from the line than the radius, and per out-of-sequence stop or platform */
function pointIssues(points: readonly PlacedPoint[], pointRadius: number): RouteIssue[] {
  return points.flatMap((p): RouteIssue[] => {
    const out: RouteIssue[] = []
    if (p.offset !== undefined && p.offset > pointRadius) {
      out.push({
        code: 'point-far',
        severity: 'warning',
        members: [p.index],
        at: p.at,
        loc: p.loc,
        detail: { distance: Math.round(p.offset) },
      })
    }
    if (p.outOfSequence) {
      out.push({
        code: 'out-of-sequence',
        severity: 'warning',
        members: [p.index],
        at: p.at,
        loc: p.loc,
      })
    }
    return out
  })
}

/** Per junction without a guidepost, on a waymarked route that lists guideposts */
function junctionIssues(
  input: RouteInput,
  junctions: readonly Junction[],
  check: boolean,
): RouteIssue[] {
  if (!check) return []
  return junctions
    .filter((j) => j.guidepost === undefined)
    .map(
      (j): RouteIssue => ({
        code: 'junction-without-guidepost',
        severity: 'info',
        members: [],
        at: j.at,
        loc: input.nodes.get(j.node),
        detail: { ways: j.outside },
      }),
    )
}

/** Once, on a waymarked route with junctions but no guidepost member */
function noGuidepostIssues(
  junctions: readonly Junction[],
  waymarked: boolean,
  hasGuidepost: boolean,
): RouteIssue[] {
  if (!waymarked || hasGuidepost || junctions.length === 0) return []
  return [{ code: 'no-guideposts', severity: 'info', members: [] }]
}

/** Per member whose role the overview does not know */
function unknownRoleIssues(members: readonly MemberInfo[]): RouteIssue[] {
  return members
    .filter((m) => !m.knownRole)
    .map(
      (m): RouteIssue => ({
        code: 'unknown-role',
        severity: 'info',
        members: [m.index],
        detail: { role: m.member.role },
      }),
    )
}

/** Per side line that touches the main line nowhere */
function branchIssues(branches: readonly Branch[]): RouteIssue[] {
  return branches
    .filter((b) => b.from === undefined)
    .map((b): RouteIssue => ({ code: 'branch-detached', severity: 'warning', members: b.indexes }))
}

/** Per pair of neighbouring members that are the same member with the same role */
function duplicateIssues(input: RouteInput): RouteIssue[] {
  const out: RouteIssue[] = []
  for (let i = 0; i + 1 < input.members.length; i++) {
    const a = input.members[i]
    const b = input.members[i + 1]
    if (a && b && a.id === b.id && a.role.trim() === b.role.trim()) {
      out.push({ code: 'duplicate', severity: 'warning', members: [i, i + 1] })
    }
  }
  return out
}

/** Once, when the chain is empty but the relation lists main ways or unloaded ways */
function emptyIssues(members: readonly MemberInfo[], chain: Chain): RouteIssue[] {
  if (chain.linear !== 'empty') return []
  const listed = members
    .filter((m) => m.kind === 'main' || (m.kind === 'unloaded' && m.member.type === 'way'))
    .map((m) => m.index)
  if (listed.length === 0) return []
  return [{ code: 'empty', severity: 'warning', members: listed }]
}

function midpoint(a: LonLat, b: LonLat): LonLat {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

/** Issues with a place come first in order of `at`; the others keep their order at the end */
function byAt(a: RouteIssue, b: RouteIssue): number {
  if (a.at === undefined) return b.at === undefined ? 0 : 1
  if (b.at === undefined) return -1
  return a.at - b.at
}
