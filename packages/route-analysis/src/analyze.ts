import { buildChain } from './chain/chain.ts'
import { buildBranches } from './place/branches.ts'
import { collectIssues } from './place/issues.ts'
import { findJunctions } from './place/junctions.ts'
import { lineIndex } from './place/line-index.ts'
import { placePoints } from './place/points.ts'
import { classifyMembers } from './roles.ts'
import type { AnalysisOptions, RouteAnalysis, RouteInput } from './types.ts'

/**
 * The whole analysis of one route relation: every member classified, the main line chained from the geometry
 * (relation order where it joins), points placed on it, side lines, junctions with the loaded network and the issues
 * with their places. Pure: the same input gives the same result, and it touches nothing outside.
 */
export function analyzeRoute(input: RouteInput, options: AnalysisOptions = {}): RouteAnalysis {
  const members = classifyMembers(input)
  const chain = buildChain(input, members)
  const index = lineIndex(input, chain)
  const points = placePoints(input, members, chain, index, options)
  const branches = buildBranches(input, members, chain, index)
  const junctions = findJunctions(input, members, chain, index, points, options)
  const issues = collectIssues(input, members, chain, points, branches, junctions, options)
  return { members, chain, points, branches, junctions, issues }
}
