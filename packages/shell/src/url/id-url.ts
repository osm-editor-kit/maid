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
 *
 * A module can add rows: a URL parameter it declares with an iD name (core's `api.urlParam`)
 * is mapped by `idRules(declared)`, and every function here takes those declared parameters.
 */
import type { UrlParamHandle } from '@osm-editor-kit/maid-core'

/** The iD parameters a module declared, as core's registry lists them */
export type DeclaredIdParams = readonly Pick<UrlParamHandle<unknown>, 'name' | 'iD'>[]

type Mapped = {
  id: string
  maid: string
  /** kept under the same name although Maid does not act on it yet */
  kind: 'same' | 'carried'
  /** iD's value to Maid's notation; the value as it is when absent. `undefined` drops the parameter. */
  fromId?: (value: string) => string | undefined
  /** Maid's value to iD's notation; as it is when absent */
  toId?: (value: string) => string
}
type Dropped = { id: string; kind: 'dropped'; why: string }
export type Rule = Mapped | Dropped

export const ID_URL_RULES: Rule[] = [
  { id: 'map', maid: 'map', kind: 'same', fromId: normaliseMap }, // zoom/lat/lng in both
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

/** The names of Maid's query parameters that iD links map onto: the app's own list, see params.ts */
export function idUrlParamNames(): string[] {
  return ID_URL_RULES.flatMap((r) => (r.kind === 'dropped' ? [] : [r.maid]))
}

/**
 * The full table: the rules above, plus one row per declared parameter that names an iD form. A declared name that
 * an existing row already uses (on either side, dropped rows included) is refused.
 */
export function idRules(declared: DeclaredIdParams = []): Rule[] {
  const rules: Rule[] = [...ID_URL_RULES]
  for (const { name, iD } of declared) {
    if (!iD) continue
    const iDTaken = rules.find((r) => r.id === iD.name)
    if (iDTaken) {
      const meaning = iDTaken.kind === 'dropped' ? 'dropped by Maid' : `"${iDTaken.maid}"`
      throw new Error(
        `iD parameter "${iD.name}" (URL parameter "${name}") is already mapped to ${meaning}.`,
      )
    }
    const maidTaken = rules.find((r) => r.kind !== 'dropped' && r.maid === name)
    if (maidTaken) throw new Error(`URL parameter "${name}" already has an iD mapping.`)
    rules.push({ id: iD.name, maid: name, kind: 'same', fromId: iD.fromId, toId: iD.toId })
  }
  return rules
}

function mappedRules(rules: Rule[]): Mapped[] {
  return rules.filter((r): r is Mapped => r.kind !== 'dropped')
}

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
 * `declared` are the iD names of the modules' parameters (see `idRules`).
 */
export function fromIdUrl(url: string, declared: DeclaredIdParams = []): Converted {
  const rules = idRules(declared)
  const hashAt = url.indexOf('#')
  const hash = hashAt >= 0 ? url.slice(hashAt + 1) : ''
  const queryAt = url.indexOf('?')
  const query = queryAt >= 0 ? url.slice(queryAt + 1, hashAt >= 0 ? hashAt : undefined) : ''
  const params = new URLSearchParams(query)
  const dropped: Converted['dropped'] = []
  // osm.org's edit link carries `editor=id`, which means nothing here
  params.delete('editor')
  for (const [name, value] of new URLSearchParams(hash)) {
    const rule = rules.find((r) => r.id === name)
    if (!rule || rule.kind === 'dropped') {
      dropped.push({
        name,
        why: rule?.kind === 'dropped' ? rule.why : 'unknown to Maid',
      })
      continue
    }
    if (params.has(rule.maid)) continue // an explicit query parameter wins over the hash
    const converted = rule.fromId ? rule.fromId(value) : value
    if (converted === undefined) dropped.push({ name, why: 'could not be read' })
    else params.set(rule.maid, converted)
  }
  return { params, dropped }
}

/** An iD URL for the same view and selection, for "Open in iD" */
export function toIdUrl(
  maidSearch: string,
  base = 'https://www.openstreetmap.org/edit?editor=id',
  declared: DeclaredIdParams = [],
): string {
  const rules = mappedRules(idRules(declared))
  const hash = new URLSearchParams()
  for (const [name, value] of new URLSearchParams(maidSearch)) {
    const rule = rules.find((r) => r.maid === name)
    if (rule) hash.set(rule.id, rule.toId ? rule.toId(value) : value)
  }
  // iD expects the slashes and commas unescaped
  const text = hash.toString().replace(/%2F/g, '/').replace(/%2C/g, ',')
  return text ? `${base}#${text}` : base
}

/**
 * Run once before the app renders: if the address has iD-style hash state, rewrite it to
 * Maid's query parameters in place (no reload, no extra history entry).
 */
export function migrateIdHash(
  location: Location,
  history: History,
  declared: DeclaredIdParams = [],
) {
  const names = ['map', 'id', 'background', 'disable_features', 'comment', 'hashtags']
  for (const { iD } of declared) if (iD) names.push(iD.name)
  if (!new RegExp(`(^#|&)(${names.join('|')})=`).test(location.hash)) return
  const { params, dropped } = fromIdUrl(location.href, declared)
  const text = params.toString().replace(/%2F/g, '/').replace(/%2C/g, ',')
  history.replaceState(history.state, '', `${location.pathname}${text ? `?${text}` : ''}`)
  if (dropped.length) console.info('Maid left out iD URL parameters:', dropped)
}
