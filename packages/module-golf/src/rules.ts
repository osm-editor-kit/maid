/**
 * Golf rules for the Issues dock, from the OSM wiki's golf pages (Key:golf, Tag:golf=*, Tag:leisure=golf_course with its
 * "Common mapping pitfalls"; PDFs of 2026-11-12). Most look at one feature: the number and par of a hole (the scorecard
 * data apps read), its points (one fewer than its par), the old key golf_hole=*, the useful combinations (`surface=sand`
 * on a bunker, `natural=water` on a water hazard), generic names and `sport=golf` on the parts of a course, and a course
 * mapped as a point. One looks at the neighbours: a hole is the ball in the air and shares no node with the ground.
 * Rules that need areas (a pin outside every green, overlapping fairway and green) are in the plan
 * (docs/research/golf/plan.md).
 */
import { actionChangeTags } from '@osm-editor-kit/maid-model'
import type { Fix, Issue, Rule } from '@osm-editor-kit/maid-validation'
import { m } from './messages.ts'

type Entity = Parameters<Rule['validate']>[0]
type Tags = Readonly<Record<string, string>>

export const GOLF_RULE_IDS = {
  holeRef: 'golf_hole_ref',
  holePar: 'golf_hole_par',
  holeHandicap: 'golf_hole_handicap',
  bunkerSand: 'golf_bunker_surface',
  holeKey: 'golf_hole_key',
  holePoints: 'golf_hole_points',
  holeShared: 'golf_hole_shared_nodes',
  water: 'golf_water_natural',
  genericName: 'golf_generic_name',
  sport: 'golf_sport',
  coursePoint: 'golf_course_point',
} as const

/** The feature for the issue text: its name or ref with its golf tag */
export function featureName(tags: Tags): string {
  const kind = tags.golf ? `golf=${tags.golf}` : tags.leisure ? `leisure=${tags.leisure}` : '?'
  if (tags.name) return `${tags.name} (${kind})`
  if (tags.ref) return `${kind} ${tags.ref}`
  return kind
}

/** Whole numbers only: OSM values like "4", not "4.5" or "4;5" */
function wholeNumber(value: string | undefined): number | undefined {
  return value !== undefined && /^\d+$/.test(value.trim()) ? Number(value) : undefined
}

/**
 * Names that say what a feature is, in the languages of the app: "Bunker", "Green 3", "fairway 1", "18th Hole",
 * "Loch 7" (the wiki's pitfall 1)
 */
const KINDS =
  'bunker|sand ?trap|fairway|green|grün|tee|abschlag|rough|hole|loch|bahn|trou|hoyo|départ|salida|water ?hazard|wasserhindernis|pond|teich'
const GENERIC = new RegExp(
  `^((${KINDS})( ?(no\\.?|nr\\.?|#)? ?\\d+)?|\\d+(st|nd|rd|th|\\.)? ?(${KINDS}))$`,
  'i',
)

export function isGenericName(name: string): boolean {
  return GENERIC.test(name.trim())
}

function issue(
  rule: string,
  entity: Entity,
  severity: Issue['severity'],
  message: string,
  fixes: Fix[] = [],
): Issue {
  return { id: `${rule}:${entity.id}`, rule, severity, message, entityIds: [entity.id], fixes }
}

/** A fix that writes the feature's tags as they are then, changed by `change` */
function tagFix(
  id: string,
  label: string,
  annotation: string,
  entity: Entity,
  change: (tags: Record<string, string>) => void,
): Fix {
  return {
    id,
    label,
    annotation,
    actions: (graph) => {
      const now = graph.hasEntity(entity.id)
      if (!now) return []
      const tags = { ...now.tags } as Record<string, string>
      change(tags)
      return [actionChangeTags(entity.id, tags)]
    },
  }
}

const isHole = (entity: Entity) => entity.type === 'way' && entity.tags.golf === 'hole'

