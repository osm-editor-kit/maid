/**
 * The URL parameter of the notes layer: `notes`, iD's name. iD reads it once at start (`svg/notes.js`: `!!hash.notes`)
 * and never writes it. Maid writes `notes=1` while the notes are on.
 *
 * So a link can turn the notes on, and it makes the viewer's browser call the OSM notes API (decided on 2026-10-15,
 * docs/research/url-state-audit.md, section 5, Q8). A link without the key does not turn them off over a viewer's
 * stored choice: no key means no opinion (AGENTS.md, rule 1, and the audit's note on `none`).
 *
 * Off is written as the empty value. A setter can only write a value, so core's `useUrlSetting` (shown.ts, with
 * `omitFallback`) writes `notes=` for an off choice and then removes the key, which leaves no key once the URL says
 * what is shown. A link with `notes=` is an explicit off.
 *
 * Pure: no React, no nuqs. The parser has the shape core's `UrlParser` takes; the module declares it in `setup`
 * (notes.tsx) and reads and writes it through `useNotesSwitch` (shown.ts).
 */
import type { IdUrlName, UrlParser } from '@osm-editor-kit/maid-core'

/** iD's name for the parameter. Maid writes the same name. */
export const ID_NOTES: IdUrlName = { name: 'notes' }

/**
 * `notes`: any non-empty value turns the notes on, as iD reads it (a link with `notes=0` is on, as in iD). The empty
 * value is off: it is what Maid writes for off, and the URL then loses the key (above).
 */
export const parseAsNotes: UrlParser<boolean> = {
  parse: (value) => value !== '',
  serialize: (on) => (on ? '1' : ''),
  eq: (a, b) => a === b,
}
