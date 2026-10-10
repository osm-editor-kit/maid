# Rapid as a benchmark reference

Rapid 3 from https://github.com/bhousel/Rapid at `413c0519f` (`3.0.0-pre.2`), built into `.reference/rapid/` and served with our own host page. Everything below was checked against that commit on 2026-10-10 (macOS, Apple M4, system Chrome via Playwright, headless). Paths like `core/GraphicsSystem.ts` are relative to `.reference/rapid/modules/`.

## Commands

```sh
bun tools/refs/rapid/setup.ts            # clone + build at the pin; no-op when already built
bun tools/refs/rapid/serve.ts            # http://localhost:8082/?scene=small|medium|dense
bun tools/refs/rapid/smoke.ts            # scene small, writes smoke.png
bun tools/refs/rapid/smoke.ts --scene dense [--zoom 17] [--headed] [--no-screenshot]
bun tools/refs/rapid/smoke.ts --scene medium --validation   # keeps Rapid's validation on
```

`smoke.ts` starts the Rapid server and the mock API in-process if they are not running. Page parameters: `?scene=<name>`, `?validation=1` (validation stays on, see "Validation and background work"), `?nsi=0` (see "Where the start-up time goes"), `?profile` (per-system start times in `__benchRapid.boot.parts`). Rapid's own parameters go in the fragment (`#map=17/52.389/13.4`); the page forces `background=none` and `locale=en` and drops `datasets`, `note`, `photo_overlay`, `maproulette`, `walkthrough`, `data`.

## Files

- `pin.json`: repo and commit. `setup.ts`: clones (from `../Rapid-Bryan` if it has the commit, else GitHub; `origin` is set to GitHub either way), `bun install --linker=hoisted`, `bun run build`, writes `.reference/rapid/.maid-built`.
- `serve.ts`: `/` host page, `/bench.js`, `/frame-sync.js` (shared `tools/refs/frame-sync.js`), `/config.js` (generated from `tools/ports.ts`, `tools/fixtures/scenes.ts`, `pin.json`), and `js/ css/ data/ img/ svg/` from `dist`. Rapid's own `dist/*.html` are not reachable.
- `index.html` + `bench.js`: host page and the `window.__bench` adapter (`nodeLoc()` is the one added for the drag check). `window.__benchRapid` has extras (`blockers()`, `boot`, `lastSettle`, `refused`, `validation`, `issues()`, `metrics()`, `measures()`, `renderer()`).

## Verified against docs/research/rapid.md

| Claim | Result |
| --- | --- |
| `context.preauth = {url, apiUrl}` before init points Rapid at the mock | Correct. `OsmService` has openstreetmap.org as default roots but sends nothing in its constructor or `initAsync`. `Context.initAsync` calls `osm.switchAsync(preauth)` after all services are initialised and before any is started; the first OSM request (`GET /api/capabilities.json`) already goes to the mock. Without `access_token` Rapid stays logged out and never asks for user details. |
| Rapid prefers the `.json` variants | Correct. It only ever asked the mock for `/api/capabilities.json` and `/api/0.6/map.json?bbox=` (one per z16 tile). No change to the mock server was needed. It repeats `capabilities.json` every 90 s (`ui/UiApiStatus.ts`). |
| `assetOrigin = 'local'` keeps Rapid off jsDelivr | Correct, but incomplete: 'local' expects npm packages under `data/modules/…`, a layout only the separate rapid-standalone project ships, so start-up failed with 404s. `serve.ts` maps those paths to `.reference/rapid/node_modules` (id-tagging-schema, name-suggestion-index, osm-community-index, wmf-sitematrix, maplibre-gl, mapillary-js, pannellum). Side effect: presets come from the installed id-tagging-schema 6.16.x, where production Rapid pins `@6.6` on the CDN. |
| Select: `context.enter('select', {selection: {points}})` | Wrong. It is `context.enter('select-osm', { selection: { osm: [id] } })`, the call `MapSystem.selectEntityID` uses. |
| Hover: `layer.setClass('hover', id)` | That is how Rapid marks it; `hovered()` reads `layer.getDataWithClass('hover')` over all layers. Confirmed with real mouse events. |
| `map=` zoom is the OSM zoom | Correct: at `map=17` one z17 tile is 256.00 CSS px wide (`smoke.ts` checks it). |
| Default renderer WebGL2 | Correct: `WebGL 2.0`, `ANGLE (Apple, ANGLE Metal Renderer: Apple M4)` in headless Chrome (`--headless=new`, the Playwright default with `channel: 'chrome'`). No extra flags needed for the GPU. `highQuality` true, fill mode `partial`, two workers: all Rapid defaults, untouched. |
| Worker script next to `rapid.js` | Correct: `WorkerSystem` derives `js/rapid-worker.min.js` from the main script URL. We load `js/rapid.min.js`, as Rapid's own index.html does. |
| CSP | It is a `<meta>` tag in Rapid's `dist/index.html` only, not a header. Our page has none, so the question whether it blocks injected scripts does not arise. Not tested against their page. |
| `performance.measure` `app-N` / `draw-N`, `SchedulerSystem.metrics` | Both work (see "Timing hooks"). |
| Pitfall not in the notes | A global bunfig with `linker = "isolated"` breaks Rapid's build (`Could not resolve "d3-selection"`): Rapid imports transitive packages. Hence `--linker=hoisted` in `setup.ts`. |

