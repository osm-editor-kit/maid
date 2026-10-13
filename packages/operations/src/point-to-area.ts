// Turn a point into an area: a standalone point whose tags could describe an area becomes a small
// closed way that carries those tags. Headless, like the rest of this package.
import { OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { Action, Graph } from '@osm-editor-kit/maid-model'
import type { Operation, OperationContext } from './types.ts'

/** Equatorial and polar radius in metres, as in iD's geo module (copied from packages/validation/src/geo.ts) */
const EQUATORIAL_RADIUS = 6.378137e6
const POLAR_RADIUS = 6.3567523e6
const TAU = 2 * Math.PI

/** Metres to degrees of latitude. Copied: this package depends on the model only. */
function metersToLat(meters: number) {
  return meters / ((TAU * POLAR_RADIUS) / 360)
}

/** Metres to degrees of longitude at this latitude. Copied: this package depends on the model only. */
function metersToLon(meters: number, atLat: number) {
  if (Math.abs(atLat) >= 90) return 0
  return meters / ((TAU * EQUATORIAL_RADIUS) / 360) / Math.abs(Math.cos((atLat * Math.PI) / 180))
}

/** The selected point, when the selection is exactly one standalone node with tags and a position */
function standalonePoint(context: OperationContext) {
  if (context.selected.length !== 1) return undefined
  const id = context.selected[0]
  const entity = id === undefined ? undefined : context.graph.hasEntity(id)
  if (!(entity instanceof OsmNode) || !entity.loc) return undefined
  if (context.graph.parentWays(entity).length > 0) return undefined
  if (Object.keys(entity.tags).length === 0) return undefined
  return entity
}

/**
 * Turn into an area: the selected point becomes the first node of a closed square of `size`
 * metres on a side, and its tags move to the way. The point keeps its id, version and history
 * (it is modified, not deleted), and the square is centred on its old position: the point
 * becomes the square's south-west corner. The other three corners are new, untagged nodes.
 * `area=yes` is added to the way only when its tags do not make it an area by themselves
 * (the model's `OsmWay.isArea`, which uses the tagging schema's area keys).
 *
 * Not in `defaultOperations`: whether tags can be an area is a question for the presets, which
 * this package does not know. The app passes `canBeArea` in and registers the operation.
 */
export function pointToArea(options: {
  /** Whether these tags could describe an area, e.g. the preset matched for the point lists `area` */
  canBeArea: (tags: Record<string, string>) => boolean
  /** Side of the square in metres. Default 10. */
  size?: number
}): Operation {
  const canBeArea = options.canBeArea
  const size = options.size ?? 10
  if (!(size > 0) || !Number.isFinite(size)) {
    throw new RangeError(`The size of the area has to be a positive number of metres, not ${size}`)
  }
  const half = size / 2

  return {
    id: 'point-to-area',
    label: 'Turn into an area',
    applies: (context) => {
      const point = standalonePoint(context)
      return point !== undefined && canBeArea(point.tags)
    },
    disabled: (context) => {
      const point = standalonePoint(context)
      if (!point) return undefined
      return context.graph.parentRelations(point).length > 0
        ? 'This point is a member of a relation. Turning it into an area would change what the relation means, so remove it from the relation first.'
        : undefined
    },
    run: (context) => {
      const point = standalonePoint(context)
      if (!point || !canBeArea(point.tags)) {
        throw new Error('The point-to-area operation does not apply to this selection')
      }
      const pointID = point.id
      let wayID: string | undefined

      const action: Action = (graph: Graph) => {
        const node = graph.entity(pointID)
        const loc = node instanceof OsmNode ? node.loc : undefined
        if (!loc) throw new Error(`The point ${pointID} has no position`)
        const [lon, lat] = loc
        const dLon = metersToLon(half, lat)
        const dLat = metersToLat(half)
        const model = node.context

        // corners in order: the kept node (south-west), south-east, north-east, north-west
        const southEast = new OsmNode(model, { loc: [lon + dLon, lat - dLat] })
        const northEast = new OsmNode(model, { loc: [lon + dLon, lat + dLat] })
        const northWest = new OsmNode(model, { loc: [lon - dLon, lat + dLat] })
        const corner = node.update({ loc: [lon - dLon, lat - dLat], tags: {} })

        const tags = { ...node.tags }
        let way = new OsmWay(model, {
          nodes: [pointID, southEast.id, northEast.id, northWest.id, pointID],
          tags,
        })
        if (!way.isArea()) way = way.update({ tags: { ...tags, area: 'yes' } })
        wayID = way.id

        return graph.replace([corner, southEast, northEast, northWest, way]).commit()
      }

      return {
        actions: [action],
        annotation: 'Turned a point into an area',
        select: (after) => (wayID !== undefined && after.hasEntity(wayID) ? [wayID] : []),
      }
    },
  }
}
