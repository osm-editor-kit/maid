# Performance review of Maid (read-only, 2026-10-13)

**Status (2026-10-13, after the fixes).** Done: 1 and 5 (38bf9a3: rotate and paste in one pass, one step per frame), 2 (4d3495d: a graph step costs what it changed), 3 and 6 (a2ea2cf: validation per step, way list kept up to date), 4 (38bf9a3: a way is built once per redraw), 8 (3687065: `tagClasses`). Open: 7, 9, 10, 11, 12, 13, 14. The timings below are from before the fixes; each commit message has the numbers after. Not measured in a browser: the dense benchmark after the fixes gives load 1.43 to 1.55 s and pan p95 16.7 ms (five runs, a busy machine), and there is no run of the same code state from before to compare it with. The measurement scripts named below were temporary and are not in the repo.

Branch `main` at 194a5f8, plus the uncommitted work of the other agent in `engine.ts`, `MapView.tsx`,
`Inspector.tsx` and the field files. Line numbers in `engine.ts` are from the working tree at the time
of reading and shift while that agent works: go by the function names.

How the numbers were made:

- **measured (bun)**: headless scripts on `fixtures/dense.json.gz` (140,863 elements), run with Bun
  (JavaScriptCore, not V8) on this machine. They time the model, the feature builder and `tagClasses`
  only: no MapLibre, no browser. The scripts are next to this file (`perform-bench.ts`,
  `move-bench.ts`, `move-prof.ts`, `rotate-bench.ts`, `build-bench.ts`, `build-prof.ts`, `tc.ts`,
  `geom-bench.ts`).
- **measured (bench-validation)**: `bun run bench-validation`, output in `bench-validation.log` here.
- **inferred**: read from the code and its callers, not timed.
- **unconfirmed**: depends on behaviour of MapLibre or the browser that I did not check.

No browser check or server benchmark was run (the dev server was in use).

## Findings, biggest expected gain first

### 1. Rotate and paste perform one committing action per node: quadratic per pointer move

- **Where**: `packages/renderer/src/transform.ts` `TransformTool.move`, rotate branch (line 140:
  `[...this.origin].map(([id, at]) => actionMoveNode(...))`, then `history.perform(...actions)`);
  `packages/renderer/src/engine.ts` `paste` (about line 841, the same pattern).
  The cause is `packages/model/src/actions/move_node.ts`: `return graph.replace(node).commit()`.
- **How often**: every pointer event in rotate mode (`MapView.tsx` `movePointer` line 218 calls
  `engine.transform.move` directly); once per paste.
- **What it costs**: `Graph.commit()` builds a `Difference` over every locally changed entity and
  clones three Maps (`snapshot()`). With N nodes rotated that is N commits of O(N) each.
- **Measured (bun), model only, per pointer move**: 1 building (17 nodes) 0.5 ms; 10 buildings
  (308 nodes) 13 ms; one way of 519 nodes 38 ms; 30 buildings (734 nodes) 59 ms; 100 buildings
  (1939 nodes) 392 ms.
- **Change**: in `transform.ts` build one action for the whole step:
  `(graph) => { for (const [id, at] of origin) graph.replace((graph.entity(id) as OsmNode).move(loc)); return graph.commit() }`.
  The same in `engine.paste` for the shift of the copies. No change to the model.
- **Expected gain**: from O(N²) to O(N): 30 buildings from about 59 ms to well under 1 ms of model time.
- **Risk and check**: low. `bun test packages/renderer` (`transform.test.ts`),
  `bun run check-interactions` (rotate, copy and paste), `bun run check-undo`.

### 2. `Graph.commit()` costs O(all edits of the session); `actionMove` calls it per intersection

- **Where**: `packages/model/src/lib/Graph.ts` `commit` (327 to 338) and `snapshot` (347);
  `packages/model/src/actions/move.ts` lines 326, 360, 444 (`replaceMovedVertex`,
  `removeDuplicateVertices`, `unZorroIntersection`, each called per intersection from
  `cleanupIntersections`); `packages/model/src/edit/EditHistory.ts` `_perform` (788, commits the
  staging graph before every perform).
- **How often**: every `history.perform`, so every pointer move of a node drag
  (`engine.moveNodeStep`), of drawing (`DrawTool.move` goes through `dragTo`) and of the move tool
  (`TransformTool.move`: `revert()` then `perform(actionMove)`).
