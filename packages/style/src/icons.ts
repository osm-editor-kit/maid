import iconPresetsJson from './generated/icon-presets.json'
import type { Tags } from './classes'

type IconPreset = { id: string; tags: Tags; icon: string; score: number }

const BY_KEY = new Map<string, IconPreset[]>()
for (const preset of iconPresetsJson as IconPreset[]) {
  const key = Object.keys(preset.tags)[0]!
  const list = BY_KEY.get(key)
  if (list) list.push(preset)
  else BY_KEY.set(key, [preset])
}

/**
 * Icon of the best matching iD preset. A simplified version of iD's preset matching:
 * all preset tags must match, exact values score higher than wildcards.
 */
export function presetIcon(tags: Tags): string | undefined {
  let best: IconPreset | undefined
  let bestScore = 0
  for (const key in tags) {
    for (const preset of BY_KEY.get(key) ?? []) {
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
  return best?.icon
}
