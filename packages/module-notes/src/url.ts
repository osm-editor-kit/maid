/**
 * The URL parameter of the notes layer: `notes`, iD's name. iD reads it once at start (`svg/notes.js`: `!!hash.notes`)
 * and never writes it. Maid writes `notes=1` while the notes are on and leaves the key out while they are off.
 *
 * So a link can turn the notes on, and it makes the viewer's browser call the OSM notes API (decided on 2026-10-15,
 * docs/research/url-state-audit.md, section 5, Q8). A link without the key does not turn them off over a viewer's
 * stored choice: off has no value in the URL (AGENTS.md, rule 1, and the audit's note on `none`).
 *
 * Pure: no React, no nuqs. The parser has the shape core's `UrlParser` takes; the module declares it in `setup`
 * (notes.tsx) and reads and writes it through the hooks in shown.ts.
 */
import type { IdUrlName, UrlParser } from '@osm-editor-kit/maid-core'

/** iD's name for the parameter. Maid writes the same name. */
export const ID_NOTES: IdUrlName = { name: 'notes' }

/**
 * `notes`: any value turns the notes on, as iD reads it (a link with `notes=0` is on, as in iD). An empty value is no
 * opinion (null). Maid writes `1`.
 */
export const parseAsNotes: UrlParser<true> = {
  parse: (value) => (value === '' ? null : true),
  serialize: () => '1',
  eq: (a, b) => a === b,
}

/** The URL's value for the notes shown: `1` while they are on, no key (null) while they are off */
export function notesValueFor(enabled: boolean): true | null {
  return enabled ? true : null
}

/** Whether the notes are on: the URL's value when it has one (a link can turn them on), else the stored choice */
export function shownNotes(url: true | null, stored: boolean): boolean {
  return url ?? stored
}
