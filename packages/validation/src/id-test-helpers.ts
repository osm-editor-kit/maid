// Helpers for the tests adopted from iD's test/spec/validations (see the *.id.test.ts files).
// They build graphs by hand, like validation.test.ts does, and run one rule the way iD's spec
// helper `validate()` does: on each changed entity, keeping every issue it returns.
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import type { Issue, Rule } from './types.ts'
import { runContext } from './validator.ts'

const context = new ModelContext()

export function node(id: string, lon: number, lat: number, tags: Record<string, string> = {}) {
  return new OsmNode(context, { id, loc: [lon, lat], tags })
}

export function way(id: string, nodes: string[], tags: Record<string, string> = {}) {
  return new OsmWay(context, { id, nodes, tags })
}

export function relation(
  id: string,
  members: { id: string; type: 'node' | 'way' | 'relation'; role: string }[],
  tags: Record<string, string>,
) {
  return new OsmRelation(context, { id, members, tags })
}

export function graphOf(...entities: OsmEntity[]): Graph {
  return new Graph(context, entities)
}

/** A graph and the ids of the entities a test "changed", in the order iD's spec creates them */
export type Scene = { graph: Graph; ids: string[] }

/**
 * iD's spec `validate()`: runs the rule on each changed entity, one by one, and returns every
 * issue it gives. Unlike the validator, this does not merge issues with the same id, which is what
 * the iD expectations count.
 */
export function validateChanged(rule: Rule, graph: Graph, ids: readonly string[]): Issue[] {
  const targets = new Set(ids)
  const ways: OsmWay[] = []
  for (const id of ids) {
    const entity = graph.hasEntity(id)
    if (entity instanceof OsmWay) ways.push(entity)
  }
  const ruleContext = runContext(graph, ways, targets)
  const issues: Issue[] = []
  for (const id of ids) {
    const entity = graph.hasEntity(id)
    if (entity) issues.push(...rule.validate(entity, ruleContext))
  }
  return issues
}

/** The data of an issue, as the tests read it. Tests fail when a rule leaves it out. */
export function dataOf(issue: Issue | undefined): Readonly<Record<string, unknown>> {
  if (!issue?.data) throw new Error(`${issue?.id ?? 'issue'} has no data`)
  return issue.data
}
