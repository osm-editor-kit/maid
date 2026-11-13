# Reroute module (`@osm-editor-kit/maid-module-reroute`)

Reroutes a stretch of a route relation over the ways that are loaded, as a route planner does. The person starts on a way of the route (edit menu) or on the relation (inspector section), drags the start, the end and the new path, sees what leaves the route and what joins it, and Apply writes it into the relation as one undo step. Route types: bicycle and mtb (bicycle profile), hiking, foot and walking (foot profile).

`reroute(options?)`: the options are `{ apply? }`, the writer of the reroute. The default is `planApply` (plan.ts). Nothing here connects ways: a way is split where the new path starts or ends inside it.

## What a person sees / can do

- Edit menu of a way in a route (right click or long tap): "Reroute the route" (Tobias, 2026-11-13: the start and the end of a long route are rarely in view, so the action belongs to the way). A way in more than one such route shows the routes in a flyout; hovering one marks its ways. The reroute starts with the way's two ends as the start and the end (`operation.ts`).
- Inspector section "Reroute" (closed by default) on a route relation (`type=route`, `route=bicycle|mtb|hiking|foot|walking`). Its button "Reroute a stretch" starts a reroute by two clicks: the start, then the end.
- While a reroute is under way the map belongs to it (module mode): nothing else can be selected or dragged. The start and the end are handles that stay on the route's own ways. A press on the new path drags a via point out of it, a click adds one, a via handle moves, Backspace takes out the last, Escape ends the reroute. Another selection ends it too.
- Preview on the map in the colours of the edits display (renderer `EDIT_COLOUR`): the stretch as it is orange and dashed (what the new path does not cover leaves the route), the new path blue, green-edged on ways that join the route, the split points, the points to check and the handles (`RerouteOnMap`, `preview-shapes.ts`).
- A panel in the map's top left corner (`ReroutePanel`): the route's name, the ways that leave the route and those that join it by name (struck through orange, green with +, as the way table's "Highlight changes"), the length before and after, ways added, removed and split, other relations that gain a part, and "To check" for point members that are far from the new path. "Nothing changes yet" while the new path is the old one.
- Questions for one-way ways on the new path, folded (each has a suggestion that Apply takes): "Forward", "Backward" or "Empty" (the route's role for that way), each with the reason the data gives.
- If the stretch occurs more than once in the route, "Occurrence 1, 2…" picks which one.
- "Apply" writes the reroute as one undo step. "Cancel" drops it and nothing reaches the history.
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
| `src/ReroutePanel.tsx` | The panel over the map: what leaves and joins, the report, the questions, Apply and Cancel |
| `src/RerouteOnMap.tsx` | The map content: the preview layers, the panel in the map's corner and the module mode that takes the pointer |
| `src/messages.ts`, `messages/` | Texts in en (base), de, fr, es |
| `src/*.test.ts`, `plan-test-helpers.ts`, `test-graph.ts` | Tests and their helpers |

## Tests

`bun test packages/module-reroute`: the plan (members, splits, roles, refusals), the route on a small test graph, the geometry, the preview shapes and the store.

The browser check is `bun run check-reroute --app bicycle` (scene `relations`, 23 checks: two clicks, the preview, Apply, one undo, Escape; then the edit menu on a way with its flyout of routes, the panel, a handle dragged along the route, the line dragged onto another way, Apply, one undo). Its screenshot: `reports/reroute-panel.png`.

## More

- Research: [docs/research/relation-handling.md](../../docs/research/relation-handling.md), section 7 (decided 2026-10-15, with its decisions list).
- Decisions and steps: [docs/build-out/steps.md](../../docs/build-out/steps.md), the relation column entries (2026-10-17) and its open list.
- Routing: [packages/routing/README.md](../routing/README.md).
- Open: "Reroute next to the route's ways" (the relation column's open list in the steps). No connecting of ways (decided as a later, separate step). A via point dragged off a short stretch gives a spur out and back: drag the start and the end first.
