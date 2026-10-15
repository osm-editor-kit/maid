/**
 * Mirror of the directional keys and direction-dependent values of a way that points the other way. Pure.
 *
 * Ported from the street space editor's `osm-way-chain/src/traversal/mirror-tags.ts` (MIT, Tobias Jordans), the
 * key part and the value part. Changes against the port:
 * - `placement=left_of:n` on a way without a lane count (no `lanes`, `lanes:forward`, `lanes:backward`) is left
 *   unchanged. The port used the lane number as the total, and then mirror(mirror(x)) was not x.
 * - `:start` and `:end` are mirrored as keys (the design keeps them, section 2.8).
 *
 * Round trips: mirrorKey is an involution for every key. mirrorValue is an involution for canonical values; the
 * synonyms `true`, `1` (for `yes`) and `reverse` (for `-1`) come back as `yes`. That is intended: the value
 * mirror is for display and comparison only. A write never goes through it (see plan.ts).
 */
import type { Tags } from './types.ts'

const LEFT_RIGHT = /:(left|right)(:|$)/g
const FORWARD_BACKWARD = /:(forward|backward)(:|$)/g
const START_END = /:(start|end)(:|$)/g

const ONEWAY_FORWARD = new Set(['yes', 'true', '1'])
const ONEWAY_REVERSE = new Set(['-1', 'reverse'])

const TURN_SWAP: Readonly<Record<string, string>> = {
  left: 'right',
  right: 'left',
  slight_left: 'slight_right',
  slight_right: 'slight_left',
  sharp_left: 'sharp_right',
  sharp_right: 'sharp_left',
  merge_to_left: 'merge_to_right',
  merge_to_right: 'merge_to_left',
}

const PLACEMENT = /^(left_of|right_of|middle_of):(\d+)$/i

/** The key with its left/right, forward/backward and start/end parts swapped. Applying it twice gives the key back. */
export function mirrorKey(key: string): string {
  return key
    .replace(
      LEFT_RIGHT,
      (_match, side: string, suffix: string) => `:${side === 'left' ? 'right' : 'left'}${suffix}`,
    )
    .replace(
      FORWARD_BACKWARD,
      (_match, dir: string, suffix: string) =>
        `:${dir === 'forward' ? 'backward' : 'forward'}${suffix}`,
    )
    .replace(
      START_END,
      (_match, pos: string, suffix: string) => `:${pos === 'start' ? 'end' : 'start'}${suffix}`,
    )
}

/** True when the key names a direction, so that its mirror is another key */
export function isDirectionalKey(key: string): boolean {
  return mirrorKey(key) !== key
}

function isOnewayKey(key: string): boolean {
  const lower = key.toLowerCase()
  return lower === 'oneway' || lower.startsWith('oneway:')
}

function mirrorOneway(value: string): string {
  const lower = value.trim().toLowerCase()
  if (ONEWAY_FORWARD.has(lower)) return '-1'
  if (ONEWAY_REVERSE.has(lower)) return 'yes'
  return value
}

function isPlacementKey(key: string): boolean {
  const lower = key.toLowerCase()
  return lower === 'placement' || lower.startsWith('placement:')
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined
  const n = Number.parseInt(value.trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** The number of lanes the way has in total, or 0 when its tags do not say */
export function laneCountOf(tags: Tags): number {
  const lanes = parsePositiveInt(tags.lanes)
  if (lanes !== undefined) return lanes
  const sum =
    (parsePositiveInt(tags['lanes:forward']) ?? 0) +
    (parsePositiveInt(tags['lanes:backward']) ?? 0) +
    (parsePositiveInt(tags['lanes:both_ways']) ?? 0)
  return sum
}

function mirrorPlacement(value: string, laneCount: number): string {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === 'transition' || laneCount === 0) return value
  const match = PLACEMENT.exec(trimmed)
  if (!match) return value
  const kind = (match[1] ?? '').toLowerCase()
  const lane = Number.parseInt(match[2] ?? '', 10)
  if (!Number.isInteger(lane) || lane < 1 || lane > laneCount) return value
  const mirrored = laneCount + 1 - lane
  if (kind === 'left_of') return `right_of:${mirrored}`
  if (kind === 'right_of') return `left_of:${mirrored}`
  return `middle_of:${mirrored}`
}

function isBareSideKey(key: string): boolean {
  return key === 'sidewalk' || key === 'cycleway' || key === 'busway'
}

function mirrorBareSide(value: string): string {
  const lower = value.trim().toLowerCase()
  if (lower === 'left') return 'right'
  if (lower === 'right') return 'left'
  return value
}

function isLanesPipeKey(key: string): boolean {
  return key.toLowerCase().includes(':lanes')
}

function mirrorTurnToken(token: string): string {
  return token
    .split(';')
    .map((part) => TURN_SWAP[part.trim().toLowerCase()] ?? part)
    .join(';')
}

function mirrorChangeToken(token: string): string {
  const lower = token.trim().toLowerCase()
  if (lower === 'not_left') return 'not_right'
  if (lower === 'not_right') return 'not_left'
  return token
}

function mirrorLanesPipe(key: string, value: string): string {
  const lower = key.toLowerCase()
  const reversed = value.split('|').reverse()
  if (lower.includes('turn:lanes')) return reversed.map(mirrorTurnToken).join('|')
  if (lower.includes('change:lanes')) return reversed.map(mirrorChangeToken).join('|')
  return reversed.join('|')
}

/**
 * The value as seen from the other direction. `tags` are the way's tags (the lane count of a placement comes from
 * them). A value that does not change is returned as it is. Use `isDirectionDependent` to ask whether it changes.
 */
export function mirrorValue(key: string, value: string, tags: Tags = {}): string {
  if (isOnewayKey(key)) return mirrorOneway(value)
  if (isPlacementKey(key)) return mirrorPlacement(value, laneCountOf(tags))
  if (isBareSideKey(key)) return mirrorBareSide(value)
  if (isLanesPipeKey(key)) return mirrorLanesPipe(key, value)
  return value
}

/** True when the row (key and value) means something else from the other direction */
export function isDirectionDependent(key: string, value: string, tags: Tags = {}): boolean {
  return isDirectionalKey(key) || mirrorValue(key, value, tags) !== value
}

/** The tags of a way that points the other way: keys mirrored, direction-dependent values mirrored */
export function mirrorTags(tags: Tags): Record<string, string> {
  const mirrored: Record<string, string> = {}
  for (const [key, value] of Object.entries(tags)) {
    mirrored[mirrorKey(key)] = mirrorValue(key, value, tags)
  }
  return mirrored
}