- **Measured (bun)**:
  - Move tool, per pointer move, model only: 1 building 0.15 ms; 30 buildings (507 nodes,
    48 intersections) 18 ms; 100 buildings 133 ms; 300 buildings 646 ms. In the last case 1341
    `graph.commit()` calls take 623 of the 646 ms.
  - One `perform(actionMoveNode)` as the session grows: 0 edited entities 0.007 ms; 1,000 edited
    0.31 ms; 5,000 edited 2.3 ms; 20,000 edited 6.6 ms.
- **Why avoidable**: `commit` only needs the ids touched since the last commit. It finds them by
  diffing the whole `local` map against a full copy of it.
- **Change**: keep a `dirty: Set<EntityID>` in `Graph`, filled in `replace`, `remove`, `revert` and
  `load` (next to `_updateCaches`). `commit()` takes its ids from that set plus their parents (what
  `Difference.complete()` adds), clears it, and no longer needs `previous = this.snapshot()`
  (`previous` is read nowhere else: checked with grep). This is a change to code ported from Rapid:
  note it in the package README.
- **Expected gain**: move tool from quadratic to linear (about 50 times for 300 buildings); a node
  drag no longer gets slower as the session grows.
- **Risk and check**: medium, it is the core of the model. `bun test packages/model`,
  `bun test packages/operations`, `bun run check-undo`, `check-ops`, `check-interactions`,
  `bun run bench-edit`.
- **Smaller alternative inside the port's shape**: remove the three `.commit()` calls in `move.ts`
  and commit once at the end of the action. Unchecked whether `unZorroIntersection` relies on the
  intermediate commits.

### 3. The validator checks everything that was ever changed again on every commit

- **Where**: `apps/maid/src/modules/validation.tsx` lines 46 to 60 (the `stablechange` listener
  passes `editor.history.difference().changes`, the whole difference from the base);
  `packages/validation/src/validator.ts` `update` (about 104 to 112) runs `entitiesToValidate` and
  every rule over all of it.
- **How often**: every commit, undo and redo.
- **Measured (bench-validation)**: "tags: 50 ways, one after another": median 18.7 ms per commit,
  worst 23.7 ms, 335 entities checked at the end, all 50 steps over 16 ms. One edit on a fresh
  validator is 0.6 ms (move) to 5.2 ms (tag). The cost grows with every edited feature; by the same
  slope a session with 500 edited ways is near 190 ms per commit (extrapolated, not measured).
- **Change**: validate only what the commit touched. Give `update` the step's difference (the
  `difference` argument of `stablechange`, which is also right for undo and redo) for
  `entitiesToValidate`, and use the full difference only for `keepOnly` (drop issues of entities
  that are no longer changed). `invalidateChanged` already works from the last graph.
  Also `issuesFor` (validator.ts) sorts all issues on every call and is called from the section's
  `when` and from `EntityIssues` on every inspector render: keep the sorted list until the next update.
- **Expected gain**: per-commit validation back to the steady-state 0.6 to 5 ms whatever the session
  size.
- **Risk and check**: medium: an issue between an old edit and a new neighbour must still be found
  (the neighbour is in `entitiesToValidate` of the step through its parents and `waysNear`). `bun test
  packages/validation`, `bun run bench-validation` (it prints issue digests), `bun run check-validation`.

### 4. `redraw` builds a way once per moved node and throws all but one away

- **Where**: `packages/renderer/src/engine.ts` `redraw` (about line 978):
  `if (way) place(wayId, this.builder.buildWay(way))`. `place` checks `placed.has(id)` only after
  `buildWay` ran. The comment above the function says each feature is built once.
- **How often**: every pointer move of the move and rotate tools, and every edit that moves several
  nodes (paste, square, straighten, undo of those). A single node drag is not affected.
- **Measured (bun)**: `buildWay` of a 519-node way 0.028 ms, so moving that way builds it 519 times:
  14.4 ms per pointer move instead of 0.03. A 150-node way: 1.4 ms. Ways have 9.9 nodes on average,
  so a move of many buildings does about ten times the building work it needs.
- **Change**: test `placed.has(wayId)` before building (for example `place` takes a function that
  builds, or the loop keeps a `Set` of ways it has seen).
- **Risk and check**: low. `bun run check-interactions`, `check-ops`, `check-undo`, `check-render`.

### 5. The move and rotate tools work on every pointer event, with no coalescing

- **Where**: `apps/maid/src/components/MapView.tsx` `movePointer` line 218;
  `packages/renderer/src/transform.ts` `move` (112 to 143); `engine.ts` `redrawDifferences` (about
  1135 to 1142) then `refreshShape` and `pushHighlight`.
- **What is done per event**: revert and perform in the model (findings 1 and 2), a rebuild of every
  feature of the selection, `updateData` queued for the live sources, and, because the selection
  itself changed, `refreshShape`: `wayVertices` for every selected way and a `setData` of the whole
  highlight source (every shape point of the selection).
