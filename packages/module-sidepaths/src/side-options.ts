/**
 * Which separate ways on one side of a road are meant: the pieces of one sidewalk all are, but two sidewalks that run
 * along the same stretch of the road (a footway beside the kerb and one along the houses) are alternatives the mapper
 * picks from. The edit menu offers each alternative in a flyout ("Tags to left sidewalk" › "4 m from the road").
 */
import type { Graph } from '@osm-editor-kit/maid-model'
import { type SeparateWayDetails, separateWayDetails } from './find.ts'
import type { Side, SidePrefix } from './side-tags.ts'

/**
 * Two sidewalks are alternatives when they run along this much of the same stretch of road, or along half of the
 * longer one on a short road. A corner piece of the side street's sidewalk overlaps a few metres: no alternative.
 */
const OVERLAP_METRES = 10

/** The ways that get one side's tags, and how far from the road the picked sidewalk runs */
export type SideOption = {
  /** Its id in the choice: the way ids, joined */
  key: string
  ways: SeparateWayDetails[]
  /** Metres from the road of the sidewalk this option is about (the nearest piece when there is no choice) */
  distance: number
  /** Metres along the road it covers */
  length: number
}

/** The pieces of one sidewalk: ways joined end to end, with the stretch of road they run along */
type Chain = { ways: SeparateWayDetails[]; from: number; to: number; distance: number }

function chainsOf(ways: readonly SeparateWayDetails[]): Chain[] {
  // union-find on shared end nodes
  const parent = ways.map((_, i) => i)
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)))
  const byNode = new Map<string, number>()
  ways.forEach((way, i) => {
    for (const node of way.ends) {
      const other = byNode.get(node)
      if (other === undefined) byNode.set(node, i)
      else parent[root(i)] = root(other)
    }
  })
  const groups = new Map<number, SeparateWayDetails[]>()
  ways.forEach((way, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), way]))
  return [...groups.values()].map((members) => ({
    ways: members,
    from: Math.min(...members.map((way) => way.from)),
    to: Math.max(...members.map((way) => way.to)),
    distance: Math.min(...members.map((way) => way.distance)),
  }))
}

/** Whether two chains run along the same stretch of road: then they are two sidewalks, not two pieces of one */
function overlaps(a: Chain, b: Chain) {
  const shared = Math.min(a.to, b.to) - Math.max(a.from, b.from)
  const longer = Math.max(a.to - a.from, b.to - b.from)
  return shared > 0 && shared >= Math.min(OVERLAP_METRES, longer / 2)
}

function optionOf(chains: readonly Chain[], about: Chain): SideOption {
  const ways = chains.flatMap((chain) => chain.ways).sort((a, b) => a.id.localeCompare(b.id))
  return {
    key: ways.map((way) => way.id).join('+'),
    ways,
    distance: about.distance,
    length: about.to - about.from,
  }
}

/**
 * The options for one side, nearest sidewalk first. One option (or none, without a separate way) when no two
 * sidewalks run along the same stretch: then all found ways get the tags, as before. Otherwise one option per sidewalk
 * that has a rival: that sidewalk, plus the other pieces along the road that are no rival of it (nearest first).
 */
export function sideOptions(
  graph: Graph,
  roadId: string,
  prefix: SidePrefix,
  side: Side,
): SideOption[] {
  const chains = chainsOf(separateWayDetails(graph, roadId, prefix, side)).sort(
    (a, b) => a.distance - b.distance,
  )
  if (chains.length === 0) return []
  const rivals = chains.filter((chain) =>
    chains.some((other) => other !== chain && overlaps(chain, other)),
  )
  if (rivals.length === 0) return [optionOf(chains, chains[0]!)]
  const options = rivals.map((picked) => {
    const taken = [picked]
    for (const chain of chains)
      if (!taken.includes(chain) && !taken.some((other) => overlaps(chain, other)))
        taken.push(chain)
    return optionOf(taken, picked)
  })
  // two rivals can give the same ways (each with its own pieces): keep the first
  return options.filter((option, i) => options.findIndex((other) => other.key === option.key) === i)
}
