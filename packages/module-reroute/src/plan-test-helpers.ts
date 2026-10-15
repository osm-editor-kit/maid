// Small graphs for the reroute tests: entities built with the model, no fixture and no network.
import {
  Graph,
  ModelContext,
  OsmNode,
  OsmRelation,
  OsmWay,
  type Action,
  type OsmRelationMember,
} from '@osm-editor-kit/maid-model'

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

/** A staging graph over the entities, as the editor's history holds: actions can be applied to it */
export function graphOf(entities: Array<OsmNode | OsmWay | OsmRelation>): Graph {
  return new Graph(new Graph(context, entities))
}

/** Runs the actions in order on the graph, as `editor.history.perform` does, and returns the result */
export function applyAll(graph: Graph, actions: Action[]): Graph {
  return actions.reduce<Graph>((g, action) => action(g), graph)
}

/** A member of a route relation, by id and type; `role` defaults to empty */
export function member(
  id: string,
  type: 'way' | 'node' | 'relation' = 'way',
  role = '',
): OsmRelationMember {
  return { id, type, role }
}
