/**
 * Translation between iD's URLs and Maid's.
 *
 * iD keeps its state in the hash (`#map=17/52.5/13.4&id=w123&background=Bing`). Maid keeps it
 * in the query string and reads it with nuqs. Links from osm.org, from QA tools and from old
 * bookmarks are in iD's form, so Maid converts them once at start, and can produce an iD link
 * for "Open in iD".
 *
 * The table below is the contract. iD parameters that Maid has no feature for yet are carried
 * over unchanged (`carried`), so a link survives a round trip and starts working when the
 * feature arrives. Parameters that make no sense in Maid are dropped on purpose.
 */

type Rule =
  | { id: string; maid: string; kind: 'same' }
  /** kept under the same name although Maid does not act on it yet */
  | { id: string; maid: string; kind: 'carried' }
  | { id: string; kind: 'dropped'; why: string }

export const ID_URL_RULES: Rule[] = [
  { id: 'map', maid: 'map', kind: 'same' }, // zoom/lat/lng in both
  { id: 'id', maid: 'id', kind: 'same' }, // n1,w2,r3; Maid selects the first for now
  { id: 'background', maid: 'background', kind: 'carried' },
  { id: 'overlays', maid: 'overlays', kind: 'carried' },
  { id: 'offset', maid: 'offset', kind: 'carried' },
  { id: 'disable_features', maid: 'disable_features', kind: 'carried' },
  { id: 'comment', maid: 'comment', kind: 'carried' },
  { id: 'hashtags', maid: 'hashtags', kind: 'carried' },
  { id: 'source', maid: 'source', kind: 'carried' },
  { id: 'locale', maid: 'locale', kind: 'carried' },
  { id: 'gpx', maid: 'gpx', kind: 'carried' },
  { id: 'photo_overlay', maid: 'photo_overlay', kind: 'carried' },
  { id: 'photo_dates', maid: 'photo_dates', kind: 'carried' },
  { id: 'photo_username', maid: 'photo_username', kind: 'carried' },
  { id: 'photo', maid: 'photo', kind: 'carried' },
  {
    id: 'presets',
    kind: 'dropped',
    why: 'presets are part of the build configuration in Maid',
  },
  { id: 'walkthrough', kind: 'dropped', why: 'Maid has no walkthrough' },
  { id: 'rtl', kind: 'dropped', why: 'follows the locale' },
  {
    id: 'maprules',
    kind: 'dropped',
    why: 'validation rules are part of the build configuration in Maid',
  },
]

const TO_MAID = new Map(
  ID_URL_RULES.flatMap((r) => (r.kind === 'dropped' ? [] : [[r.id, r.maid] as const])),
)
const TO_ID = new Map(
  ID_URL_RULES.flatMap((r) => (r.kind === 'dropped' ? [] : [[r.maid, r.id] as const])),
)

/** iD writes `map=17.00/52.52280/13.40230`. Same order as Maid; only the number of digits differs. */
function normaliseMap(value: string) {
  const [zoom, lat, lng] = value.split('/').map(Number)
  if (zoom === undefined || lat === undefined || lng === undefined) return undefined
  if (![zoom, lat, lng].every(Number.isFinite)) return undefined
  return `${zoom}/${lat}/${lng}`
}

export type Converted = {
  /** Query parameters for Maid */
  params: URLSearchParams
  /** iD parameters that were left out, with the reason */
  dropped: { name: string; why: string }[]
}

/**
 * Converts the state of an iD URL to Maid's query parameters.
 * Accepts a full URL or just a hash (`#map=…`). Query parameters that are already there are kept.
 */
export function fromIdUrl(url: string): Converted {
  const hashAt = url.indexOf('#')
  const hash = hashAt >= 0 ? url.slice(hashAt + 1) : ''
  const queryAt = url.indexOf('?')
  const query = queryAt >= 0 ? url.slice(queryAt + 1, hashAt >= 0 ? hashAt : undefined) : ''
  const params = new URLSearchParams(query)
  const dropped: Converted['dropped'] = []
  // osm.org's edit link carries `editor=id`, which means nothing here
  params.delete('editor')
  for (const [name, value] of new URLSearchParams(hash)) {
    const target = TO_MAID.get(name)
    if (!target) {
      const rule = ID_URL_RULES.find((r) => r.id === name)
      dropped.push({ name, why: rule?.kind === 'dropped' ? rule.why : 'unknown to Maid' })
      continue
    }
    if (params.has(target)) continue // an explicit query parameter wins over the hash
    const converted = name === 'map' ? normaliseMap(value) : value
    if (converted === undefined) dropped.push({ name, why: 'could not be read' })
    else params.set(target, converted)
  }
  return { params, dropped }
}

/** An iD URL for the same view and selection, for "Open in iD" */
export function toIdUrl(
  maidSearch: string,
  base = 'https://www.openstreetmap.org/edit?editor=id',
): string {
  const hash = new URLSearchParams()
  for (const [name, value] of new URLSearchParams(maidSearch)) {
    const target = TO_ID.get(name)
    if (target) hash.set(target, value)
  }
  // iD expects the slashes and commas unescaped
  const text = hash.toString().replace(/%2F/g, '/').replace(/%2C/g, ',')
  return text ? `${base}#${text}` : base
}

/**
 * Run once before the app renders: if the address has iD-style hash state, rewrite it to
 * Maid's query parameters in place (no reload, no extra history entry).
 */
export function migrateIdHash(location: Location, history: History) {
  if (!/(^#|&)(map|id|background|disable_features|comment|hashtags)=/.test(location.hash)) return
  const { params, dropped } = fromIdUrl(location.href)
  const text = params.toString().replace(/%2F/g, '/').replace(/%2C/g, ',')
  history.replaceState(history.state, '', `${location.pathname}${text ? `?${text}` : ''}`)
  if (dropped.length) console.info('Maid left out iD URL parameters:', dropped)
}
