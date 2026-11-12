# Reroute module (`@osm-editor-kit/maid-module-reroute`)

Reroutes a stretch of a route relation over the ways that are loaded. The person clicks a start and an end on the map, Maid routes between them, shows the new path as a preview, and writes it into the relation as one undo step. Route types: bicycle and mtb (bicycle profile), hiking, foot and walking (foot profile).

`reroute(options?)`: the options are `{ apply? }`, the writer of the reroute. The default is `planApply` (plan.ts). Nothing here connects ways: a way is split where the new path starts or ends inside it.

## What a person sees / can do

- Inspector section "Reroute" (closed by default) on a route relation (`type=route`, `route=bicycle|mtb|hiking|foot|walking`). Its button "Reroute a stretch" starts a reroute.
- Two points: click (or tap) the start and the end. A drag moves a point, and a new tap sets the end again. Escape ends the reroute.
- Preview on the map: the stretch as it is, the new path, the split points, the points to check and two handles (`RerouteOnMap`, `preview-shapes.ts`).
- A report: the length before and after, ways added, removed and split, other relations that gain a part, and "To check" for point members that are far from the new path.
- Questions for one-way ways on the new path: "Forward", "Backward" or "Empty" (the route's role for that way), each with the reason the data gives.
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
| `src/index.ts` | `reroute()`, and the exports the other packages use (`planApply`, `previewReroute`, `profileOfRoute`, `routingGraphOf`, `previewShapes`, the store) |
| `src/route.ts` | Pure: snaps the points to the routing graph, finds the stretch and the route (`@osm-editor-kit/maid-routing`), and keeps the last answer per graph and pair of points |
| `src/plan.ts` | Pure: turns the route into the actions (new nodes, remove the stretch's members, split ways, insert the new members in order, roles) and the report |
| `src/apply-port.ts` | Checks the data at the moment of Apply (the ways must be the ones the preview routed on), plans again, performs the plan as one undo step |
| `src/geometry.ts` | Lines and lengths of ways on the model's graph |
| `src/preview-shapes.ts` | The preview as GeoJSON, one `kind` per feature |
| `src/reroute-store.ts` | The UI state: the relation, the two points, the occurrence and the answers to the role questions |
| `src/use-reroute.ts` | The React hook that reads the graph and the preview for the map and the section |
| `src/RerouteSection.tsx` | The inspector section and its panel |
| `src/RerouteOnMap.tsx` | The map content: the preview layers and the module mode that takes the pointer |
| `src/messages.ts`, `messages/` | Texts in en (base), de, fr, es |
| `src/*.test.ts`, `plan-test-helpers.ts`, `test-graph.ts` | Tests and their helpers |

## Tests

`bun test packages/module-reroute`: the plan (members, splits, roles, refusals), the route on a small test graph, the geometry, the preview shapes and the store.

The browser check is `bun run check-reroute --app bicycle` (scene `relations`: two clicks, the preview, Apply, one undo, Escape).

## More

- Research: [docs/research/relation-handling.md](../../docs/research/relation-handling.md), section 7 (decided 2026-10-15, with its decisions list).
- Decisions and steps: [docs/build-out/steps.md](../../docs/build-out/steps.md), the relation column entries (2026-10-17) and its open list.
- Routing: [packages/routing/README.md](../routing/README.md).
- Open: "Reroute next to the route's ways" (the relation column's open list in the steps). No connecting of ways (decided as a later, separate step).