- **Why avoidable**: `dragTo` already keeps only the latest position while the map is busy
  (`dragBusy` loop). The tools do not.
- **Change**: in `TransformTool.move` store the latest pointer and run the step once per animation
  frame (or behind the same busy loop as `dragTo`); `finish()` and `cancel()` flush or drop the
  pending position first.
- **Expected gain**: inferred. At most one step per frame however many events arrive and however
  long a step takes; with findings 1, 2 and 4 this is what keeps a large move smooth.
- **Risk and check**: low to medium (the click that ends the tool must apply the last position:
  `handleClick` already calls `transform.move` first). `bun run check-interactions`.

### 6. Validation walks all 140k entities for its way list on every commit that changes a way

- **Where**: `apps/maid/src/modules/validation.tsx` `waysOf` (22 to 31) and line 47
  (`if (id[0] === 'w') ways = undefined`).
- **How often**: every commit, undo or redo whose difference has a way in it: a tag change on a
  way, split, draw, delete.
- **Measured (bench-validation)**: "way list for a tag edit: median 4.17 ms" of the 5.19 ms a tag
  edit costs in total.
- **Change**: keep the ways in a `Map<string, OsmWay>` and apply the `stablechange` difference to
  it (set the head, delete when there is none) in place of dropping the list. Still rebuild on `merge`.
- **Expected gain**: about 4 ms per way edit on the dense scene.
- **Risk and check**: low. `bun run bench-validation`, `bun run check-validation`.

### 7. The first lines and areas of a tile wait for the icon sprites

- **Where**: `packages/renderer/src/engine.ts` `merge` (about 344 to 350): with `options.prepare`
  set, the whole batch is pushed only when the promise is done. `apps/maid/src/components/MapView.tsx`
  `handleLoad` (128 to 134) sets it to `ensureImages`; `apps/maid/src/images.ts` fetches up to five
  SVG sprites (`public/sprites`: about 1 MB together), parses each with `DOMParser` on the main
  thread, and decodes one image per icon.
- **How often**: every merge; it matters for the first tiles of a session, when the sprites are not
  there yet.
- **Why avoidable**: only `points` and `vertices` use these images. Areas and lines need none (the
  direction images are installed in `attach`).
- **Change**: in `merge`, push `areas` and `lines` at once and hold back only `points` and
  `vertices` for `prepare` (two calls of `push` with the tier decided before, as now).
- **Expected gain**: inferred, not measured: the streets and buildings of the first view appear
  earlier by the time of the sprite download, parse and decode (tens to a few hundred ms on a cold
  load). The settled time that `bun run bench` reports changes little.
- **Risk and check**: low to medium (`pushing()` and `settled()` count `preparing`; a vertex must
  not arrive long after its line). `bun run check-render`, `bun run bench-smoke`.

### 8. `tagClasses` is 15 times slower for ways without a primary tag

- **Where**: `packages/style/src/classes.ts` lines 71 to 81: for a way with none of the primary keys
  the loop builds 12 x 23 template strings (`${prefix}:${key}`) and looks each up.
- **How often**: once per way when it is built (load, filter or lens change, each rebuild after an edit).
- **Measured (bun)**: 0.66 µs per way with a primary tag, 9.57 µs without. The dense scene has 4,466
  such ways: 43 of the 53 ms that `tagClasses` takes there, out of about 190 ms for building all features.
- **Change**: build the 276 key strings once at module level (an array of `[prefix, key]`), or walk
  the way's own keys and test those that contain `:` against a `Set` of the 276.
- **Expected gain**: about 40 ms less main-thread work while the dense scene loads (bun numbers; V8
  will differ), and the same on every filter or lens change.
- **Risk and check**: low: `bun test packages/style` (`id-tag-classes.test.ts`), `bun run check-render`.

### 9. A snap query runs for every pointer event of a drag, also for events that are dropped

- **Where**: `packages/renderer/src/engine.ts` `dragTo` (about 1275 to 1285): `aimAt` (one
  `queryRenderedFeatures` plus `projectedNodes`, a `map.project` for every node of every way in the
  box) and `setHover` run before the `if (this.dragBusy) return` that drops positions.
- **How often**: every pointer event while a vertex, a point or a handle is dragged (`MapView.tsx`
  `movePointer`, 196 to 211).
- **Change**: store only the pointer (`point`, `layers`, `free`) in `dragTo`, and compute the aim
  inside the busy loop for the position that is really performed. `endDrag` already awaits
  `settleDrag`, so `dragAim` is the one of the last step.
