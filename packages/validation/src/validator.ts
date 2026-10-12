import { OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { Graph } from '@osm-editor-kit/maid-model'
import { boxOf, boxesOverlap } from './geo.ts'
import type { Box, Point } from './geo.ts'
import type { Issue, Rule, RuleContext, Validator } from './types.ts'

const severityRank: Record<Issue['severity'], number> = { error: 0, warning: 1 }

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Creates a validator over these rules. Issues are kept per id, so the same finding from two of
 * its entities is one issue. A run (one `validate` call) looks up each way's bounding box at most
 * once, when a rule first asks for a way's neighbours.
 */
export function createValidator(rules: readonly Rule[]): Validator {
  const issues = new Map<string, Issue>()

  function allIssues(): Issue[] {
    return [...issues.values()].sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        compareText(a.rule, b.rule) ||
        compareText(a.id, b.id),
    )
  }

  return {
    rules,

    validate(graph, entityIds, ways) {
      const targets = new Set(entityIds)

      // Drop what the validated entities had, and whatever names an entity that left the graph
      for (const [key, issue] of issues) {
        const stale = issue.entityIds.some((id) => targets.has(id) || !graph.hasEntity(id))
        if (stale) issues.delete(key)
      }

      const context = runContext(graph, ways, targets)
      for (const id of targets) {
        const entity = graph.hasEntity(id)
        if (!entity) continue
        for (const rule of rules) {
          let found: Issue[]
          try {
            found = rule.validate(entity, context)
          } catch {
            // One broken rule must not stop the others: it reports nothing for this entity
            continue
          }
          for (const issue of found) {
            // The first entity validated wins when two runs find the same crossing
            if (!issues.has(issue.id)) issues.set(issue.id, issue)
          }
        }
      }
    },

    keepOnly(entityIds) {
      const keep = new Set(entityIds)
      for (const [key, issue] of issues) {
        const first = issue.entityIds[0]
        if (first === undefined || !keep.has(first)) issues.delete(key)
      }
    },

    issues() {
      return allIssues()
    },

    issuesFor(entityId) {
      return allIssues().filter((issue) => issue.entityIds.includes(entityId))
    },
  }
}

/**
 * The context of one run: the neighbour lookup over the given ways plus the validated ways (as they
 * are in the graph), and the validated ids themselves.
 */
function runContext(
  graph: Graph,
  ways: Iterable<OsmWay>,
  targets: ReadonlySet<string>,
): RuleContext {
  const candidates: OsmWay[] = []
  const seen = new Set<string>()
  const addCandidate = (id: string): void => {
    if (seen.has(id)) return
    seen.add(id)
    const current = graph.hasEntity(id)
    if (current instanceof OsmWay) candidates.push(current)
  }
  for (const way of ways) addCandidate(way.id)
  for (const id of targets) addCandidate(id)

  const boxes = new Map<string, Box | null>()
  const boxFor = (way: OsmWay): Box | undefined => {
    let box = boxes.get(way.id)
    if (box === undefined) {
      const points: Point[] = []
      for (const nodeId of way.nodes) {
        const node = graph.hasEntity(nodeId)
        const loc = node instanceof OsmNode ? node.loc : undefined
        if (loc) points.push([loc[0], loc[1]])
      }
      box = boxOf(points) ?? null
      boxes.set(way.id, box)
    }
    return box ?? undefined
  }

  return {
    graph,
    validated: targets,
    waysNear(way) {
      const box = boxFor(way)
      if (!box) return []
      const near: OsmWay[] = []
      for (const candidate of candidates) {
        if (candidate.id === way.id) continue
        const other = boxFor(candidate)
        if (other && boxesOverlap(box, other)) near.push(candidate)
      }
      return near
    },
  }
}
