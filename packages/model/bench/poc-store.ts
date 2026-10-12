// The store of the proof of concept, kept here only as the baseline that the load benchmark compares against.

/**
 * In-memory OSM data. Deliberately small: enough to render and to measure.
 * (Evaluating @osm-editor-kit/osm-data as the store is an open step.)
 */
type Tags = Record<string, string>

export type OsmNode = { type: 'node'; id: number; lat: number; lon: number; tags?: Tags }
export type OsmWay = { type: 'way'; id: number; nodes: number[]; tags?: Tags }
export type OsmMember = { type: 'node' | 'way' | 'relation'; ref: number; role: string }
export type OsmRelation = { type: 'relation'; id: number; members: OsmMember[]; tags?: Tags }
export type OsmElement = OsmNode | OsmWay | OsmRelation

/** What a merge added. The feature builder only looks at these. */
export type MergeResult = { nodes: OsmNode[]; ways: OsmWay[]; relations: OsmRelation[] }

export class OsmStore {
  nodes = new Map<number, OsmNode>()
  ways = new Map<number, OsmWay>()
  relations = new Map<number, OsmRelation>()
  /** How many times a node is used by ways. More than one means it is a junction. */
  nodeUses = new Map<number, number>()
  /** Ways that use a node, for rebuilding them when the node moves */
  nodeWays = new Map<number, number[]>()
  /** Nodes that are the first or last node of an unclosed way */
  endpoints = new Set<number>()
  /** Multipolygon relations a way is a member of */
  wayMultipolygons = new Map<number, number[]>()

  merge(elements: OsmElement[]): MergeResult {
    const added: MergeResult = { nodes: [], ways: [], relations: [] }
    for (const el of elements) {
      if (el.type === 'node') {
        if (this.nodes.has(el.id)) continue
        this.nodes.set(el.id, el)
        added.nodes.push(el)
      } else if (el.type === 'way') {
        if (this.ways.has(el.id)) continue
        this.ways.set(el.id, el)
        added.ways.push(el)
        const { nodes } = el
        const closed = nodes.length > 1 && nodes[0] === nodes[nodes.length - 1]
        const last = closed ? nodes.length - 1 : nodes.length
        for (let i = 0; i < last; i++) {
          this.nodeUses.set(nodes[i]!, (this.nodeUses.get(nodes[i]!) ?? 0) + 1)
          const ways = this.nodeWays.get(nodes[i]!)
          if (ways) ways.push(el.id)
          else this.nodeWays.set(nodes[i]!, [el.id])
        }
        if (!closed && nodes.length > 0) {
          this.endpoints.add(nodes[0]!)
          this.endpoints.add(nodes[nodes.length - 1]!)
        }
      } else {
        if (this.relations.has(el.id)) continue
        this.relations.set(el.id, el)
        added.relations.push(el)
        if (el.tags?.type === 'multipolygon') {
          for (const m of el.members) {
            if (m.type !== 'way') continue
            const list = this.wayMultipolygons.get(m.ref)
            if (list) list.push(el.id)
            else this.wayMultipolygons.set(m.ref, [el.id])
          }
        }
      }
    }
    return added
  }

  counts() {
    return { nodes: this.nodes.size, ways: this.ways.size, relations: this.relations.size }
  }
}
