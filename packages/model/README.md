# @osm-editor-kit/maid-model

The data model of Maid: OSM entities, the graph, differences, geometry, the edit actions, and (in progress) undo history, the spatial index and the tagging-schema lookup.

**Ported from [Rapid 3](https://github.com/bhousel/Rapid)** at commit `413c0519f` (`modules/data`, `modules/lib`, `modules/geo`, `modules/actions`, parts of `modules/core`), ISC, © Rapid contributors. The reasons are in [docs/architecture/05-data-store.md](../../docs/architecture/05-data-store.md).

## State

| Part | Folder | From Rapid | State |
| --- | --- | --- | --- |
| Entities, changeset, GeoJSON and marker data | `src/data` | `modules/data` | Ported, Rapid's tests pass |
| OSM API JSON parser | `src/data/parsers` | `modules/data/parsers` | Ported. The XML parser is left out |
| Graph, difference, geometry, multipolygon, lanes, intersection | `src/lib` | `modules/lib` | Ported, Rapid's tests pass |
| Actions (39 of 41) | `src/actions` | `modules/actions` | Ported, Rapid's tests pass. Left out: `change_preset` (needs presets), `rapid_accept_feature` (Rapid's AI datasets) |
| Tagging-schema lookup: rulesets and variables | `src/schema` | `Ruleset`, `Variable`, `PropMatcher` unchanged; `RulesetSchema` is new and replaces `SchemaSystem` for what the model asks | Ported, Rapid's tests pass. No presets: `matchTags` answers nothing and `areaKeys` is empty until set |
| Undo history with staging | `src/edit` | core of `EditSystem` | Ported as `EditHistory`; 40 of Rapid's 51 tests kept. Cut: persistence, backups, animated edits, everything that talks to other systems |
| Spatial index | `src/spatial` | `SpatialSystem` | Ported as `SpatialIndex`; `getVisibleItems` takes the box as a parameter |

## What is different from Rapid

