/**
 * When the person moves the map to an area the chosen background does not cover, the background is switched: to the
 * best layer for the new view (the same choice as the start, start.ts), else to the fork's default. Pure: the caller
 * reads the chosen layer's coverage and the best layers of the new view (eli.ts), and shows the toast (shown.ts).
 */
import { coversMoreThanHalf, type Bounds, type Coverage } from './coverage.ts'
import type { Known } from './start.ts'
import { isOwnValue } from './url.ts'

export type SwitchInput = {
  /** The new view's box: `[west, south, east, north]` in degrees */
  bounds: Bounds
  /** The background shown now: a listed layer id, none, or a custom template */
  chosen: string
  /** The chosen layer's coverage, undefined when it has none (a worldwide layer covers every view) */
  chosenCoverage: Coverage | undefined
  /** The best backgrounds that cover more than half of the new view, in order (eli.ts `bestBackgrounds`) */
  best: readonly string[]
  /** The fork's default background */
  fallback: string | null
  known: Known
}

/**
 * The background to switch to, or null when the chosen one stays. A chosen layer that covers more than half of the new
 * view stays. None and custom templates are the person's own choice and are never switched. A fallback that is not a
 * listed layer is not used: the background stays, as nothing better is known.
 */
export function switchFor(input: SwitchInput): string | null {
  const { bounds, chosen, chosenCoverage, best, fallback, known } = input
  if (isOwnValue(chosen) || !known(chosen)) return null
  if (coversMoreThanHalf(chosenCoverage, bounds)) return null
  const bestOther = best.find((id) => id !== chosen)
  if (bestOther !== undefined) return bestOther
  if (fallback !== null && fallback !== chosen && known(fallback)) return fallback
  return null
}
