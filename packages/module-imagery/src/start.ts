/**
 * The start order of the background and the overlays, and what the map shows once it has resolved. Pure: the caller
 * passes what the index knows (`known`) and what is valid for the view (`valid`, `best`). Maid's order is iD's
 * (`background.js` `init`, decided by Tobias on 2026-10-15, docs/research/url-state-audit.md, section 5):
 *
 *   1. the URL's background, when it is none, a custom template, or a layer the index knows; an unknown id is not used
 *   2. the best layer for the view that covers more than half of it (only when the URL names no background, as in iD)
 *   3. the stored choice (the last one chosen), when it is none, a custom template, or valid for the view
 *   4. the fork's default (`imagery({ default })`), when it is none, a custom template, or a known layer
 *   5. the first valid layer, else none
 *
 * Until the order has resolved (the index loads after the first render), the pending value stands: the URL's own
 * value when it has one (none, a template), else the stored choice, else the default. Nothing is written then.
 */
import { isOamValue, isOwnValue, NONE } from './url.ts'

/** Whether the index has a layer with this id */
export type Known = (id: string) => boolean

/** The background shown before the start order has resolved */
export function pendingBackground(
  url: string | null,
  stored: string | null,
  fallback: string | null,
): string {
  if (url !== null && isOwnValue(url)) return url
  return stored ?? fallback ?? NONE
}

/** The overlays shown before the start order has resolved: the URL's, else the stored ones */
export function pendingOverlays(url: string[] | null, stored: string[]): string[] {
  return url ?? stored
}

export type StartBackgroundInput = {
  /** The URL's `bg`, null when the URL gives none */
  url: string | null
  /** The stored choice: the background chosen last, null when none was ever chosen */
  stored: string | null
  /** The fork's default background */
  fallback: string | null
  /** The background layers valid for the view, in the index's order (overlays left out) */
  valid: readonly string[]
  /** The best layers of those that cover more than half of the view, in the same order (see coverage.ts) */
  best: readonly string[]
  known: Known
}

/** The background the start order picks (see the top of this file) */
export function startBackground(input: StartBackgroundInput): string {
  const { url, stored, fallback, valid, best, known } = input
  if (url !== null && (isOwnValue(url) || known(url))) return url
  // iD looks for the best layer only when the URL names none, an unknown id included
  const [bestFirst] = best
  if (url === null && bestFirst !== undefined) return bestFirst
  if (stored !== null && (isOwnValue(stored) || valid.includes(stored))) return stored
  if (fallback !== null && (isOwnValue(fallback) || known(fallback))) return fallback
  const [first] = valid
  return first ?? NONE
}

/** An overlay that can be shown: one the index knows, or an OpenAerialMap image (asked for by its id) */
function showable(known: Known): Known {
  return (id) => isOamValue(id) || known(id)
}

/** The overlays the start order picks: the URL's when it has any, else the stored ones; an id the index does not know is dropped */
export function startOverlays(url: string[] | null, stored: string[], known: Known): string[] {
  return (url ?? stored).filter(showable(known))
}

/** The background shown once the start has resolved: the URL's while it gives one that can be shown, else the start's */
export function shownBackground(url: string | null, started: string, known: Known): string {
  if (url !== null && (isOwnValue(url) || known(url))) return url
  return started
}

/** The overlays shown once the start has resolved: the URL's (without unknown ids) while it gives any, else the start's */
export function shownOverlays(url: string[] | null, started: string[], known: Known): string[] {
  return url === null ? started : url.filter(showable(known))
}

/** Two lists of ids, in order. `null` (no value) is never the same as a list. */
export function sameIds(a: readonly string[] | null, b: readonly string[]): boolean {
  return a !== null && a.length === b.length && a.every((id, index) => id === b[index])
}
