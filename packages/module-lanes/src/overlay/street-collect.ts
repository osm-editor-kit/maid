/**
 * The street drawing of the editor's graph, kept up to date with little work per change.
 *
 * The first call draws every lane road of the graph. Later calls find the ways that changed (a new way object, a way
 * gone, or a moved node: a new node object) and draw only around them: a way's pieces depend on the junctions at its
 * nodes, and a junction on every way at its node, so the ways at the nodes of the changed ways are drawn again, and
 * the junctions at those nodes. A junction of several nodes close together (`StreetJunction.nodeIds`) is drawn again
 * as a whole, with every way at one of its nodes: the nodes drawn again are widened to whole junctions, those of the
 * kept drawing and those of the new one. Context is two rings of ways round the ways drawn again: one for the
 * junctions at their far ends, one more because whether a node there is a junction (three roads or more) decides
 * whether it belongs to a junction of several nodes. Their features replace the kept ones; everything else is kept.
 */
import { isLaneRoad } from '../roads.ts'
import {
  collect,
  streetOf,
  streetParts,
  type StreetCollections,
  type StreetEntity,
  type StreetParts,
} from './street.ts'

export type StreetGraph = {
  readonly base: { readonly entities: ReadonlyMap<string, StreetEntity | undefined> }
  readonly local: { readonly entities: ReadonlyMap<string, StreetEntity | undefined> }
  hasEntity(id: string): StreetEntity | undefined
}

/** Above this many changed ways the whole graph is drawn again (a load, a large undo) */
const FULL_REDRAW = 400

type Kept = { entity: StreetEntity; nodes: (StreetEntity | undefined)[] }

function isStreetWay(entity: StreetEntity): boolean {
  return (
    entity.id.startsWith('w') &&
    entity.nodes !== undefined &&
    isLaneRoad(entity.tags) &&
    entity.tags.area !== 'yes'
  )
}

/** The lane roads of the graph: the base's, with the edits' over them (an undefined edit deletes) */
function laneWays(graph: StreetGraph): Map<string, StreetEntity> {
  const ways = new Map<string, StreetEntity>()
  for (const [id, entity] of graph.base.entities) {
    if (!id.startsWith('w') || graph.local.entities.has(id)) continue
    if (entity && isStreetWay(entity)) ways.set(id, entity)
  }
  for (const [id, entity] of graph.local.entities) {
    if (id.startsWith('w') && entity && isStreetWay(entity)) ways.set(id, entity)
  }
  return ways
}

const sameNodes = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((x, i) => x === b[i])

