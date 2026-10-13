/**
 * What a setting shows, when the URL, the person's stored choice and the default can each give
 * a value. The rule (docs/adr/0009-decisions-of-2026-10-13.md, "What is stored, and what a link
 * does"): the value in the URL, else the stored choice, else the default. A link never writes to
 * storage. Values are in the URL's notation. `normalize` makes two notations of one value equal
 * (the same filter states in another order), so that a link which repeats the stored choice shows
 * no difference.
 */

const identity = (value: string) => value

/** The value a session starts with, and whether the link decides it while it differs from the person's own */
export function startShown(
  layers: { url: string | null | undefined; stored: string | undefined; fallback: string },
  normalize: (value: string) => string = identity,
): { value: string; fromLink: boolean } {
  const own = layers.stored ?? layers.fallback
  // an empty parameter is no value: the URL's `filters=` says nothing
  if (layers.url) return { value: layers.url, fromLink: normalize(layers.url) !== normalize(own) }
  return { value: own, fromLink: false }
}

/**
 * Whether what is shown differs from the person's stored choice. The default stands in for a
 * choice that is not stored. While this holds, a link's value is in effect and untouched.
 */
export function differsFromStored(
  shown: string,
  stored: string | undefined,
  fallback: string,
  normalize: (value: string) => string = identity,
): boolean {
  return normalize(shown) !== normalize(stored ?? fallback)
}

/**
 * What a change by the person writes: the URL parameter (`null` for the default, which removes
 * it) and the stored choice. A change always writes both: once the person changes a setting it is
 * their own choice, also while the value came from a link.
 */
export function writesFor(value: string): { url: string | null; stored: string } {
  return { url: value || null, stored: value }
}