Secrets: Rapid's bundle (`dist/js/*.js`, git-ignored) contains its OAuth client id/secret and imagery tokens. Nothing of that is in our files; `__benchRapid.refusedSamples` strips query strings.

## Hosts Rapid tries to reach, and how each is switched off

With a plain `new Rapid.Context()` plus `preauth` and local assets, start-up still tried these. In the current page **Playwright sees zero non-localhost requests** in all three scenes (`blocked requests none` in `smoke.ts`, which aborts and counts them and also runs Chrome with `--host-resolver-rules` that resolves only localhost).

| Host | Who / when | Switched off by |
| --- | --- | --- |
| `openstreetmap.maps.arcgis.com` (Esri, despite the name) | `EsriService.initAsync` fetches the dataset catalogue; a failure rejects the whole start-up | pre-resolving `esri._datasetsPromise` |
| `stac.overturemaps.org` | `OvertureService.initAsync` | replacing `overture._loadStacCatalogAsync` on the instance |
| `taginfo.openstreetmap.org` (OSM infrastructure) | `TaginfoService.startAsync` fetches popular keys and rejects start-up on failure; later the sidebar asks it for field values when something is selected | start: `_startPromise` pre-resolved. Later calls: refused by the offline guard |
| `wayback.maptiles.arcgis.com` | background pane asks for imagery dates and retries after every draw | `wayback.getLocalDatesAsync` returns the bundled dates |
| `api.mapbox.com` | "locator overlay" (place-name raster tiles), on by default even with `background=none` | every imagery overlay toggled off after `initAsync` |
| `www.wikidata.org`, `*.wikipedia.org` | sidebar fields of a selected feature | offline guard |
| `cdn.jsdelivr.net` | assets | `assetOrigin = 'local'` + `serve.ts` mounts |
| `browser-update.org` | script in Rapid's index.html | not in ours |

The offline guard (`bench.js`): `NetworkSystem.fetch/fetchEnvelope/fetchRaw` (the worker only fetches what NetworkSystem dispatches) and the global `fetch` are wrapped on the instance and reject any URL that is not this origin or the mock API, before a request exists. Counts are in `__benchRapid.refused`; after `select()` it typically shows `taginfo.openstreetmap.org` (1 to 12), sometimes wikidata/wikipedia. These are attempts inside Rapid, not requests. Not done: stubbing the taginfo/wikidata lookups so that Rapid does not even try.

Off by default and left alone: notes, KeepRight, Osmose, MapRoulette, GeoScribble, Mapillary, KartaView, Streetside (`autoStart = false`, started only when their layer is enabled), Nominatim (search field only), Rapid/Overture/Esri datasets (menu emptied, none enabled). Welcome and what's-new dialogs: `ui.sawPrivacyVersion` / `ui.sawWhatsNewVersion` are set between `initAsync` and `startAsync`. `localStorage` is cleared on every load, so no run inherits settings or an edit backup (which would open the restore dialog).

## Map size, sidebar, locale

- The sidebar starts collapsed through Rapid's own preference `ui.inspector.collapsed = 'true'`; Rapid does not expand it on selection. Its 15 px drag handle (`.resizer`) is hidden by CSS in `index.html`. Result: `.main-map` is exactly the viewport (1600x1000 checked by `smoke.ts`). Rapid's toolbars float over the map.
- Rapid draws on a surface 50 px larger on every side (canvas 1700x1100 for a 1600x1000 map) and loads tiles for that larger area: 20 z16 tiles at zoom 17 in scene small.
- `project()` = `viewport.project(loc, true)` + `.main-map` rect + the supersurface's layout offset (-50/-50). `project(getCamera())` is (800, 500), checked by `smoke.ts`. `getCamera()` is `viewport.centerLoc()` and `transform.zoom`; `setCamera()` is `map.setMapParams(loc, zoom, 0, 0)`.
- `locale=en` is forced in the fragment.

