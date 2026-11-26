/**
 * What a task's link points to, for a label instead of a bare icon (Tobias, 2026-11-26): task files mostly link the
 * element on openstreetmap.org and a page of the OSM wiki, sometimes something else.
 */
export type LinkKind =
  | { kind: 'osm'; label: string }
  | { kind: 'wiki'; label: string }
  | { kind: 'other'; label: string }

const OSM_HOSTS = new Set(['www.openstreetmap.org', 'openstreetmap.org', 'osm.org'])

/** The kind and a short label of a link: `way 123`, the wiki page's title, or the host name */
export function linkKind(link: string): LinkKind {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return { kind: 'other', label: link }
  }
  if (OSM_HOSTS.has(url.hostname)) {
    const element = /^\/(node|way|relation|changeset|note)\/(\d+)/.exec(url.pathname)
    return { kind: 'osm', label: element ? `${element[1]} ${element[2]}` : 'OpenStreetMap' }
  }
  if (url.hostname === 'wiki.openstreetmap.org') {
    const page = /^\/wiki\/(.+)$/.exec(url.pathname)?.[1]
    if (!page) return { kind: 'wiki', label: 'OSM Wiki' }
    // the title without the language prefix (`DE:`), with spaces: `Key:oneway`
    const title = decodeURIComponent(page)
      .replace(/^[A-Z]{2}(-[a-z]{2,4})?:/, '')
      .replace(/_/g, ' ')
    return { kind: 'wiki', label: title }
  }
  return { kind: 'other', label: url.hostname.replace(/^www\./, '') }
}
