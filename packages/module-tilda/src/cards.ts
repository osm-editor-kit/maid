// What the TILDA section shows, without React: one card per TILDA result of the selected way (the way itself, the
// left and the right side), the open question that makes an incomplete category exact, the planner of "Change to",
// the checklist of the attributes the dataset needs, and the reminders. Ported from the TILDA box of the iD Radnetz
// Berlin fork (modules/ui/sections/tilda_bike_infra.ts); the TILDA logic itself is in the two @tilda-geo packages.
import {
  analyzeCategoryGaps,
  processBikelanes,
  type BikelaneResult,
  type CategoryGap,
  type OsmTags,
} from '@tilda-geo/bicycle-infrastructure'
import {
  applyCategoryPlan,
  gapTags,
  gapWriteKey,
  planForMappingChoice,
  reminders,
  requiredAttributes,
  resolveMappingChoice,
  roadAttributes,
  type CategoryChangePlan,
  type MappingChoice,
  type RequiredAttribute,
  type RequirementsProfile,
  type ResultSide,
} from '@tilda-geo/bicycle-infrastructure-tagging'

export type Tags = Readonly<Record<string, string>>
/** A change of tags: a value sets the key, `undefined` removes it */
export type TagsUpdate = Record<string, string | undefined>

/** A stored "Checked" or "Verified" (outside OSM, see checks-store.ts) */
export type TildaCheck = {
  /** What was confirmed, as a tag (`surface:colour=no`); empty for a reminder or `verified` */
  answer: string
  /** OSM version of the way when it was checked */
  wayVersion: string | undefined
  /** ISO time */
  at: string
}

/** The stored check of the selected way, by check id */
export type CheckOf = (check: string) => TildaCheck | undefined

/** The check id of the verification of the whole way */
export const VERIFIED = 'verified'
/** The check id of "the footway next to it does not belong to this cycleway" */
export const TRAFFIC_MODE_FOOT_CHECK = 'traffic_mode_foot'
/** The check id of a reminder */
export const reminderCheck = (id: string) => `reminder:${id}`

/** The selected cycleway has a footway right next to it and no `traffic_mode` for it */
export type FootwayQuestion = { side: 'left' | 'right' | undefined; answered: boolean }

/** One card per TILDA result (self / left / right side of the way) */
export type SideCard = {
  side: ResultSide
  result: BikelaneResult
  gaps: CategoryGap[]
  /** What the mapper picked in "Change to": a kind of infrastructure plus options */
  choice: MappingChoice | undefined
  /** The TILDA category of `choice` */
  target: string | undefined
  plan: CategoryChangePlan | undefined
  attributes: RequiredAttribute[]
  /** Mixed traffic checklist, for a way that is not bike infrastructure itself */
  roadAttributes: RequiredAttribute[]
  /** Things to look for that have no tag to check */
  reminders: string[]
  /** Can be folded: the way itself when its bike infrastructure is mapped on the sides */
  collapsible: boolean
  footway?: FootwayQuestion
  /** The right side, when both sides are the same and show as one card ("Both sides") */
  twin?: SideCard
  /** In a "Both sides" card: the row of the right side for each row of the left side */
  twins?: Map<RequiredAttribute, RequiredAttribute>
}

const SIDE_ORDER: ResultSide[] = ['self', 'left', 'right']

/** Package tags to Maid tags: keys without a value are left out */
export function definedTags(tags: OsmTags): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(tags)) if (value !== undefined) result[key] = value
  return result
}

/** Tagging `plan` changes nothing (also when its adds repeat tags that are there) */
export function planReached(tags: Tags, plan: CategoryChangePlan) {
  if (plan.conflicts.length > 0 || !plan.aligned) return false
  const after = applyCategoryPlan({ ...tags }, plan)
  const keys = new Set([...Object.keys(tags), ...Object.keys(after)])
  return [...keys].every((key) => tags[key] === after[key])
}

/** The choices of "Change to" that the tags reach now are dropped: the card shows the new category instead */
export function openChoices(tags: Tags, choices: ReadonlyMap<ResultSide, MappingChoice>) {
  const open = new Map<ResultSide, MappingChoice>()
  for (const [side, choice] of choices)
    if (!planReached(tags, planForMappingChoice({ ...tags }, choice, side))) open.set(side, choice)
  return open
}

/**
 * How the missing tag is shown: `required` (orange) must be tagged, `optional` (yellow) only if it applies or TILDA
 * only guesses
 */
export function attributeSeverity(
  attribute: RequiredAttribute,
): 'required' | 'optional' | undefined {
  if (attribute.state === 'ignored') return 'required'
  if (attribute.state === 'guess') return 'optional'
  if (attribute.state === 'missing') return attribute.optional ? 'optional' : 'required'
  return undefined
}

/** Order of the open rows of a checklist: what blocks TILDA first, defaults to confirm last */
export function attributeRank(attribute: RequiredAttribute) {
  if (attribute.state === 'ignored') return 0
  if (attribute.state === 'missing') return attribute.optional ? 3 : 1
  if (attribute.state === 'guess') return 2
  return 4
}