## settled()

How data reaches the screen:

1. `GraphicsSystem._tick` runs once per animation frame. A tick does DRAW (if `_drawPending`) or APP (if `_appPending` and the 250 ms `THROTTLE` has run down), never both. APP builds the scene (`PixiScene.render`), DRAW is `pixi.render()` followed by `emit('draw')`.
2. APP calls `OsmService.loadTiles`, which requests every z16 tile of the view that is neither completed nor in flight (`osm-data-tile-<id>` in NetworkSystem) and remembers the viewport version in `_tileCache.lastv`.
3. Fetch and parse run in a worker. The result comes back through a scheduler task of priority `normal`; only then does the request leave the in-flight map. Its callback runs `EditSystem.merge` (synchronous, emits `merge`) and `gfx.deferredRedraw()`.
4. Label text is rasterised by a scheduler task (`PixiLayerLabels._pendingRasters`) that then calls `immediateRedraw()`. Icons are rasterised through one `<img>` load each (`PixiTextures._svgIcons` holds `null` meanwhile) and then call `deferredRedraw()`.

`settled()` resolves when `blockers()` is empty on 2 animation frames in a row with no draw or merge between them. `blockers()` is empty when:

- gfx is started, pattern textures are loaded;
- `_appPending`, `_drawPending`, `_transformEase`, `_isTempTransformed` are all false, and the last DRAW used the current camera (`_prevTransform`);
- at zoom >= 15: `loadTiles` ran for the current viewport version, every tile it needs is completed, no `osm-data-tile` request is in flight;
- `worker.numPendingRequests` is 0;
- the scheduler's urgent and normal queues are empty;
- no label raster and no icon image is pending;
- the last `draw` came after the last `merge`, the last camera change and the last selection change.

It rejects after `timeoutMs` (default 60 s) with the list of remaining blockers.

`settled({ idle: true })` additionally waits for the scheduler's idle queue and its one-shot timers. Rapid validates merged data and re-renders panes there. This does not change the map. It was the default at first and is the reason the first benchmark run never saw less than ~1330 ms: several panes re-render on a 1 s throttle after every draw. It is now opt-in.

### Minimum wait, and why

After `setCamera()` over loaded data, `settled()` took 314 to 333 ms (small) and 338 to 466 ms (dense). That is: 250 ms throttle + 1 frame APP + 1 frame DRAW + 2 confirmation frames. Only the last 2 frames (33 ms) are our margin. The 250 ms are Rapid's: `setTransformAsync` sets `_appPending` but not `_timeToNextRender`, and the countdown only runs while an APP is pending, so every camera change waits a full 250 ms from the first pending frame. A user's drag or wheel takes the same path (`MapInteractionBehavior` -> `map.pan` / `map.transform`), so this is what a user gets; meanwhile Rapid moves the old picture with a CSS transform. `setCamera()` to the current camera settles in 32 ms.

### setCamera() once per frame, then settled()

Works. 90 frames of `setCamera()` (4 px each) ran in 1.5 s (small) and 2.3 s (dense); Rapid did 5 and 6 real redraws in that time and CSS-transformed the rest; `settled()` afterwards took 217 ms and 533 ms; the camera ended exactly where asked. A 60-frame zoom sweep 17 -> 18 plus settle took 1.5 s (small) and 3.9 s (dense). Note for frame-time measurements: during such a phase Rapid's frames are cheap except every ~300 ms, when APP and DRAW land (APP up to 0.4 s in small, 0.7 s in medium for a full rebuild after a zoom change).

`select()` enters `select-osm` and calls `gfx.immediateRedraw()` (as a click does), then resolves on the next `draw`: 43 to 96 ms in small, 220 to 310 ms in medium/dense.

## Where the start-up time goes

`__benchRapid.boot`, ms since navigation start, scene small, quiet machine:

| Step | at | 
| --- | --- |
| `js/rapid.min.js` (3.7 MB) loaded and evaluated | 150 |
| `prepareAsync` (construct everything) | 180 |
| `initAsync` (Pixi, presets, imagery index, styles, locales, sprites) | 735 |
| `startAsync` = `ready()` | 2300 |
| picture final = `settled()` | 3200 |
| `settled({ idle: true })` | 7950 |

