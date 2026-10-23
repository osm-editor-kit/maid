/**
 * Mirror of the directional keys and direction-dependent values of a way that points the other way. Pure.
 *
 * The keys and values follow the Reverse operation's rules (packages/model, reverse.ts: `reverseKey` and
 * `reverseValue`), so a value the table shows as mirrored is the one Reverse would write. `incline`, `up`/`down`,
 * `forward`/`backward` and the bare `left`/`right` values of any key are mirrored that way. Where the table goes
 * further than Reverse, it does so on purpose, as the design asks (docs/research/way-table.md, 2.8, 4.8 and step 7):
 * - `oneway` and `conveying` are always mirrored. Reverse leaves them unless it is asked to (iD#13027: a plain reverse
 *   keeps conveying; iD: correcting a backwards oneway is the usual reason to reverse). The table shows the way's
 *   direction, so it turns them itself. The table compares a reversed neighbour's oneway with the chain's direction.
 *   `true` and `reverse` are read as the canonical `yes` and `-1`. `oneway=1` is not a direction (iD#13026), so it
 *   stays as it is.
 * - `placement=left_of:n` follows the lane count of the way, and is left alone without one (no `lanes`, `lanes:forward`
 *   or `lanes:backward`). The street space editor's port used the lane number as the total, and then mirror(mirror(x))
 *   was not x.
 * - Lane pipes (`turn:lanes`, `change:lanes` and every other `*:lanes` key) are reversed in order, and their turn and
 *   change tokens are mirrored. Reverse keeps turn lanes as they are (iD#5674).
 * - `:start` and `:end` are mirrored as keys. Reverse does not do this. The design keeps them (2.8); question 7 of the
 *   design still asks whether Maid does it too.
 * - A compass bearing (`direction=N`) on a way is not mirrored, as in Reverse: Reverse mirrors bearings only on the
 *   node it reverses.
 * - A zero `incline` stays `0` (Reverse writes `-0`, see reverse.ts).
 *
 * Round trips: mirrorKey is an involution for every key. mirrorValue is an involution for canonical values; the
 * synonyms `true` (for `yes`) and `reverse` (for `-1`) come back as `yes` and `-1` respectively. That is intended:
 * the value mirror is for display and comparison only. A write never goes through it (see plan.ts).
 */
import { reverseKey, reverseValue } from '@osm-editor-kit/maid-model'
import type { Tags } from './types.ts'

const START_END = /:(start|end)(?=:|$)/g

/** The values of oneway that mean the way's direction or its reverse, as the canonical values */
const ONEWAY_CANONICAL: ReadonlyMap<string, string> = new Map([
  ['yes', 'yes'],
  ['true', 'yes'],
  ['-1', '-1'],
  ['reverse', '-1'],
])

const PLACEMENT = /^(left_of|right_of|middle_of):(\d+)$/i

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

function swapStartEnd(key: string): string {
  return key.replace(START_END, (_match, pos: string) => `:${pos === 'start' ? 'end' : 'start'}`)
}

/** The key with its left/right, forward/backward and start/end parts swapped. Applying it twice gives the key back. */
export function mirrorKey(key: string): string {
  return swapStartEnd(reverseKey(key))
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
  const canonical = ONEWAY_CANONICAL.get(value.trim().toLowerCase()) ?? value
  return reverseValue('oneway', canonical, {}, { reverseOneway: true })
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
 * them, and a `side` value depends on the highway). A value that does not change is returned as it is. Use
 * `isDirectionDependent` to ask whether it changes.
 */
export function mirrorValue(key: string, value: string, tags: Tags = {}): string {
  if (isOnewayKey(key)) return mirrorOneway(value)
  if (isPlacementKey(key)) return mirrorPlacement(value, laneCountOf(tags))
  if (isLanesPipeKey(key)) return mirrorLanesPipe(key, value)
  // A plain Reverse keeps conveying (iD#13027); the table shows the way's direction, so it asks for the turn
  if (key === 'conveying') return reverseValue(key, value, tags, { reverseOneway: true })
  return reverseValue(key, value, tags)
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
