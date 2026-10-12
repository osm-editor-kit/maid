# The data store: graph, history, undo, spatial index

Status: **agreed by Tobias on 2026-10-11**, including lon/lat in the model, the use of the Rapid SDK and the package layout below. Based on the reviews of iD, Rapid 3 and osm-editor-kit. Tobias's direction: look at what Rapid did, it is further along than iD here; take a lot from Rapid and iD for the base layer, because geometry work and writing OSM data are critical.

## What an editor needs from its store

1. Entities (nodes, ways, relations) with fast lookups in both directions: the nodes of a way, the ways of a node, the relations of anything.
2. Edits as a sequence that can be undone and redone.
3. New data arriving from the server at any time, without disturbing unsaved edits.
4. The difference between "what the server has" and "what I have", for upload and for redraw.
5. A spatial index: what is in this box, what is near this point.
6. Persistence of unsaved work.

Maid's proof-of-concept store has none of 2, 3 (it only adds), 4, 5 or 6. It changes nodes in place. It was enough to measure rendering and has to be replaced before real editing.

## What exists

| | iD | Rapid 3 | osm-editor-kit |
| --- | --- | --- | --- |
| Entities | `osm/` (3.3k lines), plain objects, mostly pure | `data/` classes on a common base, with a version counter `v` per change; need a `Context` | `osm-data`: flat maps |
| Graph | `core/graph`: immutable, base plus local changes | `lib/Graph.ts` (569 lines): base cache shared along the chain, local cache per graph; `commit`, `snapshot`, `rebase` | none |
| History | `core/history`: stack of graphs, tied to persistence and UI | `EditSystem`: history of stable graphs plus a **staging** graph for work in progress; `perform`, `commit`, undo, redo, checkpoints | none (`react-map-gl-draw` has its own for free geometry) |
| New data during editing | Rebase of the base | **Rebase of the base and of every graph in the history** on each download | merge by version |
| Difference | `core/difference` | `lib/Difference.ts`, with `complete()` that expands a change to its parents and children for redraw | none |
| Spatial index | `core/tree` (rbush) over the current graph | `SpatialSystem` (rbush): separate indexes for base, stable and staging, **updated from each difference**, with a segment index for ways | none; linear scans |
| Geometry | `geo/`, lat/lon | `Geometry` with original, world (zoom 16) and local coordinates, computed lazily | turf |
| Actions | `actions/` (41 files): graph in, graph out | The same set, in TypeScript, with tests (41 test files) | `osm-way-edit`: split and insert |
| Persistence | IndexedDB, one JSON document | localStorage, one JSON document | none |
| Standalone today | Needs cuts (d3, singletons) | Needs a stub `Context` (about 40 references: ids, schema, l10n) | yes, and too small |

So Tobias's impression holds for the model, the staging idea, the spatial index and the test coverage. It does not hold for persistence, where iD is ahead and neither is good.

## Proposal: Rapid's design, with three changes

Port from Rapid: `data/` (entities), `lib/Graph`, `lib/Difference`, `lib/Geometry`, the actions and their tests, and the ideas of `EditSystem` and `SpatialSystem`. They are TypeScript already, tested, and the licence is ISC.

Change three things while porting:

1. **No `Context` in the data layer.** The roughly 40 uses are for id sequences, the schema and translated names. Those become small interfaces passed in (`IdSource`, `SchemaLookup`). The result is a package that runs in a test, a worker or another app with nothing else loaded.
2. **Real immutability.** Rapid's entities are immutable by convention and are sometimes changed in place; its graph is described as transactional and is mutable. Since undo and the renderer's difference both depend on "an old graph still says what it said", Maid enforces it: frozen in development builds, and a lint rule against assigning to entity fields.
3. **A journal for persistence**, not the whole history as one document ([storage and settings](09-storage-and-settings.md)).

Two things from Rapid to watch rather than copy blindly:

- **Rebasing every history graph on each download** costs time in proportion to the length of the history. Fine for normal sessions; measure it on a long one.
- **The history keeps every stable graph.** Memory grows with edits times history length. iD has the same shape. Structural sharing keeps it reasonable; a cap on undo depth is the safety valve.

## How it meets the renderer

