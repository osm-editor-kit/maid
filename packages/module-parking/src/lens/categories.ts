/**
 * The colours of the parking map style, from the JOSM style Styles_euvm_parking_import.mapcss (its rule groups 1 to 9,
 * in josm-setup-presets-styles.md section 3.1 and 4c) and the two lines of its other files. Pure.
 *
 * The category of a feature is the first one in CATEGORY_ORDER that matches: the same order as the lens rules (4c),
 * where the JOSM groups that come later in the file win. Categories with `source: 'maid'` have no JOSM colour: they
 * are Maid's own, and the legend says so.
 */
import { readSide, type RealSide } from '../sides.ts'

export type CategoryId =
  | 'warnings'
  | 'loading_only'
  | 'charging_only'
  | 'disabled'
  | 'no_stopping'
  | 'restricted'
  | 'paid'
  | 'time_limit'
  | 'free'
  | 'parked'
  | 'no_parking_side'
  | 'not_mapped'

export type Category = {
  id: CategoryId
  /** `#rrggbb`, the JOSM value (see `josm` for the name the file uses) */
  colour: string
  /** The name the MapCSS file uses, when it has one */
  josm?: string
  /** Legend text (English; the lens rules and the legend read it) */
  label: string
  /** 'josm': the colour is the file's. 'maid': a colour Maid picks, the file has none for it */
  source: 'josm' | 'maid'
}

export const CATEGORIES: Record<CategoryId, Category> = {
  warnings: {
    id: 'warnings',
    colour: '#000000',
    josm: 'black',
    label: 'Warnings',
    source: 'josm',
  },
  loading_only: {
    id: 'loading_only',
    colour: '#e0ffff',
    josm: 'lightcyan',
    label: 'Loading zone',
    source: 'josm',
  },
  charging_only: {
    id: 'charging_only',
    colour: '#cd7f32',
    josm: '#cd7f32',
    label: 'Charging',
    source: 'josm',
  },
  disabled: {
    id: 'disabled',
    colour: '#cd7f32',
    josm: '#cd7f32',
    label: 'Disabled parking',
    source: 'josm',
  },
  no_stopping: {
    id: 'no_stopping',
    colour: '#ff0000',
    josm: 'red',
    label: 'No stopping or no parking',
    source: 'josm',
  },
  restricted: {
    id: 'restricted',
    colour: '#ff0000',
    josm: 'red',
    label: 'Restricted',
    source: 'josm',
  },
  paid: {
    id: 'paid',
    colour: '#87cefa',
    josm: 'lightskyblue',
    label: 'Paid parking',
    source: 'josm',
  },
  time_limit: {
    id: 'time_limit',
    colour: '#1e90ff',
    josm: 'dodgerblue',
    label: 'Time limit',
    source: 'josm',
  },
  free: {
    id: 'free',
    colour: '#7fff00',
    josm: 'chartreuse',
    label: 'Free parking',
    source: 'josm',
  },
  // parking without a restriction, a fee or a time limit: the common case, so a strong colour and not a grey
  parked: {
    id: 'parked',
    colour: '#16a34a',
    label: 'Parked, no further tags',
    source: 'maid',
  },
  no_parking_side: {
    id: 'no_parking_side',
    colour: '#616161',
    label: 'No parking on this side',
    source: 'maid',
  },
  not_mapped: {
    id: 'not_mapped',
    colour: '#bdbdbd',
    label: 'Not mapped (dashed)',
    source: 'maid',
  },
}

/** The order of the categories: the first that matches decides. Warnings first, as in the lens (4c). */
export const CATEGORY_ORDER: readonly CategoryId[] = [
  'warnings',
  'loading_only',
  'charging_only',
  'disabled',
  'no_stopping',
  'restricted',
  'paid',
  'time_limit',
  'free',
]

type Tags = Readonly<Record<string, string | undefined>>

function present(value: string | undefined): value is string {
  return value !== undefined && value !== ''
}