/**
 * The oneway row of a footway or path writes `oneway:bicycle`, but only `oneway` is tagged: its value, offered to tag
 * as `oneway:bicycle` instead (TILDA reads both; `oneway:bicycle` is the better tag)
 */
export function onewayToMove(attribute: RequiredAttribute) {
  const [tag, ...more] = attribute.tagged
  return attribute.key === 'oneway:bicycle' && tag?.key === 'oneway' && more.length === 0
    ? tag.value
    : undefined
}

/** The mapper confirmed this default (the same one: on another default the check does not count) */
export function confirmed(attribute: RequiredAttribute, checkOf: CheckOf) {
  const check = attribute.state === 'assumed' ? checkOf(attribute.key) : undefined
  return check !== undefined && check.answer === attribute.default ? check : undefined
}

/** A checklist row needs nothing more: tagged, taken from other tags, or a default someone confirmed */
export function attributeDone(attribute: RequiredAttribute, checkOf: CheckOf) {
  return (
    (attribute.state === 'ok' ||
      attribute.state === 'inherited' ||
      confirmed(attribute, checkOf) !== undefined) &&
    onewayToMove(attribute) === undefined
  )
}

/** What is still open on a side: the category question, checklist rows, reminders nobody checked */
export function openCount(card: SideCard, checkOf: CheckOf) {
  return (
    card.gaps.length +
    (card.footway && !card.footway.answered ? 1 : 0) +
    [...card.attributes, ...card.roadAttributes].filter(
      (attribute) => !attributeDone(attribute, checkOf),
    ).length +
    card.reminders.filter((id) => !checkOf(reminderCheck(id))).length
  )
}

/**
 * The key for both sides when two keys differ only in `left` / `right` (`cycleway:left:surface`,
 * `cycleway:right:surface` → `cycleway:both:surface`); otherwise undefined
 */
export function bothSidesKey(leftKey: string, rightKey: string) {
  const a = leftKey.split(':')
  const b = rightKey.split(':')
  if (a.length !== b.length) return undefined
  const differ = a.flatMap((part, i) => (part === b[i] ? [] : [i]))
  const at = differ[0]
  if (differ.length !== 1 || at === undefined || a[at] !== 'left' || b[at] !== 'right')
    return undefined
  return a.map((part, i) => (i === at ? 'both' : part)).join(':')
}

/** One update for both sides: the `:both` key with the side keys removed; or both side keys */
export function bothSidesUpdate(left: TagsUpdate, right: TagsUpdate): TagsUpdate {
  const update: TagsUpdate = {}
  const rightKeys = Object.keys(right)
  for (const [i, key] of Object.keys(left).entries()) {
    const twinKey = rightKeys[i]
    const both = twinKey === undefined ? undefined : bothSidesKey(key, twinKey)
    if (both !== undefined && twinKey !== undefined && left[key] === right[twinKey]) {
      Object.assign(update, { [key]: undefined, [twinKey]: undefined, [both]: left[key] })
    } else {
      update[key] = left[key]
      if (twinKey !== undefined) update[twinKey] = right[twinKey]
    }
  }
  return update
}

/**
 * Tags `value` for an attribute. The oneway row of a footway or path writes `oneway:bicycle`; an old `oneway` with
 * the same value goes in the same step, one with another value stays and shows as "not read".
 */
export function attributeUpdate(
  tags: Tags,
  attribute: RequiredAttribute,
  value: string,
  twin?: RequiredAttribute,
): TagsUpdate {
  const update: TagsUpdate = { [attribute.key]: value }
  if (attribute.key === 'oneway:bicycle' && tags.oneway === value) update.oneway = undefined
  return twin ? bothSidesUpdate(update, { [twin.key]: value }) : update
}

/** The answer of the open question for one card, or for both sides of a "Both sides" card */
export function gapUpdate(gap: CategoryGap, card: SideCard, value: string): TagsUpdate {
  const own = definedTags(gapTags(gap, card.result, value))
  return card.twin ? bothSidesUpdate(own, definedTags(gapTags(gap, card.twin.result, value))) : own
}

/** The key the open question writes, the `:both` key in a "Both sides" card */
export function gapKey(gap: CategoryGap, card: SideCard) {
  const key = gapWriteKey(gap, card.result)
  return (card.twin && bothSidesKey(key, gapWriteKey(gap, card.twin.result))) ?? key
}

/** The category a side gets when the open question is answered with `value`, or the value when it stays */
export function gapAnswerCategory(tags: Tags, gap: CategoryGap, card: SideCard, value: string) {
  const after = definedTags({ ...tags, ...gapTags(gap, card.result, value) })
  const category = processBikelanes(after).find((result) => result._side === card.side)?.category
  return category && category !== card.result.category ? category : undefined
}