This is where the port pays off for speed, because the renderer already wants exactly what this model produces:

- An edit produces a **difference**. The renderer rebuilds only those features and sends them to the live tier ([ADR 0008](../adr/0008-live-tier-for-new-and-changed-data.md)). Today the engine works out "what changed" by hand for the two edits it knows.
- **Staging** maps onto dragging: while a vertex moves, the staging graph changes on every pointer event and nothing is committed; on release it becomes one undo step. That is what the engine's drag code imitates now.
- The **spatial index** answers what MapLibre cannot: features outside the rendered tiles, snapping candidates, "what crosses this way". Hit-testing of what is on screen stays with MapLibre.

## First measurement: the model is heavy on the load path

Measured on 2026-10-11 with a script run in Bun that compared the model with the proof-of-concept store; both the script and that store are removed, `bun run bench-model` times today's load path in a browser. (In Bun, not in a browser; best of 5; times in milliseconds for the whole scene at once):

| Scene | Elements | Proof-of-concept store | Rapid's model: parse | create entities | build graph | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| small | 14,177 | 1 | 6 | 38 | 19 | 63 |
| medium | 70,939 | 6 | 36 | 226 | 146 | 408 |
| dense | 140,863 | 14 | 68 | 366 | 294 | 728 |

So the unchanged port costs about 50 times more than the store it replaces, and on the dense scene that is 0.7 s of main-thread time. In the app the data arrives tile by tile, so it is spread out, but it is the same total and it competes with rendering.

Where the time goes in "create entities": almost all of it is `structuredClone`. Every entity deep-copies its properties twice in the constructor. Cloning the dense scene's properties twice takes about 350 ms on its own; creating the geometry objects takes about 1 ms.

What follows:

- **Fixed the same day** in one place (`AbstractData`'s constructor): properties are copied with a small function for plain data (`src/util/clone.ts`). Creating the dense scene's entities went from about 350 ms to about 125 ms, and Rapid's tests still pass.
- **"Build graph" is mostly geometry.** Measured by a Haiku agent from outside the code (subclassing, best of 5, 204 ms in that run), not re-run by us:

  | Piece of `Graph.rebase` on the dense scene | ms | Share |
  | --- | ---: | ---: |
  | Nodes | 24 | 12% |
  | Ways | 155 | 76% |
  | Relations | 20 | 10% |
  | of which: computing geometry for ways and relations (`updateGeometry`, mainly `geoms.setData`) | about 135 | about 65% |
  | of which: parent lookups (a new `Set` per child node) | about 40 | about 20% |

  The geometry that is computed here is Rapid's derived cache: extents, world coordinates, label points. It is the part Maid's renderer does not use, because it builds its own features for MapLibre. **Agreed by Tobias on 2026-10-11: Maid departs from Rapid here**, because it renders differently. The geometry is computed on first access and not on load. Estimated saving about 135 ms of the 204; not built, and it changes behaviour for code that reads `geoms` directly.
- With both changes the dense scene would be at roughly 250 ms, against 14 ms for the proof-of-concept store. That is the number to judge in the browser before the renderer moves to the new model.

### In Chrome, and after deferring geometry (2026-10-12)

`bun run bench-model` runs the same steps in headless Chrome (best of 5 per step; totals move by up to 20% between runs). Dense scene, milliseconds:

| | Proof-of-concept store | Parse | Create entities | Build graph | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before (with the `cloneData` fix) | 31 | 92 | 256 | 239 | 587 |
| Geometry deferred for ways, relations and nodes | 30 | 87 | 64 | 59 | 211 |

- Chrome is slower than Bun on these steps, so the Bun numbers above were too friendly.
- Deferring node geometry was the bigger part of "create entities": every node computed an extent and world coordinates in its constructor.
- What changed for callers: geometry is computed against the graph as it is at first read, an entity with pending geometry keeps its graph alive until then, and building the spatial index reads the geometry and so computes it.
- Remaining: the parser (about 90 ms) builds an intermediate object for every element before the entity is created. Going from the API's JSON to entities directly is the next saving if it is needed.
- Done since (A2 and the review after part A): the app creates entities straight from the API's JSON (`entitiesFromOsmJson`), and an entity creates its geometry object and its cache on first use. `bun run bench-model` now times only that path: dense scene 78 ms for entities plus 105 ms for the merge into the history, 183 ms in total.
- Not done: reusing the parent sets in `Graph` (about 35 ms in Bun). They are shared between graph versions, so changing them in place is not safe as the code stands.

## Order of work

1. Entities, geometry, graph, difference and actions from Rapid, with Rapid's tests. **Done 2026-10-11.**
2. Tagging-schema lookup, undo history with staging, spatial index. **Done 2026-10-11.**
3. The engine consumes differences from the history; the proof-of-concept store goes. Maid has undo.
4. Journal and restore.

Each step is usable on its own, and after step 2 Maid has undo.

## Decided

- **Coordinates are lon/lat in the model.** Rapid's world coordinates are not adopted. MapLibre wants lon/lat, so nothing is converted on the way to the map. Where ported geometry code needs a flat plane (angles, orthogonalising), it projects for the length of that calculation, as iD does.
- **The Rapid SDK**: `@rapid-sdk/math` is a pinned dependency, `@rapid-sdk/util` is used only where ported code needs a helper, and neither is copied into the monorepo unless we have to change it ([packages](03-packages.md)).
- **`osm-data` stays what it is and Maid does not build on it.** Reasoning in the next section.

## `osm-data` and the package layout

Tobias asked who uses `@osm-editor-kit/osm-data` and whether those users could be adjusted. Checked on 2026-10-11 across the projects on Tobias's machine:

- **One user: the street-space editor** (`osmberlin/street-space-editor`), which is also where the package lives. Its app imports it in about 90 files, and seven sibling packages depend on it (`osm-way-edit`, `osm-way-chain`, `osm-changeset`, `osm-coverage`, `osm-editor-links`, `osm-route-snapper`, `osm-oauth`). No other project on disk uses it. On npm it is at `0.1.0-alpha.0`.
- **Nearly all of those imports are types** (`OsmWay`, `OsmTags`, `ParsedOsmData`). The functions (`downloadOsmData`, `parseOsmResp`, `mergeParsedOsm`) are called in a handful of places.
- **The package is about 100 lines**: the types of the OSM API's JSON, a download, and a parser into five plain maps.

So it could be adjusted: one repository, ours, mostly type names. But it should not be, because the two stores are right for different apps:

| | `osm-data` | Maid's graph |
| --- | --- | --- |
| For | Apps that change tags on ways and cut ways | A general editor |
| Shape | Plain maps by numeric id; only tagged nodes are kept as objects; coordinates as `[lat, lon]` | Entities with ids like `n1`, lookups in both directions, lon/lat |
| Undo, difference, spatial index | No, and those apps do not need them | Yes |

Putting `osm-data` under the graph would copy every element twice on Maid's hottest path (loading) and drop information the graph needs. Folding it into the graph package would force the small apps onto a model that is too big for them.

The layout that follows:

| Package | Contains | Public |
| --- | --- | --- |
| `maid-model` | Entities, geometry, graph, difference, the edit actions, undo history with staging, the spatial index, the tagging-schema lookup, and the parser from the OSM API's JSON to entities | Later, when it is stable |
| `osm-data` (street-space editor repo) | Unchanged | As today |

**One package, not three** (changed on 2026-10-11 when the port started). The plan was `maid-model`, `maid-graph` and `maid-actions`. In Rapid these parts import each other in both directions: entity methods take a graph, the graph holds entities, and `lib/intersection` and `lib/multipolygon` call actions. Cutting them into packages would mean rewriting working code before it runs. They stay together, in folders that match Rapid's, and can be split later if a user of only one part appears. The state of the port is in [`packages/model/README.md`](../../packages/model/README.md).

Loading by tile (which tiles, batching, the cache) is not a data package. It stays with the editor, next to the code that hands differences to the renderer.

The one piece both sides share is the description of the API's JSON, about 40 lines of types. That is too little to justify a dependency between the repositories, so it exists twice.

Later, once Maid's data packages are published: an app that outgrows `osm-data` (needs undo, or geometry edits beyond cutting) moves to `maid-model`. The street-space editor is the candidate, and its shape makes that a contained change. Nothing needs to happen there now.