- Nothing waits on a blocked request or a timeout. The stubs above resolve immediately.
- 1.5 to 2.5 s between `initAsync` and `startAsync` is `NsiService.startAsync` alone (loads and indexes the name-suggestion-index, 7 JSON files); with `?profile` every other system and service is started within ~0.1 s after `initAsync`. `ready()` cannot resolve earlier: `UrlHashSystem` applies `map=` only after `context.startAsync()` resolves; until then the map sits at zoom 1 and loads nothing.
- `?nsi=0` removes the service: ready 1.15 s, settled 2.4 s (small), 4.5 s (medium), 4.7 s (dense) in one run. Not the default, because Rapid always starts with it. Whether iD's host page waits for its NSI in the same way decides if this is a fair comparison; that is a decision for the benchmark, not made here.
- After the picture: validation in the idle queue, 4.7 s (small) to ~25 s (medium, dense). Validation is off by default now (see below); these numbers are from before, with it on.

## Measured: zoom 17, 1600x1000, headless Chrome, from navigation start (ms)

Validation was on in these runs (the default at the time, now `?validation=1`); the picture times are the same with it off, the idle times are not (see "Validation and background work").

Three runs each with the final page. The machine was shared with other benchmark processes for part of this; the dense rows 2 and 3 were quiet.

| Scene | ready | settled (picture) | settled({idle:true}) |
| --- | --- | --- | --- |
| small | 3916 / 3513 / 3542 | 4942 / 4594 / 4730 | 9722 / 9318 / 9476 |
| medium | 3303 / 3987 / 4083 | 6171 / 7595 / 7581 | 30765 / 31897 / 30689 |
| dense | 3433 / 2335 / 2313 | 6912 / 4935 / 4792 | 31340 / 29265 / 29183 |

Quiet-machine runs: small 2327 / 3199 / 7955, medium 2355 / 4674 / 27400. So ready-to-picture is about 0.9 to 1.2 s (small), 2.3 to 3.6 s (medium), 2.5 to 3.5 s (dense).

`stats()` at that point, scene small: 12196 nodes, 1914 ways, 67 relations; drawn `osm.polygons` 1175, `osm.lines` 562, `osm.points` 1120, `osm.vertices` 898, `osm.areaPins` 70, `labels.labels` 42; hidden `boundaries` 3. Dense: 61796 / 10275 / 177; polygons 2471, lines 2614, points 4741, vertices 5019, labels 57.

## stats()

- `entities`: ids in the staging graph (`base` plus local additions), by type.
- `drawn`: visible Pixi features attached to the scene, keyed `<layer>.<kind>`. One feature is one container; a way can have several, an area with a POI has a polygon and an `areaPins` entry. Kinds come from `instanceof Rapid.PixiFeaturePolygon/Line/Point`; `feature.type` is not reliable (undefined for some multipolygon parts). Points are split into `points` and `vertices` by `entity.geometry(graph)`, `midpoints` appear while something is selected.
- `hidden`: per switched-off filter, the entities in the scene it matches (`FilterSystem.getStats()`). Default: only `boundaries`.

## Timing hooks that work

- `performance.getEntriesByType('measure')` named `app-N` and `draw-N` (`__benchRapid.measures()`). Initial load of small: 4 APP + 4 DRAW, about 310 to 400 ms APP and 70 to 100 ms DRAW in total; medium and dense about 700 to 860 ms APP, 130 to 160 ms DRAW. DRAW measures the WebGL calls on the main thread, not GPU time.
- `context.systems.scheduler.metrics` (`__benchRapid.metrics()`): `avgFrameTime`, `avgRenderTime`, `avgIdleTime` are exponential averages (alpha 0.05), `droppedFrames` counts over the last 60 frames, `pressure` is none/light/moderate/heavy. Under moderate or heavy pressure the idle queue is not drained at all.
- Events used by the adapter: gfx `draw`, editor `merge`.

## Validation and background work

Validation is off by default. `?validation=1` keeps it on. `__benchRapid.validation` says which mode a page runs in, and `__benchRapid.issues()` counts the issues the validator holds (`getIssuesBySeverity({ what: 'all', where: 'all', includeIgnored: true, includeDisabledRules: true })`, `core/ValidationSystem.ts:429`).

How it is switched off (`bench.js`, after `context.initAsync()` and before `startAsync()`, so before any tile can merge; tiles load in APP, which needs the started graphics system). Rapid's listeners look the methods up on `this` at call time, so replacing them on the instance is enough:

