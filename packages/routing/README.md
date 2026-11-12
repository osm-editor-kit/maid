# Routing (`@osm-editor-kit/maid-routing`)

A router for the data Maid has loaded: the ways a bicycle or a walker may use, a graph of them, the turn restrictions, and an A* search that gives the route as ranges of ways. It is headless: no React, no network, no MapLibre. It routes only on the loaded data, so a route cannot leave the loaded area.

Used by: the reroute module (`packages/module-reroute`) for its preview and for the writer of the edits, and `route-analysis` for its distance helpers (`geo.ts`).

## What it computes

- `profiles`: `bicycle` and `foot`. Each says which ways a mode may use (highway kinds, `*_link` roads 1.1 times their parent), which way it prefers, and what a metre costs. The mode tag (`bicycle=`, `foot=`) overrides `access=`. The reroute maps `mtb` to `bicycle`, and `hiking`, `foot` and `walking` to `foot`.
- A graph (`buildRoutingGraph`): junctions are the ends of ways and the nodes that two or more routable ways share. An edge runs between junctions along one way and keeps that way's range, so a route can be written back as way ranges.
- Turn restrictions (`buildRestrictions`): from `type=restriction` relations with `no_*` and `only_*`. `except=bicycle` lifts a restriction for bicycles. Foot profiles ignore them. Via-way restrictions are skipped and counted.
- `snapToGraph`: a point on the map to the nearest place on a routable way.
- `findRoute`: the A* search over edge states (so turn restrictions apply). It returns segments, the split points and the length in metres. The heuristic is the great-circle distance, so the first answer is the shortest.

## Parts

| File | What it does |
| --- | --- |
| `src/index.ts` | Exports the parts below |
| `src/profile.ts` | Access profiles, the highway tables and the access tags |
| `src/graph.ts` | The routing graph, its stats and `snapToGraph`, built from the model's graph |
| `src/restrictions.ts` | Turn restrictions as forbidden transitions |
| `src/astar.ts` | The A* search and its result types |
| `src/heap.ts` | A binary min-heap with typed arrays (no allocation per pop) |
| `src/geo.ts` | Great-circle distance in metres (the router's sphere) |
| `src/test-helpers.ts` | Small test data |

## Tests

`bun test packages/routing`: the profiles, the graph, the restrictions, the search and the heap. The router's speed is measured by `bun run bench-routing` on the `dense` and `relations` fixtures (into `reports/routing-bench.json`).

## More

- Why it exists and what it is for: [docs/research/relation-handling.md](../../docs/research/relation-handling.md), section 7, and its "Router measured (2026-10-16)" part.
- The reroute that uses it: [packages/module-reroute/README.md](../module-reroute/README.md).
- Open: none listed in [docs/build-out/steps.md](../../docs/build-out/steps.md).