- **No application `Context`.** Rapid hands its whole application object to every entity and graph. Here `Context` is the small interface in `src/Context.ts`: id sequences and an optional schema lookup. Constructors keep Rapid's shape (`new OsmNode(context, props)`), so code and tests stay close to the original.
- **Global id types** (`EntityID` and friends) are declared in `src/types/globals.d.ts`, as in Rapid.
- **Entity properties are copied with `cloneData`** (`src/util/clone.ts`) and not with `structuredClone`, which made entity creation about three times faster on load.
- **`entitiesFromOsmJson` gives its props objects away** (`ownNextProps` in `src/util/clone.ts`): the entity keeps the object it is given and does not copy it again, so the tags are the parsed JSON's own object. Merge time of a tile went down by about a fifth (docs/research/performance-2026-10-13.md).
- **Geometry is computed on first access**, not when an entity is created or a graph is built. Maid's renderer builds its own features and does not read it; loading the dense scene went from 587 ms to 211 ms in Chrome.
- **Summary of a point that became a vertex.** `Difference.summary()` reports it as modified, as iD does, and not as deleted (Rapid reports it as deleted). See [docs/research/id-tests/core.md](../../docs/research/id-tests/core.md) F-core-8.
- **Adding a way to a relation keeps the members that are not loaded, and relations, where they were** (`src/actions/add_member.ts`, F-relations-1 and -2). Only the loaded ways are joined and reordered. A way that is not loaded or a relation is written after the loaded way before it, and a new way that joins that way goes in front of it. Rapid moved them to the end, and iD has the same join code, so this goes beyond iD.
- **Splitting a way that is a member of a route puts the new part on the side the route runs** (`src/actions/add_member.ts`, F-relations-3 and F-actions-b-36). When the join orders the two halves of an insert pair, the half that keeps the id no longer decides the order: the half that touches the route's node first goes first, whichever half kept the id (`split` swaps the halves to keep the longer history). iD decides this from the neighbouring members instead, so the result matches iD in the three tests that are adopted; the two dual-carriageway tests of F-actions-b-36 are still todo.
- **The survivor rule: the oldest existing entity survives** (`src/util/ids.ts`, F-util-10, used by F-actions-a-5, F-actions-b-1, -2 and -3). `utilOldestID` is iD's rule for the oldest of several ids (database before editor ids, the number closest to zero first). `utilSurvivorID` is Maid's rule on top of it: an entity exists if it has a positive numeric id or a `version`; an existing entity beats a new one, and among existing entities with numeric ids the smallest id wins. When an id cannot be ordered (a test id without a version, such as `r` in Rapid's tests), it returns `undefined` and the action keeps Rapid's own rule, so Rapid's tests pass unchanged.
- **connect (and merge_nodes, which uses it) keeps the oldest existing node** (`src/actions/connect.ts`, F-actions-a-5 and F-actions-b-2). As in iD, an existing node with interesting tags is preferred, then the oldest existing node. Rapid's rule is kept for ids that cannot be ordered: the first node with a version, else the last node.
- **merge keeps an existing point's id as iD does** (`src/actions/merge.ts`, F-actions-b-1). An existing point takes the place of a new child node, then of an uninteresting child, then of a newer interesting child; a new point (negative id) is dropped, so an existing child keeps its id. Rapid's rule is kept for a point that is a test id without a version: the first uninteresting child.
- **merge_polygon keeps the oldest multipolygon relation** (`src/actions/merge_polygon.ts`, F-actions-b-3). When the ids can be ordered, the oldest existing relation survives instead of the first in the list.
- **Joining a multipolygon that collapses into a basic area moves its parent memberships to the area first** (`src/actions/join.ts`, F-actions-b-11). Rapid deletes the multipolygon, and a parent relation that holds only it, such as a `type=site`, is deleted with it (iD#9064).
- **Splitting an area puts the new multipolygon in the area's other parent relations, in place of the area** (`src/actions/split.ts`, F-actions-b-34, iD#12024). A parent that is not a multipolygon no longer gets the new way paired next to the area.
- **The `intersection` role of a `destination_sign` counts as via** in `hasFromViaTo` and in split, and a split via way keeps that role (`src/data/OsmRelation.ts` and `src/actions/split.ts`, F-actions-b-35 and F-osm-7, as iD).
- **Reverse splits a direction value on `;` and reverses each part** (`src/actions/reverse.ts`, as iD): `N;90` becomes `S;270`, and `0;error` becomes `180;error`. Rapid dropped everything after the first number. Numbers are read with `Number`, so `90deg` is left unchanged, as in iD.
- **Reverse keeps the side of a cyclist waiting aid and `railway:turnout_side`** (`src/actions/reverse.ts`, iD#10128). Their left and right are not relative to the way, so Rapid's swap was wrong for them.
- **Reverse keeps the `red_turn:left` and `red_turn:right` keys** (`src/actions/reverse.ts`, iD#10736). They are not relative to the way, so Rapid renamed them.
- **`OsmEntity.toOSM` returns `''` for an id that is not a type letter, an optional minus and digits** (`src/data/OsmEntity.ts`, as iD). Rapid dropped the first character whatever it was, so `toOSM('x5')` gave `5`. Negative ids such as `n-1` still give `-1`.
- **`actionMove` compares the moved way's new vertex with its current neighbours, not their old places** (`src/actions/move.ts`, `replaceMovedVertex`, `test/maid/move-preserve.test.ts`, as iD). Rapid compared with the original positions for both ways, so a straight way that another way crosses at its middle node kept a vertex it did not need (`n-1` in the audit). The unmoved way keeps the original positions, as before, for the U-shaped driveway case.
- **Orthogonalize keeps a vertex that sits at the same place as its neighbour** (`src/geo/ortho.ts`, iD#9155). Rapid treated a coincident vertex as straight and removed it, so a six-node closed way lost two nodes. The score and the disabled check use the same helper, so they follow iD too.
- **`Graph.commit()` diffs only the ids written since the last commit, and does not copy the Graph** (`src/lib/Graph.ts`, `_written` and `_seqs`, `test/maid/graph-commit.test.ts`). Rapid diffed the whole `local` map against a copy taken at each commit, so an action that commits per intersection (move) cost O(all edits of the session) per commit. The changes come in the same order as before, which matters for `complete()`; the first commit of a copied Graph still diffs against its predecessor.
- **Circularize sets the number of vertices by iD's rule** (`src/actions/circularize.ts`, `getMaxAngle`, F-actions-a-2, as iD). A circle gets 12 to 32 vertices, about one per 4 m of circumference, and a new node is added only where an arc is wider than the largest angle that allows. Rapid added a node at most every 20 degrees, which gave 16 new nodes to a four-corner building of 10 to 100 m; now a 20 m square gets 18 and an 80 m square 28 (`test/maid/circularize-nodes.test.ts`). The `maxDegrees` parameter is gone.
- **Circularize keeps its key nodes on the circle and spreads the others between them** (`src/actions/circularize.ts`, as iD). A key node is a member of more than one way or has interesting tags; Rapid also counted members of relations, which iD does not. Rapid spread all the nodes by arc length over the whole way.
- **Circularize makes a concave way convex first** (`makeConvex` in `src/actions/circularize.ts`, as iD). Rapid did not. iD's loop stops one hull edge early, so the edge from the last hull point back to the first is not straightened; this is kept.
- **Circularize at t = 0 inserts the new vertices, and interpolates from the original positions** (F-actions-a-3, as iD). Rapid returned the way unchanged at t = 0. A moved node is interpolated in lon/lat from its own position, and a new node starts from the nearest node on the arc, as iD. Rapid interpolated in world coordinates.
- **Circularize adds new nodes to a shared way only where the two key nodes are adjacent in both ways** (`src/actions/circularize.ts`, as iD). Rapid added them to any edge of the shared way that matched the arc.
- **Circularize takes the radius as the median distance of all the nodes, and the winding from the current positions** (as iD). Rapid used only the interesting nodes for the radius and the geometry's winding. The area, centroid and hull helpers are d3-polygon's, ported at the end of the same file.
- **Circularize's `disabled` uses iD's maximum angle and compares distances, not squared distances** (`src/actions/circularize.ts`, as iD). A way that is circular to iD is disabled with `already_circular`.
- **The tests** are Rapid's, in `test/`, with one changed line each: they import `test/rapid.ts` instead of Rapid's `headless.js`. Maid's own tests are in `test/maid`.

Everything else is unchanged on purpose, including the formatting, so that a later Rapid fix can be compared line by line. For that reason the package is excluded from oxlint and oxfmt and has its own `tsconfig.json` without `noUncheckedIndexedAccess`.

## Still to do

- Loading the dense scene takes about 180 ms in Chrome (`bun run bench-model`), several times what the proof-of-concept store needed. The app does not use the parser; it creates entities with `entitiesFromOsmJson`.
- Enforce immutability (frozen entities in development builds).
- Decide what happens to the world-coordinate parts of `Geometry` and `GeometryPart`. Entity locations are lon/lat already; the world coordinates are a derived cache that Maid's renderer does not need.
- Bring the package under the repo's lint rules, or keep the exclusion and say why.
- Actions and model depend on each other in Rapid (`lib/intersection` and `lib/multipolygon` import actions), so they are one package here. Splitting off `maid-actions` needs those two untangled first.

## Run

```bash
bun test packages/model
bunx tsc --noEmit -p packages/model
```
