import { distance } from '../geo.ts'
import type { Branch, Chain, LonLat, MemberInfo, RouteInput } from '../types.ts'
import type { LineIndex } from './line-index.ts'

/** A run of branch ways being collected: the last way's ends decide whether the next way joins it */
type Run = {
  role: string
  indexes: number[]
  length: number
  /** The end nodes of the last way added */
  ends: readonly [string, string]
  /** Smallest and largest metres along the line of the run's nodes on the main line */
  from?: number
  to?: number
}

/**
 * Groups the branch members (kind `branch`) into branches. Consecutive members of the relation join one run when they
 * have the same role and their ways share an end node. A branch's `from` and `to` are the smallest and largest metres
 * along the line of its nodes that lie on the main line; neither is set when none does.
 */
export function buildBranches(
  input: RouteInput,
  members: readonly MemberInfo[],
  _chain: Chain,
  index: LineIndex,
): Branch[] {
  const out: Branch[] = []
  let run: Run | undefined
  for (const info of members) {
    const way = info.kind === 'branch' ? input.ways.get(info.member.id) : undefined
    if (!way || way.length === 0) {
      if (run) out.push(finish(run))
      run = undefined
      continue
    }
    const role = info.member.role.trim()
    const ends: readonly [string, string] = [way[0] ?? '', way[way.length - 1] ?? '']
    if (run && run.role === role && sharesEnd(run.ends, ends)) {
      run.indexes.push(info.index)
      run.length += wayLength(input, way)
      run.ends = ends
    } else {
      if (run) out.push(finish(run))
      run = { role, indexes: [info.index], length: wayLength(input, way), ends }
    }
    extend(run, way, index)
  }
  if (run) out.push(finish(run))
  return out
}

/** Adds the main-line places of a way's nodes to the run's range */
function extend(run: Run, way: readonly string[], index: LineIndex) {
  for (const id of way) {
    const at = index.atOfNode.get(id)
    if (at === undefined) continue
    run.from = run.from === undefined ? at : Math.min(run.from, at)
    run.to = run.to === undefined ? at : Math.max(run.to, at)
  }
}

function finish(run: Run): Branch {
  const branch: Branch = { role: run.role, indexes: run.indexes, length: run.length }
  if (run.from !== undefined) branch.from = run.from
  if (run.to !== undefined) branch.to = run.to
  return branch
}

function sharesEnd(a: readonly [string, string], b: readonly [string, string]): boolean {
  return a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]
}

/** Metres along a way; nodes without a loaded position add nothing */
function wayLength(input: RouteInput, way: readonly string[]): number {
  let total = 0
  let prev: LonLat | undefined
  for (const id of way) {
    const pos = input.nodes.get(id)
    if (!pos) continue
    if (prev) total += distance(prev, pos)
    prev = pos
  }
  return total
}
