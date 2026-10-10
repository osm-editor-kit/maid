import presetsJson from './generated/presets.json'
import type { Tags } from './classes'

export type Geometry = 'point' | 'vertex' | 'line' | 'area' | 'relation'
export type Preset = { id: string; name: string; tags: Tags; geometry: string[]; icon?: string; score: number }

const BY_KEY = new Map<string, Preset[]>()
const FALLBACK = new Map<string, Preset>()
for (const preset of presetsJson as Preset[]) {
  const key = Object.keys(preset.tags)[0]
  if (!key) {
    // iD's generic presets: point, line, area, relation
    FALLBACK.set(preset.id, preset)
    continue
  }
  const list = BY_KEY.get(key)
  if (list) list.push(preset)
  else BY_KEY.set(key, [preset])
}

/**
 * The iD preset that describes a feature. A simplified version of iD's preset matching:
 * all preset tags must match, exact values score higher than wildcards, and the preset must
 * allow the geometry. Falls back to iD's generic preset for the geometry.
 */
export function matchPreset(tags: Tags, geometry: Geometry): Preset | undefined {
  let best: Preset | undefined
  let bestScore = 0
  for (const key in tags) {
    for (const preset of BY_KEY.get(key) ?? []) {
      if (!preset.geometry.includes(geometry)) continue
      let score = 0
      for (const k in preset.tags) {
        const want = preset.tags[k]!
        const have = tags[k]
        if (have === undefined) {
          score = -1
          break
        }
        if (want === '*') score += preset.score / 2
        else if (want === have) score += preset.score
        else {
          score = -1
          break
        }
      }
      if (score > bestScore) {
        bestScore = score
        best = preset
      }
    }
  }
  return best ?? FALLBACK.get(geometry)
}

/** Icon for a standalone point */
export function presetIcon(tags: Tags): string | undefined {
  return matchPreset(tags, 'point')?.icon ?? matchPreset(tags, 'vertex')?.icon
}
