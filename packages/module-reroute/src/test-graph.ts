// Small graphs for the tests: entities built with the model, no fixture and no network (as packages/routing does).
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmRelationMember } from '@osm-editor-kit/maid-model'

const context = new ModelContext()

export function node(id: string, lon: number, lat: number): OsmNode {
  return new OsmNode(context, { id, loc: [lon, lat] })
}

export function way(id: string, nodes: string[], tags: Record<string, string> = {}): OsmWay {
  return new OsmWay(context, { id, nodes, tags })
}

export function relation(
  id: string,
  members: OsmRelationMember[],
  tags: Record<string, string> = {},
): OsmRelation {
  return new OsmRelation(context, { id, members, tags })
}

export function graphOf(entities: Array<OsmNode | OsmWay | OsmRelation>): Graph {
  return new Graph(context, entities)
}
