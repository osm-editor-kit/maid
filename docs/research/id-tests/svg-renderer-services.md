# iD tests: svg, renderer, services

Compared at iD commit `0194f3926`. Run: `bun test packages/style packages/renderer packages/filters` → 153 pass, 0 fail, 23 todo.

Status: svg and renderer/features are done. renderer/background_source, renderer/map, renderer/tile_layer and all services are not started (see Not finished). The sum row covers the finished rows only.

| iD spec file | iD tests | covered | adopted | todo | n/a | Maid test file |
| --- | --- | --- | --- | --- | --- | --- |
| `svg/areas.js` | 9 | 0 | 2 | 4 | 3 | `packages/renderer/src/id-areas.test.ts` |
| `svg/data.js` | 7 | 2 | 0 | 4 | 1 | `packages/renderer/src/id-data.test.ts`; covered by `packages/module-data-layers/src/layers.test.ts` and `geojson.test.ts` |
| `svg/icon.js` | 2 | 0 | 0 | 0 | 2 | none |
| `svg/layers.js` | 3 | 0 | 0 | 0 | 3 | none |
| `svg/lines.js` | 14 | 0 | 9 | 0 | 5 | `packages/renderer/src/id-lines.test.ts` |
| `svg/midpoints.js` | 5 | 0 | 0 | 5 | 0 | `packages/renderer/src/id-midpoints.test.ts` |
| `svg/osm.js` | 2 | 0 | 0 | 0 | 2 | none |
| `svg/points.js` | 1 | 0 | 0 | 0 | 1 | none |
| `svg/svg.js` | 2 | 0 | 0 | 0 | 2 | none |
| `svg/tag_classes.js` | 31 | 0 | 26 | 1 | 4 | `packages/style/src/id-tag-classes.test.ts`; todo in `packages/renderer/src/id-tag-classes.test.ts` |
| `svg/vertices.js` | 1 | 0 | 1 | 0 | 0 | `packages/renderer/src/id-vertices.test.ts` |
| `renderer/features.js` | 27 | 0 | 20 | 6 | 1 | `packages/filters/src/id-features.test.ts`; hidden vertices in `packages/renderer/src/id-features.test.ts` |
| **sum (finished rows)** | **104** | **2** | **58** | **20** | **24** | |

Not started, so not in the sum: `renderer/background_source.js` 16, `renderer/map.js` 23, `renderer/tile_layer.js` 2, and the ten `services/*.js` files (156).

## Missing features

