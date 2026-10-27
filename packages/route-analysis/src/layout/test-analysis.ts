// Small RouteAnalysis objects for the layout tests, built by hand: no input data and no network.
import type {
  Branch,
  Chain,
  ChainStep,
  Gap,
  IssueCode,
  Junction,
  MemberInfo,
  MemberKind,
  MemberType,
  Piece,
  PlacedPoint,
  PointKind,
  RouteAnalysis,
  RouteIssue,
} from '../types.ts'

/** A member as the classifier gives it: nodes for points and stops, relations for sub-routes, ways for the rest */
export function member(index: number, kind: MemberKind, pointKind?: PointKind): MemberInfo {
  const type: MemberType =
    kind === 'point' || kind === 'stop' ? 'node' : kind === 'subroute' ? 'relation' : 'way'
  const info: MemberInfo = {
    index,
    member: { type, id: `${type[0]}${index}`, role: '' },
    kind,
    knownRole: true,
  }
  if (pointKind) info.pointKind = pointKind
  return info
}

/**
 * A chain from pieces. Each piece is a list of [member index, metres]. A gap follows each piece listed in `gapAfter`
 * (gaps count as zero metres). `parallel` maps a piece number to the member indexes of its parallel strands.
 */
export function chainOf(
  pieces: [number, number][][],
  gapAfter: number[] = [],
  parallel: Record<number, number[]> = {},
): Chain {
  const out: Piece[] = []
  const gaps: Gap[] = []
  let at = 0
  pieces.forEach((ways, p) => {
    const pieceAt = at
    const steps: ChainStep[] = []
    for (const [index, length] of ways) {
      steps.push({
        index,
        wayId: `w${index}`,
        reversed: false,
        from: `n${index}a`,
        to: `n${index}b`,
        length,
        at,
      })
      at += length
    }
    out.push({ steps, at: pieceAt, length: at - pieceAt, parallel: parallel[p] ?? [] })
    if (gapAfter.includes(p) && p + 1 < pieces.length) {
      gaps.push({ after: p, from: `gap${p}a`, to: `gap${p}b`, distance: 30, at })
    }
  })
  return {
    pieces: out,
    linear: gaps.length > 0 ? 'no' : 'yes',
    gaps,
    length: at,
    sortedOrder: [],
  }
}

/** A placed point; without `at` it is not on the line */
export function point(index: number, at?: number): PlacedPoint {
  return at === undefined ? { index, outOfSequence: false } : { index, at, outOfSequence: false }
}

/** A side line; without `from` it touches the line nowhere */
export function branch(role: string, indexes: number[], from?: number, to?: number): Branch {
  const length = from === undefined ? 0 : Math.abs((to ?? from) - from)
  return { role, indexes, from, to, length }
}

/** A junction where other ways meet the line */
export function junction(node: string, at: number, guidepost?: number): Junction {
  return guidepost === undefined ? { node, at, outside: 2 } : { node, at, outside: 2, guidepost }
}

/** An issue; without `at` it has no place on the line */
export function issue(code: IssueCode, members: number[], at?: number): RouteIssue {
  return at === undefined
    ? { code, severity: 'warning', members }
    : { code, severity: 'warning', members, at }
}

const EMPTY_CHAIN: Chain = { pieces: [], linear: 'empty', gaps: [], length: 0, sortedOrder: [] }

/** A whole analysis; the parts not given are empty */
export function analysisOf(
  parts: { members: MemberInfo[] } & Partial<RouteAnalysis>,
): RouteAnalysis {
  return {
    chain: EMPTY_CHAIN,
    points: [],
    branches: [],
    junctions: [],
    issues: [],
    ...parts,
  }
}
