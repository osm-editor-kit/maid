# Reroute module (`@osm-editor-kit/maid-module-reroute`)

Reroutes a stretch of a route relation over the ways that are loaded, as a route planner does. The person starts on a way of the route (edit menu) or on the relation (inspector section), drags the start, the end and the new path, sees what leaves the route and what joins it, and Apply writes it into the relation as one undo step. Route types: bicycle and mtb (bicycle profile), hiking, foot and walking (foot profile).

`reroute(options?)`: the options are `{ apply? }`, the writer of the reroute. The default is `planApply` (plan.ts). Nothing here connects ways: a way is split where the new path starts or ends inside it.

## What a person sees / can do

- Edit menu of a way in a route (right click or long tap): "Reroute the route" (Tobias, 2026-11-13: the start and the end of a long route are rarely in view, so the action belongs to the way). A way in more than one such route shows the routes in a flyout; hovering one marks its ways (`operation.ts`).
- Inspector section "Reroute" (closed by default) on a route relation (`type=route`, `route=bicycle|mtb|hiking|foot|walking`): its button "Reroute the route" starts the same mode.
- The mode works as a route planner (Tobias, 2026-11-13): the whole route is a blue line, with white support points only where it turns clearly (40° over 12 m, at most one per 35 m; the ends of each piece dark, `chain.ts`). Where the menu was opened is a point to drag. A drag from the line or a support point reroutes only the stretch between the two neighbouring support points over the loaded ways, and letting go writes it at once, as one undo step (the plan splits ways where the route leaves or joins them). The new path shows while dragging; what joined stays green on the map.
- The changes show in the route's list of ways on the left (the relation column, which opens on the route): the ways that joined green with a plus, the ways that left struck through with a minus where they were (`member-marks.ts`, `setRelationMemberMarks` in `packages/ui`). Worked out against the members at the start of the mode, so an undo or a redo shows what is true after it.
- A small bar in the map's top left corner (`ReroutePanel`): the route's name, how to drag, why a drag cannot be made, Undo and Done. While the mode is on nothing else can be selected; Escape, Done or another selection ends it. Undo keeps the mode on (`staysOnUndo`).
- Messages say why there is no path (no way joins the points, one-way, a way not loaded) and why a point cannot be used (not on a road or path within 200 m).

## Using it in an editor's config

```ts
import { reroute } from '@osm-editor-kit/maid-module-reroute'
// in the modules list of apps/maid-bicycle/src/maid.config.ts:
reroute(),
```

Only `maid-bicycle` switches it on. The router works on the data loaded in the editor and applies the turn restrictions of that data. Tailwind reads the module from `packages/shell/src/styles.css` (`@source '../../module-reroute/src';`).

## Parts

| File | What it does |
| --- | --- |
| `src/index.ts` | `reroute()`, and the exports the other packages use (`planApply`, `previewReroute`, `profileOfRoute`, `routingGraphOf`, `previewShapes`, the store, the operation) |
| `src/operation.ts` | The edit menu's "Reroute the route" on a way, its flyout of routes and the marked ways of the hovered one |
| `src/route.ts` | Pure: snaps the start and the end onto the route's own ways (`snapToWay`) and the via points to any road, finds the stretch and the route leg by leg (`@osm-editor-kit/maid-routing`), joins the legs (`joinRoutes`: a via point inside a way is no split), and keeps the last answer per graph and pair of points |
| `src/plan.ts` | Pure: turns the route into the actions (new nodes, remove the stretch's members, split ways, insert the new members in order, roles) and the report |
| `src/apply-port.ts` | Checks the data at the moment of Apply (the ways must be the ones the preview routed on), plans again, performs the plan as one undo step |
| `src/geometry.ts` | Lines and lengths of ways on the model's graph |
| `src/preview-shapes.ts` | The preview as GeoJSON, one `kind` per feature |
| `src/reroute-store.ts` | The UI state: the relation, the start, the end and the via points, the way it began on, the occurrence and the answers to the role questions |
| `src/use-reroute.ts` | The React hook that reads the graph and the preview for the map and the section |
| `src/RerouteSection.tsx` | The inspector section: the button, and a note while the reroute is under way |
| `src/chain.ts` | Pure: the route as one line in travel order with its support points, and the stretch a press or a support point drag reroutes |
| `src/member-marks.ts` | Pure: the marks for the route's list of ways (joined, left and where) against the members at the start of the mode |
| `src/ReroutePanel.tsx` | The small bar over the map: the route, the hint, why a drag cannot be made, Undo and Done |
| `src/RerouteOnMap.tsx` | The map content: the route line and support points, the preview while dragging, the write at the drop, the marks, the bar and the module mode that takes the pointer |
| `src/messages.ts`, `messages/` | Texts in en (base), de, fr, es |
| `src/*.test.ts`, `plan-test-helpers.ts`, `test-graph.ts` | Tests and their helpers |

## Tests

`bun test packages/module-reroute`: the plan (members, splits, roles, refusals), the route on a small test graph, the geometry, the preview shapes and the store.

The browser check is `bun run check-reroute --app bicycle` (scene `relations`, 23 checks: the edit menu on a way with its flyout of routes, the route line and support points, a drag onto a way nearby written at the drop, the marks in the list of ways, the bar's Undo with the mode staying on, a support point dragged and undone, Escape, the inspector section). Its screenshot: `reports/reroute-panel.png`.

## More

- Research: [docs/research/relation-handling.md](../../docs/research/relation-handling.md), section 7 (decided 2026-10-15, with its decisions list).
- Decisions and steps: [docs/build-out/steps.md](../../docs/build-out/steps.md), the relation column entries (2026-10-17) and its open list.
- Routing: [packages/routing/README.md](../routing/README.md).
- Open: no connecting of ways (decided as a later, separate step). A point dragged onto a dead end gives a spur out and back, as in a route planner; the stretch between two support points is routed afresh, so a small drag can take a different street for the whole stretch.