| Id | Feature | iD tests that need it | State | Where it belongs |
| --- | --- | --- | --- | --- |
| F-svg-1 | Areas stacked by size, smaller above larger (iD sorts areas; Maid's area layer has no fill sort key) | `svg/areas.js`: 4 z-indexing tests | todo | `packages/renderer` layers.ts and build.ts |
| F-svg-2 | Midpoint handles on the selected way, to add a node between two nodes | `svg/midpoints.js`: 5 | todo | `packages/renderer` and the engine |
| F-svg-3 | GPX and KML files as data layers (Maid reads GeoJSON only) | `svg/data.js`: handles gpx, handles kml | todo | `packages/module-data-layers` (add.ts, geojson.ts) |
| F-svg-4 | Labels for the features of a data layer, with a switch to hide them | `svg/data.js`: 2 label tests | todo | `packages/module-data-layers` and layers.ts |
| F-svg-5 | A closed way with a barrier keeps its fill; iD gives it the `line` class only, so it is outlined and not filled | `svg/tag_classes.js`: stroke overrides | todo | `packages/renderer/src/build.ts` (areaFeature) |
| F-features-1 | Per-category counts of the objects in view (iD `gatherStats`); Maid's builder counts only hidden objects (`FeatureBuilder.hidden`) | `renderer/features.js`: counts features | todo | `packages/filters` and `packages/renderer` |
| F-features-2 | Auto-hide of a category with too many objects in view, the threshold doubling with the viewport | `renderer/features.js`: auto-hides, doubles threshold | todo | `packages/filters` (state) and `packages/renderer` (count) |
| F-features-3 | `forceVisible`: objects stay visible while their category is hidden (selected or edited objects) | `renderer/features.js`: #forceVisible | todo | `packages/renderer` and the engine |
| F-features-4 | Objects that are not saved yet are never hidden by a filter (iD hides only versioned entities); Maid's builder has no such check | `renderer/features.js`: hides only versioned entities | todo | `packages/renderer/src/build.ts` (isFiltered) |
| F-features-5 | The untagged members of a multipolygon or boundary relation take the category of the relation (iD `getParents`) | `renderer/features.js`: 3 matching sub-cases and the hidden-multipolygon test | todo | `packages/filters` (needs the relation) and `packages/renderer` |

## Differences found

- **Several categories per object.** iD puts an object in every category whose rule it matches, and hides it only when all of them are hidden. Maid's `FilterSet` gives each object its first matching filter (`default.ts` documents this on purpose). Hiding `rail` therefore hides a station that iD would keep as a point while `points` is on. This is a decision for Tobias, not a test fix. No test was changed for it: the per-category tests use each category's own rule (`matches`), and `others` uses the set's first match, as iD's `others` means "no other category".
- **Per-category rules fixed in source.** `packages/filters/src/default.ts`: `buildings`, `rail` and `landuse` are now functions with iD's exclusions (lifecycle values, roads and paths, buildings, building parts, indoor, water, pistes). Before, `building=construction`, `railway=tram` on a residential road and `natural=water` matched those categories on their own. The first-match results are unchanged (the 53 existing filter tests still pass).
- **Untagged members of a multipolygon.** iD strokes each member way with the relation's area classes. Maid draws no line for them (build.ts `buildWay`); the relation's area carries the outline. Visually intended, not adopted as a test.
- **Barrier areas.** iD removes the area fill of a closed barrier way; Maid keeps it (F-svg-5).
- **Layers.** iD puts a line into a DOM group named by its whole layer (-2.5 goes to layer -2). Maid keeps the fractional layer as a stacking band and a sort key (`z`). Same order, different mechanism.
- **Lifecycle prefix in tag classes.** iD's loop over lifecycle prefixes only breaks the inner loop, so the last matching prefix wins. Maid stops at the first. Not covered by iD's tests.
- **Extra class.** Maid's tag classes add `ford` as a secondary class; iD's list does not have it. Not covered by iD's tests.
- **`it.todo` needs a body for types.** Bun's type for `it.todo` requires a callback, so todos here are `it.todo(title, () => {})`; the body never runs (checked). `packages/ui/src/inspector/fields/id-wikipedia.test.ts` and `packages/validation/src/id-validator.test.ts` use the one-argument form and fail `bun run type-check` for that reason. Not touched: other agents' files.

## Not applicable, by reason

- DOM elements and classes (path, g, `class`, `selection.classed`): Maid draws GeoJSON features with MapLibre layers, not SVG. Covers `svg/areas.js` 3, `svg/lines.js` 5 (four class tests and the layer-group rounding), `svg/points.js` 1, `svg/icon.js` 2, `svg/osm.js` 2, `svg/layers.js` 3 (surface and defs), `svg/svg.js` 2 (a helper that gives members DOM classes), `svg/tag_classes.js` 4 (the `tags` accessor of a d3 binding, the removal of stale DOM classes, keeping non-tag DOM classes, an SVG `<g>` element).
- Removing a DOM path when a way is deleted (`svg/areas.js` #1903): Maid rebuilds features from the history in the engine, and the builder has no DOM to check.
- `renderer/features.js` `#toggle`: iD flips a category for its panel; Maid's `FilterButton` sets the state it wants with `filters.with(id, state)`.
- Tag classes for a DOM element: Maid's `tagClasses(tags)` returns the classes of a set of tags; the style they select is tested in `packages/style/src/style.test.ts`.

## Not finished

- `renderer/background_source.js` (16), `renderer/map.js` (23), `renderer/tile_layer.js` (2): not started.
- `services/*.js` (156): not started. For the record, the plan from the brief is kept: imagery services (`mapillary`, `kartaview`, `panoramax`, `streetside`, `vegbilder`, 46 tests) are n/a for the `@osm-editor-kit/street-imagery*` packages; `nominatim`, `taginfo`, `osm_wikibase`, `maprules` (65 tests) are todos without test files; `osm` (45) needs the `osm-api` split.
