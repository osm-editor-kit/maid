import type {
  Chain,
  ChainStep,
  LayoutOptions,
  MemberInfo,
  OverviewLane,
  OverviewLayout,
  OverviewMode,
  OverviewRow,
  OverviewRowKind,
  OverviewSection,
  RouteAnalysis,
  RouteIssue,
} from '../types.ts'

// The overview layout: rows on one vertical line in travel order, sections between them, branches as lanes beside
// the line, and groups of unplaced members at the bottom. Pure functions: the analysis in, the positions out.

const ROW_HEIGHT = 28
const SECTION_HEIGHT = 12
const PX_PER_KM = 40
const MIN_SECTION_HEIGHT = 4

/** Order of rows at the same metre: gap, junction, branch, point, and the end last. The start is always first. */
const RANK = { start: 0, gap: 1, junction: 2, branch: 3, point: 4, end: 5 } as const

/** Stands in for a member index where a row has none, so that such rows sort last among their rank */
const NO_MEMBER = Number.MAX_SAFE_INTEGER

/** The unplaced groups, in the order they are listed at the bottom */
const GROUPS = ['unloaded', 'subroute', 'other', 'points', 'detached', 'main'] as const
type Group = (typeof GROUPS)[number]

/** A row on the line, before its position is known */
type Draft = {
  key: string
  kind: OverviewRowKind
  members: number[]
  /** Metres along the line */
  at: number
  lane: number
  branch?: number
  rank: number
  /** Second sort key: the member index the row stands for */
  member: number
  /** Third sort key: a branch's start sorts before its end */
  sub: number
  /** Creation order, the last sort key */
  seq: number
}

/** The metres a way or a piece covers on the line */
type Span = { at: number; end: number; index: number }

/** Where the issues go: the rows they can attach to, looked up once */
type IssueContext = {
  rowIndex: ReadonlyMap<string, number>
  /** Point, stop and platform rows by member index */
  pointRow: ReadonlyMap<number, number>
  /** Gap and junction rows, ascending by metre */
  gapRows: readonly number[]
  junctionRows: readonly number[]
  /** All placed rows, ascending by metre */
  placedRows: readonly number[]
  /** Metres of each placed row, by row index */
  placedAt: readonly number[]
}

/**
 * The overview of a route: rows top to bottom, sections between them, lanes for branches, and unplaced groups last.
 * `schematic` gives every section the same height; `scaled` gives a section a height by its length.
 * Every member appears in a row or a section; every issue is attached to exactly one row.
 */
