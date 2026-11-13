/**
 * The edit menu's "Reroute the route" on a way of a route relation (Tobias, 2026-11-13): the stretch starts on the
 * way that was right clicked, because a long route's start and end are rarely in view. A way in more than one route
 * that Maid can route offers each route in a flyout. The operation makes no change itself: `start` begins the route
 * planner mode of that route, with a support point where the menu was opened, and RerouteOnMap takes the map from
 * there (module mode).
 */
import { OsmRelation, OsmWay, type Graph } from '@osm-editor-kit/maid-model'
import type {
  Operation,
  OperationChoice,
  OperationContext,
  OperationPreviewLine,
} from '@osm-editor-kit/maid-operations'
import { editAt, routeChain } from './chain.ts'
import { wayLine } from './geometry.ts'
import { m } from './messages.ts'
import { rerouteActions } from './reroute-store.ts'
import { profileOfRoute } from './route.ts'

/** The one selected way, when exactly one way is selected */
function selectedWay(context: OperationContext): OsmWay | undefined {
  if (context.selected.length !== 1) return undefined
  const entity = context.graph.hasEntity(context.selected[0]!)
  return entity instanceof OsmWay ? entity : undefined
}

/** The route relations of a way that the reroute works on (bicycle, mtb, hiking, foot, walking), in the data's order */
export function routesOfWay(graph: Graph, way: OsmWay): OsmRelation[] {
  return graph
    .parentRelations(way)
    .filter((relation) => profileOfRoute(relation.tags ?? {}) !== undefined)
}

/** A route's name for the flyout and the panel: its name, its ref, or its id */
export function routeLabel(relation: OsmRelation): string {
  const { name, ref } = relation.tags ?? {}
  if (name && ref && !name.includes(ref)) return `${name} (${ref})`
  return name ?? ref ?? relation.id
}

/** The route the person picked, or the only one */
function chosenRoute(context: OperationContext): { way: OsmWay; route: OsmRelation } | undefined {
  const way = selectedWay(context)
  if (!way) return undefined
  const routes = routesOfWay(context.graph, way)
  const route =
    context.choice === undefined ? routes[0] : routes.find((r) => r.id === context.choice)
  return route ? { way, route } : undefined
}

export const rerouteOperation: Operation = {
  id: 'reroute-route',
  // a getter: the label is read when the menu shows it, in the language of that moment
  get label() {
    return m.reroute_operation()
  },
  icon: 'iD-route-detour',
  group: 'structure',
  applies: (context) => {
    const way = selectedWay(context)
    return way !== undefined && routesOfWay(context.graph, way).length > 0
  },
  disabled: () => undefined,
  choices: (context): OperationChoice[] => {
    const way = selectedWay(context)
    if (!way) return []
    const routes = routesOfWay(context.graph, way)
    // one route needs no choice; more than one: the flyout names each
    if (routes.length < 2) return []
    return routes.map((route) => ({ id: route.id, label: routeLabel(route) }))
  },
  // while a route is hovered in the flyout, its ways are marked: which route is which
  preview: (context): OperationPreviewLine[] => {
    const chosen = chosenRoute(context)
    if (!chosen) return []
    const seen = new Set<EntityID>()
    const lines: OperationPreviewLine[] = []
    for (const member of chosen.route.members) {
      if (member.type !== 'way' || seen.has(member.id)) continue
      seen.add(member.id)
      const line = wayLine(context.graph, member.id)
      if (line.length > 1) lines.push({ line: [...line], style: 'mark' })
    }
    return lines
  },
  run: () => ({ actions: [], annotation: '' }),
  start: (context) => {
    const chosen = chosenRoute(context)
    if (!chosen) return
    const { way, route } = chosen
    rerouteActions.beginRoute(route.id, way.id)
    // where the menu was opened is a support point on the line, ready to be dragged away
    const at = context.at
    if (!at) return
    const edit = editAt(routeChain(context.graph, route), at[0], at[1])
    if (edit) rerouteActions.edit(edit)
  },
}
