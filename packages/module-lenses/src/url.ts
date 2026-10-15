/**
 * The URL parameter of the lenses module: `lens`, the id of the lens on the map. iD has no lens, so the name is Maid's
 * own. `none` is the explicit "no lens": a link can say it, and the stored choice does not come back over it.
 *
 * Pure: no React and no nuqs. The parser has the shape core's `UrlParser` takes; the module declares it in `setup`
 * (module.tsx) and the URL is read and written by `useLensUrl` (sync.ts).
 */
import type { UrlParser } from '@osm-editor-kit/maid-core'

/** The value that means no lens. A lens file may not use it as an id (lens-file.ts). */
export const NO_LENS = 'none'

/**
 * `lens`: a lens id, or `none`. An empty value is no opinion (null). Whether the id is a lens that exists is decided by
 * `resolveLens`, where the list of lenses is known.
 */
export const parseAsLens: UrlParser<string> = {
  parse: (value) => (value === '' ? null : value),
  serialize: (value) => value,
  eq: (a, b) => a === b,
}

/**
 * The lens the URL shows: the id when it is a lens here, else none (`none` is none). An id that is not a lens here (an
 * import that was removed) is none, and the URL is corrected to it. Nothing falls back to the stored choice: the URL says
 * what its author saw.
 */
export function resolveLens(id: string, known: readonly string[]): string {
  return known.includes(id) ? id : NO_LENS
}
