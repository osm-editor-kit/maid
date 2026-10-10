# Rapid 3

Checkout: `../Rapid-Bryan` at `413c0519f` (`3.0.0-pre.2`), which is https://github.com/bhousel/Rapid. Paths are relative to that checkout, most under `modules/`. License: ISC.

Do not confuse with `facebook/Rapid` or `../Rapid`. See `../Rapid-Bryan/FORK-SUMMARY.md` for how far the two have diverged.

## Rendering

Rapid draws with PixiJS 8.20 on WebGL2. `renderer=canvas|webgpu|webgl1|webgl2` switches the backend (`GraphicsSystem.ts:708-731`). Rendering runs on the main thread.

- Scene: `stage` > `origin` > groups for background, basemap, points, labels, UI and more (`PixiScene.ts:117-150`). 18 layers. One `PIXI.Container` per feature (`AbstractPixiFeature.ts:103`), with feature classes for point, line, polygon and label.
- Coordinates: features are stored in world coordinates at zoom 16. `origin` carries the scale `2^(z − 16)` and the pan offset (`GraphicsSystem.ts:552-566`).
- Pan: no re-projection, only `origin.position` moves. Zoom: the scene is marked dirty and geometry is rebuilt (`GraphicsSystem.ts:533-537`, inferred from code). Rotation only restyles.
- Loop: a scheduler runs on `requestAnimationFrame` with urgent, normal and idle queues and a 16.67 ms frame budget (`SchedulerSystem.ts:772-808`). Between real draws Rapid applies a temporary CSS transform, like iD does. Scene preparation is throttled to 250 ms (`GraphicsSystem.ts:16`).
- Culling: a spatial query returns what is visible; features not seen for 20 frames are destroyed (`AbstractPixiLayer.ts:171-186`).
- Textures: three atlases (symbols, text, tiles). Icons are rasterised from SVG on demand. Label text is rasterised to canvas textures step by step.
- Labels: collision with RBush (`PixiLayerLabels.ts:565-763`).
- Picking: Pixi's own pointer events with a hit area per feature. No colour picking.
- Workers: a pool of up to two, used for OSM fetch and parse and for vector tiles (`WorkerSystem.ts:57`, `OsmService.worker.ts`).

### Zoom limits

Data loads at z >= 15 and renders at z >= 12. iD needs z >= 16. Scenes that compare all three must stay at z >= 16.

## Styling

No CSS. Styles are data: `data/rapid_style.json5` holds variables, style groups (fill, casing, stroke, marker, icon, label) and selectors. `StyleSystem.styleMatch(tags, geometry, scope)` (`StyleSystem.ts:526`) resolves a feature's style in code. Classification rules are in `data/osm_rulesets.json5`. Presets come from `@openstreetmap/id-tagging-schema` plus `data/rapid_schema.json5`.

This is close to what a MapLibre port needs: tags go in, a resolved style comes out. It is worth reading before we design Maid's style package.

## Data model and loading

- Model: `lib/Graph.ts`, `lib/Difference.ts`, `lib/Geometry.ts`; entities in `data/OsmNode.ts`, `OsmWay.ts`, `OsmRelation.ts`. Entity constructors need a `Context`, so they are not usable standalone as they are.
- Parsers: `OsmJSONParser.parse` and `OsmXMLParser.parse`, both returning `{osm, data, seenIDs}`.
- Merge local data: `context.systems.editor.merge(entities, seenIDs)` (`EditSystem.ts:740`).
- Mock API: set `context.preauth = {url, apiUrl, access_token}` before init (`Context.ts:434`). Rapid then requests `/api/capabilities` and `/api/0.6/map?bbox=` per z16 tile, and prefers the `.json` variants.
- Offline assets: by default Rapid pulls assets from jsDelivr. Set `context.assetOrigin = 'local'` and `assetPath` (`Context.ts:116`).
- URL parameters: `map=zoom/lat/lon/bearing`, `id=`, `background=`, `disable_features=`, `renderer=`, `data=` or `gpx=` (GPX, KML, GeoJSON, not OSM entities), `datasets=`, `poweruser=`, and more. Full list in `../Rapid-Bryan/API.md`.

## Driving Rapid from Playwright

- Globals: `window.rapidContext`, `window.Rapid`. The dev bundle adds `PIXI` and more.
- Events: graphics `draw` (`GraphicsSystem.ts:622`) and `move`; editor `merge`; map `mapchange`; scheduler `pressurechange`. There is no "tile loaded" event; use `merge` or call `OsmService.loadTiles(cb)`.
- Built-in timing: `performance.measure` entries named `app-N` and `draw-N` (`GraphicsSystem.ts:273-307`), and `SchedulerSystem.metrics` with average frame time, render time, dropped frames and pressure (`SchedulerSystem.ts:622`).
- Camera: `setMapParams`, `center`, `zoom`, `setTransformAsync` on the map system (`MapSystem.ts:523-654`).
- Select: `context.enter('select', {selection: {points: [ids]}})`. Hover: `layer.setClass('hover', id)`.
- The benchmark in `test/benchmark/` is stale and refers to APIs that no longer exist. Do not reuse it.
- Rapid enforces a Content Security Policy. Unverified: whether it blocks scripts that Playwright injects. Playwright's `bypassCSP` context option is the fallback.

## Build and serve

- Bun >= 1.4. `bun install`, `bun run build`. `bun run start` serves on `http://127.0.0.1:8080`.
- `dist/` is static and uses relative paths. The worker script is located next to `rapid.js`. Needs a secure context (localhost is fine).
- `dist/index.html` contains OAuth client ids and secrets for OSM. We write our own host page and never copy them.

## What is worth taking from Rapid

- `Map3dSystem.ts` already drives a MapLibre map inside Rapid (`maplibre-gl ^5.24`) and feeds it OSM areas, roads and buildings through GeoJSON sources with `setData` (`Map3dSystem.ts:163-172`, `527-630`). It is a small, working example of OSM entities in MapLibre and the first thing to read before milestone 2.
- The style and ruleset data files, as a model for tag-based styling without CSS.
- The scheduler idea: a frame budget and priority queues for work that is not drawing.
- `@rapid-sdk/math` and `@rapid-sdk/util` are separate npm packages. Unverified: their licenses and current state.