- **Expected gain**: inferred: one query per performed step, not one per event. It matters when a
  step takes longer than a frame (a big live tier, a slow machine).
- **Risk and check**: medium: the cursor (`dragRefusal`) is read right after `dragTo` in `MapView`
  and would be one step late. `bun run check-interactions` (snapping, refused drops), `check-draw`.

### 10. Hover picking probably runs on every frame while the map is panned (unconfirmed)

- **Where**: `apps/maid/src/components/MapView.tsx` `handleMouseMove` (220 to 228): `engine.pick`
  (`queryRenderedFeatures`), `engine.setHover` and `engine.midpointAt` on every `mousemove` in browse
  mode, with no test for a pressed button or `map.isMoving()`.
- **Unconfirmed**: that MapLibre sends `mousemove` to the map while it is dragged. I believe it does;
  I did not check it in the browser.
- **Change**: return before the pick when `event.originalEvent.buttons !== 0` or the map is moving.
- **Expected gain**: one feature query and possibly a hover repaint less per frame during a pan, when
  frames are most expensive on a dense scene.
- **Risk and check**: low. `bun run check-interactions`; `tools/bench/quick-pan.ts` for the effect.

### 11. A vertex drag on a selected way resends the whole highlight source on every step

- **Where**: `engine.ts` `redrawDifferences` (about 1135 to 1142) calls `refreshShape` when a moved
  id is a shape node or selected; `refreshShape` (about 1584) rebuilds `wayVertices` for every
  selected way and `computeMidpoints` (projects every node), then `pushHighlight` (about 1624) calls
  `setData` with all shape points, handles, previews and overlay features.
- **How often**: every performed step of a vertex drag when the way is selected, which is the usual
  way to drag a vertex.
- **Change**: the highlight source has `promoteId="id"` (`OsmLayers.tsx`), so use
  `updateData` with only the moved shape point and the handles of its two segments; or keep
  `setData` and skip the handles while `dragged` is set.
- **Expected gain**: inferred: nothing to notice for a way of 20 nodes, real for a selected way of
  several hundred nodes (hundreds of features serialised and indexed again per step).
- **Risk and check**: medium, `engine.ts` is being changed by someone else now. `bun run
  check-interactions`, `check-edit`.

### 12. Every `useEngine` reader renders again on every engine change, and `entity()` is never the same object

- **Where**: `apps/maid/src/editor.ts` `useEngine` (subscribes to the one version counter);
  `engine.ts` `entity()` (returns a new object each call); used in `Inspector.tsx` line 51, and with
  fresh objects also in `UndoRedo.tsx` (`undoState()`), `FilterButton.tsx` line 19, `BottomDock.tsx`.
- **How often**: `engine.changed()` runs on every tile merge, every edit, every selection and mode
  change (not on hover and not on drag steps: `notify = false`).
- **What the React Compiler cannot fix**: `entity` is a new object each time, so everything in the
  inspector that depends on it runs again: `presets.fieldsFor`, `presets.moreFieldsFor` (walks the
  preset's fields and all universal fields and sorts with `localeCompare`), `PresetFields` (`ownKeys`
  over all fields), `TagList`, and every `inspector.section` (`when`, `detail`, the component).
- **Change**: in `engine.entity` keep the last result per id and return it while the underlying
  `OsmEntity` object, `nodeWays.has(id)` and `isReadOnly(id)` are unchanged (entities are never
  changed in place). Then read with `useSyncExternalStore(engine.subscribe, () => read(engine))` for
  readers that return a primitive or such a cached object (`mode`, `canPaste`, `draw.active`,
  `hasChanges`, `entity`), so a component whose slice did not change does not render at all.
- **Expected gain**: inferred: the inspector does nothing while tiles arrive and after edits to other
  features. Small per event, no effect on pointer moves.
- **Risk and check**: low to medium (a selection from the URL must still appear when its tile
  arrives: the cache misses then because the entity is new). `bun run check-edit`, `check-relations`,
  `check-journal`. `Inspector.tsx` is being edited now.

### 13. `EditHistory._emitChanges` diffs the whole session on every commit

- **Where**: `packages/model/src/edit/EditHistory.ts` `_emitChanges` (979 to 1008):
  `new Difference(base, stable)` for `_fullDifference`, two more `Difference` objects and two
  `snapshot()` copies. Each walks or copies every locally changed entity, with `deepEqual` on tags
  and node lists.
- **How often**: the staging part on every perform (pointer moves), the stable part on every commit,
  undo and redo.
