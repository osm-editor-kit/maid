/**
 * The number of dwellings of a building, as the kaligrafy iD fork reads it (svg/tag_classes.js): the first of
 * `building:flats`, `flats` and `houses` that is set, when it is a number above 0. And the labels `FlatsOnMap` draws:
 * one point per building way with such a number, at the middle of its outline.
 */

/** The keys the fork reads, in the order Maid prefers them */
export const FLATS_KEYS = ['building:flats', 'flats', 'houses'] as const

type Tags = Readonly<Record<string, string | undefined>>

/** The number of dwellings, or undefined when the feature is no building or has no number above 0 */
export function flatsOf(tags: Tags): number | undefined {
  if (!tags.building || tags.building === 'no') return undefined
  for (const key of FLATS_KEYS) {
    const value = tags[key]
    if (value === undefined) continue
    const count = Number(value.trim())
    return Number.isInteger(count) && count > 0 ? count : undefined
  }
  return undefined
}

type GraphEntity = {
  readonly id: string
  readonly tags: Tags
  readonly nodes?: readonly string[]
  readonly loc?: readonly number[]
}
type Entities = { [Symbol.iterator](): Iterator<[string, GraphEntity | undefined]> }

/** The part of the model's graph this file reads; a structural type, so the tests can pass plain objects */
export type GraphLike = {
  readonly base: {
    readonly entities: Entities & {
      readonly size: number
      get(id: string): GraphEntity | undefined
    }
  }
  readonly local: { readonly entities: Entities }
  hasEntity(id: string): GraphEntity | undefined
  /** The ways a node is in (the model's Graph has it); without it a moved node does not move its building's label */
  parentWays?(entity: GraphEntity): readonly { readonly id: string }[]
}

export type FlatsLabel = { id: string; count: number; at: [number, number] }

type Lookup = (id: string) => GraphEntity | undefined

/** The label of one building way with a number of dwellings at the mean of its corners (the closing node once) */
function labelOf(
  id: string,
  entity: GraphEntity | undefined,
  lookup: Lookup,
): FlatsLabel | undefined {
  // a deleted entity is undefined in the local graph and hides the base one
  if (!entity?.nodes || entity.nodes.length < 4) return undefined
  const count = flatsOf(entity.tags)
  if (count === undefined) return undefined
  const nodes = entity.nodes
  const corners = nodes[0] === nodes[nodes.length - 1] ? nodes.length - 1 : nodes.length
  let x = 0
  let y = 0
  let n = 0
  for (let i = 0; i < corners; i++) {
    const loc = lookup(nodes[i]!)?.loc
    if (!loc || loc.length < 2) continue
    x += loc[0]!
    y += loc[1]!
    n++
  }
  return n > 0 ? { id, count, at: [x / n, y / n] } : undefined
}

/**
 * The labels of the base graph (the data as loaded), kept per base and its size: the base changes only when data is
 * loaded, and walking it costs about 25 ms on a dense scene, too much for every step of a drag.
 */
const baseCache = new WeakMap<object, { size: number; labels: FlatsLabel[] }>()

function baseLabels(graph: GraphLike): FlatsLabel[] {
  const entities = graph.base.entities
  const cached = baseCache.get(entities)
  if (cached && cached.size === entities.size) return cached.labels
  const lookup = (id: string) => entities.get(id)
  const labels: FlatsLabel[] = []
  for (const [id, entity] of entities) {
    const label = labelOf(id, entity, lookup)
    if (label) labels.push(label)
  }
  baseCache.set(entities, { size: entities.size, labels })
  return labels
}

/**
 * The building ways with a number of dwellings, each with the mean of its corners. The base's labels come from the
 * cache; what was changed here (the local graph), and the ways of a changed node, are measured again.
 */
export function flatsLabels(graph: GraphLike): FlatsLabel[] {
  const changed = new Set<string>()
  for (const [id, entity] of graph.local.entities) {
    changed.add(id)
    if (entity?.loc && graph.parentWays) {
      for (const way of graph.parentWays(entity)) changed.add(way.id)
    }
  }
  const labels = baseLabels(graph).filter((label) => !changed.has(label.id))
  const lookup = (id: string) => graph.hasEntity(id)
  for (const id of changed) {
    const label = labelOf(id, graph.hasEntity(id), lookup)
    if (label) labels.push(label)
  }
  return labels
}
