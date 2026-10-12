import { locationOf } from '../geo.ts'
import type { Issue, Rule } from '../types.ts'

/**
 * Sources that OSM must not use as a reference, from iD's `incompatible_source`. `exceptRegex`
 * excludes the sources that only look like them (Google Books and Drive, Google's open building
 * datasets, Amap's road names).
 */
const incompatibleRules: readonly {
  id: string
  regex: RegExp
  exceptRegex?: RegExp
  reference: string
}[] = [
  {
    id: 'amap',
    regex: /(^amap$|^amap\.com|autonavi|mapabc|高德)/i,
    exceptRegex: /高德([路山桥街巷]|大道)/i,
    reference: 'Amap products are proprietary and must not be used as references.',
  },
  {
    id: 'baidu',
    regex: /(baidu|mapbar|百度)/i,
    reference: 'Baidu products are proprietary and must not be used as references.',
  },
  {
    id: 'google',
    regex: /(google)/i,
    exceptRegex:
      /((books|drive)\.google|google\s?(books|drive|plus))|(esri\/Google_(Africa|Open)_Buildings)/i,
    reference: 'Google products are proprietary and must not be used as references.',
  },
]

/** The rules a single source value matches, e.g. `Google Maps` matches `google` */
function incompatibleRulesFor(source: string) {
  return incompatibleRules.filter(
    (rule) => rule.regex.test(source) && !rule.exceptRegex?.test(source),
  )
}

/**
 * Features whose `source` tag names a proprietary product (Google, Baidu, Amap). One issue per
 * source value and matching product. The fix is by hand: iD's fix only says "remove proprietary
 * data" and changes nothing, so Maid offers none.
 */
export const incompatibleSource: Rule = {
  id: 'incompatible_source',
  label: 'Incompatible source',
  validate(entity, { graph }): Issue[] {
    const sourceTag = entity.tags.source
    if (!sourceTag) return []
    const loc = locationOf(entity, graph)
    return sourceTag.split(';').flatMap((source) =>
      incompatibleRulesFor(source).map(
        (matched): Issue => ({
          id: `incompatible_source:${entity.id}:${source}:${matched.id}`,
          rule: 'incompatible_source',
          severity: 'warning',
          message: `Lists "${source}" as a data source. ${matched.reference}`,
          entityIds: [entity.id],
          ...(loc ? { loc } : {}),
          fixes: [],
          data: { source, product: matched.id },
        }),
      ),
    )
  },
}