- `validator._validateBaseEntitiesAsync`: the `merge` listener (`core/ValidationSystem.ts:180`). Merged entities go through `_validateEntitiesAsync` in chunks of 50, scheduled with `scheduleIdleTask` (line 838).
- `validator.validateAsync`: the `stablechange` listener (line 179), and the UI toggles of validators (lines 539, 553).
- `validator._validateEntitiesAsync` (line 760): the only job queue. The 5 s retry for provisional results (lines 812-815) and `revalidateUnsquare` go through it.

Not used: the `validator.disabledRules` setting. It only filters the results in `getIssues` (lines 327-328). `_validateEntity` (line 705) still runs every validator, so the work stays. (From reading the source, not measured.)

Measured on medium, zoom 17, final smoke run, headless Chrome, two runs each:

| | validation off (default) | validation on (`?validation=1`) |
| issues held by the validator, after `settled({ idle: true })` | 0 | 519 (1 error, 410 warnings, 108 suggestions) |
| `settled()`, picture final (ms) | 5824, 5637 | 5839, 5961 |
| `settled({ idle: true })` (ms) | 7374, 7236 | 28271, 33997 |
| drag frames: rAF interval median / max (ms) | 16.7 / 50.0, 16.7 / 50.0 | 16.7 / 66.7, 16.7 / 233.3 |

Scene small, validation off: picture 8884 ms, idle 10579 ms (a slow start on that run, ready at 5819 ms).

What runs after the picture is final, with validation off (medium, sampled every 100 ms with `__benchRapid.blockers()`): the picture was final at 4.6 s, the idle queue was empty at 6.2 s. Timers that fired in that window: `UiAttribution-render`, `urlhash-update-hash`, `UiContributors-render`, `UiFilterStatus-render`, `UiDrawModesTool-render`, `BackgroundList-mapDraw`, `OverlayList-mapDraw`. Each is a UI update, not a map change. `settled()` does not wait for them, so the benchmark numbers do not include them.

Background work that does not draw, and what was done with it:

| Work | Where | Trigger | Switched off? |
| --- | --- | --- | --- |
| Validation (merge, edit, retry) | `core/ValidationSystem.ts` 179-180, 760, 812-815 | every merge and edit, idle queue | Yes, off by default (`?validation=1` keeps it) |
| API status poll | `ui/UiApiStatus.ts:54` (1 s, rate-limit countdown), `:61` (90 s) | interval | Yes, `scheduler.cancel` in `bench.js`. Only the footer chip reads it; OsmService's rate limit is set only by HTTP 429, which the mock never sends |
| Attribution text | `ui/UiAttribution.ts:42`, `:49` | 400 ms throttle, every draw | No: it is visible text on the map, not the map data |
| URL hash update | `core/UrlHashSystem.ts:274` | 500 ms throttle, map moves | No: it is the URL, and it is cheap |
| Contributors, filter status, draw modes chips | `ui/UiContributors.ts:44`, `ui/UiFilterStatus.ts:47`, `ui/tools/UiDrawModesTool.ts:100` | 1 s, 1 s, 500 ms throttles | No: footer UI. Freezing it would show stale state |
| Background and overlay list panes | `ui/sections/UiSectionBackgroundList.ts:754`, `UiSectionOverlayList.ts:214` | 1 s throttle, every draw | No: the pane is hidden, but they are bound to `gfx` events and would need private handlers replaced |
| React sections | `ui/sections/react_container.jsx:37-47` | 1 s debounce, every draw, then idle | No: same reason |
| Validation panes and footer status | `UiSectionValidationStatus.ts:40`, `UiSectionValidationIssues.ts:60`, `UiValidatorStatus.ts:46` | `validated` events | Effectively yes: with validation off no `validated` event fires during a load |
| Scale bar, minimap | `ui/UiScale.ts:50`, `ui/UiMinimap.ts:453` | every draw | No: part of the map picture |
| Edit backup | `core/EditSystem.ts:1425` | 1 s debounce after an edit | No: only after edits, writes `localStorage` |
| Taginfo, Wikidata, Wikipedia | `services/TaginfoService.ts`, sidebar fields | on selection | Blocked by the offline guard in `bench.js` |

Rule for the table: only switch off what does not change the picture on the map. The rest is listed so that a later change can decide on it.

## Dragging a vertex

`smoke.ts` does this with the real mouse. It zooms to 18, presses on a vertex, moves 60 px in 20 steps (one animation frame per step), releases, waits for `settled()`, and checks that `nodeLoc()` moved the vertex by about 60 px on screen and that the map did not move. Result on every final run: 60.0 px, camera unchanged, both scenes.

