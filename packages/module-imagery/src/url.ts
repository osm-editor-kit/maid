/**
 * The URL parameters of the imagery module: `bg` (the background; iD calls it `background`), `overlays` (the same
 * name in iD), `offset` (the same name and notation in iD, in meters) and `bg_display` (the display settings of the
 * background, Maid's own). The notation is iD's
 * (`.reference/id/modules/renderer/background.js`): a background is an ELI layer id, `none`, or `custom:<template>`
 * (Maid adds `oam:<item id>`, one OpenAerialMap image, see oam.ts); overlays are a comma list in the order they were chosen; `bg_display` is a comma list of `name:value`.
 *
 * Pure: no React and no nuqs. The parsers have the shape core's `UrlParser` takes; the module declares them in
 * `setup` (index.ts), and the shell maps the iD names (core's `iD`).
 */
import type { IdUrlName, UrlParser } from '@osm-editor-kit/maid-core'
import { isZeroOffset, readOffset, roundOffset, type Meters } from './offset.ts'

/** The background that is no imagery at all */
export const NONE = 'none'

const CUSTOM = 'custom:'

/** The value of a custom background with this template: `custom:<template>` */
export function customValue(template: string) {
  return `${CUSTOM}${template}`
}

export function isCustomValue(value: string) {
  return value.startsWith(CUSTOM)
}

/** The template of a `custom:` value, or null for any other value */
export function templateOf(value: string): string | null {
  return isCustomValue(value) ? value.slice(CUSTOM.length) : null
}

const OAM = 'oam:'

/** The value of an OpenAerialMap image: `oam:<item id>`, the id the layer index gives it too */
export function oamValue(itemId: string) {
  return `${OAM}${itemId}`
}

/** Whether a value is an OpenAerialMap image (`oam:<item id>`, with an id) */
export function isOamValue(value: string) {
  return value.startsWith(OAM) && value.length > OAM.length
}

/**
 * A background that needs no index: none, a custom template (its own tiles) or an OpenAerialMap image (asked for by
 * its id). These are the person's own choice: the start order keeps them and a move never switches them.
 */
export function isOwnValue(value: string) {
  return value === NONE || isCustomValue(value) || isOamValue(value)
}

/**
 * `bg`: an ELI id, `none`, `custom:<template>` or `oam:<item id>`. The template keeps its `&`, braces and spaces: the URL
 * encodes them and nuqs decodes them. Nothing else is checked here; a template that does not work is refused where
 * it is drawn. Empty, or `custom:` with no template, is no opinion (null).
 */
export const parseAsBackground: UrlParser<string> = {
  parse(value) {
    if (value === '') return null
    if (value === CUSTOM) return null
    if (value === OAM) return null
    return value
  },
  serialize: (value) => value,
  eq: (a, b) => a === b,
}

/**
 * `overlays`: the ids in the order they were chosen, comma separated. `none` is the explicit empty list, so that a
 * link can say "no overlays" and the stored ones do not come back. A value with no id in it is no opinion (null).
 */
export const parseAsOverlays: UrlParser<string[]> = {
  parse(value) {
    if (value === NONE) return []
    const ids = [
      ...new Set(
        value
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id !== ''),
      ),
    ]
    return ids.length > 0 ? ids : null
  },
  serialize: (ids) => (ids.length === 0 ? NONE : ids.join(',')),
  eq: (a, b) => a.length === b.length && a.every((id, index) => id === b[index]),
}

/**
 * iD's name for the background, which Maid's parameter `bg` maps onto. `layer` is read too
 * (`hash.background || hash.layer`), and an iD link ("Open in iD") is written with `background`.
 */
export const ID_BACKGROUND: IdUrlName = { name: 'background', aliases: ['layer'] }

/** iD's name for the overlays. iD leaves an empty list out of its link, so `none` is written as an empty value. */
export const ID_OVERLAYS: IdUrlName = {
  name: 'overlays',
  toId: (value) => (value === NONE ? '' : value),
}

/** iD's name for the offset: the same name and notation (`offset=east,north` in meters, background.js) */
export const ID_OFFSET: IdUrlName = { name: 'offset' }

/**
 * `offset`: the imagery's offset in meters, `east,north` (iD's notation). It is live state: a link sets it, the panel
 * changes it, and nothing remembers it for the next visit (iD does not either). Two numbers, a comma or a semicolon
 * between them, rounded to two decimals as iD's hash has them. Anything else, and `0,0`, is no opinion (null).
 */
export const parseAsOffset: UrlParser<Meters> = {
  parse(value) {
    const meters = readOffset(value)
    return meters === null || isZeroOffset(meters) ? null : meters
  },
  serialize: (meters) => {
    const [east, north] = roundOffset(meters)
    return `${east},${north}`
  },
  eq: (a, b) => a[0] === b[0] && a[1] === b[1],
}

/**
 * `bg_display`: the display settings of the background, a comma list of `name:value` with the value in percent as an
 * integer, e.g. `brightness:70`. A name Maid does not know is left out (iD and later versions may add more), and so is
 * a value that is not an integer in the name's range. The first entry of a name wins.
 */
export const DISPLAY_RANGES: Readonly<Record<string, readonly [number, number]>> = {
  // the same range as BRIGHTNESS_MIN and BRIGHTNESS_MAX in helpers.ts (kept here: helpers imports this file)
  brightness: [20, 100],
}

/** The names `bg_display` reads, with their values in percent (integers). Pure: no value is clamped or converted. */
export function readDisplayList(value: string): Record<string, number> {
  const entries: Record<string, number> = {}
  for (const part of value.split(',')) {
    const [name = '', percent, ...rest] = part.split(':').map((text) => text.trim())
    if (rest.length > 0 || percent === undefined) continue
    if (!Object.prototype.hasOwnProperty.call(DISPLAY_RANGES, name)) continue
    if (!/^\d+$/.test(percent)) continue
    const [min, max] = DISPLAY_RANGES[name] ?? [0, 0]
    const amount = Number(percent)
    if (amount < min || amount > max) continue
    if (!Object.prototype.hasOwnProperty.call(entries, name)) entries[name] = amount
  }
  return entries
}

/**
 * `bg_display` as the brightness of the background (0.2 to 1, the store's scale). No `brightness:` entry is no opinion
 * (null): the stored choice applies. Written as `brightness:<percent>`, rounded to a whole percent.
 */
export const parseAsBgDisplay: UrlParser<number> = {
  parse(value) {
    const percent = readDisplayList(value).brightness
    return percent === undefined ? null : percent / 100
  },
  serialize: (brightness) => `brightness:${Math.round(brightness * 100)}`,
  eq: (a, b) => Math.round(a * 100) === Math.round(b * 100),
}
