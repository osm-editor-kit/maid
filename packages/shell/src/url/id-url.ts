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
 * A module adds its rows: a URL parameter it declares with an iD name (core's `api.urlParam`) is
 * mapped by `idRules(declared)`, and every function here takes those declared parameters. The
 * imagery module's `background` and `overlays` are such rows, so they are not in this table.
 */
import type { UrlParamHandle } from '@osm-editor-kit/maid-core'
import { fromIdDisableFeatures, toIdDisableFeatures } from '@osm-editor-kit/maid-filters'
import { isLocale } from '@osm-editor-kit/maid-i18n'

/** The iD parameters a module declared, as core's registry lists them */
export type DeclaredIdParams = readonly Pick<UrlParamHandle<unknown>, 'name' | 'iD'>[]

type Mapped = {
  id: string
  maid: string
  /** kept under the same name although Maid does not act on it yet */
  kind: 'same' | 'carried'
  /** other iD names read for the same parameter (read only); see core's `IdUrlName.aliases` */
  aliases?: readonly string[]
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
  // iD's hidden features are Maid's filters with the state hidden (iD has no read-only state)
  {
    id: 'disable_features',
    maid: 'filters',
    kind: 'same',
    fromId: (value) => fromIdDisableFeatures(value) || undefined,
    toId: toIdDisableFeatures,
  },
  { id: 'comment', maid: 'comment', kind: 'same' }, // the changeset's prefills, as in iD
  { id: 'hashtags', maid: 'hashtags', kind: 'same' },
  { id: 'source', maid: 'source', kind: 'same' },
  { id: 'theme', maid: 'theme', kind: 'same' }, // light or dark
  // the levels of validation rules, read at start (iD's names in camel case, Maid's in snake case)
  { id: 'validationDisable', maid: 'validation_disable', kind: 'same' },
  { id: 'validationWarning', maid: 'validation_warning', kind: 'same' },
  { id: 'validationError', maid: 'validation_error', kind: 'same' },
  {
    id: 'validationSuggestion',
    kind: 'dropped',
    why: 'Maid has no suggestion level, only warnings and errors',
  },
  { id: 'locale', maid: 'lang', kind: 'same', fromId: localeFromId }, // de-DE in iD, de in Maid
  { id: 'photo_username', maid: 'photo_username', kind: 'carried' },
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
 * The full table: the rules above, plus one row per declared parameter that names an iD form. A declared name (or
 * alias) that an existing row already uses (on either side, dropped rows included) is refused.
 */
export function idRules(declared: DeclaredIdParams = []): Rule[] {
  const rules: Rule[] = [...ID_URL_RULES]
  for (const { name, iD } of declared) {
    if (!iD) continue
    for (const iDName of [iD.name, ...(iD.aliases ?? [])]) {
      const iDTaken = rules.find(
        (r) => r.id === iDName || (r.kind !== 'dropped' && r.aliases?.includes(iDName)),
      )
      if (iDTaken) {
        const meaning = iDTaken.kind === 'dropped' ? 'dropped by Maid' : `"${iDTaken.maid}"`
        throw new Error(
          `iD parameter "${iDName}" (URL parameter "${name}") is already mapped to ${meaning}.`,
        )
      }
    }
    const maidTaken = rules.find((r) => r.kind !== 'dropped' && r.maid === name)
    if (maidTaken) throw new Error(`URL parameter "${name}" already has an iD mapping.`)
    rules.push({
      id: iD.name,
      maid: name,
      kind: 'same',
      aliases: iD.aliases,
      fromId: iD.fromId,
      toId: iD.toId,
    })
  }
  return rules
}

function mappedRules(rules: Rule[]): Mapped[] {
  return rules.filter((r): r is Mapped => r.kind !== 'dropped')
}

/**
 * iD's `locale` is a list of codes in the order they are preferred (`de-DE,en-US`). Maid takes the first one it has,
 * by its base language (`de-DE` is `de`). A list with none of Maid's languages is left out.
 */
function localeFromId(value: string) {
  for (const code of value.split(',')) {
    const base = code.trim().split(/[-_]/)[0]?.toLowerCase() ?? ''
    if (isLocale(base)) return base
  }
  return undefined
}

/** iD writes `map=17.00/52.52280/13.40230`. Same order as Maid; only the number of digits differs. */
function normaliseMap(value: string) {
  const [zoom, lat, lng] = value.split('/').map(Number)
  if (zoom === undefined || lat === undefined || lng === undefined) return undefined
  if (![zoom, lat, lng].every(Number.isFinite)) return undefined
  return `${zoom}/${lat}/${lng}`
}

export type FromIdOptions = {
  /**
   * Hash entries no rule knows yet are left in the hash (`kept`) instead of being dropped. The first pass at start
   * uses this, because a module's iD names are known only after the editor is made (see `migrateIdHash`).
   */
  keepUnknown?: boolean
}

export type Converted = {
  /** Query parameters for Maid */
  params: URLSearchParams
  /** iD parameters that were left out, with the reason */
  dropped: { name: string; why: string }[]
  /** iD hash entries that were left for a later pass (with `keepUnknown` only) */
  kept: URLSearchParams
  /** hash entries that were converted, dropped or left out by a rule: 0 when the hash held none of them */
  handled: number
}

/**
 * Converts the state of an iD URL to Maid's query parameters.
 * Accepts a full URL or just a hash (`#map=…`). Query parameters that are already there are kept.
 * `declared` are the iD names of the modules' parameters (see `idRules`).
 */
export function fromIdUrl(
  url: string,
  declared: DeclaredIdParams = [],
  options: FromIdOptions = {},
): Converted {
  const rules = idRules(declared)
  const hashAt = url.indexOf('#')
  const hash = hashAt >= 0 ? url.slice(hashAt + 1) : ''
  const queryAt = url.indexOf('?')
  const query = queryAt >= 0 ? url.slice(queryAt + 1, hashAt >= 0 ? hashAt : undefined) : ''
  const params = new URLSearchParams(query)
  const dropped: Converted['dropped'] = []
  const kept = new URLSearchParams()
  let handled = 0
  // osm.org's edit link carries `editor=id`, which means nothing here
  params.delete('editor')
  const hashParams = new URLSearchParams(hash)
  for (const [name, value] of hashParams) {
    const rule = rules.find(
      (r) => r.id === name || (r.kind !== 'dropped' && r.aliases?.includes(name)),
    )
    if (!rule) {
      if (options.keepUnknown) kept.append(name, value)
      else dropped.push({ name, why: 'unknown to Maid' })
      continue
    }
    handled++
    if (rule.kind === 'dropped') {
      dropped.push({ name, why: rule.why })
      continue
    }
    // iD reads `background || layer`: the canonical name wins over an alias
    if (rule.id !== name && hashParams.has(rule.id)) {
      dropped.push({ name, why: `${rule.id} is given too` })
      continue
    }
    if (params.has(rule.maid)) continue // an explicit query parameter wins over the hash
    const converted = rule.fromId ? rule.fromId(value) : value
    if (converted === undefined) dropped.push({ name, why: 'could not be read' })
    else params.set(rule.maid, converted)
  }
  return { params, dropped, kept, handled }
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
    if (!rule) continue
    const converted = rule.toId ? rule.toId(value) : value
    // an empty value says nothing in iD (its overlays, for one, are written as none here)
    if (converted !== '') hash.set(rule.id, converted)
  }
  // iD expects the slashes and commas unescaped
  const text = hash.toString().replace(/%2F/g, '/').replace(/%2C/g, ',')
  return text ? `${base}#${text}` : base
}

/**
 * Rewrites iD-style hash state to Maid's query parameters in place (no reload, no extra history entry).
 *
 * It runs twice. The first pass (`final` false) runs before the config is read, with the shell's own rules: the
 * hash entries no rule knows yet (a module's names) stay in the hash. The second pass runs after the editor is made,
 * with the modules' declared names (`editor.urlParams.list()`) and `final: true`: what is still unknown is dropped
 * and reported.
 */
export function migrateIdHash(
  location: Location,
  history: History,
  declared: DeclaredIdParams = [],
  options: { final?: boolean } = {},
) {
  if (location.hash === '' || location.hash === '#') return
  const { params, dropped, kept, handled } = fromIdUrl(location.href, declared, {
    keepUnknown: options.final !== true,
  })
  if (handled === 0) return
  const text = params.toString().replace(/%2F/g, '/').replace(/%2C/g, ',')
  const rest = kept.toString()
  history.replaceState(
    history.state,
    '',
    `${location.pathname}${text ? `?${text}` : ''}${rest ? `#${rest}` : ''}`,
  )
  if (dropped.length) console.info('Maid left out iD URL parameters:', dropped)
}
