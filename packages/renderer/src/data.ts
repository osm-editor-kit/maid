/**
 * The OSM data the renderer reads. The entities and the edit history live in the data model
 * (`@osm-editor-kit/maid-model`). This class adds what the feature builder needs on top: four
 * indexes keyed by entity id (`n123`, `w45`, `r6`), updated on every merge and on every edit
 * that changes which nodes a way has or which ways a multipolygon has.
 */
import {
  type Context,
  type Difference,
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
  ) {
    history.on('stagingchange', (difference) => this.reindex(difference))
  }
  /** How many times a node is used by ways. More than one means it is a junction. */
  nodeUses = new Map<string, number>()
  /** Ways that use a node, for rebuilding them when the node moves */
  nodeWays = new Map<string, string[]>()
  /** Nodes that are the first or last node of an unclosed way, with the number of such ways */
  endpoints = new Map<string, number>()
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

  /**
   * Keeps the indexes right after an edit, undo or redo. Only entities whose node or member list
   * changed cost anything; moving a node or changing a tag is skipped at the first comparison.
   */
  private reindex(difference: Difference) {
    for (const { base, head } of difference.changes.values()) {
      const from = base instanceof OsmWay ? base : undefined
      const to = head instanceof OsmWay ? head : undefined
      if ((from || to) && from?.nodes !== to?.nodes) {
        if (from) this.indexWay(from, -1)
        if (to) this.indexWay(to, 1)
        continue
      }
      const before =
        base instanceof OsmRelation && base.tags.type === 'multipolygon' ? base : undefined
      const after =
        head instanceof OsmRelation && head.tags.type === 'multipolygon' ? head : undefined
      if ((before || after) && before?.members !== after?.members) {
        if (before) this.indexMultipolygon(before, -1)
        if (after) this.indexMultipolygon(after, 1)
      }
    }
  }

  /** Ways per node, junctions and the ends of unclosed ways. `by` is 1 to add the way, -1 to take it out. */
  private indexWay(way: OsmWay, by: 1 | -1 = 1) {
    const { nodes } = way
    const closed = nodes.length > 1 && nodes[0] === nodes[nodes.length - 1]
    const last = closed ? nodes.length - 1 : nodes.length
    for (let i = 0; i < last; i++) {
      const id = nodes[i]
      if (id === undefined) continue
      count(this.nodeUses, id, by)
      list(this.nodeWays, id, way.id, by)
    }
    const first = nodes[0]
    const end = nodes[nodes.length - 1]
    if (!closed && first !== undefined && end !== undefined) {
      count(this.endpoints, first, by)
      count(this.endpoints, end, by)
    }
  }

  /** Multipolygons per member way */
  private indexMultipolygon(relation: OsmRelation, by: 1 | -1 = 1) {
    for (const m of relation.members) {
      if (m.type === 'way') list(this.wayMultipolygons, m.id, relation.id, by)
    }
  }
}

/** Counts a key up or down; a key at zero is removed, so `has` stays the question "is there one" */
function count(map: Map<string, number>, key: string, by: 1 | -1) {
  const next = (map.get(key) ?? 0) + by
  if (next > 0) map.set(key, next)
  else map.delete(key)
}

/** Adds a value to the list of a key, or takes one occurrence out; an empty list is removed */
function list(map: Map<string, string[]>, key: string, value: string, by: 1 | -1) {
  const values = map.get(key)
  if (by === 1) {
    if (values) values.push(value)
    else map.set(key, [value])
    return
  }
  const at = values?.indexOf(value) ?? -1
  if (!values || at < 0) return
  if (values.length === 1) map.delete(key)
  else values.splice(at, 1)
}
