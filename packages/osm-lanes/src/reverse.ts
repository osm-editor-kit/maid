import { mirrorTags } from '@osm-editor-kit/osm-way-chain'

/** A key that holds one value per lane, or a lane count: `lanes`, `lanes:forward`, `turn:lanes`, `width:lanes:backward` */
function isLaneKey(key: string): boolean {
  return /(^|:)lanes(:(forward|backward|both_ways))?$/.test(key)
}

function swapDirection(key: string): string {
  if (key.endsWith(':forward')) return `${key.slice(0, -':forward'.length)}:backward`
  if (key.endsWith(':backward')) return `${key.slice(0, -':backward'.length)}:forward`
  return key
}

/**
 * The tags of the way drawn the other way round. As osm-way-chain's `mirrorTags` (sides, `oneway`, `:forward` and
 * `:backward` swap), except for the lane keys: their pipes run left to right in the direction of travel and a turn
 * value is what the driver does, so reversing the way changes neither. Only `:forward` and `:backward` swap there
 * (`turn:lanes:forward=left|through` becomes `turn:lanes:backward=left|through`, a oneway's `turn:lanes` stays).
 * `mirrorTags` reverses the pipes and swaps left and right turns, which put the values of a `oneway=-1` road on the
 * wrong lanes (Maid, 2026-11-11).
 */
export function reverseWayTags(tags: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(mirrorTags(tags))) if (!isLaneKey(key)) out[key] = value
  for (const [key, value] of Object.entries(tags))
    if (isLaneKey(key)) out[swapDirection(key)] = value
  return out
}