export function layoutOverview(
  analysis: RouteAnalysis,
  mode: OverviewMode,
  options: LayoutOptions = {},
): OverviewLayout {
  const rowHeight = options.rowHeight ?? ROW_HEIGHT
  const sectionHeight = options.sectionHeight ?? SECTION_HEIGHT
  const pxPerKm = options.pxPerKm ?? PX_PER_KM
  const minSectionHeight = options.minSectionHeight ?? MIN_SECTION_HEIGHT

  const lanes = assignLanes(analysis.branches)
  const drafts = placedDrafts(analysis, lanes)
  const rows: OverviewRow[] = drafts.map(rowOf)

  // Sections: one between each pair of consecutive placed rows. Main ways go into the sections they cover.
  const { steps, parallel } = spansOf(analysis.chain)
  const bounds: [number, number][] = []
  for (let i = 1; i < drafts.length; i++) {
    const before = drafts[i - 1]
    const here = drafts[i]
    if (before && here) bounds.push([before.at, here.at])
  }
  const stepMembers = coverBySections(steps, bounds)
  const parallelMembers = coverBySections(parallel, bounds)

  const sections: OverviewSection[] = []
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]
    const row = rows[i]
    const before = drafts[i - 1]
    const here = drafts[i]
    if (!prev || !row || !before || !here) continue
    const length = Math.max(0, here.at - before.at)
    const height =
      mode === 'scaled' ? Math.max(minSectionHeight, (length / 1000) * pxPerKm) : sectionHeight
    sections.push({
      fromRow: i - 1,
      toRow: i,
      length,
      members: mergeSorted(stepMembers[i - 1] ?? [], parallelMembers[i - 1] ?? []),
      lane: 0,
      gap: prev.kind === 'gap' || row.kind === 'gap',
      y: prev.y + rowHeight,
      height,
    })
    row.y = prev.y + rowHeight + height
  }

  // Unplaced rows: one per non-empty group, after the placed rows.
  const covered = new Set<number>()
  for (const row of rows) for (const member of row.members) covered.add(member)
  for (const section of sections) for (const member of section.members) covered.add(member)
  const groups = new Map<Group, number[]>()
  for (const group of GROUPS) groups.set(group, [])
  for (const info of analysis.members) {
    const group = groupOf(info, covered)
    if (group) groups.get(group)?.push(info.index)
  }
  for (const group of GROUPS) {
    const list = groups.get(group)
    if (!list || list.length === 0) continue
    rows.push({
      key: `unplaced:${group}`,
      kind: 'unplaced',
      members: list,
      issues: [],
      lane: 0,
      y: nextY(rows, rowHeight),
    })
  }

  // Issues: each one attaches to exactly one row.
  const rowIndex = new Map<string, number>()
  rows.forEach((row, i) => rowIndex.set(row.key, i))
  const context = issueContext(rows, drafts, rowIndex)
  let fallback = rowIndex.get('start') ?? (rows.length > 0 ? 0 : undefined)
  analysis.issues.forEach((issue, i) => {
    let target = targetOf(issue, analysis, context)
    target ??= fallback
    if (target === undefined) {
      // No row at all (an empty analysis): one row holds the issues
      rows.push({
        key: 'unplaced:issues',
        kind: 'unplaced',
        members: [],
        issues: [],
        lane: 0,
        y: 0,
      })
      target = rows.length - 1
      rowIndex.set('unplaced:issues', target)
      fallback = target
    }
    rows[target]?.issues.push(i)
  })

  // Branch lanes: from the start row to the end row
  const laneList: OverviewLane[] = []
  analysis.branches.forEach((_, branch) => {
    const start = rowIndex.get(`branch-start:${branch}`)
    const end = rowIndex.get(`branch-end:${branch}`)
    const startRow = start === undefined ? undefined : rows[start]
    const endRow = end === undefined ? undefined : rows[end]
    if (startRow && endRow) {
      laneList.push({ lane: startRow.lane, branch, fromY: startRow.y, toY: endRow.y })
    }
  })

  const height = nextY(rows, rowHeight)
  return { rows, sections, lanes: laneList, height }
}

/**
 * A lane for each branch that touches the line: branches whose [from, to] ranges overlap get different lanes.
 * Greedy colouring by `from`: each branch takes the lowest lane that is free. Lane 0 is the main line.
 * Returns one number per branch (0 for a branch that does not touch the line).
 */
function assignLanes(branches: RouteAnalysis['branches']): number[] {
  const order: { branch: number; lo: number; hi: number }[] = []
  branches.forEach((branch, index) => {
    if (branch.from === undefined) return
    const to = branch.to ?? branch.from
    order.push({ branch: index, lo: Math.min(branch.from, to), hi: Math.max(branch.from, to) })
  })
  order.sort((a, b) => a.lo - b.lo || a.hi - b.hi || a.branch - b.branch)

  const lanes: number[] = branches.map(() => 0)
  // The last metre of the branch on each lane
  const laneEnd: number[] = []
  for (const item of order) {
    let lane = 0
    while (lane < laneEnd.length && (laneEnd[lane] ?? 0) >= item.lo) lane++
    laneEnd[lane] = item.hi
    lanes[item.branch] = lane + 1
  }
  return lanes
}

