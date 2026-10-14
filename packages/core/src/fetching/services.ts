/**
 * The services Maid sends requests to, as data. Each request goes through the gate of its service
 * (gate.ts): the gate limits how many requests of that service are in flight, and holds them all
 * during a rate-limit pause. A URL is matched to a service by its host (fetching-audit.md, 5.3).
 */

export const SERVICE_IDS = [
  'osm',
  'wikimedia',
  'mapillary',
  'panoramax',
  'taginfo',
  'data',
  'local',
] as const

export type ServiceId = (typeof SERVICE_IDS)[number]

export const SERVICES: Readonly<Record<ServiceId, { readonly limit: number }>> = {
  // The OSM API. Its host comes from the editor's config, so the app registers it at run time.
  osm: { limit: 6 },
  // Wikimedia (Wikipedia, Wikidata, Commons) and the OSM wiki, which is MediaWiki too. One at a time.
  wikimedia: { limit: 1 },
  mapillary: { limit: 6 },
  panoramax: { limit: 6 },
  // taginfo.openstreetmap.org, asked while a person types a key or a value (taginfo/taginfo.ts). Two at a time: iD sends no limit.
  taginfo: { limit: 2 },
  // Added data layers, and every host that no service claims.
  data: { limit: 2 },
  // Local hosts that no service claims, such as the dev server and the mock API when not registered.
  local: { limit: 6 },
}

/** A host to claim for a service: `api.example.org`, `localhost:8090` (with a port), or a predicate. */
export type HostMatch = string | ((url: URL) => boolean)

export interface ServiceRegistry {
  /** Claims a host for a service. A later claim for the same service replaces the earlier one. */
  register(id: ServiceId, host: HostMatch): void
  /** The service of a URL: a claimed host first, then the known hosts, then `local`, then `data`. */
  serviceOf(url: URL): ServiceId
}

/**
 * Whether an address points at this machine: `localhost`, `127.0.0.1`, `[::1]`, and the names ending in
 * `.localhost` or `.test`. This is the rule for automated runs (AGENTS.md, core rule 1). A relative address,
 * such as a path on the same server (`/data/x.geojson`), resolves against `page`, so it is local exactly when
 * the page is. `page` defaults to the page's address in a browser; without a page a relative address is not
 * local. An address that does not parse is not local.
 */
export function isLocalUrl(
  url: string | URL,
  page: string | URL | undefined = currentPageHref(),
): boolean {
  let host: string
  try {
    host = new URL(url, page).hostname
  } catch {
    return false
  }
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.localhost') ||
    host.endsWith('.test')
  )
}

/** The address of the page in a browser; undefined where there is no page (tests, Node). */
function currentPageHref(): string | undefined {
  return typeof location === 'undefined' ? undefined : location.href
}

function domainMatcher(...domains: readonly string[]): (url: URL) => boolean {
  return (url) =>
    domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
}

const KNOWN: readonly { readonly id: ServiceId; readonly matches: (url: URL) => boolean }[] = [
  {
    id: 'wikimedia',
    matches: domainMatcher(
      'wikimedia.org',
      'wikipedia.org',
      'wikidata.org',
      'wiki.openstreetmap.org',
    ),
  },
  { id: 'mapillary', matches: domainMatcher('mapillary.com') },
  { id: 'panoramax', matches: domainMatcher('panoramax.xyz') },
  { id: 'taginfo', matches: domainMatcher('taginfo.openstreetmap.org') },
]

function hostMatcher(host: HostMatch): (url: URL) => boolean {
  if (typeof host === 'function') return host
  const wanted = host.toLowerCase()
  // "localhost:8090" is compared with the port; a bare host matches any port
  return (url) => url.host === wanted || (!wanted.includes(':') && url.hostname === wanted)
}

export function createServiceRegistry(): ServiceRegistry {
  // Claims made by the app come before the known hosts, so the app can override them.
  const claims = new Map<ServiceId, (url: URL) => boolean>()
  return {
    register(id, host) {
      claims.set(id, hostMatcher(host))
    },
    serviceOf(url) {
      for (const [id, matches] of claims) if (matches(url)) return id
      for (const known of KNOWN) if (known.matches(url)) return known.id
      return isLocalUrl(url) ? 'local' : 'data'
    },
  }
}
