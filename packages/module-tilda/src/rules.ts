/**
 * The TILDA rules that need the geometry, as rules of Maid's validation: `sidepath_line_against_traffic`
 * (tagging 0.9.0) finds a cycle path of its own whose line runs against the traffic on its side of the road, with
 * `oneway=yes`: almost always drawn the wrong way round. The package picks the road and writes the text; the fix
 * reverses the way with Maid's Reverse (which keeps `oneway=yes`, as iD) and then applies the package's tag changes.
 */
import { actionChangeTags, type Graph, OsmWay } from '@osm-editor-kit/maid-model'
import { reverseAction } from '@osm-editor-kit/maid-operations'
import type { Fix, Issue, Rule } from '@osm-editor-kit/maid-validation'
import {
  type Finding,
  renderMessage,
  sidepathDirectionFindings,
  type TagFix,
} from '@tilda-geo/bicycle-infrastructure-tagging'
import { m } from './messages.ts'
import { wayWithRoads } from './side-road.ts'
import { packageLanguage } from './texts.ts'

const RULE_ID = 'tilda_sidepath_direction'

export const sidepathDirectionRule: Rule = {
  id: RULE_ID,
  get label() {
    return m.tilda_rule_sidepath_direction()
  },
  validate(entity, context) {
    if (!(entity instanceof OsmWay) || entity.isClosed()) return []
    // the ways near it by distance, not by the validator's box overlap: a straight path beside a straight road has a
    // box of no height that touches the road's box nowhere
    const found = wayWithRoads(context.graph, entity.id)
    if (!found || found.roads.length === 0) return []
    const { way, roads } = found
    const coords = way.coords
    return sidepathDirectionFindings(way, roads).map((finding) =>
      issueOf(entity.id, finding, coords),
    )
  },
}

function issueOf(
  wayId: string,
  finding: Finding,
  coords: readonly (readonly [number, number])[],
): Issue {
  const language = packageLanguage()
  const middle = coords[Math.floor(coords.length / 2)]!
  return {
    id: `${RULE_ID}:${finding.ruleId}:${wayId}`,
    rule: RULE_ID,
    severity: finding.severity === 'error' ? 'error' : 'warning',
    message: renderMessage(finding.message, language),
    entityIds: [wayId],
    loc: [middle[0], middle[1]],
    fixes: finding.fixes.map((fix, index) => fixOf(wayId, fix, index, language)),
  }
}

function fixOf(wayId: string, fix: TagFix, index: number, language: 'de' | 'en'): Fix {
  const label = renderMessage(fix.message, language)
  return {
    id: `${RULE_ID}:${index}`,
    label,
    annotation: label,
    actions: () => [
      ...(fix.reverseWay ? [reverseAction(wayId)] : []),
      (graph: Graph) => {
        const way = graph.hasEntity(wayId)
        if (!way) return graph
        const tags: Record<string, string> = { ...way.tags }
        for (const key of fix.remove ?? []) delete tags[key]
        Object.assign(tags, fix.add ?? {})
        // Reverse already turned what follows the way; a change applies only where its value is still the old one
        for (const [key, { from, to }] of Object.entries(fix.change ?? {}))
          if (tags[key] === from) tags[key] = to
        return actionChangeTags(wayId, tags)(graph)
      },
    ],
  }
}
