/**
 * Small, exact tag edits of a road's lanes: one value of one lane, or one lane more or less. Pure functions from tags to
 * tags. They change only the keys that the edit is about, and never write a value the person did not choose: the
 * street space editor's `serializeWayLanes` writes every pipe of the parsed model back, defaults included
 * (`vehicle:lanes=yes|yes` after adding a lane), which Maid avoids (docs/research/lanes-ux.md, 3.1).
 *
 * Pipe order is OSM's: left to right in the direction of travel of that direction. A oneway road uses the plain keys
 * (`turn:lanes`), a road with two directions the directional ones (`turn:lanes:forward`, `turn:lanes:backward`,
 * `turn:lanes:both_ways`).
 */
import { isOneway, parseWayLanes, type LaneDirection } from '@osm-editor-kit/osm-lanes'

export type Tags = Readonly<Record<string, string | undefined>>

/** What one cell of the lane table edits, and the pipe key it lives in */
export const LANE_PROPS = {
  turn: 'turn:lanes',
  width: 'width:lanes',
  bus: 'bus:lanes',
  bicycle: 'bicycle:lanes',
  vehicle: 'vehicle:lanes',
  change: 'change:lanes',
} as const

export type LaneProp = keyof typeof LANE_PROPS

/** The tags without undefined values, as the lane packages read them */
export function plainTags(tags: Tags): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(tags)) if (value !== undefined) out[key] = value
  return out
}

/** True when the road has one direction of travel (`oneway=yes|-1|…`): then the plain keys are used */
export function roadIsOneway(tags: Tags): boolean {
  return isOneway(plainTags(tags))
}

/** The key of a pipe for a direction: `turn:lanes` on a oneway road, `turn:lanes:backward` on a two-way road */
export function pipeKey(base: string, direction: LaneDirection, oneway: boolean): string {
  return oneway ? base : `${base}:${direction}`
}

/** The number of lanes in each direction, as the lane model reads the tags */
export function laneCounts(tags: Tags): Record<LaneDirection, number> {
  const counts: Record<LaneDirection, number> = { forward: 0, backward: 0, both_ways: 0 }
  for (const slot of parseWayLanes(plainTags(tags)).slots) counts[slot.direction] += 1
  return counts
}

function split(value: string | undefined, length: number): string[] {
  const parts = value === undefined ? [] : value.split('|')
  while (parts.length < length) parts.push('')
  return parts
}

function setOrDelete(out: Record<string, string | undefined>, key: string, parts: string[]) {
  if (parts.every((part) => part === '')) delete out[key]
  else out[key] = parts.join('|')
}

/**
 * The tags with one lane's value set (`value` empty or undefined: the lane's entry is emptied, and the key goes when
 * no lane has a value). `index` counts in OSM pipe order within the direction.
 */
export function setLaneValue(
  tags: Tags,
  direction: LaneDirection,
  index: number,
  prop: LaneProp,
  value: string | undefined,
): Record<string, string | undefined> {
  const oneway = roadIsOneway(tags)
  const count = laneCounts(tags)[direction]
  const key = pipeKey(LANE_PROPS[prop], direction, oneway)
  const parts = split(tags[key], Math.max(count, index + 1))
  parts[index] = (value ?? '').trim()
  const out: Record<string, string | undefined> = { ...tags }
  setOrDelete(out, key, parts)
  return out
}

/** The pipe keys of a direction that the tags have: `*:lanes` on a oneway road, `*:lanes:<direction>` otherwise */
function pipeKeysOf(tags: Tags, direction: LaneDirection, oneway: boolean): string[] {
  const suffix = oneway ? ':lanes' : `:lanes:${direction}`
  return Object.keys(tags).filter((key) => key.endsWith(suffix) && tags[key] !== undefined)
}

/**
 * The lane counts as tagged (`lanes`, `lanes:forward`, …), or as the lane model reads them where a key is missing. They
 * can differ from the number of pipe entries: in Germany a cycle lane is often in the pipes but not in `lanes`.
 */
export function taggedCounts(tags: Tags): Record<LaneDirection, number> & { total: number } {
  const model = parseWayLanes(plainTags(tags))
  const slots = laneCounts(tags)
  const forward = model.lanesForward ?? slots.forward
  const backward = model.lanesBackward ?? slots.backward
  const bothWays = model.lanesBothWays ?? slots.both_ways
  return {
    forward,
    backward,
    both_ways: bothWays,
    total: model.lanesTotal ?? forward + backward + bothWays,
  }
}

/** The counts after one lane more (`step` 1) or less (-1) in a direction, written as tags */
function writeCounts(
  out: Record<string, string | undefined>,
  tags: Tags,
  direction: LaneDirection,
  step: 1 | -1,
  oneway: boolean,
) {
  const counts = taggedCounts(tags)
  out.lanes = String(Math.max(0, counts.total + step))
  if (oneway) return
  const next = { ...counts, [direction]: Math.max(0, counts[direction] + step) }
  out['lanes:forward'] = String(next.forward)
  out['lanes:backward'] = String(next.backward)
  if (next.both_ways > 0) out['lanes:both_ways'] = String(next.both_ways)
  else delete out['lanes:both_ways']
}

/**
 * One lane more in a direction, at its right edge in the direction of travel (the kerb side where traffic keeps
 * right). Every pipe of the direction gets an empty entry, so the values of the other lanes stay where they are.
 */
export function addLane(tags: Tags, direction: LaneDirection): Record<string, string | undefined> {
  const oneway = roadIsOneway(tags)
  const before = laneCounts(tags)[direction]
  const out: Record<string, string | undefined> = { ...tags }
  for (const key of pipeKeysOf(tags, direction, oneway)) {
    out[key] = [...split(tags[key], before), ''].join('|')
  }
  writeCounts(out, tags, direction, 1, oneway)
  return out
}

/** One lane less: the lane at `index` (pipe order) and its entry in every pipe of the direction go */
export function removeLane(
  tags: Tags,
  direction: LaneDirection,
  index: number,
): Record<string, string | undefined> {
  const oneway = roadIsOneway(tags)
  const before = laneCounts(tags)[direction]
  if (index < 0 || index >= before) return { ...tags }
  const out: Record<string, string | undefined> = { ...tags }
  for (const key of pipeKeysOf(tags, direction, oneway)) {
    const parts = split(tags[key], before)
    parts.splice(index, 1)
    setOrDelete(out, key, parts)
  }
  writeCounts(out, tags, direction, -1, oneway)
  return out
}

/** The tags that differ, as `actionChangeTags` takes them: every key with its new value, removed keys left out */
export function changedTags(after: Record<string, string | undefined>): Record<string, string> {
  return plainTags(after)
}
