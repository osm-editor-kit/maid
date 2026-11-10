/**
 * Sidewalks and cycleways tagged on a road (`sidewalk:left=yes`, `cycleway:right=track`, `cycleway=lane`), split into
 * one entry per side with the side's own tags. Written for Maid in place of the street space editor's
 * `@osm-editor-kit/osm-sidepath-tags`, whose `expandSidepaths` calls `@tilda-geo/bicycle-infrastructure` (AGPL), which
 * Maid does not take in (NOTICE.md). Only what `from-tags.ts` and `slot-ids.ts` read is here: the side, the value
 * and the nested keys (`cycleway:left:width` → `width`). Which entries become slots is decided in `from-tags.ts`.
 */

export type SidepathPrefix = 'cycleway' | 'sidewalk'
export type SidepathSide = 'left' | 'right'

export type SidepathRef = {
  osmType: 'way'
  osmId: number
  prefix: SidepathPrefix
  side: SidepathSide
}

const PREFIXES: SidepathPrefix[] = ['cycleway', 'sidewalk']
const SIDES: SidepathSide[] = ['left', 'right']

/** Ways that are themselves a path: their `cycleway=*` or `sidewalk=*` does not describe a path beside them */
const PATH_HIGHWAYS = new Set(['cycleway', 'footway', 'path', 'bridleway', 'pedestrian', 'steps'])

/** The value of one side: `prefix:side`, then `prefix:both`, then the bare key (`sidewalk=left` means the left side) */
function sideValue(
  tags: Record<string, string>,
  prefix: SidepathPrefix,
  side: SidepathSide,
): string | undefined {
  const sided = tags[`${prefix}:${side}`]
  if (sided != null) return sided
  const both = tags[`${prefix}:both`]
  if (both != null) return both
  if (tags[`${prefix}:left`] != null || tags[`${prefix}:right`] != null) return undefined
  const bare = tags[prefix]
  if (bare == null) return undefined
  const value = bare.toLowerCase()
  if (value === 'both') return 'yes'
  if (value === 'left' || value === 'right') return value === side ? 'yes' : undefined
  return bare
}

/** The nested keys of one side, without their prefix: `cycleway:both:width` then `cycleway:left:width` → `width` */
function nestedTags(
  tags: Record<string, string>,
  prefix: SidepathPrefix,
  side: SidepathSide,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const part of ['both', side]) {
    const head = `${prefix}:${part}:`
    for (const [key, value] of Object.entries(tags)) {
      if (key.startsWith(head)) result[key.slice(head.length)] = value
    }
  }
  return result
}

/**
 * One entry per side and prefix that has a value, `no` and `separate` included (the caller drops them). The entry's
 * tags hold `highway` (`footway` or `cycleway`), the value under the prefix, and the side's nested keys.
 */
export function expandSidepaths(
  osmId: number,
  tags: Record<string, string>,
): Array<{ ref: SidepathRef; tags: Record<string, string> }> {
  if (PATH_HIGHWAYS.has(tags.highway ?? '')) return []
  const results: Array<{ ref: SidepathRef; tags: Record<string, string> }> = []
  for (const prefix of PREFIXES) {
    for (const side of SIDES) {
      const value = sideValue(tags, prefix, side)
      if (value == null) continue
      results.push({
        ref: { osmType: 'way', osmId, prefix, side },
        tags: {
          ...nestedTags(tags, prefix, side),
          highway: prefix === 'sidewalk' ? 'footway' : 'cycleway',
          [prefix]: value,
        },
      })
    }
  }
  return results
}

export function formatSidepathFeatureId(ref: SidepathRef): string {
  return `way/${ref.osmId}/${ref.prefix}/${ref.side}`
}

export function parseSidepathFeatureId(id: string): SidepathRef | null {
  const parts = id.split('/')
  if (parts.length !== 4 || parts[0] !== 'way') return null
  const osmId = Number.parseInt(parts[1] ?? '', 10)
  if (!Number.isInteger(osmId) || osmId <= 0) return null
  const prefix = parts[2]
  const side = parts[3]
  if (prefix !== 'cycleway' && prefix !== 'sidewalk') return null
  if (side !== 'left' && side !== 'right') return null
  return { osmType: 'way', osmId, prefix, side }
}
