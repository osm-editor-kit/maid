// What blocks Merge, as a table for the box beside the edit menu (`Operation.details`): the tags and the relations of
// the selected features side by side, the rows that block first. iD only says the sentence; the table is Maid's.
import { OsmWay, osmJoinWays } from '@osm-editor-kit/maid-model'
import type { Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import type { OperationContext, OperationDetails } from './types.ts'

type Row = OperationDetails['rows'][number]

/** A feature's short label for a column header: its name, else its preset's name, else its kind */
function labelOf(entity: OsmEntity, graph: Graph, context: OperationContext): string {
  const name = entity.tags.name ?? entity.tags.ref
  if (name) return name
  const preset = context.presetOf?.(entity, graph)
  if (preset) return preset.name
  return entity.type === 'way' ? 'Way' : entity.type === 'node' ? 'Point' : 'Relation'
}

/**
 * The graph the join compares the tags in: the lines that run the wrong way reversed (iD#4688), as `actionJoin`'s
 * `disabled` does. Reversing turns the direction tags (`cycleway:left` to `cycleway:right`, `oneway=-1`, …), so the
 * table shows the values the join compares, not the ones in the tag editor. Also returns the ids that were reversed.
 */
function joinGraph(ids: readonly string[], graph: Graph): { graph: Graph; reversed: Set<string> } {
  const ways = ids.map((id) => graph.entity(id) as OsmWay)
  const sequences = osmJoinWays(ways, graph)
  if (sequences.length !== 1 || sequences.actions.length === 0)
    return { graph, reversed: new Set() }
  let after = graph.snapshot()
  for (const action of sequences.actions) after = action(after)
  const reversed = new Set(
    ways
      .filter((way) => (after.entity(way.id) as OsmWay).nodes[0] !== way.nodes[0])
      .map((way) => way.id),
  )
  return { graph: after, reversed }
}

/**
 * The tags of the features, one row per key. A row conflicts when two features have different values for a key that
 * counts (`isInterestingTag`, as `actionJoin` asks; `source` and the like never block). With `strict` (the area merge
 * of maid-module-shapes, which wants equal tags) any difference conflicts, a key one feature lacks too, except the keys
 * in `ignore`. Conflicting rows first, then the others, each sorted by key.
 */
export function tagRows(
  entities: readonly OsmEntity[],
  options: { strict?: boolean; ignore?: readonly string[] } = {},
): Row[] {
  const keys = [...new Set(entities.flatMap((entity) => Object.keys(entity.tags)))].sort()
  const rows = keys.map((key): Row => {
    const cells = entities.map((entity) => entity.tags[key])
    if (options.ignore?.includes(key)) return { label: key, cells, conflict: false }
    const conflict = options.strict
      ? new Set(cells).size > 1
      : new Set(cells.filter((value) => value !== undefined && value !== '')).size > 1 &&
        entities.some((entity) => entity.isInterestingTag(key))
    return { label: key, cells, conflict }
  })
  return [...rows.filter((row) => row.conflict), ...rows.filter((row) => !row.conflict)]
}

/**
 * The relations of the features, one row per relation, the cell the feature's role ("member" when it has none). A row
 * conflicts when not every feature is in it, as `actionJoin` refuses lines in different relations (turn restrictions
 * and connectivity relations aside, which it checks otherwise). With `strict` (the area merge) every relation counts
 * and different roles conflict too.
 */
export function relationRows(
  entities: readonly OsmEntity[],
  graph: Graph,
  options: { strict?: boolean } = {},
): Row[] {
  const relations = new Map<string, { label: string; cells: (string | undefined)[] }>()
  entities.forEach((entity, column) => {
    for (const relation of graph.parentRelations(entity)) {
      if (!options.strict && (relation.isRestriction() || relation.isConnectivity())) continue
      let row = relations.get(relation.id)
      if (!row) {
        const name = relation.tags.name ?? relation.tags.ref ?? relation.tags.type ?? 'relation'
        row = { label: `${name} (${relation.id})`, cells: entities.map(() => undefined) }
        relations.set(relation.id, row)
      }
      const roles = relation.members
        .filter((member) => member.id === entity.id)
        .map((member) => member.role || 'member')
      row.cells[column] = roles.sort().join('; ')
    }
  })
  return [...relations.values()]
    .map((row) => ({
      ...row,
      conflict:
        row.cells.some((cell) => cell === undefined) ||
        (options.strict === true && new Set(row.cells).size > 1),
    }))
    .sort((a, b) => Number(b.conflict) - Number(a.conflict) || a.label.localeCompare(b.label))
}

/**
 * The table for a Merge that is refused for its tags or its relations; undefined for the other reasons, which the
 * sentence says well enough. `kind` is the action Merge picked, `reason` why it is refused, `title` the sentence.
 */
export function mergeDetails(
  context: OperationContext,
  plan: { kind: string; ids: readonly string[] },
  reason: string,
  title: string,
): OperationDetails | undefined {
  if (reason !== 'conflicting_tags' && reason !== 'conflicting_relations') return undefined
  const lines = plan.kind === 'join'
  const { graph, reversed } = lines
    ? joinGraph(plan.ids, context.graph)
    : { graph: context.graph, reversed: new Set<string>() }
  const entities = plan.ids.map((id) => graph.entity(id))
  const columns = entities.map((entity) => ({
    label: labelOf(context.graph.entity(entity.id), context.graph, context),
    id: entity.id,
    note: reversed.has(entity.id) ? 'reversed' : undefined,
  }))
  const rows =
    reason === 'conflicting_relations'
      ? relationRows(
          entities.filter((entity) => entity instanceof OsmWay),
          graph,
        )
      : tagRows(entities)
  if (rows.length === 0) return undefined
  return { title, columns, rows }
}
