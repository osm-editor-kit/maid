import type { Presets } from '@osm-editor-kit/maid-presets'
import type { PresetsSource } from './types.ts'

/**
 * Presets that are made when first asked for, for an app config: `lazyPresets(() => import('./presets').then((m) =>
 * m.makePresets()))`. The data of the tagging schema (about 1.9 MB with the country data) is then in a chunk of
 * its own and is not read, parsed or run before the map exists. The editor asks for them once the map is up.
 */
export function lazyPresets(make: () => Presets | Promise<Presets>): PresetsSource {
  let promise: Promise<Presets> | undefined
  let current: Presets | undefined
  return {
    get current() {
      return current
    },
    load() {
      promise ??= Promise.resolve()
        .then(make)
        .then((presets) => {
          current = presets
          return presets
        })
      return promise
    },
  }
}

/**
 * Whether a point with these tags has a type that can also be an area: the type the presets give the point
 * lists "area" among its geometries (a playground does, a bench does not), and `area=no` says it is not one.
 * False while the presets are not there yet. For `pointToArea` (packages/operations) in an app's config.
 */
export function canBeArea(presets: PresetsSource) {
  return (tags: Record<string, string>) =>
    tags.area !== 'no' && (presets.current?.match(tags, 'point').geometry.includes('area') ?? false)
}
