/**
 * The edit menu's "Reroute the route" on a way of a route relation (Tobias, 2026-11-13): the stretch starts on the
 * way that was right clicked, because a long route's start and end are rarely in view. A way in more than one route
 * that Maid can route offers each route in a flyout. The operation makes no change itself: `start` begins the reroute
 * with the way's two ends as its start and end, and RerouteOnMap takes the map from there (module mode).
 */
import { OsmRelation, OsmWay, type Graph } from '@osm-editor-kit/maid-model'
import type {
  Operation,
  OperationChoice,
  OperationContext,
  OperationPreviewLine,
} from '@osm-editor-kit/maid-operations'
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
    const line = wayLine(context.graph, way.id)
    const first = line[0]
    const last = line.at(-1)
    if (!first || !last) return
    const anchor = route.members.findIndex(
      (member) => member.type === 'way' && member.id === way.id,
    )
    // the way's ends, in the route's direction where the member before it tells which end comes first
    const before = anchor > 0 ? route.members[anchor - 1] : undefined
    const previous = before?.type === 'way' ? context.graph.hasEntity(before.id) : undefined
    const turned =
      previous instanceof OsmWay &&
      !previous.nodes.includes(way.nodes[0]!) &&
      previous.nodes.includes(way.nodes.at(-1)!)
    const [start, end] = turned ? [last, first] : [first, last]
    rerouteActions.beginOnWay({
      relationId: route.id,
      wayId: way.id,
      anchor,
      start: { lon: start[0], lat: start[1] },
      end: { lon: end[0], lat: end[1] },
    })
  },
}