export const golfHoleRef: Rule = {
  id: GOLF_RULE_IDS.holeRef,
  get label() {
    return m.rule_hole_ref_label()
  },
  validate(entity) {
    if (!isHole(entity) || entity.tags.ref) return []
    return [
      issue(
        this.id,
        entity,
        'warning',
        m.rule_hole_ref_message({ feature: featureName(entity.tags) }),
      ),
    ]
  },
}

export const golfHolePar: Rule = {
  id: GOLF_RULE_IDS.holePar,
  get label() {
    return m.rule_hole_par_label()
  },
  validate(entity) {
    if (!isHole(entity)) return []
    const par = wholeNumber(entity.tags.par)
    if (par !== undefined && par >= 3 && par <= 6) return []
    return [
      issue(
        this.id,
        entity,
        'warning',
        m.rule_hole_par_message({ feature: featureName(entity.tags), par: entity.tags.par ?? '–' }),
      ),
    ]
  },
}

export const golfHoleHandicap: Rule = {
  id: GOLF_RULE_IDS.holeHandicap,
  get label() {
    return m.rule_hole_handicap_label()
  },
  validate(entity) {
    const value = entity.tags.handicap
    if (!isHole(entity) || value === undefined) return []
    const handicap = wholeNumber(value)
    if (handicap !== undefined && handicap >= 1 && handicap <= 18) return []
    return [
      issue(
        this.id,
        entity,
        'warning',
        m.rule_hole_handicap_message({ feature: featureName(entity.tags), handicap: value }),
      ),
    ]
  },
}

export const golfBunkerSand: Rule = {
  id: GOLF_RULE_IDS.bunkerSand,
  get label() {
    return m.rule_bunker_sand_label()
  },
  validate(entity) {
    if (entity.type === 'node' || entity.tags.golf !== 'bunker' || entity.tags.surface) return []
    const fix = tagFix(
      'add_surface_sand',
      m.rule_bunker_sand_fix(),
      m.rule_bunker_sand_done(),
      entity,
      (tags) => {
        tags.surface = 'sand'
      },
    )
    return [
      issue(
        this.id,
        entity,
        'warning',
        m.rule_bunker_sand_message({ feature: featureName(entity.tags) }),
        [fix],
      ),
    ]
  },
}

export const golfWaterNatural: Rule = {
  id: GOLF_RULE_IDS.water,
  get label() {
    return m.rule_water_label()
  },
  validate(entity) {
    const golf = entity.tags.golf
    if (entity.type === 'node' || (golf !== 'water_hazard' && golf !== 'lateral_water_hazard'))
      return []
    if (entity.tags.natural || entity.tags.water || entity.tags.waterway) return []
    const fix = tagFix(
      'add_natural_water',
      m.rule_water_fix(),
      m.rule_water_done(),
      entity,
      (tags) => {
        tags.natural = 'water'
      },
    )
    return [
      issue(
        this.id,
        entity,
        'warning',
        m.rule_water_message({ feature: featureName(entity.tags) }),
        [fix],
      ),
    ]
  },
}

export const golfGenericName: Rule = {
  id: GOLF_RULE_IDS.genericName,
  get label() {
    return m.rule_generic_name_label()
  },
  validate(entity) {
    const name = entity.tags.name
    if (!entity.tags.golf || !name || !isGenericName(name)) return []
    const fix = tagFix(
      'remove_name',
      m.rule_generic_name_fix(),
      m.rule_generic_name_done(),
      entity,
      (tags) => {
        delete tags.name
      },
    )
    const kind = featureName({ ...entity.tags, name: '' })
    return [
      issue(this.id, entity, 'warning', m.rule_generic_name_message({ feature: kind, name }), [
        fix,
      ]),
    ]
  },
}

export const golfSport: Rule = {
  id: GOLF_RULE_IDS.sport,
  get label() {
    return m.rule_sport_label()
  },
  validate(entity) {
    if (!entity.tags.golf || entity.tags.sport !== 'golf' || entity.tags.leisure === 'golf_course')
      return []
    const fix = tagFix('remove_sport', m.rule_sport_fix(), m.rule_sport_done(), entity, (tags) => {
      delete tags.sport
    })
    return [
      issue(
        this.id,
        entity,
        'warning',
        m.rule_sport_message({ feature: featureName(entity.tags) }),
        [fix],
      ),
    ]
  },
}

