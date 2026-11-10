/**
 * Tag logic for "move the tags of a separately mapped side to its own way": a road with `sidewalk:left=separate` (or
 * `cycleway:right=separate`) that still carries `sidewalk:left:surface=…` and the like. Those attributes describe the
 * separate way and belong on it as plain keys (`surface=…`). Pure functions on plain tags.
 */

export type Tags = Readonly<Record<string, string>>
export type Side = 'left' | 'right'
/** The part of the road a side describes: its sidewalk, or its cycle track */
export type SidePrefix = 'sidewalk' | 'cycleway'

export const SIDES: readonly Side[] = ['left', 'right']
const SIDE_WORDS = new Set(['left', 'right', 'both'])

/** Values of a side that mean there is nothing on it */
const NOTHING = new Set(['no', 'none'])

/**
 * Keys that stay on the road: they describe the road at the side, not the separate way. `lane` and `lanes` as TILDA's
 * `sideTags` leaves them out (`cycleway:right:lane=advisory` is a painted lane, seen next to a separate cycle track on
 * Alexanderstraße in the medium fixture). `kerb` would fit the sidewalk, but a road side's kerb is mapped at crossings.
 */
const ROAD_ONLY = /(^|:)lanes(:|$)|^lane$|^kerb$/

/** The highway values of a road that has sides (iD's and TILDA's road classes) */
const ROAD_HIGHWAYS = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'unclassified',
  'residential',
  'living_street',
  'service',
  'road',
  'busway',
  'bus_guideway',
])

export function isRoad(tags: Tags): boolean {
  return tags.highway !== undefined && ROAD_HIGHWAYS.has(tags.highway) && tags.area !== 'yes'
}

/** The value of one side: `prefix:side`, `prefix:both`, then the plain `prefix` (with the old `left|right|both` values) */
export function sideValue(tags: Tags, prefix: SidePrefix, side: Side): string | undefined {
  const sided = tags[`${prefix}:${side}`] ?? tags[`${prefix}:both`]
  if (sided !== undefined) return sided
  const value = tags[prefix]
  if (value === 'both') return 'yes'
  if (value === 'left' || value === 'right') return value === side ? 'yes' : 'no'
  return value
}

/** One attribute of a side: its plain key on the separate way, its value, and the road key it is read from */
export type SideAttribute = { key: string; value: string; from: string }

/**
 * The attributes of one side, by the key they get on the separate way. `prefix:side:key` wins over
 * `prefix:both:key`, which wins over `prefix:key`. Keys that stay on the road (`ROAD_ONLY`) are left out.
 */
export function sideAttributes(tags: Tags, prefix: SidePrefix, side: Side): SideAttribute[] {
  const found = new Map<string, SideAttribute & { rank: number }>()
  for (const [roadKey, value] of Object.entries(tags)) {
    if (!roadKey.startsWith(`${prefix}:`)) continue
    const parts = roadKey.slice(prefix.length + 1).split(':')
    let rank: number
    let key: string
    if (parts[0] === side) {
      rank = 0
      key = parts.slice(1).join(':')
    } else if (parts[0] === 'both') {
      rank = 1
      key = parts.slice(1).join(':')
    } else if (SIDE_WORDS.has(parts[0]!)) {
      continue
    } else {
      rank = 2
      key = parts.join(':')
    }
    if (!key || ROAD_ONLY.test(key)) continue
    const before = found.get(key)
    if (!before || rank < before.rank) found.set(key, { key, value, from: roadKey, rank })
  }
  return [...found.values()]
    .map(({ key, value, from }) => ({ key, value, from }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

/** Whether this side is mapped as a way of its own and the road still has attributes for it */
export function canMoveSide(tags: Tags, prefix: SidePrefix, side: Side): boolean {
  return (
    isRoad(tags) &&
    sideValue(tags, prefix, side) === 'separate' &&
    sideAttributes(tags, prefix, side).length > 0
  )
}

/**
 * The road's tags after the attributes of `sides` moved away. A shared key (`prefix:both:key`, `prefix:key`) of a
 * side that stays is kept for that side as `prefix:<other>:key`, unless the other side has no such part (`no`) or
 * a key of its own. `kept` names keys of a moving side that stay on the road (their separate way has another
 * value): they stay as the side's own key.
 */
export function roadTagsWithout(
  tags: Tags,
  prefix: SidePrefix,
  sides: readonly Side[],
  kept: ReadonlyMap<Side, ReadonlySet<string>> = new Map(),
): Record<string, string> {
  const result: Record<string, string> = { ...tags }
  const stays = (side: Side, key: string) => !sides.includes(side) || !!kept.get(side)?.has(key)
  for (const side of sides) {
    for (const { key } of sideAttributes(tags, prefix, side)) {
      if (stays(side, key)) continue
      delete result[`${prefix}:${side}:${key}`]
      // a shared key would describe the moved side again: it goes, and a staying side keeps its value as its own key
      for (const shared of [`${prefix}:both:${key}`, `${prefix}:${key}`]) {
        const value = tags[shared]
        if (value === undefined) continue
        for (const other of SIDES) {
          if (other === side || !stays(other, key)) continue
          const present = sideValue(tags, prefix, other)
          const own = `${prefix}:${other}:${key}`
          if (present === undefined || NOTHING.has(present) || result[own] !== undefined) continue
          result[own] = value
        }
        delete result[shared]
      }
    }
  }
  return result
}

/** A key read in the other direction: `:forward` and `:backward`, `:left` and `:right` swap */
function reverseKey(key: string): string {
  const swap: Record<string, string> = {
    forward: 'backward',
    backward: 'forward',
    left: 'right',
    right: 'left',
  }
  return key
    .split(':')
    .map((part) => swap[part] ?? part)
    .join(':')
}

/** A value read in the other direction: only `oneway` (`yes` and `-1`) changes */
function reverseValue(key: string, value: string): string {
  if (key !== 'oneway' && !key.startsWith('oneway:')) return value
  if (value === 'yes') return '-1'
  if (value === '-1') return 'yes'
  return value
}

/**
 * The tags the separate way gets from the side. `reversed`: the separate way runs against the road, so directions
 * and sides in the keys are turned (`traffic_sign:forward` becomes `traffic_sign:backward`).
 */
export function tagsForWay(
  attributes: readonly SideAttribute[],
  reversed: boolean,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const { key, value } of attributes) {
    if (reversed) result[reverseKey(key)] = reverseValue(key, value)
    else result[key] = value
  }
  return result
}

/** The keys whose value on the separate way differs from the one that would be moved there */
export function conflictingKeys(wayTags: Tags, moved: Tags): string[] {
  return Object.keys(moved).filter(
    (key) => wayTags[key] !== undefined && wayTags[key] !== moved[key],
  )
}
