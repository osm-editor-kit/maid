# 3D views for OSM editing: OSM2World and MapLibre options

Date: 2026-10-20. Scope: research only. No code changed, no requests to OSM infrastructure, no issues, comments or contact with anyone. Read-only `gh` and raw GitHub files; the GitHub code search hit its rate limit, so the indoor inventory comes from raw source files plus issue and PR search, not from an exhaustive code search.

Labels: **[R]** read in a fetched page or source file. **[I]** inferred from what was read. **[U]** not verified: not run, not measured, or not found.

## Summary

- **iD #11894** (opened 2026-02-19 by the OSM2World maintainer) proposes a 3D preview of the selected object in a side panel, shipped as an npm package, starting with buildings. Two substantive comments, no decision, indoor not mentioned. [R]
- **OSM2World's core is Java (MIT).** The same core is compiled with TeaVM to an ES module that converts OSM JSON in the browser. The object viewer (MIT-0, JavaScript, Babylon.js) uses it and already re-converts in-memory tag edits, so an unsaved-edit path exists in practice, for tags. [R]
- **Indoor support is partial.** It renders rooms, corridors/areas, interior walls with doors and windows, and elevator cabins, only from LOD 3, and only for elements inside a building part's polygon. Stairs that connect levels are not solved (issue #197, open since 2022). Indoor doors, level displays and stair geometry are not rendered. [R]
- **The public demo is a tile viewer, not an editor tool.** It streams pre-built glTF tiles from tiles.osm2world.org into Babylon.js, and at fetch time it said it "currently only shows a few example areas". The 2025 OSM-3D-Edit roadmap makes a real-time preview of unsaved edits the central feature, with JOSM first. Indoor levels are only "kept in mind". [R]
- **Recommendation for Maid:** start with MapLibre `fill-extrusion` per level (native, live, no new dependency; Rapid already does this). Treat an OSM2World panel as a second step, built on the web library with a self-hosted copy. [I]

## 1. iD issue 11894 [R]