/** A `TagsUpdate` as the set and remove lists the history takes */
export function toTagChange(update: TagsUpdate) {
  const set: Record<string, string> = {}
  const remove: string[] = []
  for (const [key, value] of Object.entries(update)) {
    if (value === undefined) remove.push(key)
    else set[key] = value
  }
  return { set, remove }
}

export type CardOptions = {
  profile: RequirementsProfile
  /** "Change to" per side */
  choices: ReadonlyMap<ResultSide, MappingChoice>
  /** Keys whose value differs from the downloaded data: a width tagged now needs its source */
  edited: ReadonlySet<string>
  /** The footway question of the way itself, from the geometry (footway.ts) */
  footway?: FootwayQuestion
}

/** The cards of a way, in the order self, left, right */
export function buildCards(tags: Tags, options: CardOptions): SideCard[] {
  const osmTags: OsmTags = { ...tags }
  const results = processBikelanes(osmTags)
  // no result for the way itself (a sidewalk without bike access): still offer a card with "Change to",
  // to see what would make it bike infrastructure
  if (!results.some((result) => result._side === 'self'))
    results.push({ _side: 'self', _prefix: null, _infrastructureExists: false, category: '' })
  results.sort((a, b) => SIDE_ORDER.indexOf(a._side) - SIDE_ORDER.indexOf(b._side))
  const gaps = analyzeCategoryGaps(osmTags, results)
  const selfIsInfrastructure = results.some(
    (result) => result._side === 'self' && result._infrastructureExists,
  )
  const sidesHaveInfrastructure = results.some(
    (result) => result._side !== 'self' && result._infrastructureExists,
  )

  return results.map((result) => {
    const side = result._side
    const sideGaps = gaps.find((gap) => gap._side === side)?.missing ?? []
    // the open question of the category asks for these keys; the checklist does not repeat them
    const gapKeys = new Set(sideGaps.map((gap) => gapWriteKey(gap, result)))
    const notAGap = (attribute: RequiredAttribute) =>
      attribute.state !== 'missing' || !gapKeys.has(attribute.key)
    const choice = options.choices.get(side)
    const target = choice && resolveMappingChoice(choice, side)?.categoryId
    const plan = choice ? planForMappingChoice(osmTags, choice, side) : undefined
    const targetCategory = target !== result.category ? target : undefined
    const { profile, edited } = options
    return {
      side,
      result,
      gaps: sideGaps,
      choice,
      target,
      plan,
      attributes: requiredAttributes(result, osmTags, { profile, targetCategory, edited }).filter(
        notAGap,
      ),
      roadAttributes:
        side === 'self' && !selfIsInfrastructure
          ? roadAttributes(osmTags, { profile, edited }).filter(notAGap)
          : [],
      reminders: reminders(result, osmTags, profile, targetCategory),
      // bike infrastructure on the sides: the way itself (mixed traffic) matters less
      collapsible: side === 'self' && !selfIsInfrastructure && sidesHaveInfrastructure,
      ...(side === 'self' && options.footway ? { footway: options.footway } : {}),
    }
  })
}

/** Left and right look the same in every row: one card "Both sides" (halves the section on a road) */
export function sidesMatch(
  left: SideCard,
  right: SideCard,
  checkOf: CheckOf,
  label: (card: SideCard) => string,
) {
  if (left.choice || right.choice) return false
  if (left.result.category !== right.result.category || label(left) !== label(right)) return false
  const gapID = (card: SideCard) =>
    card.gaps.map((gap) => `${gap.key}=${gap.values.join('|')}`).join(';')
  if (gapID(left) !== gapID(right)) return false
  if (left.reminders.join() !== right.reminders.join()) return false
  if (left.attributes.length !== right.attributes.length) return false
  return left.attributes.every((a, i) => {
    const b = right.attributes[i]
    if (!b) return false
    // an untagged default may read differently per side and mean the same (`oneway`: -1 left, yes right)
    const sameTilda =
      a.tilda === b.tilda || (a.state === 'assumed' && a.options.join() === b.options.join())
    return (
      a.id === b.id &&
      a.state === b.state &&
      sameTilda &&
      a.value === b.value &&
      !!confirmed(a, checkOf) === !!confirmed(b, checkOf) &&
      !!onewayToMove(a) === !!onewayToMove(b)
    )
  })
}

/** The cards with left and right as one "Both sides" card where they match */
export function mergeSides(
  list: SideCard[],
  checkOf: CheckOf,
  label: (card: SideCard) => string,
  editing: ReadonlySet<ResultSide>,
): SideCard[] {
  const left = list.find((card) => card.side === 'left')
  const right = list.find((card) => card.side === 'right')
  if (!left || !right || editing.has('left') || editing.has('right')) return list
  if (!sidesMatch(left, right, checkOf, label)) return list
  const twins = new Map<RequiredAttribute, RequiredAttribute>()
  left.attributes.forEach((attribute, i) => {
    const twin = right.attributes[i]
    if (twin) twins.set(attribute, twin)
  })
  return list
    .filter((card) => card !== right)
    .map((card) => (card === left ? { ...left, twin: right, twins } : card))
}
