# iD tests: svg, renderer, services

Compared at iD commit `0194f3926`. Run: `bun test packages/style packages/renderer packages/filters apps/maid/src/save` → 161 pass, 0 fail, 23 todo.

Status: every row is done, the sum covers all 301 iD tests of the three areas. The todo counts under `renderer/map.js` and the services are listed in this report only: the brief allowed no test files outside `apps/maid/src/save/id-osm.test.ts`, so no `it.todo` lines were written for them.

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
| `renderer/background_source.js` | 16 | 3 | 0 | 7 | 6 | `packages/module-imagery/src/helpers.test.ts` (covered: `visibleAtZoom` tests) |
| `renderer/features.js` | 27 | 0 | 20 | 6 | 1 | `packages/filters/src/id-features.test.ts`; hidden vertices in `packages/renderer/src/id-features.test.ts` |
| `renderer/map.js` | 23 | 3 | 0 | 17 | 3 | `tools/bench/interactions-check.ts` (browser check: sets and reads zoom and centre, no unit test) |
| `renderer/tile_layer.js` | 2 | 0 | 0 | 0 | 2 | none |
| `services/kartaview.js` | 9 | 0 | 0 | 0 | 9 | none |
| `services/mapillary.js` | 11 | 0 | 0 | 0 | 11 | none |
| `services/maprules.js` | 29 | 0 | 0 | 29 | 0 | none |
| `services/nominatim.js` | 5 | 0 | 0 | 5 | 0 | none |
| `services/osm.js` | 45 | 2 | 2 | 30 | 11 | `apps/maid/src/save/id-osm.test.ts` (adopted 2); covered by `packages/model/test/data/parsers/OsmJSONParser.test.js` and `packages/module-notes/src/model.test.ts` |
| `services/osm_wikibase.js` | 11 | 0 | 0 | 11 | 0 | none |
| `services/panoramax.js` | 11 | 0 | 0 | 0 | 11 | none |
| `services/streetside.js` | 7 | 0 | 0 | 0 | 7 | none |
| `services/taginfo.js` | 20 | 0 | 0 | 20 | 0 | none |
| `services/vegbilder.js` | 8 | 0 | 0 | 0 | 8 | none |
| **sum** | **301** | **10** | **60** | **139** | **92** | |

