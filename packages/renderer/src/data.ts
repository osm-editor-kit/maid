/**
 * The OSM data the renderer reads. The entities and the edit history live in the data model
 * (`@osm-editor-kit/maid-model`). This class adds what the feature builder needs on top: four
 * indexes keyed by entity id (`n123`, `w45`, `r6`), updated on every merge.
 */
import {
  type Context,
  type EditHistory,
  entitiesFromOsmJson,
  OsmNode,
  OsmRelation,
  OsmWay,
  type OsmJsonElement,
} from '@osm-editor-kit/maid-model'

/** What a merge added. The feature builder only looks at these. */
export type MergeResult = { nodes: OsmNode[]; ways: OsmWay[]; relations: OsmRelation[] }

export class OsmData {
  /**
   * The editor's context and edit history (maid-core owns them). `history.staging.graph` is the
   * current state; entities are never changed in place.
   */
  constructor(
    readonly context: Context,
    readonly history: EditHistory,
  ) {}
  /** How many times a node is used by ways. More than one means it is a junction. */
  nodeUses = new Map<string, number>()
  /** Ways that use a node, for rebuilding them when the node moves */
  nodeWays = new Map<string, string[]>()
  /** Nodes that are the first or last node of an unclosed way */
  endpoints = new Set<string>()
  /** Multipolygon relations a way is a member of */
  wayMultipolygons = new Map<string, string[]>()
  /** Entities loaded so far, by type */
  private loaded = { nodes: 0, ways: 0, relations: 0 }

  node(id: string): OsmNode | undefined {
    const entity = this.history.staging.graph.hasEntity(id)
    return entity instanceof OsmNode ? entity : undefined
  }

  way(id: string): OsmWay | undefined {
    const entity = this.history.staging.graph.hasEntity(id)
    return entity instanceof OsmWay ? entity : undefined
  }

  relation(id: string): OsmRelation | undefined {
    const entity = this.history.staging.graph.hasEntity(id)
    return entity instanceof OsmRelation ? entity : undefined
  }

  /**
   * Adds the elements of one OSM API response. Entities that are loaded already are skipped.
   * Returns what was added, which is all the feature builder needs.
   */
  merge(elements: OsmJsonElement[]): MergeResult {
    const { graph } = this.history.staging
    const fresh = entitiesFromOsmJson(
      this.context,
      elements,
      (id) => graph.hasEntity(id) !== undefined,
    )
    const added: MergeResult = { nodes: [], ways: [], relations: [] }
    if (fresh.length === 0) return added
    this.history.merge(fresh)
    for (const entity of fresh) {
      if (entity instanceof OsmNode) {
        added.nodes.push(entity)
      } else if (entity instanceof OsmWay) {
        added.ways.push(entity)
        this.indexWay(entity)
      } else if (entity instanceof OsmRelation) {
        added.relations.push(entity)
        if (entity.tags.type === 'multipolygon') this.indexMultipolygon(entity)
      }
    }
    this.loaded.nodes += added.nodes.length
    this.loaded.ways += added.ways.length
    this.loaded.relations += added.relations.length
    return added
  }

  counts() {
    return { ...this.loaded }
  }

  /** Ways per node, junctions and the ends of unclosed ways */
  private indexWay(way: OsmWay) {
    const { nodes } = way
    const closed = nodes.length > 1 && nodes[0] === nodes[nodes.length - 1]
    const last = closed ? nodes.length - 1 : nodes.length
    for (let i = 0; i < last; i++) {
      const id = nodes[i]
      if (id === undefined) continue
      this.nodeUses.set(id, (this.nodeUses.get(id) ?? 0) + 1)
      const ways = this.nodeWays.get(id)
      if (ways) ways.push(way.id)
      else this.nodeWays.set(id, [way.id])
    }
    const first = nodes[0]
    const end = nodes[nodes.length - 1]
    if (!closed && first !== undefined && end !== undefined) {
      this.endpoints.add(first)
      this.endpoints.add(end)
    }
  }

  /** Multipolygons per member way */
  private indexMultipolygon(relation: OsmRelation) {
    for (const m of relation.members) {
      if (m.type !== 'way') continue
      const list = this.wayMultipolygons.get(m.id)
      if (list) list.push(relation.id)
      else this.wayMultipolygons.set(m.id, [relation.id])
    }
  }
}