export function streetCollector() {
  let kept = new Map<string, Kept>()
  let byWay = new Map<string, StreetParts>()
  let byNode = new Map<string, StreetParts>()
  let last: StreetCollections | undefined
  /** The nodes of each junction of several nodes in the kept drawing, by each of its nodes */
  let groupAt = new Map<string, readonly string[]>()
  /** One frame for every drawing of this collector, so a part drawn again agrees with the rest */
  let origin: [number, number] | undefined

  /** The ways at each node */
  const waysAtNodes = (ways: ReadonlyMap<string, Kept>) => {
    const at = new Map<string, string[]>()
    for (const [id, { entity }] of ways) {
      for (const node of entity.nodes ?? []) {
        const list = at.get(node)
        if (list) list.push(id)
        else at.set(node, [id])
      }
    }
    return at
  }

  function full(graph: StreetGraph, ways: Map<string, StreetEntity>) {
    if (!origin) {
      for (const way of ways.values()) {
        const loc = graph.hasEntity(way.nodes?.[0] ?? '')?.loc
        if (loc && loc.length >= 2) {
          origin = [loc[0]!, loc[1]!]
          break
        }
      }
    }
    const { geometry, assumed } = streetOf(ways.values(), (id) => graph.hasEntity(id), origin)
    const parts = streetParts(geometry, assumed)
    byWay = parts.byWay
    byNode = parts.byNode
    groupAt = new Map()
    for (const junction of geometry.junctions)
      for (const node of junction.nodeIds ?? []) groupAt.set(node, junction.nodeIds!)
  }

  return {
    /** The drawing of the graph; the same object as last time when nothing it draws changed */
    update(graph: StreetGraph): StreetCollections {
      const ways = laneWays(graph)
      const now = new Map<string, Kept>()
      const dirty = new Set<string>()
      for (const [id, entity] of ways) {
        const nodes = (entity.nodes ?? []).map((node) => graph.hasEntity(node))
        const before = kept.get(id)
        now.set(
          id,
          before && before.entity === entity && sameNodes(before.nodes, nodes)
            ? before
            : { entity, nodes },
        )
        if (!before || before.entity !== entity || !sameNodes(before.nodes, nodes)) dirty.add(id)
      }
      for (const id of kept.keys()) if (!ways.has(id)) dirty.add(id)

      if (last && dirty.size === 0) return last
      if (!last || dirty.size > FULL_REDRAW) {
        full(graph, ways)
      } else {
        const atNow = waysAtNodes(now)
        const atBefore = waysAtNodes(kept)
        const neighbours = (ids: Iterable<string>) => {
          const out = new Set<string>()
          for (const id of ids) {
            out.add(id)
            for (const source of [kept.get(id), now.get(id)]) {
              for (const node of source?.entity.nodes ?? []) {
                for (const other of atNow.get(node) ?? []) out.add(other)
                for (const other of atBefore.get(node) ?? []) out.add(other)
              }
            }
          }
          return out
        }
        const waysAt = (node: string) => [...(atNow.get(node) ?? []), ...(atBefore.get(node) ?? [])]
        // the nodes whose junctions are drawn again: those of the changed ways, widened to whole junctions
        const nodes = new Set<string>()
        const widen = (node: string) => {
          if (nodes.has(node)) return
          nodes.add(node)
          for (const member of groupAt.get(node) ?? []) nodes.add(member)
        }
        for (const id of dirty) {
          for (const source of [kept.get(id), now.get(id)])
            for (const node of source?.entity.nodes ?? []) widen(node)
        }
        let done = false
        for (let pass = 0; pass < 4 && !done; pass++) {
          const redrawn = new Set<string>(dirty)
          for (const node of nodes) for (const id of waysAt(node)) redrawn.add(id)
          const context = neighbours(neighbours(redrawn))
          const input = [...context].flatMap((id) => {
            const way = ways.get(id)
            return way ? [way] : []
          })
          const { geometry, assumed } = streetOf(input, (id) => graph.hasEntity(id), origin)
          // a junction of the new drawing that reaches beyond the nodes drawn again: once more, with all of it
          done = true
          for (const junction of geometry.junctions) {
            const members = junction.nodeIds
            if (!members || !members.some((node) => nodes.has(node))) continue
            for (const node of members) {
              if (nodes.has(node)) continue
              done = false
              widen(node)
            }
          }
          if (!done) continue
          const parts = streetParts(geometry, assumed)
          for (const id of redrawn) {
            const fresh = parts.byWay.get(id)
            if (fresh && ways.has(id)) byWay.set(id, fresh)
            else byWay.delete(id)
          }
          for (const node of nodes) {
            const fresh = parts.byNode.get(node)
            if (fresh) byNode.set(node, fresh)
            else byNode.delete(node)
            groupAt.delete(node)
          }
          for (const junction of geometry.junctions) {
            if (!junction.nodeIds || !nodes.has(junction.nodeId)) continue
            for (const node of junction.nodeIds) groupAt.set(node, junction.nodeIds)
          }
        }
        // (junctions that keep growing: a chain of close junctions longer than the passes)
        if (!done) full(graph, ways)
      }
      kept = now
      last = collect([byNode.values(), byWay.values()])
      return last
    },
  }
}
