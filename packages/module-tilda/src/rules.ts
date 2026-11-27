/**
 * The rules of `@tilda-geo/bicycle-infrastructure-tagging/validation` as rules of Maid's validation, the same rules
 * as in the iD Radnetz fork:
 *
 * - `tildaTagRules`: every rule that reads the tags alone (`validateTags`), e.g. `unexpected_oneway_direction` for
 *   `cycleway:both:oneway=yes`, the widths, the traffic signs, the deprecated `cycleway=shared`. One Maid rule, an
 *   issue per finding; the package's rule id is in the issue's id and `data.tildaRule`.
 * - `sidepathDirectionRule`: `sidepath_line_against_traffic` (tagging 0.9.0), which needs the geometry: a cycle path of
 *   its own whose line runs against the traffic on its side of the road, with `oneway=yes`, is almost always drawn
 *   the wrong way round. The package picks the road and writes the text.
 *
 * A fix with `reverseWay` reverses the way with Maid's Reverse (which keeps `oneway=yes`, as iD) and then applies the
 * package's tag changes. Findings of the severity `info` (a missing width, surface or sign: nice to have) are left
 * out: Maid has no such level, and the TILDA section lists those attributes already.
 */
import { actionChangeTags, type Graph, OsmWay } from '@osm-editor-kit/maid-model'
import { reverseAction } from '@osm-editor-kit/maid-operations'
import {
  type Fix,
  type Issue,
  nodeLoc,
  type Rule,
  type RuleContext,
  sphericalDistance,
} from '@osm-editor-kit/maid-validation'
import {
  type Finding,
  renderMessage,
  sidepathDirectionFindings,
  type TagFix,
  type ValidationProfile,
  validateTags,
} from '@tilda-geo/bicycle-infrastructure-tagging'
import { m } from './messages.ts'
import { wayWithRoads } from './side-road.ts'
import { packageLanguage } from './texts.ts'

const RULE_ID = 'tilda_sidepath_direction'
const TAGS_RULE_ID = 'tilda_tags'
/** The rule with the geometry is `sidepathDirectionRule`; `validateTags` cannot trigger it without `lineRelation` */
const GEOMETRY_RULES = ['sidepath_line_against_traffic']

/**
 * The package's rules on the tags of a way with `highway`. `profile` as in the package: `tilda-geo` (the todos of
 * tilda-geo) or `radnetz-berlin` (those and the rules of the iD Radnetz fork, e.g. `cycleway_oneway_wrong`).
 */
export function tildaTagRules(options: { profile?: ValidationProfile } = {}): Rule {
  const { profile = 'radnetz-berlin' } = options
  return {
    id: TAGS_RULE_ID,
    get label() {
      return m.tilda_rule_tags()
    },
    validate(entity, context) {
      if (!(entity instanceof OsmWay) || entity.tags.highway === undefined) return []
      const coords = coordsOf(entity, context)
      const findings = validateTags(entity.tags, {
        profile,
        skip: GEOMETRY_RULES,
        ...(coords.length > 1 ? { length: lengthOf(coords) } : {}),
      })
      return findings
        .filter((finding) => finding.severity !== 'info')
        .map((finding) => issueOf(TAGS_RULE_ID, entity.id, finding, coords))
    },
  }
}

function coordsOf(way: OsmWay, context: RuleContext) {
  return way.nodes
    .map((id) => nodeLoc(context.graph, id))
    .filter((loc): loc is [number, number] => loc !== undefined)
}

function lengthOf(coords: readonly [number, number][]) {
  let length = 0
  for (let i = 1; i < coords.length; i++) length += sphericalDistance(coords[i - 1]!, coords[i]!)
  return length
}

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
      issueOf(RULE_ID, entity.id, finding, coords),
    )
  },
}

function issueOf(
  ruleId: string,
  wayId: string,
  finding: Finding,
  coords: readonly (readonly [number, number])[],
): Issue {
  const language = packageLanguage()
  const middle = coords[Math.floor(coords.length / 2)]
  // a rule can find the same on both sides (scope left and right): the scope and keys keep the ids apart
  const id = `${ruleId}:${finding.ruleId}:${finding.scope}:${finding.keys.join(',')}:${wayId}`
  return {
    id,
    rule: ruleId,
    severity: finding.severity === 'error' ? 'error' : 'warning',
    message: renderMessage(finding.message, language),
    entityIds: [wayId],
    ...(middle ? { loc: [middle[0], middle[1]] as [number, number] } : {}),
    fixes: finding.fixes.map((fix, index) => fixOf(id, wayId, fix, index, language)),
    data: { tildaRule: finding.ruleId, scope: finding.scope },
  }
}

function fixOf(
  issueId: string,
  wayId: string,
  fix: TagFix,
  index: number,
  language: 'de' | 'en',
): Fix {
  const label = renderMessage(fix.message, language)
  return {
    id: `${issueId}:${index}`,
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
