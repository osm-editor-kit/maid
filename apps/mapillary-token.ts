/**
 * Mapillary client token of the three apps, for the street-level photos module.
 *
 * It is a client token: Mapillary issues it for use in the browser, so it is not a secret and is
 * part of every built page. It belongs to an application in the Mapillary account `tordans`.
 * Where to find or renew it: https://www.mapillary.com/dashboard/developers
 *
 * The limit is 50,000 tile requests a day for the whole token, shared by everyone who uses these
 * apps. A fork should register its own application there and set `VITE_MAPILLARY_TOKEN` in its
 * app's `.env.local` (or as a variable of its deployment), which takes precedence over this one.
 */
export const MAPILLARY_TOKEN = 'MLY|39514138868200192|9f56cdfee9f25db7c536b4c5aacdfd9b'

/**
 * An app gives the street-imagery module its token. It is `VITE_MAPILLARY_TOKEN` when the build sets it, else
 * this one. The module trims it once (packages/module-street-imagery/src/index.ts); nothing else resolves it.
 */
export function mapillaryToken(): string {
  return import.meta.env.VITE_MAPILLARY_TOKEN || MAPILLARY_TOKEN
}
