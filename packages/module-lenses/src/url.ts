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
 * `lens`: a lens id, or `none`. An empty value is no opinion (null). Whether the id is a lens that exists is checked at
 * start (`startLens`), not here: the list of lenses is known only then.
 */
export const parseAsLens: UrlParser<string> = {
  parse: (value) => (value === '' ? null : value),
  serialize: (value) => value,
  eq: (a, b) => a === b,
}

/**
 * The lens on the map at start: the URL's, when the URL names one (`none` is no lens); else the lens chosen last (the
 * stored choice); else no lens. A name in the URL that is not a lens here is no lens, and it does not fall back to the
 * stored choice: the URL says what its author saw. A stored choice that is no lens any more (an import removed) is none.
 */
export function startLens(
  url: string | null,
  stored: string | null,
  known: readonly string[],
): string | null {
  const id = url ?? stored
  if (id === null || id === NO_LENS) return null
  return known.includes(id) ? id : null
}
