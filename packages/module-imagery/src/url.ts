/**
 * The URL parameters of the imagery module, `background` and `overlays`, in iD's names and notation
 * (`.reference/id/modules/renderer/background.js`): a background is an ELI layer id, `none`, or
 * `custom:<template>`; overlays are a comma list in the order they were chosen.
 *
 * Pure: no React and no nuqs. The parsers have the shape core's `UrlParser` takes; the module declares them in
 * `setup` (index.ts), and the shell maps the iD names (core's `iD`).
 */
import type { IdUrlName, UrlParser } from '@osm-editor-kit/maid-core'

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

/** A background that needs no index: none, or a custom template (its own tiles) */
export function isOwnValue(value: string) {
  return value === NONE || isCustomValue(value)
}

/**
 * `background`: an ELI id, `none`, or `custom:<template>`. The template keeps its `&`, braces and spaces: the URL
 * encodes them and nuqs decodes them. Nothing else is checked here; a template that does not work is refused where
 * it is drawn. Empty, or `custom:` with no template, is no opinion (null).
 */
export const parseAsBackground: UrlParser<string> = {
  parse(value) {
    if (value === '') return null
    if (value === CUSTOM) return null
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

/** iD's name for the background: `layer` is read too (`hash.background || hash.layer`), Maid writes `background` */
export const ID_BACKGROUND: IdUrlName = { name: 'background', aliases: ['layer'] }

/** iD's name for the overlays. iD leaves an empty list out of its link, so `none` is written as an empty value. */
export const ID_OVERLAYS: IdUrlName = {
  name: 'overlays',
  toId: (value) => (value === NONE ? '' : value),
}
