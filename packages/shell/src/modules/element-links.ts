import {
  changesetLinks,
  elementLinks,
  linksIn,
  osmProdUrl,
  toLongOsmType,
  userLinks,
  type OsmLink,
  type OsmObjectType,
} from '@osm-editor-kit/osm-editor-links'
import { DEV_API, type DataSource } from '../config'

/**
 * The links behind the values of the "Element" section, as pure functions of the entity and the server.
 * The section shows the first link of a row as the value's own, and lists all of them beside it.
 */

/**
 * The OSM website the links of a data source point at: the development server's for `dev`, else openstreetmap.org.
 * The mock serves real OSM ids from its fixtures, so its links go to the real website (config.ts).
 */
export function websiteOf(source: DataSource): string {
  return source === 'dev' ? DEV_API : osmProdUrl
}

/**
 * The OSM element an entity id names: `w704805875` is way 704805875. A new entity (`n-1`) is not on the server
 * and has no OSM element yet: undefined.
 */
export function osmRef(entityId: string): { type: OsmObjectType; id: string } | undefined {
  const [, letter, id] = /^([nwr])(\d+)$/.exec(entityId) ?? []
  if (!letter || !id) return undefined
  const type = toLongOsmType(letter)
  return type ? { type, id } : undefined
}

/** A place as the link package takes it, from the engine's centre `[lng, lat]` */
export function placeOf(centre: readonly [number, number] | undefined) {
  // six decimals (about 10 cm) keep the links short: the centre of an extent has float noise
  const round = (value: number) => Math.round(value * 1e6) / 1e6
  return centre ? { lat: round(centre[1]), lng: round(centre[0]) } : undefined
}

/**
 * The links of the ID row. Links that need a country are kept only where the place lies in one of the given
 * countries; without a place or with no codes, only the links that are offered everywhere.
 */
export function idLinks(
  entityId: string,
  options: {
    website: string
    loc?: { lat: number; lng: number }
    countryCodes?: readonly string[]
  },
): OsmLink[] {
  const ref = osmRef(entityId)
  if (!ref) return []
  const links = elementLinks({ ...ref, loc: options.loc, server: options.website })
  return linksIn(links, options.countryCodes ?? [])
}

/** The links of the Changeset row: none for an entity that is not on the server, or without a changeset */
export function changesetRowLinks(
  entityId: string,
  changeset: string | number | undefined,
  website: string,
): OsmLink[] {
  if (!osmRef(entityId) || changeset === undefined || changeset === '') return []
  return changesetLinks({ id: changeset, server: website })
}

/** The links of the User row: none for an entity that is not on the server, or without a user name */
export function userRowLinks(
  entityId: string,
  user: string | undefined,
  website: string,
): OsmLink[] {
  if (!osmRef(entityId) || user === undefined || user === '') return []
  return userLinks({ name: user, server: website })
}
