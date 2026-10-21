import { levelsOf } from './parse.ts'

/**
 * The floors a set of features is on, for a level picker: every level of every feature (levelsOf), sorted upwards,
 * without duplicates, with 0 always present as MapComplete does. It runs on every map move, over the features in view.
 */
export function floorsOf(features: Iterable<{ tags: Readonly<Record<string, string>> }>): number[] {
  const floors = new Set<number>([0])
  for (const feature of features) {
    for (const level of levelsOf(feature.tags).levels) floors.add(level)
  }
  return [...floors].sort((a, b) => a - b)
}
