/**
 * The bicycle infrastructure features of every loaded way, from the editor's graph. Pure apart from its caches. A copy of
 * the parking module's collector (packages/module-parking/src/lens/collect.ts), with one variant and ways only: a module
 * does not import another module.
 *
 * Cost. The loaded data (the graph's base) is walked once, and again only for what a later load adds; the features of
 * its ways are kept. A change of the graph (an edit, a drag step, undo) then costs the edited entities only: the
 * entities in the graph's local part and the ways that use an edited node are built again, everything else is the
 * kept feature. When that gives the same features as the last call, the same collection object is returned, so the
 * map source is not set again for an edit that touches no bicycle infrastructure.
 * Measured headless (bun, 2026-11-11), the features of every highway: dense fixture 20,896 ways, 944 features, 70 to
 * 77 ms; medium 8,879 ways, 636 features, 45 to 65 ms. A pass after an edit costs the edited ways only.
 */
import type { Feature, FeatureCollection } from 'geojson'
import { bikeWayFeatures, type BikeWay } from './features.ts'

/** What the collector reads of an entity: the model's entities have this shape (a way has `nodes`, a node `loc`) */
export type GraphEntity = {
  readonly id: string
  readonly tags: Readonly<Record<string, string | undefined>>
  readonly nodes?: readonly string[]
  readonly loc?: readonly [number, number]
}

type Entities = ReadonlyMap<string, GraphEntity | undefined>

/** The part of the model's Graph that the collector reads (`editor.history.staging.graph`) */
export type GraphLike = {
  /** The loaded data, shared by every graph of the history; a load adds entities to it */
  readonly base: { readonly entities: Entities }
  /** What the edits changed: an entry replaces the base entity of the same id, an undefined entry deletes it */
  readonly local: { readonly entities: Entities }
  hasEntity(id: string): GraphEntity | undefined
  /** The ways that use a node */
  parentWays(entity: GraphEntity): readonly GraphEntity[]
}

/** The features of the loaded data, by way id; only ways that have features are in it */
type BaseIndex = {
  /** How many entries of the base were read. A Map keeps insertion order, so a load's entities come after them. */
  read: number
  features: Map<string, Feature[]>
  /** The last result: returned again when a call gives the same features */
  last?: FeatureCollection
}

/** Per base (the Map object of its entities) */
const bases = new WeakMap<Entities, BaseIndex>()

/** Per edited way: the node entities it was built from, and the features built from them */
const edited = new WeakMap<
  GraphEntity,
  { refs: readonly (GraphEntity | undefined)[]; features: Feature[] }
>()

function sameItems(a: readonly unknown[], b: readonly unknown[]) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** The features of one way, with its nodes looked up by `nodeOf`; none for a node or a way without `highway` */
function featuresOf(
  entity: GraphEntity,
  nodeOf: (id: string) => GraphEntity | undefined,
): Feature[] {
  if (entity.nodes === undefined || entity.tags.highway === undefined) return []
  const coordinates: [number, number][] = []
  for (const id of entity.nodes) {
    const loc = nodeOf(id)?.loc
    if (loc) coordinates.push([loc[0], loc[1]])
  }
  const way: BikeWay = { id: entity.id, tags: entity.tags, coordinates }
  return bikeWayFeatures(way)
}

/** The index of the base, brought up to date with what was loaded since the last call */
function baseIndex(base: Entities): BaseIndex {
  let index = bases.get(base)
  if (!index) bases.set(base, (index = { read: 0, features: new Map() }))
  if (index.read === base.size) return index
  let position = 0
  for (const entity of base.values()) {
    if (position++ < index.read || !entity) continue
    const features = featuresOf(entity, (id) => base.get(id))
    if (features.length > 0) index.features.set(entity.id, features)
  }
  index.read = base.size
  index.last = undefined
  return index
}

/** The bicycle infrastructure of every loaded way, as one collection */
export function bikeCollection(graph: GraphLike): FeatureCollection {
  const index = baseIndex(graph.base.entities)

  // what the edits touch: the edited entities, and the ways that use an edited node (its position is theirs)
  const touched = new Map<string, GraphEntity | undefined>()
  for (const [id, entity] of graph.local.entities) {
    touched.set(id, entity)
    if (entity && entity.nodes === undefined)
      for (const way of graph.parentWays(entity)) touched.set(way.id, way)
  }

  const features: Feature[] = []
  for (const [id, kept] of index.features) {
    if (!touched.has(id)) for (const feature of kept) features.push(feature)
  }
  for (const entity of touched.values()) {
    if (!entity) continue
    // an edited way keeps its features while it and its nodes are the same entities: a drag step rebuilds one way
    const refs = entity.nodes?.map((id) => graph.hasEntity(id)) ?? []
    let entry = edited.get(entity)
    if (!entry || !sameItems(entry.refs, refs)) {
      entry = { refs, features: featuresOf(entity, (id) => graph.hasEntity(id)) }
      edited.set(entity, entry)
    }
    for (const feature of entry.features) features.push(feature)
  }

  if (index.last && sameItems(index.last.features, features)) return index.last
  index.last = { type: 'FeatureCollection', features }
  return index.last
}