- **Measured (bun)**: a tag change plus commit: 0.3 ms with 100 edited entities, 1.3 ms with 1,000,
  10 ms with 5,000, 20 ms with 20,000.
- **Change**: update `_fullDifference` from the step's stable difference (only its ids need a new
  comparison with the base); with the dirty set of finding 2 the staging difference can be built
  from the touched ids as well.
- **Expected gain**: only for long sessions or after very large moves and pastes; below 1 ms otherwise.
- **Risk and check**: medium (ported code). `bun test packages/model`, `packages/journal`,
  `bun run check-undo`, `check-journal`.

### 14. Tiles that arrive after the first view share the live tier with edits (unconfirmed)

- **Where**: `engine.ts` `merge` and `push` (`tier = this.firstLoadDone ? 'live' : 'base'`),
  `touch` and `compact`: compaction waits for 2 s without activity, and `loadVisibleTiles`, `push`
  and `dragTo` all call `touch()`.
- **Scenario**: pan to a new part of a dense scene (thousands of features arrive in the live tier),
  then start a drag within two seconds. Every drag step is an `updateData` on live sources that hold
  all of those features, and the drag keeps postponing compaction.
- **Unconfirmed**: how much MapLibre re-indexes of a GeoJSON source on a diff update, and so how slow
  a step gets. Measure first: `bun run bench-edit` right after a pan against after a 3 s wait.
- **Change, if the measurement shows it**: compact arrivals as soon as `inflight` reaches zero
  without waiting 2 s, or do not let `dragTo` postpone a compaction of arrivals that is pending.
- **Risk and check**: medium. `bun run bench`, `bench-edit`, `check-render`.

## Looked at and fine

- **`resolveWayStyle`** (`packages/style/src/resolve.ts`): cached by class list.
- **Filters** (`packages/filters/src/filters.ts`): compiled once, key shortcut before the test;
  16 ms for all tagged nodes and ways of the dense scene.
- **`presets.match`**: index by key and value; 8 ms for all 27k tagged nodes of the dense scene.
  `createPresets` 13 ms once at start (bun). `defaultPresets` is marked pure and not used by the app,
  so the presets are built once.
- **Multipolygons waiting for members** (`FeatureBuilder.build` walks `pendingRelations` on every
  call, also from `redraw`): 6 pending in the whole dense scene, 0.025 ms per call.
- **`updateGeometry` of the model** on load and per perform: about 0.0001 ms per perform, no
  measurable share of the merge.
- **Model load** (`reports/model-load-chromium.json`): dense 183 ms in total (entities 78, merge
  105). The merge time is the graph's parent caches (one `Set` per node); no cheap win found.
- **Journal** (`packages/journal/src/journal.ts`): writes only the commit's difference, on
  `stablechange` only, in a queue off the edit path. Nothing per pointer move.
- **`OsmData.reindex`** (`packages/renderer/src/data.ts`): skips node moves and tag changes at the
  first comparison.
- **Hover** (`setHover`, `applyHighlight`): two `setFeatureState` calls, no rebuild, no React.
- **Drag steps and React**: `change(..., false)` does not notify; `setCursor` with the same value
  does not render.
- **`buildLayers`** in `MapView` and `OsmLayers`: runs when `dashes` changes (a new dash pattern
  during load), not per pointer event.
- **Save flyout**: `SavePanel` (and `pendingChange()`) is mounted only while the flyout is open.
- **Bundle**: the photo viewers (mapillary-js, photo-sphere-viewer, three) are behind `import()` in
  `@osm-editor-kit/street-imagery-react`; `osm-api` and the editor layer index are dynamic too. The
  tagging schema (presets 405 kB, English texts 264 kB, fields 89 kB before gzip) is in the main
  chunk and needed for the first paint (icons). `apps/maid/dist` is older than the current modules,
  so no chunk sizes were read from it.
- **`moveend`**: `refreshFieldOverlay` and `refreshMidpoints` return early without a selection.

## Not looked at

- `packages/renderer/src/layers.ts` (the style expressions and the number of layers per source),
  `direction.ts`, `direction-images.ts`, `address.ts`, `field-overlay.ts` beyond their callers.
- GPU and MapLibre worker time (tiling, symbol placement): nothing here was measured in a browser.
- `apps/maid/src/modules/relations.tsx` beyond its store subscription, `packages/operations`
  (`applies` and `disabled` run for every operation on each engine change in `useEditCommands`),
  `packages/ui` outside the inspector's field list, `PresetPicker` and `presets.search`.
- The modules `module-imagery`, `module-data-layers`, `module-notes`, `module-lenses`,
  `module-street-imagery` beyond their imports.
- `apps/compare`, `tools/`.