export const golfCoursePoint: Rule = {
  id: GOLF_RULE_IDS.coursePoint,
  get label() {
    return m.rule_course_point_label()
  },
  validate(entity) {
    if (entity.type !== 'node' || entity.tags.leisure !== 'golf_course') return []
    return [
      issue(
        this.id,
        entity,
        'warning',
        m.rule_course_point_message({ feature: featureName(entity.tags) }),
      ),
    ]
  },
}

/** The old key golf_hole=* for the number of a hole: the wiki keeps the number in ref=*. Fix: move it there. */
export const golfHoleKey: Rule = {
  id: GOLF_RULE_IDS.holeKey,
  get label() {
    return m.rule_hole_key_label()
  },
  validate(entity) {
    const old = entity.tags.golf_hole
    if (old === undefined) return []
    const canMove = entity.tags.ref === undefined || entity.tags.ref === old
    const fixes = canMove
      ? [
          tagFix('move_to_ref', m.rule_hole_key_fix(), m.rule_hole_key_done(), entity, (tags) => {
            tags.ref = old
            delete tags.golf_hole
          }),
        ]
      : []
    const message = m.rule_hole_key_message({ feature: featureName(entity.tags), value: old })
    return [issue(GOLF_RULE_IDS.holeKey, entity, 'warning', message, fixes)]
  },
}

/** The node ids of a way; none for another entity */
function nodesOf(entity: Entity): readonly string[] {
  return 'nodes' in entity && Array.isArray(entity.nodes) ? (entity.nodes as string[]) : []
}

/**
 * The wiki: the way of a hole has one point fewer than its par; a par 3 is a straight line from the tee to the green,
 * the points between are where a scratch golfer's shots land.
 */
export const golfHolePoints: Rule = {
  id: GOLF_RULE_IDS.holePoints,
  get label() {
    return m.rule_hole_points_label()
  },
  validate(entity) {
    if (!isHole(entity)) return []
    const par = wholeNumber(entity.tags.par)
    if (par === undefined || par < 3 || par > 6) return []
    const points = nodesOf(entity).length
    if (points === par - 1) return []
    const message = m.rule_hole_points_message({
      feature: featureName(entity.tags),
      points: String(points),
      expected: String(par - 1),
      par: String(par),
    })
    return [issue(GOLF_RULE_IDS.holePoints, entity, 'warning', message)]
  },
}

/**
 * The wiki: a hole is the ball in the air, so its way never shares a node with tees, greens, fairways, bunkers or other
 * golf features on the ground. A node tagged golf=pin at its end is fine; only the ways that share it count.
 */
export const golfHoleSharedNodes: Rule = {
  id: GOLF_RULE_IDS.holeShared,
  get label() {
    return m.rule_hole_shared_label()
  },
  validate(entity, context) {
    if (!isHole(entity)) return []
    const graph = context?.graph
    if (!graph) return []
    const touched = new Set<string>()
    for (const id of nodesOf(entity)) {
      const node = graph.hasEntity(id)
      if (!node) continue
      for (const parent of graph.parentWays(node)) {
        if (parent.id === entity.id || parent.tags.golf === 'hole') continue
        if (parent.tags.golf || parent.tags.leisure === 'golf_course') touched.add(parent.id)
      }
    }
    if (touched.size === 0) return []
    const message = m.rule_hole_shared_message({ feature: featureName(entity.tags) })
    return [
      {
        ...issue(GOLF_RULE_IDS.holeShared, entity, 'warning', message),
        entityIds: [entity.id, ...touched],
      },
    ]
  },
}

export const golfRules: Rule[] = [
  golfHoleRef,
  golfHolePar,
  golfHoleHandicap,
  golfHoleKey,
  golfHolePoints,
  golfHoleSharedNodes,
  golfBunkerSand,
  golfWaterNatural,
  golfGenericName,
  golfSport,
  golfCoursePoint,
]
