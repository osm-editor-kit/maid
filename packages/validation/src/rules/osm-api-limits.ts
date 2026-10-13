import { OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import type { Issue, Rule } from '../types.ts'

/**
 * The most nodes the OSM API accepts in one way. iD reads it from the server's capabilities; Maid
 * never calls the API (automated runs send no requests to OSM), so it uses the limit the API
 * documents. A caller that knows another limit passes it to `createOsmApiLimits`.
 */
export const defaultMaxWayNodes = 2000

/** The most characters the OSM API accepts in a tag key and in a tag value (Unicode characters, not bytes) */
export const MAX_TAG_LENGTH = 255

/** A tag key or value that the OSM API would refuse: which part, of which key, and its length */
export type LongTag = { key: string; part: 'key' | 'value'; length: number }

/** The keys and values of the tags that are longer than the API accepts, in the tags' order */
export function longTags(tags: Readonly<Record<string, string>>): LongTag[] {
  const long: LongTag[] = []
  for (const [key, value] of Object.entries(tags)) {
    const keyLength = Array.from(key).length
    if (keyLength > MAX_TAG_LENGTH) long.push({ key, part: 'key', length: keyLength })
    const valueLength = Array.from(value).length
    if (valueLength > MAX_TAG_LENGTH) long.push({ key, part: 'value', length: valueLength })
  }
  return long
}

function describeLongTag(tag: LongTag) {
  const what = tag.part === 'value' ? `The value of ${tag.key}` : `The key ${tag.key}`
  return `${what} is ${tag.length} characters long, the limit is ${MAX_TAG_LENGTH}`
}

/**
 * The most nodes in one way, and the longest tag keys and values. Both make the upload refused.
 * The tag check looks at every kind of entity; one issue per entity names its first long tag.
 */
// The annotation makes the returned object be checked against the Rule type
export function createOsmApiLimits(maxWayNodes: number): Rule {
  return {
    id: 'osm_api_limits',
    label: 'OSM API limits',
    validate(entity: OsmEntity) {
      const issues: Issue[] = []
      if (entity instanceof OsmWay && entity.nodes.length > maxWayNodes) {
        const count = entity.nodes.length
        issues.push({
          id: `osm_api_limits:${entity.id}`,
          rule: 'osm_api_limits',
          severity: 'error',
          message: `This way has ${count} nodes, more than the ${maxWayNodes} the OSM API accepts in one way`,
          entityIds: [entity.id],
          // Splitting the way is an operation, not a tag change: see the validations report
          fixes: [],
          data: { nodes: count, maxWayNodes },
        })
      }
      const long = longTags(entity.tags)
      const first = long[0]
      if (first !== undefined) {
        const more = long.length - 1
        issues.push({
          id: `osm_api_limits:${entity.id}:tags`,
          rule: 'osm_api_limits',
          severity: 'error',
          message:
            more === 0
              ? describeLongTag(first)
              : `${describeLongTag(first)} (and ${more} more too long)`,
          entityIds: [entity.id],
          // a tag change is fixed by the person, in the field or the raw tags
          fixes: [],
          data: { kind: 'tagLength', part: first.part, tags: long, limit: MAX_TAG_LENGTH },
        })
      }
      return issues
    },
  }
}

/** The rule with the API's documented limit of nodes in one way */
export const osmApiLimits: Rule = createOsmApiLimits(defaultMaxWayNodes)