/** The rows on the line, in travel order. Sorted once. */
function placedDrafts(analysis: RouteAnalysis, lanes: readonly number[]): Draft[] {
  const { chain, members, points, junctions, branches } = analysis
  const drafts: Draft[] = []
  const add = (draft: Omit<Draft, 'seq'>) => {
    drafts.push({ ...draft, seq: drafts.length })
  }

  if (chain.pieces.length > 0) {
    const first = firstStep(chain)
    const last = lastStep(chain)
    add({
      key: 'start',
      kind: 'start',
      members: first ? [first.index] : [],
      at: 0,
      lane: 0,
      rank: RANK.start,
      member: -1,
      sub: 0,
    })
    add({
      key: 'end',
      kind: 'end',
      members: last ? [last.index] : [],
      at: chain.length,
      lane: 0,
      rank: RANK.end,
      member: NO_MEMBER,
      sub: 0,
    })
  }

  for (const gap of chain.gaps) {
    const before = chain.pieces[gap.after]?.steps.at(-1)
    const after = chain.pieces[gap.after + 1]?.steps[0]
    const gapMembers: number[] = []
    if (before) gapMembers.push(before.index)
    if (after) gapMembers.push(after.index)
    add({
      key: `gap:${gap.after}`,
      kind: 'gap',
      members: gapMembers,
      at: gap.at,
      lane: 0,
      rank: RANK.gap,
      member: gap.after,
      sub: 0,
    })
  }

  const placedPoints = new Set<number>()
  for (const point of points) {
    const kind = members[point.index]?.kind
    if (point.at === undefined || placedPoints.has(point.index)) continue
    if (kind !== 'point' && kind !== 'stop' && kind !== 'platform') continue
    placedPoints.add(point.index)
    add({
      key: `point:${point.index}`,
      kind,
      members: [point.index],
      at: point.at,
      lane: 0,
      rank: RANK.point,
      member: point.index,
      sub: 0,
    })
  }

  for (const junction of junctions) {
    add({
      key: `junction:${junction.node}`,
      kind: 'junction',
      members: [],
      at: junction.at,
      lane: 0,
      rank: RANK.junction,
      member: junction.guidepost ?? NO_MEMBER,
      sub: 0,
    })
  }

  branches.forEach((branch, index) => {
    if (branch.from === undefined) return
    const lane = lanes[index] ?? 0
    const member = branch.indexes[0] ?? NO_MEMBER
    add({
      key: `branch-start:${index}`,
      kind: 'branch-start',
      members: [...branch.indexes],
      at: branch.from,
      lane,
      branch: index,
      rank: RANK.branch,
      member,
      sub: 0,
    })
    add({
      key: `branch-end:${index}`,
      kind: 'branch-end',
      members: [],
      at: branch.to ?? branch.from,
      lane,
      branch: index,
      rank: RANK.branch,
      member,
      sub: 1,
    })
  })

  drafts.sort(
    (a, b) =>
      a.at - b.at || a.rank - b.rank || a.member - b.member || a.sub - b.sub || a.seq - b.seq,
  )
  return drafts
}

/** A row from its draft, positioned later */
function rowOf(draft: Draft): OverviewRow {
  const row: OverviewRow = {
    key: draft.key,
    kind: draft.kind,
    members: draft.members,
    at: draft.at,
    issues: [],
    lane: draft.lane,
    y: 0,
  }
  if (draft.branch !== undefined) row.branch = draft.branch
  return row
}

/** The first way of the line, in travel order */
function firstStep(chain: Chain): ChainStep | undefined {
  for (const piece of chain.pieces) {
    const step = piece.steps[0]
    if (step) return step
  }
  return undefined
}

/** The last way of the line, in travel order */
function lastStep(chain: Chain): ChainStep | undefined {
  for (let i = chain.pieces.length - 1; i >= 0; i--) {
    const step = chain.pieces[i]?.steps.at(-1)
    if (step) return step
  }
  return undefined
}

/** Metres of every step and every parallel strand, each list sorted once by metre */
function spansOf(chain: Chain): { steps: Span[]; parallel: Span[] } {
  const steps: Span[] = []
  const parallel: Span[] = []
  for (const piece of chain.pieces) {
    for (const step of piece.steps) {
      steps.push({ at: step.at, end: step.at + step.length, index: step.index })
    }
    for (const index of piece.parallel) {
      parallel.push({ at: piece.at, end: piece.at + piece.length, index })
    }
  }
  steps.sort((a, b) => a.at - b.at)
  parallel.sort((a, b) => a.at - b.at)
  return { steps, parallel }
}

/**
 * For each stretch [a, b] (ascending, consecutive), the member indexes of the spans it covers, sorted. One walk over
 * both sorted lists: a span covers a stretch when they overlap; a span of zero length covers the stretch it sits in.
 */
function coverBySections(
  spans: readonly Span[],
  bounds: readonly (readonly [number, number])[],
): number[][] {
  const result: number[][] = []
  let lo = 0
  for (const [a, b] of bounds) {
    // Spans that end before this stretch starts are never needed again
    while (lo < spans.length && (spans[lo]?.end ?? Infinity) < a) lo++
    const found: number[] = []
    for (let j = lo; j < spans.length; j++) {
      const span = spans[j]
      if (!span || span.at > b) break
      const overlaps = span.at < b && span.end > a
      const zeroInside = span.at === span.end && span.at >= a && span.at <= b
      if (overlaps || zeroInside) found.push(span.index)
    }
    result.push(uniqueSorted(found))
  }
  return result
}

