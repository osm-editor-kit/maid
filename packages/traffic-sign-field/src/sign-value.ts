import type { SignType } from '@osm-traffic-signs/converter'
import { isCountry, type Country } from './catalogue.ts'

/**
 * Parse and format a `traffic_sign` value over one country's catalogue, without the converter's main entry (which
 * imports all nine catalogues). The rules are the converter's `trafficSignTagToSigns` and
 * `signsToTrafficSignTagValue`; sign-value.test.ts checks both against the converter on real values.
 *
 * A value is a list of parts. A part the catalogue knows has its `sign`; any other part (a named value such as
 * `none`, a typo, a code of another year) stays an entry with the text as it was, so it is never lost on write.
 */
export type SignKind = SignType['kind']
export type SignEntry = {
  /** The `osmValuePart` as written: `274[47]`, `1000-31`, `"Kfz-Verkehr frei"`, or the unknown text */
  part: string
  /** The catalogue sign; undefined for an unknown part */
  sign: SignType | undefined
  kind: SignKind
}

/** Values that stand for a sign without a country prefix (the converter's namedTrafficSignValues) */
export const NAMED_VALUES: readonly string[] = [
  'city_limit',
  'maxspeed',
  'none',
  'destination',
  'yes',
  'variable',
  'hazard',
  'signals',
  'give_way',
  'stop',
  'variable_message',
]

/** The country a value is written in (`DE:274` is DE) if it is a known one, else the given default */
export function resolveCountry(value: string | undefined, fallback: Country): Country {
  const prefix = value ? /^\s*([A-Z]{2}):/.exec(value)?.[1] : undefined
  return isCountry(prefix) ? prefix : fallback
}

export function splitSignIdSignValue(part: string): {
  signId: string
  signValue: string | undefined
} {
  if (part.startsWith('"') && part.endsWith('"')) return { signId: part, signValue: undefined }
  const [signId = '', rest] = part.split('[')
  return { signId, signValue: rest?.replace(']', '') }
}

export function combineSignIdSignValue(signId: string, signValue: string | undefined): string {
  if (signId.startsWith('"') && signId.endsWith('"')) return signId
  return signValue ? `${signId}[${signValue}]` : signId
}

type Index = {
  byPart: Map<string, SignType>
  bySignId: Map<string, SignType[]>
  redirects: Map<string, string>
}
const indexes = new WeakMap<readonly SignType[], Index>()

function indexOf(catalogue: readonly SignType[]): Index {
  const known = indexes.get(catalogue)
  if (known) return known
  const index: Index = { byPart: new Map(), bySignId: new Map(), redirects: new Map() }
  for (const sign of catalogue) {
    index.byPart.set(sign.osmValuePart, sign)
    const same = index.bySignId.get(sign.signId)
    if (same) same.push(sign)
    else index.bySignId.set(sign.signId, [sign])
    for (const redirect of sign.redirects ?? [])
      index.redirects.set(redirect.from.toLowerCase(), redirect.to)
  }
  indexes.set(catalogue, index)
  return index
}

/** The converter's getSignBySignIdAndCheckValue: one sign per id, else the one with or without a value */
function bySignId(index: Index, signId: string, signValue: string | undefined) {
  const matches = index.bySignId.get(signId) ?? []
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    return signValue
      ? matches.find((sign) => sign.signValue)
      : matches.find((sign) => !sign.signValue)
  }
  return undefined
}

/** Split on , and ; but not inside [] or "" (the converter's splitIntoSignValueParts) */
function splitParts(input: string): string[] {
  return input
    .split(/[,;](?![^[\]]*\])(?![^"]*"(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function stripKey(input: string): string {
  const split = input.split('=')
  return split[0]?.includes('traffic_sign') ? split.slice(1).join('=') : input
}

function stripCountry(input: string, country: Country): string {
  return input.replaceAll(`${country}:`, '').replaceAll(`${country.toLowerCase()}:`, '')
}

/** The entries of a tag value (or of typed text). Without a catalogue every part is unknown, and is kept. */
export function parseSignValue(
  value: string | undefined,
  country: Country,
  catalogue: readonly SignType[],
): SignEntry[] {
  if (!value) return []
  const cleaned = stripCountry(stripKey(value), country)
  const index = indexOf(catalogue)
  const topLevel = cleaned.split(';')
  return splitParts(cleaned).map((original): SignEntry => {
    let part = original
    const redirected = index.redirects.get(part.toLowerCase())
    if (redirected) {
      const target = splitSignIdSignValue(redirected)
      if (
        index.byPart.has(redirected) ||
        bySignId(index, target.signId, target.signValue) ||
        NAMED_VALUES.includes(redirected)
      )
        part = redirected
    }
    const { signId, signValue } = splitSignIdSignValue(part)
    const sign = index.byPart.get(part) ?? bySignId(index, signId, signValue)
    if (sign) {
      return {
        part: signValue ? combineSignIdSignValue(signId, signValue) : sign.osmValuePart,
        sign,
        kind: sign.kind,
      }
    }
    return {
      part,
      sign: undefined,
      kind: topLevel.includes(part) ? 'traffic_sign' : 'exception_modifier',
    }
  })
}

/**
 * The tag value of the entries: the country prefix once before the first non-named part, `;` before a main sign
 * (or after a named value), `,` before a modifier. No entries: undefined, so the key is removed.
 */
export function formatSignValue(
  entries: readonly SignEntry[],
  country: Country,
): string | undefined {
  if (entries.length === 0) return undefined
  let prefixed = false
  return entries
    .map((entry, index) => {
      const named = NAMED_VALUES.includes(entry.part)
      let prefix = ''
      if (!prefixed && !named) {
        prefix = `${country}:`
        prefixed = true
      }
      const previous = entries[index - 1]
      const separator =
        index === 0
          ? ''
          : entry.kind === 'traffic_sign' || (previous && NAMED_VALUES.includes(previous.part))
            ? ';'
            : ','
      return `${separator}${prefix}${entry.part}`
    })
    .join('')
}

export function entryOf(sign: SignType): SignEntry {
  return { part: sign.osmValuePart, sign, kind: sign.kind }
}

/** The title of a sign: descriptive name, else name, else the code */
export function signTitle(sign: SignType): string {
  return sign.descriptiveName || sign.name || sign.osmValuePart
}