- Title: "Provide a 3D preview using OSM2World". Open, label `enhancement`, no milestone, no linked PRs.
- Proposal: 3D preview for the selected feature, buildings first, so mappers see the result without uploading and checking elsewhere. Only the selected object plus its parents (for example the whole building for a `building:part`) would be rendered, for responsiveness.
- Discussion: the account `tordans` (the user's handle, inferred) welcomed it and suggested a side panel modelled on the Mapillary integration, shipped as an npm package that iD configures. It also pointed to an iD community chat for the design. The account `k-yle` pointed to Rapid's existing 3D preview (facebook/Rapid PR #940; not checked by me).
- Not discussed: indoor mapping, levels, rendering limits beyond the selection, objections, decisions.

## 2. OSM2World

### 2.1 Indoor capabilities, from code

Source: `core/src/main/java/org/osm2world/world/modules/building/indoor/` and `BuildingPart.java`, on `master` (last push 2026-10-15). [R]

| Element                       | Tags read                                      | What is rendered                                                                                                       | State                                                                                        |
| ----------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Room                          | area with `indoor=room` (`HardcodedRuleset`)   | Walls, floor, ceiling over its `level` range (`IndoorRoom`)                                                            | Rendered                                                                                     |
| Corridor, area                | area with `indoor=corridor` or `indoor=area`   | Floor and ceiling (`IndoorArea`)                                                                                       | Rendered                                                                                     |
| Interior wall                 | way or area with `indoor=wall`                 | Wall with thickness; windows and doors on it (`IndoorWall`, PR #168)                                                   | Rendered                                                                                     |
| Elevator                      | area with `highway=elevator` (`IndoorModule`)  | Cabin, shaft, cable, door from door nodes on the outline; height from the `level` range                                | Rendered, a fixed cabin size (2.2 m)                                                         |
| Stairs                        | way with `highway=steps` and `level`           | Road-like geometry with attachment connectors to the floor levels                                                      | Partly: a unit test says "nothing to attach to" for the geometry; issue #197 open since 2022 |
| Door, column, level as object | `indoor=door`, `indoor=column`, `indoor=level` | Not in the `BuildingPartInterior` switch (only wall, room, area, corridor). `indoor=level` is used only for level data | Not rendered                                                                                 |

Rules that limit what appears:

- An indoor element is added only if its polygon, or for a way its segment, lies inside the building part's polygon, and its level list exists in that part's level structure (`BuildingPart.createInteriorComponents`). Elements that span parts are a TODO. [R]
- Interior geometry is drawn only from LOD 3 to LOD 4 (`INDOOR_MIN_LOD = LOD3`). The web demo and the object viewer use LOD 4. [R]
- Windows and doors on indoor walls take the level from their `level` tag. Issue #238 (closed 2025-01-22) was answered that way by the maintainer. [R]
- No level picker, per-level visibility or cutaway appears in either viewer. [R, from the viewer sources]

History: PR #166 "Indoor" (merged 2020-08-02) added rooms, walls, corridors, areas and `indoor=level`. PR #169 added attachment connectors. `doc/changes.txt` lists "experimental Simple Indoor Tagging support". [R]

### 2.2 Architecture

- **core** (Java, Maven, MIT): the converter, world modules, LOD, materials. [R]
- **core-jvm**: JVM build. Inputs include OSM XML and PBF (osm4j), GeoDesk, and OSM JSON (the SotM 2026 post names GeoDesk and OSM JSON backends). [R]
- **core-web**: TeaVM 0.14.1 (`core-web/pom.xml`) compiled to `osm2world-core-web.mjs`, served from `osm2world.org/build/web/<version>/`. Public surface: `loadO2WConfig(url, { lod }, onOk, onErr)`, `new O2WConverter()`, `setConfig(config)`, `convertJson(jsonString, onMeshes, onErr, options)`. The viewer passes `filterIds` in `options`; the library docs do not mention that option. [R]
- **Mesh output** from the web library: `positions()`, `indices()`, `normals()`, `uvs()`, `color()`, `baseColorTexture()` (a relative path), `clampTextures()`, `transparency()`, `opacityTexture()`, `normalTexture()`, `ormTexture()` (occlusion in red, roughness in green, metal in blue). No formal schema is published. [R]
- **desktop** and **opengl**: Java desktop and JOGL viewer. [R, from module list]
- **Output formats**: glTF/GLB (0.4.0 changelog; "zipped glTF output"), OBJ, 3D Tiles (repository topics; the 2026 blog posts speak of 3D tile generation). [R]
- **Tiles**: `tiles.osm2world.org` serves glTF tiles, textures and the style file `default-style/standard.properties`. The server-side pipeline that cuts tiles is not in the public repository (the tree was listed; nothing found). [U]
- **Object viewer** (`tordanik/OSM2World-object-viewer`, JavaScript, MIT-0, last push 2026-06-16): `src/Data.js` picks a source (OSM API `/api/0.6/{type}/{id}/full.json`, Overpass, or in-app data), `src/MeshesToBabylon.js` turns meshes into Babylon PBR materials, `index.html` imports the converter and rebuilds the scene on each data change. [R]

### 2.3 Licence

- Core, desktop and the repository licence: MIT (GitHub API and `LICENSE.txt`). [R]
- Object viewer: MIT-0. [R]
- The 3D renderings on the blog and the SotM post: CC BY-SA 2.0, based on OSM data; OSM attribution required. [R]
- The library docs ask users to host their own copy of the style and its resources. [R]
- The licence of the web build as distributed is not stated separately. [U]

## 3. The demo's embedding (osm2world.org/demo/) [R]

Fetched the HTML directly (`curl`), then read the scripts it loads.

- **Scripts**: `https://cdn.babylonjs.com/babylon.js`, `.../loaders/babylonjs.loaders.min.js` and `.../loaders/babylon.glTF2FileLoader.js` (unversioned CDN URLs), `https://code.jquery.com/pep/0.4.3/pep.js`, and the site's own `src/geocoords.js`, `src/osm2world-frontend.js`, `src/searchField.js`, `src/osm2world-frontend.css`.
- **Renderer**: Babylon.js. Not three.js, not Cesium.
- **Inline setup**: `OSM2World.Viewer.fromCanvas("renderCanvas", ["https://tiles.osm2world.org/glb/"], renderOptions)`. Render options are "low" (256 px tiles, LOD 4) on narrow screens and "high" otherwise.
- **Input**: no OSM data reaches the client. The viewer loads static glTF tiles by tile number and LOD around the camera (rings up to 10 tiles, updated each second). Location comes from `lat` and `lon` URL parameters (default 48.5683 in the code) and a search field.
- **Embedding API** (from the frontend source): `OSM2World.Viewer.fromCanvas(...)`; `OSM2World.Viewer.fromBabylonScene(engine, scene, tileRoots, originLatLon, camera)` for an existing Babylon scene; `new OSM2World.Model(url, position, ele, rotation, scale, onPick)` places an external glTF.
- **Observed state**: the page showed "Loading center tile" and a notice that no tiles exist for the requested place, and it said the demo "currently only shows a few example areas". [R, fetched 2026-10-20]
- **Unsaved edits**: not possible in the demo, because it only shows pre-built tiles.

## 4. Can OSM2World render unsaved edits? [R, with gaps marked]

- **Tags: yes, proven in the object viewer.** `Data.js` keeps the element's tags in memory; a tag change sets `_osmJsonElement.tags`, then `onDataChanged` calls `updateMeshes`, which calls `converter.convertJson(JSON.stringify(data.osmJson), ...)` on the whole in-memory JSON. Conversion is a full re-run; no incremental update was seen.
- **Geometry: not shown.** Moved nodes, new nodes and changed way membership would go through the same JSON path, since the input is OSM JSON (nodes, ways and relations with ids). Not tested. [I/U]
- **What the editor must send**: the feature, its nodes, and its parents (the `building` or `building:part` way or relation), in OSM JSON with consistent ids. The viewer fetches `full.json` for ways and relations for that reason.
- **Cost**: the library docs say client-side conversion is "best used for smaller data sets". No timings were found. [R for the quote; no numbers, [U]]. Measure on a fixture before choosing any option.
- **Undocumented**: `filterIds` (used by the viewer) is not in the library docs. [R]

## 5. Integration options for Maid

Effort: S = a few files, no new dependency. M = a package or a module with a new dependency. L = a new surface, a service, or a larger change. Automated runs must use fixtures and self-hosted assets, never a CDN or the tile server (core rule 1 in `AGENTS.md`).

| Option                                                            | What the user gets                                                                                                                                                                       | Effort                                                                                                                                                                              | Limits                                                                                                                                                          | Unsaved edits                                         |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **a1. MapLibre `fill-extrusion` per level** (in the map)          | Footprints stacked by level range: base = bottom level height, height = top. An elevator becomes a tall column across its levels. Entrances and doors as small extrusions at their level | S-M: a layer plus derived `base`/`height` properties in the model, no new dependency. Rapid's `Map3dSystem.ts` does the same with `['get','min_height']` and `['get','height']` [R] | Footprints only: no walls, cabin, door or stair geometry, no interior. Heights are schematic unless the data has `height` or `building:levels` [I]              | Yes, live: `setData` on each edit, as Rapid does      |
| **a2. MapLibre custom layer with three.js** (glTF from OSM2World) | Real OSM2World meshes in the map, georeferenced                                                                                                                                          | M-L: MapLibre's own example pattern (pinned to MapLibre 4.3.2 in the example, so a version check is needed) [R via search]                                                          | Needs either pre-built glTF from a server (not live, and outside automation unless vendored) or in-browser conversion in a worker. Two render stacks in one map | Only with in-browser conversion                       |
| **a3. deck.gl `MapboxOverlay` + `Tile3DLayer`** (3D Tiles)        | Streamed 3D Tiles, the format OSM2World names for tiling                                                                                                                                 | L: a deck.gl dependency and a tile server we do not run                                                                                                                             | No official example combines `Tile3DLayer` with MapLibre through `MapboxOverlay` [U]. Needs a tileset that does not exist for indoor. Static, so no edits       | No                                                    |
| **b. Floating window** (like the street-imagery panel)            | The selected feature and its building part in 3D, rendered with Babylon.js or three.js from the in-memory OSM JSON via the web library. Matches the iD proposal's side panel             | M: a module with a lazy import of a self-hosted `osm2world-core-web.mjs`, a canvas, a debounced re-convert                                                                          | Second WebGL context. Bundle size unknown [U]. Rooms need LOD 3 or higher. Needs the parent building part in the input. Automated runs need a mock or fixture   | Yes: re-convert on change, debounced; cost unmeasured |
| **c. Full view** (like the way table or the junction editor)      | The whole building part with a floor switch, elevators, entrances and stairs in context                                                                                                  | L: the panel's work plus level selection, camera, selection sync with the 2D map, and scoping to one building part                                                                  | Same as b. Conversion cost grows with the part's size. Stair geometry is incomplete upstream (#197)                                                             | Yes, as b                                             |
| Babylon.js inside the map                                         | Not recommended: a second engine beside MapLibre                                                                                                                                         |                                                                                                                                                                                     |                                                                                                                                                                 |                                                       |

Notes on the rules:

- The demo and the object viewer load their scripts and tiles from third-party hosts with unversioned URLs. Maid would need a pinned, self-hosted copy of the `.mjs`, its style file and textures (the library docs ask for this anyway).
- The object viewer fetches the OSM API and Overpass. Maid must not do that in automated runs; it would read the frozen fixtures through the mock API instead.

## 6. MapLibre-native alternatives for levels in 3D

- **Layer types** in the style spec page, read 2026-10-20: background, fill, line, symbol, raster, circle, fill-extrusion, heatmap, hillshade, color-relief. **No `model` layer and no glTF or 3D Tiles layer type** appear. [R]
- **`fill-extrusion` paint properties**: `fill-extrusion-height` (metres; negative extrudes below ground), `fill-extrusion-base` (metres, must not exceed the height; negative supports underground floors), `fill-extrusion-vertical-gradient`, `fill-extrusion-color`, `fill-extrusion-opacity`, `fill-extrusion-translate`, `fill-extrusion-pattern`, and a layout property for rounded corners. [R]
- **Data-driven values**: the Rapid code uses expressions on feature properties for both height and base [R]. Other expression uses in Maid follow the same pattern [I].
- **glTF in MapLibre**: the search found no native model layer, and MapLibre's documented route is a custom layer with three.js. The search summary did not confirm a model layer in the 5.x or 6.x series. [U]
- **Maid's version**: `packages/renderer/package.json` and `packages/module-imagery/package.json` pin `maplibre-gl ^6.12.0` [R]. The spec page read above may not match 6.x exactly. Check the 6.x changelog before relying on "no model layer". [U]
- **Per-level model for Maid** [I]: each indoor feature carries its level range (`min_level`, `max_level`, or the parsed `level` list). A per-building level height constant (default about 3 m, user-set) turns levels into `base` and `height` expressions. Levels with no real height are schematic.

**Recommendation**: a1 first. It needs no new dependency, updates live from the model, shows how a shaft or an elevator spans floors, and has a working precedent in Rapid. Decide on b only after a measured conversion cost on a fixture (open question 3), and only if the questions in section 5 (cabins, doors, stairs) matter to the indoor variant.

## 7. Open questions

1. **Tile pipeline**: is the code that cuts the tiles and the 3D Tiles output open, and under which licence? It is not in the public repository. Tobias decides whether to ask the maintainer; no one here contacts anyone.
2. **Licence of the web build**: the repository says MIT; the library docs say nothing. Confirm before vendoring the `.mjs`.
3. **Conversion cost**: time `convertJson` for a building part with about 20 rooms, 2 elevators and interior walls, at LOD 3 and 4, and per edit. Needs a browser run on a fixture with no network. Not run.
4. **`filterIds`**: does the built `.mjs` support it, and what does it return? Only the viewer uses it.
5. **Stairs and levels in the web build**: does a `highway=steps` with a level list render a usable connection at LOD 3? The unit test asserts only connectors. Not tested.
6. **MapLibre 6.12 model layer**: check the 6.x changelog and style spec for a native model or 3D Tiles layer.
7. **Rendering contract**: which indoor tags must the variant show? The Maid tagging model (`docs/research/indoor/tagging-model.md`) lists `indoor=door`, `indoor=level`, `stairs=yes` and `conveying`, and OSM2World renders none of those as objects. The choice between a1, b and c depends on this.
8. **Panel contract**: iD's proposal (a side panel shipped as a package) and Maid's module pattern may differ. Check the street-imagery module's contract before designing a b-type panel.

## 8. Sources

Fetched or read on 2026-10-20.

- iD issue 11894: https://github.com/openstreetmap/iD/issues/11894
- OSM2World repository: https://github.com/tordanik/OSM2World (README; tree; `core/.../indoor/*.java`, `BuildingPart.java`, `HardcodedRuleset.java`, `IndoorModule.java`; `core-web/pom.xml`, `WebModule.java`; `doc/changes.txt`; `core-jvm/src/test/.../IndoorStepsTest.java`)
- OSM2World issues and PRs: https://github.com/tordanik/OSM2World/issues/197, https://github.com/tordanik/OSM2World/issues/238, https://github.com/tordanik/OSM2World/pull/166, https://github.com/tordanik/OSM2World/pull/168, https://github.com/tordanik/OSM2World/pull/169
- Object viewer: https://github.com/tordanik/OSM2World-object-viewer (`index.html`, `src/Data.js`, `src/MeshesToBabylon.js`, `src/OsmApiDataSource.js`, `src/OverpassApiDataSource.js`, `src/InAppDataSource.js`)
- Blog and launch post: https://osm2world.org/blog/2026/05/31/object-viewer-launch/
- Blog feed: https://osm2world.org/blog/index.xml
- Roadmaps and SotM: https://osm2world.org/blog/2025/09/24/ptf-roadmap-2025-osm-3d-edit/, https://osm2world.org/blog/2026/06/03/ptf-roadmap-2026-osm-3d-terrain/, https://osm2world.org/blog/2026/08/26/sotm-2026/
- Web library docs: https://osm2world.org/docs/library-web/
- Demo: https://osm2world.org/demo/ (HTML and `src/osm2world-frontend.js`, `src/geocoords.js`, `src/searchField.js`)
- MapLibre style spec, layers: https://maplibre.org/maplibre-style-spec/layers/
- MapLibre custom 3D model example (search result, not opened): https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-using-threejs/
- deck.gl Tile3DLayer and MapboxOverlay (search results, not opened): https://deck.gl/docs/api-reference/geo-layers/tile-3d-layer, https://deck.gl/docs/api-reference/mapbox/overview
- Rapid's 3D precedent (local, read only): `.reference/rapid/modules/core/Map3dSystem.ts` lines 646-658
- Maid's package pins: `packages/renderer/package.json`, `packages/module-imagery/package.json`
- Maid's indoor tagging model: `docs/research/indoor/tagging-model.md`

## 8. Measured on 2026-10-21 (prototype `bun run osm2world-prototype`)

The web build `0.5.0-SNAPSHOT_2026-06-16` (3.9 MB `.mjs`) and its style converted the `indoor` fixture (Berlin Hauptbahnhof) in the browser, offline, shown with Babylon.js 9.28.0 (`tools/osm2world-prototype`).

- **Works**: buildings with heights, the glass roof, tracks and platforms; the level filter of the prototype shows level -2 alone. Rooms are only drawn inside a building or building part, so the building outline must be part of the input.
- **Too slow to follow every edit**: 5552 elements (buildings and indoor) took 39 s; one level took 10 to 12 s (2344 to 2747 elements), the same on a second run, so it is not JIT warm-up. About 4 ms per element: a single building of a few hundred elements would take about one to two seconds (inferred, not measured).
- **The style needs its includes**: `standard.properties` loads `locales/DE-defaults.properties` and two traffic sign files; `loadO2WConfig` needs an absolute URL. Textures are left out (they would come from the tile server); colours only.
- **Not in Bun**: the build uses `XMLHttpRequest`, so it runs only in a browser.
- About 90 "Degenerate triangle" errors in the console for small features; the conversion goes on.

So for Maid: a panel that converts the selected building on demand (b), not a live view of every edit; the live 3D of levels stays with MapLibre `fill-extrusion` (a).
