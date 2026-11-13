// Rerouting a route relation onto other ways: docs/research/relation-handling.md, section 7.
//
// The module adds "Reroute the route" to the edit menu of a way in a route relation (type=route,
// route=bicycle|mtb|hiking|foot|walking), an inspector section to the relation, and a map content item. Either starts
// a reroute; while one is under way the map's pointer goes to it (the engine's module mode), the preview and its panel
// are drawn, and Apply writes the reroute through the port (apply-port.ts): one undo step.
import { defineModule } from '@osm-editor-kit/maid-core'
import type { MapContentItem } from '@osm-editor-kit/maid-renderer'
import type { InspectorSectionProps } from '@osm-editor-kit/maid-ui'
import { createElement } from 'react'
import { planApply, type RerouteApply } from './apply-port.ts'
import { m } from './messages.ts'
import { rerouteOperation } from './operation.ts'
import { RerouteOnMap } from './RerouteOnMap.tsx'
import { RerouteSection } from './RerouteSection.tsx'
import { profileOfRoute } from './route.ts'

export type RerouteOptions = {
  /** The writer of the reroute. Default: `planApply` (plan.ts, performed as one undo step). */
  apply?: RerouteApply
}

/**
 * The reroute: the edit menu's "Reroute the route" on a way of a route, the inspector section of a route relation, and
 * the map of the reroute with its panel. Switched on by the app's config.
 */
export function reroute(options: RerouteOptions = {}) {
  const apply = options.apply ?? planApply
  return defineModule({
    id: 'reroute',
    setup(api) {
      const contents: MapContentItem = {
        id: 'reroute',
        component: (props) => createElement(RerouteOnMap, { ...props, apply }),
      }
      api.register('map.content', contents)
      // the edit menu on a way of a route: "Reroute the route", the stretch starts on that way
      api.register('edit.operation', rerouteOperation)
      api.register('inspector.section', {
        id: 'reroute',
        title: m.reroute_title(),
        when: (entity) =>
          entity.type === 'relation' && profileOfRoute(entity.tags ?? {}) !== undefined,
        disclosure: 'closed',
        component: (props: InspectorSectionProps) => createElement(RerouteSection, props),
      })
    },
  })
}

export {
  planApply,
  type RerouteApply,
  type RerouteApplyResult,
  type RerouteRefusal,
  type RerouteRequest,
} from './apply-port.ts'
export {
  previewReroute,
  profileOfRoute,
  requestOf,
  routingGraphOf,
  type RoutePreview,
} from './route.ts'
export { previewShapes } from './preview-shapes.ts'
export { rerouteActions, readReroute, type ViaPoint } from './reroute-store.ts'
export { rerouteOperation, routesOfWay } from './operation.ts'
