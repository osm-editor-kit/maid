// Access profiles: which ways a bicycle or a walker may use, which way they prefer, and what a
// metre costs on each. Pure functions over OSM tags; no graph here.
//
// Covered
// - highway kinds from the tables below; `*_link` roads cost 1.1 times their parent kind
// - `area=yes` highways are read as `pedestrian` (a plaza: walkable, not cyclable by default)
// - access tags: the mode tag (`bicycle=`, `foot=`) overrides `access=`. `no` and `private` make a
//   way unroutable. `yes`, `designated`, `permissive`, `official`, `destination`, `delivery` and
//   `customers` make it routable. `discouraged` doubles the cost. `dismount` (bicycle only) costs
//   ten times as much; on foot it counts as allowed. `use_sidepath` costs twenty times as much: the
//   side way is preferred, but the route still works when that side way is not mapped
// - `steps` cost twenty times as much for a bicycle (the table), a little more on foot
// - one-way for bicycle: `oneway:bicycle` wins over `oneway`; `yes`, `1`, `true` and `reversible`
//   (read as `yes`) are forward, `-1` is backward, `no` and other values are both ways
// - one-way for bicycle with a contraflow lane (`cycleway*=opposite*`, or `cycleway*=lane|track`
//   with `cycleway*:oneway=-1|no`) on a one-way road: both ways
// - `junction=roundabout` is one-way (forward) for bicycle unless a one-way tag says otherwise
// - one-way for foot: only `oneway:foot` counts; `oneway` is ignored
//
// Skipped
// - `vehicle=*`, `motor_vehicle=*`, `maxspeed`, `surface`, `smoothness`, slope and other cost tags
// - conditional access (`access:conditional`, `bicycle:conditional`) and lifecycle prefixes
//   (`disused:`, `construction:`): such ways are read as their plain tags
// - turn costs, and a route's own `network` or `ref` (the route relation is what decides the mode)
// - highway kinds not in the tables (motorway, construction, busway, platform and the rest) are
//   not routable, even with `bicycle=yes`
//
// Numbers are judgement, not measurement. They are listed here so Tobias can change them in one place.

export type ProfileName = 'bicycle' | 'foot'

/** What a profile says about one way */
export interface WayRule {
  /** The highway kind the rule was read from, after `area=yes` and `_link` mapping */
  kind: string
  /** The way may be followed in its node order */
  forward: boolean
  /** The way may be followed against its node order */
  backward: boolean
  /** Cost per metre, relative to a plain road (1). The router's cost is length times this */
  factor: number
  /** The tag rules that applied, for reports and tests */
  covered: string[]
}

export interface Profile {
  name: ProfileName
  /** Whether turn restrictions apply. Foot routes ignore them */
  restrictions: boolean
  /** A restriction whose `except` lists this value does not apply. Undefined: none */
  exceptValue: string | undefined
  /** The smallest factor of any way. The A* heuristic multiplies the distance by it */
  minFactor: number
  wayRule(tags: Readonly<Record<string, string>>): WayRule | undefined
}

interface KindEntry {
  factor: number
  /** Routable without an access tag */
  routable: boolean
}

// Bicycle: cycleways and tracks are preferred; footways and pedestrian areas need a `bicycle=` tag
const BICYCLE_KINDS: Record<string, KindEntry> = {
  cycleway: { factor: 0.7, routable: true },
  track: { factor: 0.8, routable: true },
  path: { factor: 0.9, routable: true },
  living_street: { factor: 1, routable: true },
  residential: { factor: 1, routable: true },
  unclassified: { factor: 1, routable: true },
  service: { factor: 1.2, routable: true },
  road: { factor: 1.3, routable: true },
  bridleway: { factor: 1.3, routable: true },
  tertiary: { factor: 1.3, routable: true },
  secondary: { factor: 1.6, routable: true },
  primary: { factor: 2, routable: true },
  trunk: { factor: 4, routable: true },
  footway: { factor: 1.5, routable: false },
  pedestrian: { factor: 2, routable: false },
  steps: { factor: 20, routable: true },
}

// Foot: footways and paths are preferred; cycleways need a `foot=` tag
const FOOT_KINDS: Record<string, KindEntry> = {
  footway: { factor: 1, routable: true },
  pedestrian: { factor: 1, routable: true },
  path: { factor: 1, routable: true },
  steps: { factor: 1.3, routable: true },
  track: { factor: 1.1, routable: true },
  bridleway: { factor: 1.2, routable: true },
  living_street: { factor: 1, routable: true },
  residential: { factor: 1, routable: true },
  unclassified: { factor: 1, routable: true },
  service: { factor: 1.1, routable: true },
  road: { factor: 1.3, routable: true },
  tertiary: { factor: 1.3, routable: true },
  secondary: { factor: 1.5, routable: true },
  primary: { factor: 1.8, routable: true },
  trunk: { factor: 4, routable: true },
  cycleway: { factor: 1.5, routable: false },
}

