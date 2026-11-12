# Route analysis (`@osm-editor-kit/maid-route-analysis`)

The analysis behind the route overview in the relation column: it reads a route relation and its member data and says what the route is made of, where its points lie along it, where it has gaps and what to check. It is plain data in and plain data out (no React, no network, no editing), so it can move into a web worker later.

Used by: `packages/shell/src/modules/route-overview/` (the overview, the superroute view, the preview store and the input). Headless: no module, no factory, no app config.

## What it computes

- Classifies each member: the main line's ways, side lines (branches), points (stops, platforms, guideposts, other points), sub-relations and members the line does not place.
- Chains the main ways from their geometry into pieces, and joins the pieces into one line where it can. The relation's member order is the tie-breaker. Gaps and the linear state (`yes`, `sorted`, `no`, `empty`) come from the chain.
- Places points on the line: a point up to 2 km from it is searched for (a grid index), and one more than 30 m from the line is reported as `point-far`. A stop or platform out of order along the line is reported too.
- Junctions: for waymarked routes only, a node of the line shared with a loaded way that is not a member. A guidepost within 50 m of it means the junction has one.
- Issues with a place each (`IssueCode`): `gap`, `order`, `not-loaded`, `point-far`, `out-of-sequence`, `junction-without-guidepost`, `no-guideposts`, `unknown-role`, `branch-detached`, `duplicate`, `empty`.
- `layoutOverview`: the rows of the overview, schematic or to scale, with junctions without a guidepost folded into one row when there are two or more in a row (`JUNCTION_FOLD_MIN`), and the side lines as lanes.
- Preview from Postpass (`preview/postpass.ts`): writes the one SQL query for a relation with its sub-relations, and reads the answer. The package makes no request. The shell sends the query when a person asks for the preview. `preview/merge.ts` fills the members that are not loaded with the simplified shapes; loaded data always wins.

## Parts

| File | What it does |
| --- | --- |
| `src/types.ts` | The contract: `RouteInput`, `RouteAnalysis`, the overview types |
| `src/analyze.ts` | `analyzeRoute`: the whole analysis of one relation |
| `src/roles.ts` | The way and point roles of the wiki and of Maid's suggestions (`classifyMembers`, `pointKindOf`) |
| `src/chain/` | Pieces and the chain of the main line |
| `src/place/` | Points on the line (`line-index.ts`, `points.ts`), junctions, branches and issues |
| `src/layout/` | `layoutOverview`: rows, the km column, folds |
| `src/preview/` | The Postpass query and reader, and the merge of a preview into the input |
| `src/synthetic/` | Generated routes and mutations that break them on purpose (for the fuzz test and the benchmark) |
| `src/geo.ts` | Distances and nearest points in a local flat projection |

## Tests

`bun test packages/route-analysis`: the chain, the placing, the junctions and issues, the layout, the preview reader and merge, the synthetic routes, and a fuzz test (`fuzz.test.ts`) where every mutation must give its expected issue codes.

Speed: `bun run bench-route-analysis [--runs 5]` runs the analysis and the layout on generated routes of 100 to 20,000 ways and on the fixtures' routes (into `reports/route-analysis-bench.json`).

## More

- Research: [docs/research/relation-overview.md](../../docs/research/relation-overview.md) (the diagram, the steps, the Postpass preview and the worker question), and [relation-handling.md](../../docs/research/relation-handling.md), section 8 (Waymarked Trails' analysis).
- Decisions and steps: [docs/build-out/steps.md](../../docs/build-out/steps.md), "the route overview" (2026-10-27) and "the route preview and route groups" (2026-11-05).
- Open (from the research): the thresholds for "on the way" and "guidepost missing" are not yet measured on real data; no worker or WebAssembly yet.