What a real drag needs in browse mode (paths relative to `.reference/rapid/modules`):

- **Press target.** The Pixi hit test at pointerdown must return an `osm` layer point whose data is a node (`behaviors/DragBehavior.ts:123-140`). The press does not need a hover first: pressing right after the move, with no frame in between, started the drag on small (checked with a temporary script, removed).
- **Hit area.** A vertex's hit area is a square of about 14 px around its centre (`pixi/PixiFeaturePoint.ts:395-403`: at least 20 px, then 4 px padding). Press at `__bench.project(loc)`, which is the centre.
- **Which vertices can be pressed.** Only the ones drawn: at zoom >= 16 the "interesting" ones (tags, endpoint, intersection), plus those related to the selection or hover (`pixi/PixiLayerOsm.ts:606-626`). Other vertices have no hit area.
- **Hover draws more.** Hovering a way draws its other vertices, and those have hit areas too (observed in medium). At zoom 17 the picked vertex had neighbours 12 to 14 px away, one of them won the press, and the neighbour moved. So `smoke.ts` picks a vertex that has 15 px (max-norm, the hit square) of room from every node in view, and a spot 60 px to its right with the same room, at zoom 18. At zoom 17 no vertex in medium has that room.
- **Minimum movement.** 1 px for a mouse, 4 px for a pen (`behaviors/DragBehavior.ts:12-13`, `:180`). The drag starts on the first pointermove past that, and enters `drag-node` (`:178-229`).
- **Drop.** On pointerup, a node under the pointer is connected to the dragged node (`modes/DragNodeMode.ts:314-315`): the dragged node is merged away, `nodeLoc()` returns undefined, and the annotation reads "Connected a way to another". Within 6 px of a way the node snaps onto the way and stays (`modes/DragNodeMode.ts:238`, `:335`).
- **Hidden connections.** A node connected to a hidden feature cannot be dragged. Rapid flashes "connected to hidden" and does not enter the mode (`modes/DragNodeMode.ts:104-113`). Boundaries are hidden by default (15 entities in medium), so a boundary vertex is not draggable. The smoke pick does not check this; it would show up as no movement.
- **Pointer over the canvas.** The drag only runs while the pointer is over the renderer (`behaviors/DragBehavior.ts`, `_pointermove`). Playwright's mouse events are.
- **Frame times during the drag** (rAF in the page, medium and small, one run each): median 16.7 ms throughout; max 50 ms with validation off, 67 and 233 ms with it on. Single samples, so treat the maxima as indicative.

## Pitfalls

- The adapter reads protected fields (`_appPending`, `_drawPending`, `_prevTransform`, `_tileCache`, `_inflight`, scheduler queues, `_pendingRasters`, `_svgIcons`). The bundle does not mangle property names and the commit is pinned; a new pin needs a re-check of `blockers()`.
- `settled()` polls inside `requestAnimationFrame`. In a hidden tab rAF does not run and Rapid's whole loop stops; `settled()` then times out and says so.
- The scheduler's 1 s interval (`ui-check-rate-limit`) puts a task in the normal queue once a second. `blockers()` sampled at that instant shows `1 normal tasks queued`; `settled()` just takes one frame longer.
- Hover: a road's hit area is wider than its stroke and wins over a footway next to it; pins and vertices win over lines. In medium and dense the smoke test's hover therefore sometimes reports a node or a neighbouring way instead of the chosen way (checked for one case: target 0.1 px away, hovered road 6 px away). The smoke test only fails on an empty `hovered()`.
- `ready()` rejects (and `document.documentElement.dataset.benchError` is set) when the bundle is missing or Rapid's start-up fails.

## Not verified

- Behaviour under Rapid's own CSP page, headed mode timings, WebGPU/canvas renderers, device pixel ratio 2 (all runs were DPR 1).
- Validation on and off were compared on medium only (issue counts and idle times). Dense was not run with validation on or off, and the drag was not run on dense.
- The drag was not run with a hidden boundary vertex, with a pen, or in a headed browser. The frame-time maxima come from one or two runs.
- "Validation is off" means no validator job runs; that the `disabledRules` setting does not stop the work is from reading the source, not measured.
- That no code path at all can reach a remote host through an `<img>`, `<script>` or `<link>` element: the guard covers `fetch` paths only. With imagery, photo layers and Map3D off none was observed, and Playwright would block and report it.
