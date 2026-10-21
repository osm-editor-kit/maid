import type { UrlParser } from '@osm-editor-kit/maid-core'
import type { EditedLevel } from '@osm-editor-kit/maid-levels'

/**
 * The `level` URL key: the building level being edited, a number as OSM writes it (`-1`, `0.5`), or `none` for the
 * features without a level; absent: no level mode
 */
export const parseAsLevel: UrlParser<EditedLevel> = {
  parse: (value) =>
    value === 'none' ? 'none' : /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : null,
  serialize: (level) => String(level),
  eq: (a, b) => a === b,
}