const NOT_ALLOWED = new Set(['no', 'private'])
const ALLOWED = new Set([
  'yes',
  'designated',
  'permissive',
  'official',
  'destination',
  'delivery',
  'customers',
])
const LINK_FACTOR = 1.1
const SIDEPATH_FACTOR = 20
const DISMOUNT_FACTOR = 10
const DISCOURAGED_FACTOR = 2

const CYCLEWAY_SIDES = ['cycleway', 'cycleway:left', 'cycleway:right', 'cycleway:both']

type Direction = 'forward' | 'backward' | 'both'

function directionOf(value: string | undefined): Direction {
  if (value === undefined) return 'both'
  if (value === 'yes' || value === '1' || value === 'true' || value === 'reversible')
    return 'forward'
  if (value === '-1') return 'backward'
  return 'both' // `no`, `false`, `0` and values we do not know
}

/** The contraflow rule that lets a bicycle use a one-way road against its direction, or undefined */
function contraflowRule(tags: Readonly<Record<string, string>>): string | undefined {
  for (const side of CYCLEWAY_SIDES) {
    const value = tags[side]
    if (value?.startsWith('opposite')) return `${side}=${value}`
  }
  for (const side of CYCLEWAY_SIDES) {
    const value = tags[side]
    const oneway = tags[`${side}:oneway`]
    if ((value === 'lane' || value === 'track') && (oneway === '-1' || oneway === 'no'))
      return `${side}:oneway=${oneway}`
  }
  return undefined
}

function makeProfile(
  name: ProfileName,
  kinds: Record<string, KindEntry>,
  options: { restrictions: boolean; exceptValue: string | undefined },
): Profile {
  const wayRule = (tags: Readonly<Record<string, string>>): WayRule | undefined => {
    const highway = tags.highway
    if (highway === undefined) return undefined
    const covered: string[] = []
    let kind = highway
    if (tags.area === 'yes') {
      kind = 'pedestrian'
      covered.push('area=yes')
    }
    const isLink = kind.endsWith('_link')
    const entry = kinds[isLink ? kind.slice(0, -'_link'.length) : kind]
    if (!entry) return undefined
    let factor = entry.factor
    let routable = entry.routable
    if (isLink) {
      factor *= LINK_FACTOR
      covered.push('link')
    }

    // The mode tag is read first, then `access` for every mode
    const modeKey = name
    const modeTag = tags[modeKey]
    const mode = modeTag ?? tags.access
    if (mode !== undefined) {
      covered.push(`${modeTag !== undefined ? modeKey : 'access'}=${mode}`)
      if (NOT_ALLOWED.has(mode)) return undefined
      if (mode === 'dismount') {
        routable = true
        if (name === 'bicycle') factor *= DISMOUNT_FACTOR
      } else if (mode === 'use_sidepath') {
        routable = true
        factor *= SIDEPATH_FACTOR
      } else if (mode === 'discouraged') {
        routable = true
        factor *= DISCOURAGED_FACTOR
      } else if (ALLOWED.has(mode)) {
        routable = true
      }
    }
    if (!routable) return undefined

    let direction: Direction = 'both'
    if (name === 'bicycle') {
      const roundabout = tags.junction === 'roundabout'
      const raw = tags['oneway:bicycle'] ?? tags.oneway ?? (roundabout ? 'yes' : undefined)
      if (raw === undefined && roundabout) covered.push('junction=roundabout')
      else if (tags['oneway:bicycle'] !== undefined) covered.push(`oneway:bicycle=${raw}`)
      else if (tags.oneway !== undefined) covered.push(`oneway=${raw}`)
      direction = directionOf(raw)
      if (direction !== 'both') {
        const contraflow = contraflowRule(tags)
        if (contraflow !== undefined) {
          direction = 'both'
          covered.push(`contraflow ${contraflow}`)
        }
      }
    } else if (tags['oneway:foot'] !== undefined) {
      direction = directionOf(tags['oneway:foot'])
      covered.push(`oneway:foot=${tags['oneway:foot']}`)
    }

    return {
      kind,
      forward: direction !== 'backward',
      backward: direction !== 'forward',
      factor,
      covered,
    }
  }

  let minFactor = Infinity
  for (const entry of Object.values(kinds)) minFactor = Math.min(minFactor, entry.factor)
  return { name, minFactor, wayRule, ...options }
}

/** Bicycle and MTB routes. Turn restrictions apply unless they say `except=bicycle` */
export const bicycleProfile: Profile = makeProfile('bicycle', BICYCLE_KINDS, {
  restrictions: true,
  exceptValue: 'bicycle',
})

/** Hiking and foot routes. Turn restrictions are ignored, as Tobias decided */
export const footProfile: Profile = makeProfile('foot', FOOT_KINDS, {
  restrictions: false,
  exceptValue: undefined,
})

export const profiles: Record<ProfileName, Profile> = {
  bicycle: bicycleProfile,
  foot: footProfile,
}