/** Index list without repeats, sorted. A short list is sorted in place; a list of one or none is returned as it is. */
function uniqueSorted(list: number[]): number[] {
  if (list.length < 2) return list
  list.sort((x, y) => x - y)
  let write = 1
  for (let read = 1; read < list.length; read++) {
    if (list[read] !== list[write - 1]) list[write++] = list[read] ?? 0
  }
  list.length = write
  return list
}

/** Two sorted index lists, merged into one sorted list without repeats */
function mergeSorted(a: readonly number[], b: readonly number[]): number[] {
  if (b.length === 0) return [...a]
  if (a.length === 0) return [...b]
  return uniqueSorted([...a, ...b])
}

/** Where a member goes when no row or section shows it: its unplaced group. Null when a row or section shows it. */
function groupOf(info: MemberInfo, covered: ReadonlySet<number>): Group | undefined {
  switch (info.kind) {
    case 'unloaded':
      return 'unloaded'
    case 'subroute':
      return 'subroute'
    case 'other':
      return 'other'
    case 'point':
    case 'stop':
    case 'platform':
      return covered.has(info.index) ? undefined : 'points'
    case 'branch':
      return covered.has(info.index) ? undefined : 'detached'
    case 'main':
      return covered.has(info.index) ? undefined : 'main'
  }
}

/** The y below the last row, or 0 for no rows */
function nextY(rows: readonly OverviewRow[], rowHeight: number): number {
  const last = rows.at(-1)
  return last ? last.y + rowHeight : 0
}

/** The lookups the issues need, built once */
function issueContext(
  rows: readonly OverviewRow[],
  drafts: readonly Draft[],
  rowIndex: ReadonlyMap<string, number>,
): IssueContext {
  const gapRows: number[] = []
  const junctionRows: number[] = []
  const pointRow = new Map<number, number>()
  const placedRows = drafts.map((_, i) => i)
  const placedAt = drafts.map((draft) => draft.at)
  rows.forEach((row, i) => {
    if (i >= drafts.length) return
    if (row.kind === 'gap') gapRows.push(i)
    else if (row.kind === 'junction') junctionRows.push(i)
    else if (row.kind === 'point' || row.kind === 'stop' || row.kind === 'platform') {
      const member = row.members[0]
      if (member !== undefined) pointRow.set(member, i)
    }
  })
  return { rowIndex, pointRow, gapRows, junctionRows, placedRows, placedAt }
}

/** The row an issue attaches to, or undefined for the start row (the caller's fallback) */
function targetOf(
  issue: RouteIssue,
  analysis: RouteAnalysis,
  context: IssueContext,
): number | undefined {
  const first = issue.members[0]
  if (issue.code === 'not-loaded') return context.rowIndex.get('unplaced:unloaded')
  if (issue.code === 'unknown-role' && first !== undefined) {
    if (analysis.members[first]?.kind === 'other') return context.rowIndex.get('unplaced:other')
  }
  if (issue.code === 'branch-detached') {
    const row = context.rowIndex.get('unplaced:detached')
    if (row !== undefined) return row
  }
  if ((issue.code === 'point-far' || issue.code === 'out-of-sequence') && first !== undefined) {
    const row = context.pointRow.get(first)
    if (row !== undefined) return row
  }
  if (issue.at === undefined) return undefined

  const at = issue.at
  const candidates =
    issue.code === 'gap'
      ? context.gapRows
      : issue.code === 'junction-without-guidepost'
        ? context.junctionRows
        : undefined
  if (candidates) {
    const row = nearestRow(candidates, context.placedAt, at)
    if (row !== undefined) return row
  }
  return nearestRow(context.placedRows, context.placedAt, at)
}

/**
 * The row of `candidates` (row indexes, ascending by metre) nearest to `at`. A tie goes to the earlier row.
 * Binary search, so a row lookup costs log n.
 */
function nearestRow(
  candidates: readonly number[],
  placedAt: readonly number[],
  at: number,
): number | undefined {
  let lo = 0
  let hi = candidates.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((placedAt[candidates[mid] ?? 0] ?? 0) < at) lo = mid + 1
    else hi = mid
  }
  const after = candidates[lo]
  const before = candidates[lo - 1]
  if (after === undefined) return before
  if (before === undefined) return after
  const afterDistance = (placedAt[after] ?? 0) - at
  const beforeDistance = at - (placedAt[before] ?? 0)
  return beforeDistance <= afterDistance ? before : after
}
