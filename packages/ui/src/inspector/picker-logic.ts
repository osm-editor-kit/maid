import type { Preset } from '@osm-editor-kit/maid-presets'

/**
 * The row that becomes active after moving by `delta` (+1 or -1), wrapping at both ends.
 * An index outside the list (or none yet) starts from the first row going down and the last going up.
 * Returns -1 when there are no rows.
 */
export function moveActive(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return -1
  const from = current >= 0 && current < count ? current : delta > 0 ? -1 : count
  return (((from + delta) % count) + count) % count
}

/** The preset's first tag as `key=value`, or undefined when the preset has no tags. */
export function mainTagLabel(preset: Preset): string | undefined {
  const first = Object.entries(preset.tags)[0]
  return first ? `${first[0]}=${first[1]}` : undefined
}
