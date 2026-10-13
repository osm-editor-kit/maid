import type { Tags } from '@osm-editor-kit/maid-style'

/**
 * The text iD shows for a feature: its name, or for an unnamed feature its network, ref, direction and
 * waypoints (routes), or one of the alternative name tags. A port of iD's `utilDisplayName`
 * (modules/util/util.ts), with the map label flag and the locale list as arguments.
 *
 * `locales` are the locale codes to try before `name`, most specific first (iD's
 * `localizer.expandedLocaleCodes()`); the caller expands them, this function does not.
 * Nothing is allocated unless a locale list is passed, and no regex runs unless the feature is a route with a name.
 */

export type LabelFlags = {
  /** do not use `network` (or `cycle_network`) in the text */
  hideNetwork?: boolean
  /** do not use `ref` in the text */
  hideRef?: boolean
  /** the text is drawn on the map: only the house number of an address, never the whole address */
  isMapLabel?: boolean
}

const NO_FLAGS: LabelFlags = {}

/** iD's alternative name keys, tried in this order when there is no name, ref, network or route text */
const ALT_KEYS = [
  'addr:housename',
  'alt_name',
  'official_name',
  'loc_name',
  'loc_ref',
  'unsigned_ref',
  'seamark:name',
  'sector:name',
  'lock_name',
] as const

/** A right or left-right arrow marks a formulaic PTv2 route name, which needs no network, ref or stops */
const ARROW = /[→⇒↔⇔]|[-=]>/

function nameIn(tags: Tags, locales?: readonly string[]): string {
  if (locales) {
    for (const code of locales) {
      const localised = tags[`name:${code}`]
      if (localised) return localised
    }
  }
  return tags.name || ''
}

/**
 * The label of a feature. Returns '' when iD would show no text.
 *
 * Non-routes: the name, else the composition of network and ref (`US:US 76`, `SORTA 3X`).
 * Routes: network, ref, name, then direction or `from … to … via …`, joined the way iD's locale keys join them
 * (`VTA 64A: McKee & White`, `Green from A to B`). Only the name is taken for a route whose name is a PTv2 arrow name.
 */
export function labelOf(
  tags: Tags,
  locales?: readonly string[],
  flags: LabelFlags = NO_FLAGS,
): string {
  const name = nameIn(tags, locales)
  const route = Boolean(tags.route)
  // the common path: a plain name, no allocation
  if (!route && name) return name
  // iD checks the raw `name` tag here, not the localised one
  if (route && tags.name && ARROW.test(tags.name)) return tags.name

  const network = flags.hideNetwork ? undefined : tags.cycle_network || tags.network
  const ref = flags.hideRef ? undefined : tags.ref
  // the head is network, ref and name: `{network} {ref}: {name}`, the parts that are present only
  let head = ref && name ? `${ref}: ${name}` : ref || name || ''
  if (network) head = head ? `${network} ${head}` : network

  // a route is told apart by its direction, or else by its waypoints (only when both ends are known)
  let tail = ''
  if (route) {
    if (tags.direction) tail = tags.direction
    else if (tags.from && tags.to) {
      tail = tags.via
        ? `from ${tags.from} to ${tags.to} via ${tags.via}`
        : `from ${tags.from} to ${tags.to}`
    }
  }

  if (head || tail) return head && tail ? `${head} ${tail}` : head || tail

  for (const key of ALT_KEYS) {
    const value = tags[key]
    if (value !== undefined) return value
  }
  if (tags.highway === 'milestone' || tags.railway === 'milestone') {
    const distance = tags.distance ?? tags['railway:position']
    if (distance !== undefined) return distance
  }

  // the street address, as a last resort (iD: inspector.display_name_addr*)
  const housenumber = tags['addr:housenumber']
  const streetOrPlace = tags['addr:street'] || tags['addr:place']
  if (!flags.isMapLabel && housenumber && streetOrPlace) {
    const unit = tags['addr:unit']
    if (unit) return `${unit}, ${housenumber} ${streetOrPlace}`
    return `${housenumber} ${streetOrPlace}`
  }
  return housenumber || ''
}

const MAP_LABEL: LabelFlags = { isMapLabel: true }

/**
 * The label the feature builder puts on a line, area or point ('' for none). A feature with neither `name` nor
 * `ref` gets none here, so iD's alternative name keys (alt_name, loc_name, ...) and address labels are not drawn
 * for such features yet. The builder reads no other tag for them.
 */
export function mapLabelOf(tags: Tags): string {
  return tags.name || tags.ref ? labelOf(tags, undefined, MAP_LABEL) : ''
}