/** Conditional values are free text (`loading_only @ (Mo-Fr 08:00-18:00)`); the file's `~/loading_only/` is a contains test */
function mentions(value: string | undefined, word: string) {
  return present(value) && value.includes(word)
}

/**
 * The category of a separately mapped parking area (amenity=parking), with the file's own selectors:
 * `fee=no` free, `maxstay` time limit, `fee=yes` or `fee:conditional` paid, `access` other than yes or
 * `access:conditional`, `restriction` or `restriction:conditional` restricted, `restriction=no_stopping|no_parking`
 * no stopping (fill), `disabled` and `disabled:conditional`, `restriction=charging_only` and the conditional
 * containing it, the same for loading_only, `warnings`. Undefined when no rule matches.
 */
export function areaCategory(tags: Tags): CategoryId | undefined {
  const restriction = tags.restriction
  if (present(tags.warnings)) return 'warnings'
  if (restriction === 'loading_only' || mentions(tags['restriction:conditional'], 'loading_only'))
    return 'loading_only'
  if (restriction === 'charging_only' || mentions(tags['restriction:conditional'], 'charging_only'))
    return 'charging_only'
  if (present(tags.disabled) || present(tags['disabled:conditional'])) return 'disabled'
  if (restriction === 'no_stopping' || restriction === 'no_parking') return 'no_stopping'
  if (
    (present(tags.access) && tags.access !== 'yes') ||
    present(tags['access:conditional']) ||
    present(restriction) ||
    present(tags['restriction:conditional'])
  ) {
    return 'restricted'
  }
  if (tags.fee === 'yes' || present(tags['fee:conditional'])) return 'paid'
  if (present(tags.maxstay) || present(tags['maxstay:conditional'])) return 'time_limit'
  if (tags.fee === 'no') return 'free'
  return undefined
}

/**
 * The category of one side of a road, from the side's values (readSide: own key, else `both`). `position` is the
 * value of `parking:<side>` (lane, street_side, on_kerb, half_on_kerb, shoulder, separate, no, yes, unknown).
 * Undefined when the side has no parking tags at all. The same order as areaCategory, without `warnings`
 * (the file has none for the road sides).
 */
export function sideCategory(tags: Tags, side: RealSide): CategoryId | undefined {
  const position = readSide(tags, side)
  if (position === 'no') return 'no_parking_side'
  const restriction = readSide(tags, side, 'restriction')
  const restrictionConditional = readSide(tags, side, 'restriction:conditional')
  if (restriction === 'loading_only' || mentions(restrictionConditional, 'loading_only'))
    return 'loading_only'
  if (restriction === 'charging_only' || mentions(restrictionConditional, 'charging_only'))
    return 'charging_only'
  if (
    present(readSide(tags, side, 'disabled')) ||
    present(readSide(tags, side, 'disabled:conditional'))
  )
    return 'disabled'
  if (restriction === 'no_stopping' || restriction === 'no_parking') return 'no_stopping'
  const access = readSide(tags, side, 'access')
  if (
    (present(access) && access !== 'yes') ||
    present(readSide(tags, side, 'access:conditional')) ||
    present(restriction) ||
    present(restrictionConditional)
  ) {
    return 'restricted'
  }
  const fee = readSide(tags, side, 'fee')
  if (fee === 'yes' || present(readSide(tags, side, 'fee:conditional'))) return 'paid'
  if (
    present(readSide(tags, side, 'maxstay')) ||
    present(readSide(tags, side, 'maxstay:conditional'))
  )
    return 'time_limit'
  if (fee === 'no') return 'free'
  return undefined
}

/** True if the tags say anything about one side: its own key, the `both` key, or a key below either */
export function hasSideTags(tags: Tags, side: RealSide) {
  for (const key of Object.keys(tags)) {
    if (!key.startsWith('parking:')) continue
    const rest = key.slice('parking:'.length)
    for (const prefix of [side, 'both']) {
      if (rest === prefix || rest.startsWith(`${prefix}:`)) {
        if (present(tags[key])) return true
      }
    }
  }
  return false
}
