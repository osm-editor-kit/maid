import { OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import type { Rule } from '../types.ts'

/**
 * The most nodes the OSM API accepts in one way. iD reads it from the server's capabilities; Maid
 * never calls the API (automated runs send no requests to OSM), so it uses the limit the API
 * documents. A caller that knows another limit passes it to `createOsmApiLimits`.
 */
export const defaultMaxWayNodes = 2000

/** Ways with more nodes than the OSM API accepts: the upload would be refused */
// The annotation makes the returned object be checked against the Rule type
export function createOsmApiLimits(maxWayNodes: number): Rule {
  return {
    id: 'osm_api_limits',
    label: 'OSM API limits',
    validate(entity: OsmEntity) {
      if (!(entity instanceof OsmWay)) return []
      const count = entity.nodes.length
      if (count <= maxWayNodes) return []
      return [
        {
          id: `osm_api_limits:${entity.id}`,
          rule: 'osm_api_limits',
          severity: 'error',
          message: `This way has ${count} nodes, more than the ${maxWayNodes} the OSM API accepts in one way`,
          entityIds: [entity.id],
          // Splitting the way is an operation, not a tag change: see the validations report
          fixes: [],
          data: { nodes: count, maxWayNodes },
        },
      ]
    },
  }
}

/** The rule with the API's documented limit of nodes in one way */
export const osmApiLimits: Rule = createOsmApiLimits(defaultMaxWayNodes)
