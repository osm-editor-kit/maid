import type { UrlParser } from '@osm-editor-kit/maid-core'

/** The `level` URL key: the building level being edited, a number as OSM writes it (`-1`, `0.5`); absent: no level */
export const parseAsLevel: UrlParser<number> = {
  parse: (value) => (/^-?\d+(\.\d+)?$/.test(value) ? Number(value) : null),
  serialize: (level) => String(level),
  eq: (a, b) => a === b,
}