The sum row covers all 301 tests of the three areas (svg 77, renderer 68, services 156). The 3 `it.todo` in iD's `services/osm.js` (`#loadMultiple`) are iD's own todos and are not in the inventory's count; they need F-services-3.

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
| F-renderer-1 | A minimum camera zoom (iD `map.minzoom`). Maid lets the camera zoom out to 0 and shows "Zoom in to load data" instead. Decision needed | `renderer/map.js`: respects minzoom, is zero by default (2) | todo, decision | `apps/maid` MapView.tsx; the engine's `minDataZoom` |
| F-renderer-2 | Missing check: a move of the view (zoom or centre) is reported, so that the tiles and the URL follow. No test asserts it | `renderer/map.js`: dispatches move on zoom change, on centre change (2) | todo (missing check) | `tools/bench` check or a test of `packages/renderer/src/engine.ts` |
| F-renderer-3 | Missing check: zoom in and zoom out step one level, from the buttons and the `=` and `-` keys | `renderer/map.js`: #zoomIn, #zoomOut (2) | todo (missing check) | `tools/bench` check; `apps/maid` ZoomControls.tsx, useShortcuts.ts |
| F-renderer-4 | Missing check: the view's extent (bounds) and the animated move to a centre (`easeTo`, used by the notes focus) | `renderer/map.js`: #extent, #centerEase (2) | todo (missing check) | `tools/bench` check or a unit test |
| F-renderer-5 | Cursors by feature and mode (iD: select-point, select-vertex, select-line, select-area, select-split, select-add, select-remove, draw-connect-line, draw-connect-vertex). Maid shows grab, grabbing, pointer or crosshair | `renderer/map.js`: cursors (9) | todo | `apps/maid` MapView.tsx and the engine's pick |
| F-renderer-6 | Custom imagery from a URL template (TMS or WMS) in the background list, with the key in the URL shown as `{apikey}` in the name | `renderer/background_source.js`: Custom (7) | todo | `packages/module-imagery` (store, ImageryPanel) |
| F-services-1 | API rate limit: a 429 or 509 answer stops tile loading and is shown to the person. Maid logs the error and retries the tile on the next move (see Differences) | `services/osm.js`: 509, 429 (2) | todo | `packages/renderer/src/engine.ts` (loadTile); `apps/maid` MapNotices.tsx |
| F-services-2 | Tile loading rules, under test: only the tiles of the view that are not loaded yet, centre first; no loading below `minDataZoom`; requests go to the configured API URL. The rules are in engine.ts and have no test | `services/osm.js`: loadTiles (2), uses apiUrl (1) | todo (missing check) | `packages/renderer/src/engine.ts`; move the tile maths into a pure function to test it |
| F-services-3 | Load one element that is not in view, by id, for relation members or a parent. iD's `#loadMultiple` is a todo in iD itself (3 `it.todo`) | `services/osm.js`: loadEntity (3); iD's 3 `it.todo` | todo | `packages/renderer/src/engine.ts` (new method) |
| F-services-4 | Older versions of an element (history of an element) | `services/osm.js`: loadEntityVersion (3) | todo | `packages/renderer/src/engine.ts` and a history view (none in Maid) |
| F-services-5 | The person's own changesets, with their comments | `services/osm.js`: userChangesets (3) | todo | `apps/maid` (new view), `osm-api` |
| F-services-6 | Web links to an element, its history, its changeset, a user and the changesets page (iD's URL builders). Maid has `noteWebUrl` for notes only | `services/osm.js`: changesetURL (1), changesetsURL (1), entityURL (3), historyURL (3), userURL (1) | todo | next to `noteWebUrl` in `packages/module-notes/src/model.ts` or a shared helper; see F-ui-15 (View on OSM, another area) |
| F-services-7 | Look up one note by id | `services/osm.js`: getNote (1) | todo | `packages/module-notes/src/store.ts` |
| F-services-8 | Writing notes: add, comment, close and reopen. Maid reads notes only (iD's removeNote and replaceNote are the local state of new and changed notes). Only against the development server, see AGENTS.md rule 1 | `services/osm.js`: removeNote (1), replaceNote (2) | todo | `packages/module-notes` and `apps/maid/src/save` |
| F-services-9 | Missing check: a view requests only the note cells it lacks, and the loaded notes reach the store. `missingCells` is pure and could take a test; the iD test is about the event | `services/osm.js`: loadNotes fires loadedNotes (1) | todo (missing check) | `packages/module-notes/src/store.ts` (requestCells, missingCells) |
| F-services-10 | The API's capabilities and status, and the imagery blocklists from them. Maid makes no capabilities call | `services/osm.js`: API capabilities (2) | todo | `apps/maid/src/auth.ts` or `apps/maid/src/save` |
| F-services-11 | Place search and the country code of a position, through Nominatim. Nominatim is OSM infrastructure (AGENTS.md rule 1): a fixture or a decision comes first | `services/nominatim.js` (5) | todo | a new module; none in Maid |
| F-services-12 | Taginfo: key and value suggestions for the fields, and the wiki pages of keys. Decision pending: `docs/research/fields-vs-id.md` section 5 | `services/taginfo.js` (20) | todo, decision pending | `packages/presets` or `packages/ui` fields |
| F-services-13 | OSM wiki and Wikidata lookups: the info button, the sitelinks, and the links in wiki text. Decision pending: `docs/research/fields-vs-id.md` section 5 | `services/osm_wikibase.js` (11) | todo, decision pending | `packages/ui` inspector |
| F-services-14 | MapCSS validation rules from the Map Rules service (iD's maprules). Maid's rules are TypeScript in `packages/validation`; there is no MapCSS parser. Decision needed | `services/maprules.js` (29) | todo, decision needed | `packages/validation` |

## Differences found

- **Several categories per object.** iD puts an object in every category whose rule it matches, and hides it only when all of them are hidden. Maid's `FilterSet` gives each object its first matching filter (`default.ts` documents this on purpose). Hiding `rail` therefore hides a station that iD would keep as a point while `points` is on. This is a decision for Tobias, not a test fix. No test was changed for it: the per-category tests use each category's own rule (`matches`), and `others` uses the set's first match, as iD's `others` means "no other category".
- **Per-category rules fixed in source.** `packages/filters/src/default.ts`: `buildings`, `rail` and `landuse` are now functions with iD's exclusions (lifecycle values, roads and paths, buildings, building parts, indoor, water, pistes). Before, `building=construction`, `railway=tram` on a residential road and `natural=water` matched those categories on their own. The first-match results are unchanged (the 53 existing filter tests still pass).
- **Untagged members of a multipolygon.** iD strokes each member way with the relation's area classes. Maid draws no line for them (build.ts `buildWay`); the relation's area carries the outline. Visually intended, not adopted as a test.
- **Barrier areas.** iD removes the area fill of a closed barrier way; Maid keeps it (F-svg-5).
- **Layers.** iD puts a line into a DOM group named by its whole layer (-2.5 goes to layer -2). Maid keeps the fractional layer as a stacking band and a sort key (`z`). Same order, different mechanism.
- **Lifecycle prefix in tag classes.** iD's loop over lifecycle prefixes only breaks the inner loop, so the last matching prefix wins. Maid stops at the first. Not covered by iD's tests.
- **Extra class.** Maid's tag classes add `ford` as a secondary class; iD's list does not have it. Not covered by iD's tests.
- **`it.todo` needs a body for types.** Bun's type for `it.todo` requires a callback, so todos here are `it.todo(title, () => {})`; the body never runs (checked). `packages/ui/src/inspector/fields/id-wikipedia.test.ts` and `packages/validation/src/id-validator.test.ts` use the one-argument form and fail `bun run type-check` for that reason. Not touched: other agents' files.
- **Overlay above its maximum zoom (`renderer/background_source.js`, overzoom:false).** iD hides an overlay past its maximum zoom when `overzoom` is false. Maid never hides an overlay by its maximum zoom: ELI's `maxzoom` is not a limit, MapLibre overzooms the last tiles (`visibleAtZoom` in `packages/module-imagery/src/helpers.ts`, asserted by `helpers.test.ts`). Kept Maid's choice; counted as n/a.
- **Partial response (`services/osm.js`, handles errors in partial JSON response).** iD's test feeds an element with an `error` key and expects a rejection with its message. OSM's partial responses carry an element with `type: 'error'` and a `message`; Rapid's parser throws on that (`OsmJSONParser.ts`, "Partial Response: …", Rapid#501), and its test asserts it. Maid follows the real shape, so iD's exact input does not throw in Maid. Counted as covered by the parser test, not adopted. Unsure whether the API still sends an `error` key; if it does, the parser misses it.
- **Failed tiles are retried on every move (`services/osm.js`, 509 and 429).** iD's test expects a change event and a rejection with the status. Maid's `loadTile` logs the error and removes the tile from its set, so the next move asks for it again. Under a rate limit that repeats the requests that caused it. Signalling the limit is the right behaviour for OSM data; this is F-services-1, not fixed here.
- **Empty map response (`services/osm.js`, handles empty response gracefully).** Maid's parser returns the bounds of the response as a data item of its own. The adopted test counts the elements only (`data` without the `bounds` item). The expectation is unchanged.
- **Zoom and centre tests of `renderer/map.js`.** The three covered rows rely on the browser checks, which set the camera with `jumpTo` and read `zoom` from the map. No check asserts a value directly.
- **Imagery providers.** Maid offers Panoramax and Mapillary (`IMAGERY_PROVIDER_IDS` in `packages/module-street-imagery/src/state.ts`). iD's services also include KartaView, Streetside and Vegbilder. A product choice, not a test question; counted as n/a under the street imagery packages.
- **Not counted: iD's `it.todo`.** The 3 `it.todo` in `services/osm.js` (`#loadMultiple`) are not in the inventory's 45, and are listed under F-services-3.

## Not applicable, by reason

- **DOM elements and classes** (path, g, `class`, `selection.classed`): Maid draws GeoJSON features with MapLibre layers, not SVG. Covers `svg/areas.js` 3, `svg/lines.js` 5 (four class tests and the layer-group rounding), `svg/points.js` 1, `svg/icon.js` 2, `svg/osm.js` 2, `svg/layers.js` 3 (surface and defs), `svg/svg.js` 2 (a helper that gives members DOM classes), `svg/tag_classes.js` 4 (the `tags` accessor of a d3 binding, the removal of stale DOM classes, keeping non-tag DOM classes, an SVG `<g>` element).
- **Removing a DOM path when a way is deleted** (`svg/areas.js` #1903): Maid rebuilds features from the history in the engine, and the builder has no DOM to check.
- **`renderer/features.js` `#toggle`**: iD flips a category for its panel; Maid's `FilterButton` sets the state it wants with `filters.with(id, state)`.
- **Tag classes for a DOM element**: Maid's `tagClasses(tags)` returns the classes of a set of tags; the style they select is tested in `packages/style/src/style.test.ts`.
- **URL templates and tile maths** (`renderer/background_source.js`: blank template, tms tokens, wms tokens, subdomains ×2; 5): the ELI package builds the raster source (`getRasterSourceSpec` in `packages/module-imagery/src/eli.ts`), and MapLibre fetches the tiles. Maid has no template input for them.
- **Overlay overzoom switch** (`renderer/background_source.js`, overzoom:false; 1): Maid has no overzoom option and always overzooms (see Differences).
- **D3 tile layer** (`renderer/tile_layer.js`, 2): iD's tile layer is a D3 renderer with a `dimensions` setter. Maid's raster layers are MapLibre sources drawn by `ImageryLayers.tsx`; MapLibre sizes its canvas from the container.
- **MapLibre canvas, not an SVG surface** (`renderer/map.js` surface, 1): Maid draws the map with MapLibre on a canvas.
- **iD's own event dispatch** (`renderer/map.js`, "dispatches no move event when … does not change", 2): iD's D3 dispatcher. MapLibre fires its own move events, and only when the view changes.
- **iD's service object and connection** (`services/osm.js`: "is instantiated" 1, getConnectionId 2, reset 1, switch 2, "allows secure connections" 1; 7): iD's connection object. Maid has no service registry: the engine and `osm-api` are used directly. The API root is set once when the page loads (`readConfig` in `apps/maid/src/config.ts`), so there is nothing to reset or switch.
- **iD's service caches** (`services/osm.js` #caches, 4): iD's cache API for tiles, notes and users. Maid keeps loaded tiles in the engine's set and notes in the notes store.
- **Street imagery services** (`services/kartaview.js` 9, `mapillary.js` 11, `panoramax.js` 11, `streetside.js` 7, `vegbilder.js` 8; 46 in all): the tests are about the `@osm-editor-kit/street-imagery*` packages (cache, loading, stacking, sequences, selected image). Maid's `packages/module-street-imagery` is an adapter. Its own decisions (which providers are switched on, nothing requested in an automated browser, Mapillary only with a token) are asserted in `packages/module-street-imagery/src/state.test.ts`, but no iD test title is about them, so none is counted as covered.
  - `kartaview.js`: init, reset, loadImages (fires loaded, null island, several pages), images, stacked, sequences, selected image.
  - `mapillary.js`: init, reset, images, stacked, signs, stacked signs, map features, stacked map features, sequences, active image, filter by date.
  - `panoramax.js`: init, reset, null island, API error, images, stacked, invalid image data, no images, speed, sequences, selected image.
  - `streetside.js`: init, reset, loadBubbles, null island, bubbles, stacked, sequences.
  - `vegbilder.js`: init (cache, layers), reset, loadImages, null island, images, stacked, sequences.

## Not finished

None. Every row of the three areas is counted.
