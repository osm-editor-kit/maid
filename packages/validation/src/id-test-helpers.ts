// Helpers for the tests adopted from iD's test/spec/validations (see the *.id.test.ts files).
// They build graphs by hand, like validation.test.ts does, and run one rule the way iD's spec
// helper `validate()` does: on each changed entity, keeping every issue it returns.
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import type { Issue, PresetLookup, RelationRoles, Rule } from './types.ts'
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

export function graphOf(...entities: OsmEntity[]) {
  return new Graph(context, entities)
}

/** A graph and the ids of the entities a test "changed", in the order iD's spec creates them */
export type Scene = { graph: Graph; ids: string[] }

/**
 * iD's spec `validate()`: runs the rule on each changed entity, one by one, and returns every
 * issue it gives. Unlike the validator, this does not merge issues with the same id, which is what
 * the iD expectations count.
 */
export function validateChanged(
  rule: Rule,
  graph: Graph,
  ids: readonly string[],
  presets?: PresetLookup,
) {
  const targets = new Set(ids)
  const ways: OsmWay[] = []
  for (const id of ids) {
    const entity = graph.hasEntity(id)
    if (entity instanceof OsmWay) ways.push(entity)
  }
  const ruleContext = runContext(graph, ways, targets, presets)
  const issues: Issue[] = []
  for (const id of ids) {
    const entity = graph.hasEntity(id)
    if (entity) issues.push(...rule.validate(entity, ruleContext))
  }
  return issues
}

/** The data of an issue, as the tests read it. Tests fail when a rule leaves it out. */
export function dataOf(issue: Issue | undefined) {
  if (!issue?.data) throw new Error(`${issue?.id ?? 'issue'} has no data`)
  return issue.data
}

/**
 * A PresetLookup with the relation schema only: `roles` gives the roles of a relation with these tags. The other
 * methods throw, which is right for the rules that read nothing but the schema (missing_role, relation_members).
 */
export function schemaPresets(
  roles: (tags: Readonly<Record<string, string>>) => RelationRoles,
  allowsDuplicates = true,
): PresetLookup {
  const unused = (): never => {
    throw new Error('this preset lookup has the relation schema only')
  }
  return {
    match: unused,
    preset: unused,
    applyPreset: unused,
    deprecatedTags: unused,
    relationRoles: (tags) => roles(tags),
    allowsDuplicateMembers: () => allowsDuplicates,
    // the presets filter by geometry and by tag patterns, and tested there; the stub does the same for simple patterns:
    // a key with `*` must be present, any other value must be equal. An undefined geometry or tags skips that filter.
    memberRoles: (relationTags, geometry, memberTags) =>
      Object.fromEntries(
        Object.entries(roles(relationTags)).filter(
          ([, { member }]) =>
            (geometry === undefined || !member.geometry || member.geometry.includes(geometry)) &&
            (memberTags === undefined ||
              !member.matchTags ||
              member.matchTags.some((pattern) =>
                Object.entries(pattern).every(
                  ([key, value]) =>
                    Object.hasOwn(memberTags, key) &&
                    (value === '*' ? memberTags[key] !== '' : memberTags[key] === value),
                ),
              )),
        ),
      ),
  }
}

/** The issues with one entry per id, as the validator keeps them (iD's spec counts each finding, the validator once) */
export function uniqueById(issues: readonly Issue[]): Issue[] {
  return [...new Map(issues.map((issue) => [issue.id, issue])).values()]
}
