# Performance of Maid's load, 2026-10-13

How to read the numbers. Every number carries one of three marks:

- **quiet**: from `reports/2026-10-13-10-53-perf-baseline/` (3 repeats, medians, a quiet machine, Chrome 155, 1600x1000).
- **busy**: measured by me with the headless benchmarks (Bun, JavaScriptCore, not V8) while five other agents used the machine. Only the ratio between two states is meaningful, and only the "cold" figures (first run in a fresh process) look like a page load. They matched the browser's phase metrics well (dense cold total 253 to 308 ms against 235 ms in the browser).
- **inferred**: reasoned from code or from the three scenes, not measured.

No browser was started. Nothing in this document was verified in a browser.

## Baseline (quiet)

Medians, maid / iD / Rapid.

| Scene | ready (ms) | settled (ms) | load CPU (ms) | pan CPU per second (ms) | drag fps |
| --- | --- | --- | --- | --- | --- |
| small | 353 / 313 / 746 | 990 / 1309 / 1489 | 658 / 507 / 1297 | 155 / 253 / 204 | 59.9 / 59 / 59.3 |
| medium | 363 / n.a. / n.a. | 1691 / 2038 / 2915 | 1235 / 1226 / 2744 | 291 / 706 / 858 | 59.8 / 17.1 / 58 |
| dense | 327 / 359 / 855 | 1397 / 2570 / 3463 | 1106 / 1843 / 3199 | 285 / 828 / 877 | 60 / 7.5 / 59.8 |

Engine phases of Maid's load (`stats.metrics`, quiet, medians of 3 repeats):

| Scene | tiles | MB of JSON | fetchMs (sum over tiles) | parseMs | mergeMs | buildMs | pushMs | engine work (parse+merge+build+push) | load CPU |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| small | 6 | 3.7 | 501 | 6 | 24 | 105 | 3 | 138 | 658 |
| medium | 8 | 21.5 | 2261 | 43 | 91 | 137 | 4 | 275 | 1235 |
| dense | 9 | 8.8 | 1637 | 19 | 71 | 145 | 5 | 240 | 1106 |

## Where the load time goes

1. **"fetchMs" is not network time.** It is the sum over all tiles of the time from sending the request to the end of `res.text()`. It includes the wait for a slot in the gate (6 at a time for local hosts, `packages/core/src/fetching/services.ts`; dense asks for 9 tiles), and the time a finished response waits behind the main thread, which is busy with the earlier tiles. The mock API is not the reason: building all the tile bodies of the dense view takes 62 ms in total (busy, `serverStringifyAllTilesMs` in `bench-load`), and the second and third repeat read it from the server's cache. The sum of 1.6 s over 9 tiles is mostly queueing. Tiles are asked in parallel, nothing waits for all tiles before the first push (8 `updateData` calls for 9 tiles, the 150 ms flush timer only holds tiles that are still on their way).
2. **The engine's own work is 140 to 275 ms of 660 to 1235 ms CPU (quiet).** The rest is outside the engine: start-up JavaScript, MapLibre's main-thread work, and the images (see 3).
3. **The marker images are the biggest piece that is not the engine (inferred).** `prepare` in `MapView.handleLoad` makes one image per distinct pin and per distinct vertex icon: a data-URL SVG, `Image.decode()`, a canvas, `getImageData`/`createImageBitmap`, in `packages/shell/src/images.ts`. The first view needs **118 images on small, 264 on dense, 278 on medium** (busy, `bench-load`: 98/218/230 pins and 20/46/48 vertex icons). Across the three scenes the load CPU not explained by the engine grows with that count at about 2 ms per image (small 658 - 138 = 520, dense 1106 - 240 = 866, medium 1235 - 275 = 960; per image 4.4, 3.3, 3.5 ms including the common start-up), so images are roughly 250 to 550 ms of the load CPU. This is a three-point fit with the start-up cost mixed in: **treat it as a lead, not a result**. iD draws icons as DOM `use` elements and has none of this; this is the most likely reason iD's load CPU on small (507 ms) is under Maid's (658 ms). **83 percent of these images are pins, and the pin layer starts at MapLibre zoom 17.5 (`PIN_ZOOM`); the dense and medium scenes start at 16**, so the images that cost most are for layers that are not drawn when the picture is complete.
4. **Medium is slower than dense because it sends 2.4 times the bytes.** 21.5 MB against 8.8 MB although it holds fewer entities (27,518 nodes against 39,790): neighbouring tiles repeat the nodes of every way that crosses a tile edge, and the inner-city nodes carry long tags. That costs parse (43 against 19 ms), merge (91 against 71 ms), text decoding of 2.7 MB strings and garbage collection, together about 130 ms of CPU and about 300 ms of settle time (quiet). Medium's build is as fast as dense's. It is a property of the data and of z16 tiles, which iD asks for in the same way.
5. **Between ready and settled** (quiet: about 1000 ms on dense): tile responses queue on the main thread; each tile is parsed, merged, built; each push is followed by MapLibre's worker re-tiling that source and the main thread placing symbols; `settled()` then waits for MapLibre's `idle` (fades of symbols included). `settled` uses 250 ms and 2000 ms timers as a safety net, which do not add to a normal run.
6. **The build phase was dominated by one library call (measured, busy).** `presets.match` asks `matchesLocation` for presets with a location set. The first set that was asked for, `{include: ['Q46']}` (Europe), made location-conflation sum up the area of the set while registering it, which is a polygon union of all member countries with polygon-clipping on BigNumber. A cold profile of the dense load (Bun, `--cpu-prof`) put **144 ms of 295 ms of `FeatureBuilder.build` there**, and 88 ms of it was this one set. The small scene's `buildMs` in the browser (105 ms quiet) is the same cost: the cold build of small in Bun is 175 ms before and 21 ms after the fix.

## Bottlenecks, biggest first

### A. Marker images made before the picture is complete (not changed, outside my files)

- Evidence: point 3 above (inferred from the counts and the three scenes), and the code in `packages/shell/src/images.ts` and `MapView.handleLoad`.
- Not fixed because: the files are outside the list I was allowed to edit (`packages/shell/src/images.ts`, `MapView.tsx`), and any fix changes when pins appear after a zoom-in, which only a browser can judge (the benchmark's zoom-in phase would show a regression if the pins are made late and in one go).
- Options, in order of how much they keep behaviour:
  1. Make fewer images before the picture is complete: skip `pin-*` for points while the map zoom is below `floor(PIN_ZOOM)` (the pin layer is not built for tiles below that zoom; `map.getLayer('point-pin').minzoom` says when), and make them in small slices in idle time after `settled`, all of them before the user can zoom in. Needs a drain that finishes before the zoom or runs at once on `zoomstart`.
  2. Make each image cheaper: one `getImageData` per pin forces a GPU read-back; draw the pin shape and the icon into one `OffscreenCanvas` and use `createImageBitmap` (no read-back); decode each icon once and share it between `pin-x` and `icon-x`.
  3. Draw the pin shape with a MapLibre layer (a circle or an SDF) and put only the icon in the symbol, so no pin canvas is made.
- Expected gain: up to the 250 to 550 ms CPU estimated above on dense and medium, and about 100 to 240 ms on small, which is where iD is ahead.

### B. Location sets registered with their polygon union (fixed)

- Change: `packages/presets/src/locations.ts`. A location set whose members are all country-coder regions is answered from `wikidataQIDs(point)` (the regions at the point and every group that contains it) without registering it in location-conflation. That is exactly what `LocationConflation.locationSetsAt` does itself (it never reads a polygon, only the inverted index and country-coder's `featuresContaining`); only the registration summed up areas. The rules copied from it: the world on its own (`+[Q2]`) holds at every valid point and nowhere else is the world special; a point that is not a valid longitude and latitude, a set with a geojson, a point with a radius or a code country-coder does not know goes to the engine as before.
- Test: `packages/presets/src/locations.test.ts` compares the new answer with location-conflation's for the 46 distinct location sets in the bundled presets and fields (and 8 more shapes) at about 2,800 points: a lattice over the world plus the Canary Islands, Melilla, Puerto Rico, Jersey, the Isle of Man, the Vatican, Reunion, French Guiana, Alaska, Hawaii and other places where groups differ from their countries. No difference. (A first version that treated the world as holding the sea in every set differed from location-conflation in the sea, which the test caught.)
- Before and after (busy, Bun, `bun run bench-load`, cold first run, ratio): dense `build` 152 / 180 / 182 ms to 75 / 85 / 72 ms; small `build` 179 / 354 / 174 ms to 22 / 22 / 21 ms. Warm medians barely change (the registration is paid once).
- Expected in the browser (inferred): about 80 to 100 ms less main-thread time in the first tile that has a Europe-set preset, on every scene, earlier first features. Small load CPU 658 to about 570 ms, dense 1106 to about 1010 ms.
- Risk for browser checks: none for drawn features; the answers are the same for the fixtures.

### C. Entities copied twice on load (fixed)

- Change: `packages/model/src/util/clone.ts` (`ownNextProps` / `takeOwnedProps`), `data/AbstractData.ts`, `data/fromOsmJson.ts`. `entitiesFromOsmJson` builds a fresh props object per element and `AbstractData` then deep-copied it (`cloneData`) and assigned it again. The new entity takes the object when the caller says it gives it up. The tags object is now the one from the parsed JSON (entities are immutable; nothing writes into `props.tags`). Noted in `packages/model/README.md`.
- Before and after (busy, noisy, minimum over 5 alternating runs, warm median of `merge` over 12 dense tiles): 72.9 ms to 57.4 ms (0.79). Cold-run merge about 85 ms in both (noise was larger than the difference there).
- Expected in the browser (inferred): 10 to 20 percent of `mergeMs` (71 ms dense quiet), so 7 to 15 ms.
- Risk: a caller that merges the same JSON elements twice and mutates `el.tags` in between would see the change. Nothing in the repo does; `bun test packages/model packages/renderer packages/journal` pass.

### D. Areas and lines waited for the marker images (fixed, small)

- Change: `packages/renderer/src/engine.ts` `merge`. With `options.prepare` set, areas and lines are pushed at once; points and vertices still wait for their images. (Finding 7 of `review-performance.md`.)
- Not measurable headless. Effect (inferred): streets and buildings of the first tile appear earlier by the time of the sprite download, parse and the first tile's images; `settled` changes little because points and vertices still gate it.
- Risk for browser checks: a vertex arrives after its line. `check-render` compares after `settled()`, which counts `preparing`.

### E. Not fixed

- **Layers (114).** MapLibre skips a layer outside its zoom range in the painter (`isHidden` in `render/painter.ts`: lines 331, 359, 376, 458), so the 34 selection twins above the floor zoom and the empty edit twins cost no draw work. What every layer does cost is `Style.update` (`style/style.ts` 770 to 780): on every `zoom` event and every `sourcedata` of type style it calls `recalculate` for all 114 layers, hidden or not, and walks every layer to mark its source "used". Removing the 38 edit twins and 34 select twins would make that loop 60 percent shorter, but I could not measure what it costs per frame (inferred: tens of microseconds per layer, so a few ms per zoom frame; zoom frames are at the 60 fps cap with p95 16.7 ms in the quiet run). Adding twins only on demand changes layer order handling in `OsmLayers`/`buildLayers` and the browser checks compare drawn features and sources; not done without a way to measure.
- **Per-edit path.** `bun run bench-edit-path` (new, `packages/renderer/bench/edit.bench.ts`): one node move through `history.perform` plus the rebuild of its vertex and its three ways takes **0.02 ms** (busy, median of 300 steps). A vertex drag is not limited by the model or the builder; its cost is MapLibre's `updateData`. Nothing to fix.
- **Bundle.** `apps/maid/dist/assets/index-*.js` is **4.35 MB (1.27 MB gzip), one chunk**: the entry `main.tsx` imports `mountEditor` statically, and `mount.tsx` has no dynamic import of the shell (the lazy chunk named in the brief is not in the tree at f488630, so there is no round trip to remove with a `modulepreload`). By size (source-map attribution, input to output bytes): MapLibre 980 kB, the tagging schema data about 710 kB (shown under `journal.ts` and `style/resolve.ts` in the map, the attribution is off), country-coder 596 kB, react-dom 203 kB, zod 93, dexie 93, motion 123 (motion-dom, framer-motion), aes-js 43, the rest small. Which of it is needed before the first paint is a design question: the sync API of `matchesLocation` and `countryAt` needs country-coder at the first match, so it can only move after the first paint if those become asynchronous. Module evaluation measured in Bun (not V8): `maid-presets/default` 73 ms (JSON 12 ms, `createPresets` 19 ms, the rest is import), model 25, renderer 31, operations 18, country-coder 14.5 inside the profile. Not changed.
- **JSON parse off the main thread.** parseMs is 19 to 43 ms; moving it to a worker costs a structured clone back (more than the parse). Not worth it.
- **Zooming out** was not looked at, as agreed.

## What the quiet-machine run must confirm

Run `bun run --cwd apps/maid build` first (the benchmark serves the build), then `bun run bench --editor maid --repeat 3 --label perf-after`, and compare with `perf-baseline`:

1. Small and dense `buildMs` in `stats.metrics`: small 105 to about 20 ms, dense 145 to about 70 ms (B). If it does not drop, the Europe set is not the cause in V8.
2. Load CPU and `readyMs` on small (658 to about 570) and dense (1106 to about 1010) (B, C).
3. `mergeMs` dense 71 to about 60 (C).
4. `check-render` for all scenes, and `check-edit`, `check-ops`, `check-undo` (the model change touches every entity).
5. The first-tile look (D): in a screenshot at 300 ms, streets and buildings before the pins and vertices.
6. Nothing in pan, zoom, hover or drag moved (those phases do not run this code); a change there means the machine was not quiet.

## Next candidates, biggest expected gain first

1. **A (marker images).** Up to 250 to 550 ms CPU on dense and medium, 100 to 240 ms on small (inferred). Measure first: one run with a profile of the load (`Performance.enable` task duration around `ensureImages`, or `performance.mark` in `images.ts`) to replace the three-point fit with a number. Needs a browser.
2. **Start-up JavaScript.** 4.35 MB in one chunk. Split the app config's heavy modules (journal/Dexie, validation rules, street imagery, imagery panel, data layers, notes, the inspector fields) behind `import()` so they load after `ready`. Needs a measurement of how much of the 327 ms to `ready` is evaluation; nothing here could measure it.
3. **Medium's duplicate bytes.** Skip entities that are already loaded before they are parsed (not possible with `JSON.parse`), or ask for larger tiles when the view is large; both change how the data is asked and compared with iD. Expected 100 to 300 ms on medium only.
4. **Layers.** Add the edit twins when the first edit starts and the select twins when something is selected or the zoom is below a floor; saves part of a per-zoom-frame loop of 114 layers. Needs a per-frame measurement first.
5. **Findings 9 to 14 of `review-performance.md`** (snap query per pointer event, hover pick while panning, highlight source on a vertex drag, `useEngine` renders, `_emitChanges`, live-tier tiles after a pan) are about interaction and long sessions, not load.

## Marker images on demand

Written with finding A in mind. Nothing here is verified in a browser: the counts are from the layer rules and one headless run of the bench, the timings are inferred.

### Design chosen: a missing-image resolver (preference a)

The shell makes no image up front. `installMarkerImages(map)` (`packages/shell/src/images.ts`) calls `map.setMissingStyleImageResolver`, and MapLibre asks for each `pin-*`, `icon-*` and the address plaque when a tile needs it. Read in `node_modules/maplibre-gl` 6.12 (`dist/maplibre-gl-dev.mjs`, `maplibre-gl.d.ts`):

- `ImageManager._getImagesForIds` awaits the resolver for every id it does not have, and only then builds the response. The `styleimagemissing` event fires for ids still missing afterwards. `maplibre-gl.d.ts` says event listeners cannot resolve the image of the current request, so the event would only add it to a later layout. The resolver is the only route that gets an image into a tile's first layout.
- The worker lays out a layer only where `!layer.isHidden(tileZoom, true)` (`maplibre-gl-worker-dev.mjs`, `WorkerTile`): the tile's zoom must reach `floor(minzoom)`. It asks for the icon of every feature the layer's filter lets through, whatever the paint says (`iconDependencies`, `SymbolBucket.populate`): a feature-state opacity of 0 does not stop the request.
- `Style.getImages` awaits `imageManager.getImages` and then records the tile's icon dependencies. An image added later goes through `Style.addImage` and `_afterImageUpdated`, and `reloadTilesForDependencies` re-lays out only the tiles that asked for it: a late image costs a second layout of those tiles, which the resolver avoids.
- `addImage` with an `HTMLImageElement` or `ImageBitmap` makes MapLibre draw it and read it back itself (`browser.getImageData`). With `ImageData` it takes the pixels as they are. The old `addIcon` passed an `ImageBitmap`, so each vertex icon was drawn twice.
- A tile that is still waiting for its image is not loaded (`TileManager.loaded()`: any in-view tile not in state `loaded` or `errored`), so `Style.loaded()` and `map.loaded()` stay false. `Engine.settled()` checks `map.loaded()` after `idle` and loops, so it does not report settled while the current view's images are being made. The engine's `preparing` counter is now always 0 (the shell does not pass `prepare`); settled rests on MapLibre's own loaded state.

Why not the alternatives: a placeholder plus `updateImage` (a) would need a second layout of every tile that drew the placeholder; zoom lists (b) duplicate MapLibre's rule, which the worker already applies, and need a tile reload when a pin appears at its zoom.

### What changed

- `packages/shell/src/images.ts`: `ensureImages` is replaced by `installMarkerImages`. Ids that are not markers (the direction arrows, the parking arrow) are left to their own `styleimagemissing` handlers. Decoded icons are cached per icon and size, so a pin and the bare icon of one preset share one decode; a failed decode is dropped from the cache. One scratch canvas with `willReadFrequently` draws and reads back each image in one synchronous run. Ids, sizes, pixel ratio 2, plaque stretch and the drawing code are unchanged.
- `packages/shell/src/components/MapView.tsx` `handleLoad`: installs the resolver; no `prepare`.
- `packages/renderer/src/icon-requests.ts` (new, exported): `iconImagesRequestedAt(layers, tileZoom)` applies the worker's rule to the layers `buildLayers` returns. Used by the tests and the bench.
- `packages/renderer/src/engine.ts` is unchanged. `prepare` stays an optional hook that the shell no longer uses (a candidate for removal).
- Tests: `packages/shell/src/images.test.ts` (id parsing, sprite lookup, which icons a zoom requests, the resolver ignores other ids). Pixel creation needs a canvas and is not unit-tested.

### Numbers

Counts come from `bun packages/renderer/bench/load.bench.ts --scene <s> --runs 1` (one run, counts only, the timings of that run are not used). "All" is what the shell made before this change; "needed at opening zoom" is what the layer rule says MapLibre asks for when the first view is laid out at the floor of the scene's MapLibre zoom.

| Scene | opening zoom | all, before (pins / vertex icons) | needed at opening zoom, after | pin layer alone |
| --- | --- | --- | --- | --- |
| small | 17 | 118 (98 / 20) | 118 | 118 |
| medium | 16 | 278 (230 / 48) | 278 | 48 |
| dense | 16 | 264 (218 / 46) | 264 | 46 |

"Pin layer alone" is the same rule with `active-point-pin` left out. It shows the problem below.

### Finding: the on-demand count at the opening zoom does not drop

- `active-point-pin` has no minzoom of its own, so `floorOf` gives it the symbol floor of 15. Its `icon-image` is `pin-<icon>` for every non-address point, and its hover and selection state only changes the opacity. So MapLibre asks for every point's pin from tile zoom 15, and on dense and medium (opening at 16) that is all 218 and 230 pins. The pin layer proper (`point-pin`, floor 17) asks for none at 16.
- On small (opening at 17) `point-pin` asks for the pins from tile zoom 17, but the layer draws only from map zoom 17.5. The worker rounds the minzoom down, so the pins of [17, 17.5) are requested while not drawn.
- So the premise of finding A holds for `point-pin` only. The image count at the opening view is unchanged. What is left is the per-image cost (inferred below).

To cut the count, two options, neither done here (both change the renderer's layers and need a browser to check):

1. **Only active points get a pin request.** Give hovered and selected points their own source (the engine already keeps selection copies in the select source) so that `active-point-pin` asks for a few pins, not all of them. Expected on dense and medium at the opening zoom: 264 to about 46 and 278 to about 48 (counts from the table; inferred that nothing else asks for those pins).
2. **A zoom gate for pins below `PIN_ZOOM`.** The resolver could decline `pin-*` below 17.5 and add them when the zoom crosses it. Declined ids warn in MapLibre, and the late image reloads the tiles that asked, so the pins arrive with a re-layout at the crossing. That is the flicker to avoid; measure before choosing it.

### Inferred cost per image (not measured)

- No `getImageData` on a GPU-backed canvas per pin: one reused canvas with `willReadFrequently` (MapLibre's own helper uses `OffscreenCanvas` with the same flag, for the same reason).
- Vertex icons: one read-back instead of a `createImageBitmap` plus MapLibre's read-back.
- The decode of each icon is unchanged for the pin (one per preset icon).

### Risks

- **Browser checks.** Ids, sizes and drawn features are the same. A tile's symbols are laid out after its images, so the first pins come with the tile, not before it. `check-render` and `check-edit` compare after `settled()`, which waits for the tiles. A new preset on a point gets its image on the re-layout of its tile.
- **Flicker.** None expected: a tile is not drawn until its images are in. A tile whose image cannot be made is drawn without it, as before (MapLibre warns once).
- **Style reload** drops images; the resolver makes them again on demand.
- **Chrome.** MapLibre's comment warns that a GPU-backed `ImageBitmap` drawn into a `willReadFrequently` document canvas stalls the main thread. The shell now draws a decoded `Image` into such a canvas. Measure in the quiet run.

### What the quiet-machine run must confirm

1. The image count, not the timing: after `settled()` in the browser, `window.__maid.map.listImages()` filtered to `pin-` and `icon-` should match the "needed at opening zoom" column (small 118, medium 278, dense 264) and no more. A larger number means MapLibre asked for images the layer rule does not predict: the rule is wrong, fix it before reading any timing.
2. Load CPU and `readyMs` on the three scenes against `perf-baseline`. Expected: only the per-image part moves, so a fall of 250 to 550 ms (finding A) would mean the counts are not what the table says. Expected small change at most.
3. `settled` honesty: the screenshot at the end of `settled()` shows all pins and vertex icons of the first view.
4. `check-render`, `check-edit`, `check-ops`, `check-undo` and `check-journal` pass (new icons after an edit, journal restore).
5. Pan, zoom and hover unchanged (no code on those paths changed).

## Pins only where drawn

Option 1 of the finding above, done: only the hovered and selected points get a pin request. Option 2 (a zoom gate) was not done. Point B of the finding (the pin layer's layout floor) was not changed, see below. Counts are from the layer rules and the headless bench (`bun packages/renderer/bench/load.bench.ts --scene <s> --runs 1`). Nothing here is verified in a browser.

### What changed

- `active-point-pin` draws from its own source, `osm-points-active` (`ACTIVE_SOURCE` in `packages/renderer/src/layers.ts`). The source holds copies of the hovered point and of the selected points: a few features at most. The layer has no feature state and no `--edit` or `--select` twin (`buildLayers` skips the twins for that source). It keeps its floor (15), its icons, its filter (`!has addr`) and its hidden state in selection-only mode. It is still not in `interactiveLayerIds`, as before, so a press never picks it.
- The engine keeps the source (`packages/renderer/src/engine.ts`): `syncActive` on each hover and selection change (`setHover`, `setSelected`); `pushActive` on each batch that arrives or changes, so a selected point follows its preset, an edit, a drag step, undo and redo, and a point that loads later; `removeFeatures` for deleted ids and ids that became vertices; `rebuildAll` and `attach`. The whole set goes to the source with `setData` on each change (`flushActive`). `activePinIds` (layers.ts) is the pure part: the hovered and selected node ids, each once, no ways.
- Below the floor the selected pins are drawn by the `point-pin--select` twin, as before. The `active-point-pin--select` twin drew the same pins a second time below 15 with the same look; it is gone.
- `iconImagesRequestedAt` (`icon-requests.ts`) leaves the active source out, as it leaves out the edit and selection twins: the pins of those few points are asked for when they are shown, and none at the opening view.
- Tests: `layers.test.ts` (the active layer's source, filter, no feature state, floor, no twins, not picked, selection-only, no icons, `activePinIds`) and `icon-requests.test.ts` (the pin request starts at zoom 17, none at 11 to 16; vertex icons from 16). Both files: 28 pass.

### Numbers (images needed at the opening view, the bench's `neededAtOpeningZoom`)

| Scene | opening zoom | before | after | what is left |
| --- | --- | --- | --- | --- |
| small | 17 | 118 (98 pins, 20 vertex icons) | 118 (98 pins, 20 vertex icons) | all pins: point B |
| medium | 16 | 278 (230 pins, 48 vertex icons) | 48 (0 pins, 48 vertex icons) | vertex icons only |
| dense | 16 | 264 (218 pins, 46 vertex icons) | 46 (0 pins, 46 vertex icons) | vertex icons only |

The "before" column is the number the previous section recorded. What each image costs is inferred, not measured here; the quiet run measures it.

### B: the pin layer's layout floor, left as it is

`point-pin` has minzoom 17.5. The worker lays a layer out from `floor(minzoom)`, so a tile at zoom 17 asks for every pin. At opening zoom 17 (small) the 98 pins are requested while no pin is drawn yet (they appear from 17.5). Options checked:

- minzoom 18, or the pins faded in from 18: changes when pins appear. Not acceptable without Tobias.
- minzoom 17 with the opacity ramped from 17.5: still laid out, still requested at tile zoom 17. No gain.
- a zoom step in `icon-image`: the worker evaluates layout properties at the integer tile zoom, so the image cannot switch at 17.5 without re-laying out the tile.

So nothing clean exists and the layer is unchanged. What a person sees does not differ. Only the creation of the small scene's pin images at load happens earlier than they are drawn.

**Superseded (later the same day):** Tobias decided pins from zoom 18 (`PIN_ZOOM = 18`, see "Layers that take part in a zoom frame" below). The pin layer now starts at 18, so a tile at 17 asks for no pin.

### What the quiet run must confirm (browser, not run here)

1. After `settled()` at the opening view, the `pin-` and `icon-` images in `window.__maid.map.listImages()` match the table: medium and dense have no `pin-` image at zoom 16, small has 98 at zoom 17.
2. Hover a point at MapLibre zoom 16: its pin appears within a frame or two and goes when the hover leaves. Select it: the pin stays. Hover it while selected: one pin.
3. Drag the selected point: its pin follows the drag and stays where it is dropped. Undo: the pin goes back.
4. Change the preset of a selected point: the pin takes the new icon.
5. Zoom out below MapLibre 11 with a point selected: its pin is drawn. Hover at zoom 14: no pin (as before).
6. Selection-only mode: hovered points show no pin, selected ones do.
7. `check-edit`, `check-interactions`, `check-undo`, `check-render` and `check-ops` pass (exit code 0 and the expected `ok` lines).
8. Load CPU and `readyMs` on medium and dense against `perf-baseline`: the per-image part should fall (230 and 218 pin images fewer at load). A larger fall than the table implies would mean the counts differ.

### Unsure

- The hover latency is not measured. A `setData` of a few features should show within a frame or two, but the worker round trip is asynchronous, so the pin can lag `hovered()` by one render.
- `settled()` waits for `map.loaded()`, and a `setData` on the active source makes that source load briefly. Not expected to matter, but check that `settled()` returns after a hover.
- The copies come from the same builder as the data (`redraw`), so their properties match; this is by reading the code, not by a browser run.

## Benchmarks added

| Script | File | Writes | What it times |
| --- | --- | --- | --- |
| `bun run bench-load [--scene dense\|medium\|small] [--runs 7]` | `packages/renderer/bench/load.bench.ts` | `reports/renderer-load-bench-<scene>.json` | the tiles of the benchmark's first view: JSON parse, `OsmData.merge`, `FeatureBuilder.build`, push bookkeeping; first (cold) run and warm medians; counts the images the first view needs |
| `bun run bench-build` | `packages/renderer/bench/build.bench.ts` (existing) | `reports/renderer-build-bench.json` | the builder over the whole dense fixture, warm |
| `bun run bench-edit-path [--steps 300]` | `packages/renderer/bench/edit.bench.ts` | `reports/renderer-edit-bench-<scene>.json` | one node move: `history.perform` and the rebuild of the vertex and its ways |

`bench-load` imports `tools/mock-osm-api/server.ts` for the tile bodies; no server is started and nothing is fetched. To profile a phase: `bun --cpu-prof --cpu-prof-dir <dir> packages/renderer/bench/load.bench.ts --runs 1`.

## A run that did not finish

One of 17 runs of the dense scene after d1158bc (`reports/bench-after.log` line 161: `dense maid #0`, "run did not finish within 5 minutes"). Its `load` result was never written (`load undefinedms`), so the stall was in the load phase: `page.goto`, `waitForFunction` (60 s), `ready()`, or the first `settled()`. The other 16 runs were normal. It did not come back in 8 further runs. This section is a reading of the code, with the hardening that goes with it. Nothing was run in a browser; the orchestrator runs `bun run bench`.

### What the reading shows

**The image path cannot hang by itself.** Every await in it, and what settles it now:

| Await | Before | Now |
| --- | --- | --- |
| MapLibre `ImageManager._getImagesForIds`: `await Promise.allSettled(resolver(id))` (maplibre-gl-dev.mjs, around line 1078) | waits for each resolver; a resolver that never settles keeps the tile from loading | MapLibre's side is unchanged; every resolver promise now settles (below) |
| resolver `await job` (images.ts `installMarkerImages`) | the job could be pending for ever | the job is `addMarker(...)` wrapped in `.catch` (records the failure, warns once) and `.finally` (leaves `making`); it settles within `MARKER_LIMIT_MS` (5 s) |
| `addMarker`: `await makeMarker(...)` | no limit | `within(makeMarker(...), limitMs)`; the image is added only if the limit has not won, so a late result is dropped |
| `makePin` / `makeBareIcon`: `await decodeIcon(...)` | the cache held the pending promise for ever | `within(...)` on the decode; a failed or late decode is dropped from the cache (`icons`) |
| `makeIconImage`: `await loadSprite(...)` | the sprite fetch had no limit; a failed fetch stayed cached | `within(...)` on the fetch chain; a failed or late sprite is dropped from `sprites` |
| `makeIconImage`: `await image.decode()` | a second promise, no limit | replaced by `onload`/`onerror` (`loadDataImage`); a loaded image is decoded when the canvas draws it |
| the resolver's synchronous part (`parseMarkerImage`, `map.hasImage`, the job set-up) | a throw became a rejection that MapLibre only logs | inside `try`; a throw is recorded as a failure and the resolver resolves |

Before the change, the only way the resolver could leave a tile waiting for ever was a `decode()` or a sprite `fetch` that never settled. Both are now limited. None of this is confirmed as the cause of the run.

**The engine's `settled()` cannot hang.** Each iteration waits at most 250 ms (`waiters` plus a timer) or 2 s (`nextIdle`), and the deadline (60 s) is checked at the top of each iteration, so the call returns or throws within about 62 s. A `setData` in flight or a stuck channel makes it throw `Maid did not settle`, not hang. `once('idle')` cannot be missed: the listener is registered before `triggerRepaint()`, and the 2 s timer covers a frame that does not come. The `preparing` counter is always 0 because `setEngineHooks` passes no `prepare` (MapView.tsx, `handleLoad`), so the split push in `merge` (suspect 3) is inert in Maid: the `else` branch pushes the whole batch.

**A 5-minute stall in load needs an unbounded await, and the image path is bounded.** The `settled()` of the load phase can take at most about 62 s, so it would have failed with `Maid did not settle`, which the run records as FAILED with that text, not as "did not finish". The text in the log is the runner's 5-minute race. So the stall was a call the runner waits on with no limit:
- Playwright `page.evaluate` and `page.mouse` / `page.keyboard` calls have no timeout (`page.setDefaultTimeout` does not apply to them). They answer only if the renderer's main thread runs. A renderer that stops running timers answers none of them, and then `settled()` (whose waits are timers) does not return either.
- In the harness, `window.__bench.select` (bench.ts) waited on a `requestAnimationFrame` loop with no limit. That is not in the load phase, so it does not explain this run, but it is the one unbounded page-side wait that a rendering problem could cause (see below).
- `hoverLatency` in `tools/bench/probe-page.ts` resolves only after a `pointermove`; no limit before the first one. Not in the load phase; not changed (outside the allowed files).

**No cause found by reading.** The image path can make a load fail in 60 s, not hang for 5 minutes. A renderer that stopped answering, a run that was slow on a busy machine (several `settled()` calls of up to 60 s each in one run), and a frame that threw in the render path are all consistent with the log. Nothing here distinguishes them. The render path is the one I could not rule out: `applyHighlight` (engine.ts) sets `shownSelected` only in `map.once('render')`, and a frame that throws never fires it, so the bench's selection wait would stay pending (the page error goes only to the run's error list at the end, never awaited).

### What is hardened

- `images.ts`: every step of a marker image is limited (`MARKER_LIMIT_MS` 5 s, via `within`); a failure or a late result is dropped from the caches; `onload`/`onerror` replace `decode()`; the resolver never rejects and never throws; an id that failed is warned once (`console.warn`) and not asked again in the session (`failed`). The resolver resolves `undefined` for it, which MapLibre draws without the image, as before. A failed image is not silent: `markerImageState()` lists it, and the bench fails the run (below). Unit tests in `images.test.ts` cover: a decode that never settles (resolves through the limit, warns once), an `onerror`, a synchronous throw (in the canvas and in the map's lookup), two requests for one id (one creation, both settle), and a result that comes after the limit (not added).
- `engine.ts`: `settled()` waits on the next `idle` through `on`/`off` (the listener is removed when the timer wins, no longer left behind), and its deadline error carries the state (`debugState()`). No wait became unbounded and no wait was shortened: the picture is still final only when nothing is in flight, nothing is queued, the map is loaded and not moving, and a frame has been drawn.
- `bench.ts`: `select` fails after 10 s with the state when the selection is not drawn, instead of waiting for ever. `window.__maid.debug()` returns the map state (`loaded`, `areTilesLoaded`, `moving`, `zoom`), `engine.debugState()`, and `markerImageState()`.
- `tools/bench/run.ts`: each phase (load, pan, zoom, hover, select, drag) has a limit of 60 s (`PHASE_LIMIT_MS`). When it runs over, the runner asks the page for `__maid.debug()` (bounded to 5 s), takes `stuck-<editor>-<variant>-<scene>-<repeat>.png` (bounded), records the phase, the page state and the page's console warnings and errors (last 30) in `result.stuck`, prints one line, and closes the context so the waiting call fails. The run keeps the 5-minute limit (`RUN_LIMIT_MS`) as a backstop; when it fires, the runner now closes the open context and names the last phase in the error (the text starts the same, `run did not finish within 5 minutes (last phase: ...)`). A Maid run also fails when the editor reports marker images it could not draw (`result.imageFailures`), with the ids and reasons in the error.

### What the next hang will print

- `results.json`, the run: `error` says `phase "<name>" did not finish within 60 s` (or `run did not finish within 5 minutes (last phase: <name>)`), `stuck.phase`, `stuck.page` (the map, the engine's counters and channels, tile counts, `shown` and `selection`, the marker images' pending and failed ids), `stuck.console` (MapLibre and editor warnings).
- The log: one line `phase "<name>" did not finish within 60 s; page: {...}`.
- A screenshot `reports/<run-id>/stuck-maid-<variant>-<scene>-<repeat>.png`.
- A `select` that is not drawn: `the selection of <id> was not drawn within 10000 ms: {...}`.
- A load settle that does not come: `Maid did not settle in 60000ms: {...}`, with the same state.
- Run with `BENCH_DEBUG=1` to print each phase as it starts.

### The hover-phase hang (found 2026-10-13, evening)

**Cause: the probe, not the editor.** In the hover phase `run.ts` did `const latency = page.evaluate(() => __probe.hoverLatency())` and then, without waiting, `page.mouse.move(...)`. The evaluate (which registers the `pointermove` listener and reads `before = hovered()`) and the mouse move reach the page on separate paths. When the page's main thread is busy, the move is handled first: Maid shows the hover (`shown.hovered` = the node), and only then the listener is registered and `before` already holds that node. No further `pointermove` comes, so `hoverLatency` waited for ever (its 2 s timeout started only after a pointer move). That is exactly the recorded state: the editor idle and consistent, a node shown as hovered, the selection left by an earlier phase, nothing pending.

**Reproduced** with `bun tools/bench/hover-probe.ts dense N [port]` (hovers real targets found with the mouse, with and without a selection, parked pointer between): the old arm-then-move order without waiting (`RACY=1`) lost the move 3 times in 300 hovers; every case had a hover that did not clear within the park wait, i.e. a busy page. With the arm awaited first: 0 in 500. The full `bun run bench --editor maid --scene dense --repeat 6` also hung once in run #0 before the fix.

**A person cannot see it.** Hovering the same feature in the app shows the highlight every time: `setHover` returns early for the feature already hovered, which is right, and a hover of another feature always leads to a frame (`applyHighlight` calls `triggerRepaint`). Selection is the same (`select` was bounded already; 400+ selects in the probe, none failed). No change to the editor was needed.

**Fix.** `__probe.armHover()` is awaited before the mouse moves; `hoverLatency()` returns the armed wait. A wait that sees no pointer move rejects after 8 s with the page's `__maid.debug()` state (it was unbounded); a move without a new hover still gives -1 after 2 s. Why the hang was seen more often after d1158bc is not known (a busier main thread is the likely reason, not measured).

### Still unexplained or not done

- The hover-phase hang is explained (next section). The 5-minute stall in the load phase after d1158bc is a different symptom (no `hover` phase was reached) and is still not explained; the 60 s phase limit will name its phase.
- `debug` is declared on `MaidHandle` now (`tools/bench/maid-window.d.ts`) and `run.ts` reads it without a cast.
- The 60 s phase limit can trip a legitimate slow `drag` phase on a loaded machine (several `settled()` calls per try). If that happens, the state in `stuck.page` will show it (counters moving, not stopped).
- Marker images that fail are now a failed run. If the sprite files or a decode fail on some machine, runs fail rather than look better; the orchestrator should look at `imageFailures` in the first run.

## What settled means

Found 2026-10-13: `bun run check-journal` failed in about 4 of 6 runs after d1158bc, at "after restore: data, undo state and map as before the reload".

**Cause.** `__bench.ready()` was `Promise.resolve()` (packages/shell/src/bench.ts). The restore dialog closes when `answerRestore` sets the journal to `checking` (journal.ts), before `journal.restore()` has replayed anything, so the check's "dialog detached, `ready()`, `settle()`" read the un-restored state (shape b), or the state with the edits applied but not yet in the map's sources (shape a). Before the on-demand images the same race was hidden by the longer, slower image path. `settled()` did not wait for the restore because it could not know about it.

**Now `ready()`** resolves when the journal is no longer `checking` (looking for stored edits, or restoring): `journalSettled` in bench.ts. A dialog that is open (`pending`) does not block it, since only a person answers it.

**`settled()` returns only when, on one check after an `idle`:** no tile request is in flight or planned for the view; no flush timer, preparing batch, drag, compaction, or channel (base, live, select) is busy or dirty; no update of the active source is unconfirmed (`activeSending`); `map.loaded()`, `map.areTilesLoaded()`, not moving; `map.isSourceLoaded` for every source the engine feeds; and a `render` has happened after the last start or end of any source update (`dataSeq` against `renderedSeq`). The 250 ms and 2 s timers only wake the loop; none of them ends it. After the 60 s deadline it throws with `debugState()`. Marker images need no extra condition: a tile that waits for an image is not loaded, so `map.loaded()` is false.

**Check:** `check-journal` 10 of 10 runs exit 0 with 15 ok; `check-all` 11 of 11, `check-all --app parking` 12 of 12.

**Load numbers with the honest settled** (`reports/2026-10-13-13-10-settled-fixed`, 3 runs per scene, medians, all nine ok, no `stuck`, no `imageFailures`):

| Scene | ready | settled | load CPU | baseline settled / CPU | after d1158bc (early settled) |
| --- | --- | --- | --- | --- | --- |
| small | 325 | 613 | 449 | 990 / 658 | 706 / 466 |
| medium | 323 | 856 | 667 | 1691 / 1235 | 1105 / 675 |
| dense | 326 | 1024 | 757 | 1397 / 1106 | ~1120 / 759 |

The numbers marked "early settled" were measured while `ready()` did nothing and `settled()` did not look at the sources or at a frame after the last update; they are not comparable with the honest column. The improvement over the baseline stands. The honest settled is not slower than the early one in this run, so the early settled did not flatter the numbers by a measurable amount (medians of three runs on one machine; not a statistical result).

## Layers that take part in a zoom frame

What MapLibre 6.12 (`maplibre-gl/dist`) does with a layer on each zoom frame, read from the code:

- `Style.update` (maplibre-gl-shared-dev.mjs) calls `layer.recalculate(parameters)` for **every** layer in `_order`, hidden or not. A hidden layer still pays its paint and layout evaluation (inferred: tens of microseconds for a symbol layer).
- `StyleLayer.isHidden(zoom)` is true for a layer below its minzoom, at or above its maxzoom, or with `visibility: none`. Hidden layers are not rendered (`prepareForRender`) and do not mark their source as used (`tileManagers[source].used`).
- `TileManager.update` gives a source that no visible layer uses **no ideal tiles** (`if (!this.used && !this.usedForTerrain) idealTileIDs = []`). So a source feeds the worker and the tile cache only while a visible layer draws it. A visible layer over an empty GeoJSON source still asks for its tiles on each zoom step.
- Placement (`Style._updatePlacement`) loops over every symbol layer in `_order` and calls `crossTileSymbolIndex.addLayer` for each. `PauseablePlacement.continuePlacement` skips a layer by its minzoom and maxzoom only, not by `visibility`: a symbol layer with `visibility: none` is still placed (cheap when its tiles have no bucket, which is the case for an empty twin).
- react-map-gl 8.1.3 adds a `<Layer>` that mounts later with `map.addLayer(options, props.beforeId)`: without a `beforeId` it is put on top of the stack. A layer that appears in the middle of the list therefore needs a `beforeId` to keep its place. Visibility changes avoid that.

**Counts** (`buildLayers`, headless, `bun` script; the list has 112 layers: 33 data layers, 33 edit twins, 33 selection twins and the highlight and tool layers. The brief's 115 counted differently.) "In frame" is a layer MapLibre does not treat as hidden at that zoom.

| State | total | select twins shown | in frame z11 / z14 | z15 | z17 / z18 | select sources used (z11) |
| --- | --- | --- | --- | --- | --- | --- |
| before (all twins visible, pins from 17.5) | 112 | 33 | 62 | 75 | 77 | 4 |
| after, no selection | 112 | 0 (hidden) | 53 | 75 | 77 | 0 |
| after, selection | 112 | 33 | 62 | 75 | 77 | 4 |
| after, selection-only | 112 | 33 (data hidden) | 44 | 45 | 44 / 45 | 4 |

Above zoom 15 the selection twins were already hidden by their own maxzoom before this change, and their sources were unused. So this change saves the zoom-out work (nine twins that were in frame between 11 and 14, and four sources asking for tiles at every zoom step) and does not reduce the zoom-in work by itself. The zoom-in work left is `Style.update`'s recalculation and the placement loop over the 33 hidden twins: inferred, not measured.

### What changed

- `layers.ts` `buildLayers`: option `selectTwins` (default true, all twins shown as before). With `selectTwins: false` and no `selectionOnly`, each `--select` twin gets `visibility: none`. Ids, order, zoom ranges and the interactive list are unchanged in every state (tests in `layers.test.ts`).
- `engine.ts`: getter `selectTwins` = `selectionOnlyShown || selectedIds.length > 0`. `setSelected` and `setSelectionOnly` already call `changed()`, so the layers follow.
- `MapView.tsx`: one added line in the `options` object, `selectTwins: useEngine((e) => e.selectTwins)`.
- Not done: removing the twins from the list (zoom-dependent or selection-dependent). That needs a `beforeId` for each re-added twin (the next non-twin layer; the label twins have none, so they would go on top of the module layers), and a React re-render at each threshold crossing. Left as the next step, with the numbers above as its target.

### Edit twins: not changed, and why

The edit twins can be hidden only while the live tier is empty and no feature has `editing` state. Both change inside the engine, during a drag or an edit, and the base feature is hidden by feature state in the same step. A hide that waits for React lets the feature vanish for a frame or more. Live data is also not rare: after the first view, every tile that loads (a pan) goes to the live tier until compaction, 2 s after the last change (`touch()` arms `compactTimer`). So the saving is limited to idle browsing. Next step, if wanted: set the twins' `visibility` imperatively in `push(batch, 'live')` before `hideOriginals`, from the renderer package, with a comment on why (the same frame as the feature state). Not tested in a browser.

### Pins from zoom 18

Every use of the pin zoom, `PIN_ZOOM` in `layers.ts` (exported now):

- `point-dot` `maxzoom` (the dot is drawn below it): 17.5 to 18.
- `point-pin` `minzoom` (unless `pins: 'all'`): 17.5 to 18. Its tiles are laid out from floor(minzoom) = 18, so a tile at 17 asks for no pin image.
- `point-dot--select`: unchanged, its maxzoom is the dot floor (11).
- `point-pin--select`: unchanged (maxzoom 15). The active pin (`active-point-pin`, floor 15), the glow `highlight-halo-pin` and the labels do not depend on it.
- `icon-requests.test.ts` and the `images.test.ts` expectation (`packages/shell/src/images.test.ts`, the one test in that package): pins requested at 18, none at 15 to 17.
- The only other `17.5` in the code is a path in `ZoomControls.tsx` (an icon), not the zoom.

### What the quiet run must confirm

1. Zoom CPU on dense and small against 434 / 396 ms (dense) and 316 / 400 ms (small): the zoom-out figure should fall, the zoom-in figure may not reach 434 ms until the twins are removed (see above).
2. At the opening view of small (zoom 17) no `pin-` image is requested: `listImages()` shows no `pin-` at 17, and the first pin appears at 18.
3. Hover a point at zoom 17: it shows a dot (or its pin from the active source), as before; at 18 it is a pin.
4. Select a vertex at zoom 14 (below its floor): it is drawn at once after the selection, with no flicker from the visibility change; deselect: it goes.
5. `check-render`, `check-edit`, `check-interactions` and `check-relations` with a selection below the floor (the twins are switched on by the selection).

### Unsure

- The recalculation and placement costs above are read from the code, not measured.
- A twin switched from `none` to visible needs its source's tiles reloaded: one worker round trip. A selection made below a floor may draw one or two frames later than before. Not measured.


## Start-up: chunks and ready

Measured by me with Playwright and system Chrome against `vite preview` of the production build (port 5190, 127.0.0.1, then stopped), headless, cache disabled, `?scene=small`, 1600x1000, local mock API. Both builds in the same session, alternating in rounds (4 rounds of 5 loads per build and condition = 20 loads each). The machine was **busy** (other agents were running), so absolute numbers are higher than the quiet baseline above (the old build's ready was 357 to 419 ms here against 325 in the quiet run): only the difference between the two builds, measured in the same minutes, means anything. The throttled runs are spread widely (p25 to p75 is 460 ms wide).

### Is Maid's "ready" comparable to iD's?

Roughly, not exactly. `load.readyMs` in `tools/bench/run.ts` is the time from `page.goto` until `window.__bench` exists and `await window.__bench.ready()` has returned.

- **Maid:** `exposeBenchApi` runs in `MapView.handleLoad`, so `__bench` exists after the MapLibre `load` event (all JS evaluated, React rendered the shell, the map and its style are up, a WebGL context exists, the layers are added). `ready()` then waits for the journal to finish looking for stored edits (`journalSettled`, an IndexedDB open): 10 to 15 ms. No tile has been asked for yet; the first data request leaves 10 to 40 ms after `load`.
- **iD:** `__bench` exists from the adapter on, and `ready()` resolves after `context.ui().ensureLoaded()` and `collapseSidebar()` (`tools/refs/id/adapter.js`): the iD UI is built and its presets are loaded. No WebGL (SVG map), and the first tiles are not asked for yet either (iD asks in an idle callback).
- **Same:** both stop before the first data request and before any data is drawn; both include the script's download, parse and evaluation and the first render of the UI. **Different:** Maid's includes a WebGL context, a shader program compile and 4 worker starts (about 40 to 60 ms of the profile below); iD's includes loading the presets over the network and building the DOM of a larger UI. So Maid's "ready" is not defined later or earlier in a way that favours one side by design, but the two include different work. I did not change the definition. (Maid's "ready" is not "the map is drawn": `settled` is.)

### What the main thread does before ready (CPU profile, busy machine, one load)

About 250 ms of busy main thread, of which: script compile and top-level evaluation 42 to 87 ms (the long task at 99 ms start), MapLibre (shader program link `_Pe` 19 ms, `_setupPainter` 17 ms, `_containerDimensions` 9 ms, style `clone` 11 ms), `Intl.DateTimeFormat().resolvedOptions()` 10.5 ms (found, removed, see below), the unicode-regex of `@tanstack/hotkeys` at mount 7.6 ms (not changed), marker canvas drawing 8 ms (renderer, not mine). The app's own code (React render of the shell, config) is a minority; **most of the time to ready is MapLibre and the WebGL setup, which iD does not have.**

### Chunks before and after

Module attribution from a temporary `generateBundle` plugin over `chunk.modules` (rolldown's `renderedLength`; no dependency added, the config file was removed after use). Sizes are the files in `dist/assets`.

| | before | after |
| --- | --- | --- |
| entry `index-*.js`, raw | 4,363 kB | 3,476 kB |
| entry, gzip | 1,273 kB | 990 kB |
| static graph needed before the first paint (entry + 5 shared chunks: zod, floating-ui, jsx runtime, ...), raw | 4,364 kB (2 files) | 4,027 kB (7 files) |
| same, gzip / brotli | 1,273 kB / 951 kB | 1,170 kB / 887 kB |
| requests before ready (JS, CSS, workers, tile requests) | 9 | 14 (5 more small files in parallel via `modulepreload`) |
| lazy chunks of the app | Mapillary/Panoramax viewers, osm-api (92 kB), layer index (563 kB, only when the Background panel opens) | those, and: Inspector 204 kB (type picker, fields, tags sheet, operations, multi-select, reference loader), relations sections 18 kB, surface field 39 kB, street-images field 8 kB, Photos panel 4 kB and dock 10 kB, Background panel 21 kB, Data layers panel 14 kB, Map style panel 6 kB, Notes dock 4 kB |

The entry file lost 887 kB, but 550 kB of that now sits in shared chunks (zod `schemas` 319 kB, floating-ui 217 kB, small runtime chunks), because both the entry and a lazy chunk use them. They are still needed at start and are fetched in parallel through `modulepreload` (see `dist/index.html`). The real saving at start is 337 kB raw, 103 kB gzip (7.7 and 8 percent).

Top 25 modules of the entry chunk before (rendered bytes): country-coder 848 kB, maplibre-gl.mjs 706, maplibre-gl-shared 619, react-dom 530, id-tagging-schema presets 501, translations/en 294, dexie 132, style `id-rules.json` 126, id-tagging-schema fields 118, floating-ui 74, aes-js 66 (comes from `@rapid-sdk/util` through the model), `renderer/engine.ts` 57, tailwind-merge 57, zod core schemas 52, sonner 52, motion-dom projection 39, street-imagery-react 39, bignumber 36, street-imagery 35, `shell/modules/relations.tsx` 34, `module-imagery/ImageryPanel.tsx` 34, polyclip-ts 32, zod classic 27, `presets/presets.ts` 26, surface catalogue 24. **After:** the same first nine, then `engine.ts`, sonner, street-imagery-react, bignumber, street-imagery, polyclip-ts, `presets.ts`, `operations.ts` 23, `MapView.tsx` 21; ImageryPanel, relations, the surface catalogue and all of `packages/ui/src/inspector` and `sheet` are gone from it.

### What is lazy now, and when it loads

- A small helper in `packages/ui/src/lazy.tsx`: `lazyComponent(load, fallback)` is a component with its own `Suspense` (no boundary needed at the call site); `preloadLazyComponents()` loads all of them, one per idle moment; `lazyChunksPending()` resolves when no asked-for chunk is on its way.
- **When:** (1) on first render of the thing (select a feature, open a panel); (2) **in idle time after the first view is complete**: `MapView.handleLoad` calls `preloadAfterFirstSettle(engine)` (`packages/shell/src/lazy-chunks.ts`), which waits for the first `engine.settled()` and then preloads every lazy chunk. Not before settled, because the main thread is the scarce thing while the first tiles are parsed and drawn. A load with a selection in the URL asks for the inspector at once.
- **What:** the inspector (`components/InspectorSlot.tsx`: the empty hint is eager and has the real sidebar's label, so the frame does not change; the fallback while the chunk loads is the same sidebar frame), the sections of `relations`, the panels of imagery, data layers and lenses, the street-imagery panel, dock view and field, the surface field, the notes dock. Fallbacks have a fixed height (`PANEL_FALLBACK`, 160 px) in flyouts; a field has none (it is preloaded).
- **`window.__bench.settled()`** now also awaits the preload that follows the first settle and any other lazy chunk that was asked for, so a check that selects a feature right after `settled` gets the inspector, not its fallback. It does not wait for chunks nobody asked for. `ready()` is unchanged.
- **Bundler:** `apps/*/vite.config.ts` marks `packages/ui/src` as free of import-time effects (`build.rolldownOptions.treeshake.moduleSideEffects`). Without it the bundler keeps every module of the `maid-ui` barrel in the entry, also those only the lazy inspector uses (with the lazy boundaries alone the entry lost only 136 kB, 4.36 to 4.22 MB). Only `extension-points.ts` is imported for its effect, and it only declares types. Build only; the dev server is unchanged. Other workspace packages measured: marking them too saves 6 kB more, so not done.
- **`FetchPauses`** called `Intl.DateTimeFormat().resolvedOptions().timeZone` on its first run although no service was paused (10.5 ms self time in the profile, the first Intl call of a page). It now reads it only when there is a pause.

### Measurements (busy machine, medians of 20 loads, p25 to p75, ms)

| | old build | new build | change |
| --- | --- | --- | --- |
| FCP | 304 [272 to 316] | 268 [248 to 284] | -36 |
| `__bench` exists | 400 [360 to 412] | 367 [347 to 380] | -33 |
| ready | 419 [382 to 443] | 387 [369 to 398] | **-32 (-7.6 percent)**, spread narrower |
| settled (includes the preload now) | 706 [656 to 735] | 724 [689 to 806] | +18 (within noise; the preload adds about the cost of evaluating 400 kB) |
| 4x CPU throttle: FCP | 1000 [728 to 1232] | 784 [640 to 984] | -216 |
| 4x: ready | 1442 [1071 to 1808] | 1114 [962 to 1430] | **-328**, but the distributions overlap strongly |
| 4x: settled | 2780 [2170 to 3217] | 2277 [2163 to 3063] | -503 (noise) |

Earlier, shorter runs of the same builds in quieter minutes: ready 357 to 340 (n=20), 357 to 331 (n=10). A first, partial state (without the `FetchPauses` change and the notes dock) gave 357 to 340. The saving is **about 17 to 32 ms at full speed**, which is what the evaluation of 340 kB less code and one 10 ms Intl call add up to. It is a first step: most of the 325 ms is MapLibre, WebGL and React, which are needed.

### Does Maid's ready now beat iD's?

Not shown. The quiet figures are Maid 325 / iD 313 (small), 359 (dense). Subtracting what I measured (17 to 32 ms) would put Maid at about 295 to 308 ms, i.e. around iD's 313, **within the noise of a quiet run**. This needs the quiet run to confirm; I would not claim a win from this document. What would move it further (not done, outside my files or too risky):

1. **MapLibre's four workers** each fetch and compile the 510 kB worker script (`setWorkerCount`, `shell.config.workers`). A `modulepreload` of the worker in `index.html` is not possible with a hashed name from the HTML file; a Vite plugin or `?worker&url` import could emit it. Saves nothing measurable on localhost, a round trip on a real network.
2. **Style clone and layers** (114 layers, `clone` 11 ms) and **shader compile** (19 ms) are in MapLibre and in `layers.ts` (the renderer agent's area).
3. **Presets, translations and country-coder** (about 1.9 MB raw): needed at the first preset match, which is synchronous (`matchesLocation`, `countryAt`). `maid.config.ts` calls `createPresets(defaultPresetData)` at module level. To move them behind `import()` the builder would have to await presets and the config would have to offer them as a promise. A design change; with the measured 19 ms for `createPresets` plus parse, the gain is perhaps 30 to 60 ms.
4. **`@tanstack/hotkeys`** registers its keys at mount with a unicode-property regex (7.6 ms). Could be deferred to idle, but the checks press keys right after `ready()`.

### Not split, and why

- Paraglide messages: the four languages are 40 kB of source in total; a lazy locale needs `setLocale` to become asynchronous. Not worth it.
- The save flow: `osm-api` (92 kB) is already behind `import()`. `SaveButton`, `save/` and the validation rules are small (12 kB, `createValidator` is also used by `maid.config.ts`'s `validation({ rules })`).
- The restore dialog: 3 kB.
- Notes panel (`module-notes/notes.tsx`, 16 kB): the panel is a closure inside `setup` that shares state with the layer, so it cannot be moved without a refactor of the module. Only its dock view is lazy.
- Street imagery map layer (`map.tsx`) and its libraries (`street-imagery`, `street-imagery-react`, 96 kB): `streetImageryClick` is exported from `map.tsx` and used by `MapView`, and the module configures the package in `setup`.
- `date-fns` (56 kB) and `sonner` (52 kB): used by the shell's toasts and the time display from the first frame.
- Taginfo client and the reference loader: tiny; the reference loader moved with the inspector.
- Harness pages: already behind `import.meta.env.DEV`.

### Risks for the browser checks

- The inspector, the relations sections, the module fields and the dock views are separate files. The fallbacks are empty frames. A check that selects a feature before the preload finished waits for its elements as before (Playwright waits), and `__bench.select` only waits for the selection to be drawn on the map, not for the inspector. `__bench.settled()` waits for the chunks, so checks that call `settled()` first are not affected.
- `settled()` takes up to one preload longer the first time (the idle callbacks, each with a 1 s limit, so at most a few ms of waiting in practice; measured +18 ms median, within the noise).
- A check that counts requests, or blocks everything but known files, sees 14 instead of 9 requests before ready and about 13 more `.js` files later.
- The side-effect flag only changes the production build. If a module of `packages/ui/src` ever gets an import-time effect that is imported only for it, the build would drop it silently; `bun run check-config` and the three builds do not catch that.
- Not run by me (rules): `bun run bench*` and `check-*`. I ran only my own Playwright scripts against the preview: select a way (inspector with fields shows, 0 console errors), open Background, Map style and Data layers right after `ready()` (all three show their content, 0 errors), start with `id=w...` in the URL (inspector shows).

### What the quiet benchmark must confirm

1. `reports/...` small `load.readyMs` below the baseline 353 ms (the old build's median) by at least 15 ms; dense 327 and medium 363 likewise. If not, the savings were hidden by the busy machine.
2. `settled` does not rise by more than the noise (about 20 ms): the preload runs inside it.
3. `check-render`, `check-edit`, `check-ops`, `check-relations`, `check-validation`, `check-tags`, `check-interactions` and `check-journal` still green (they select features right after `ready()` and expect the inspector; relations and the tags sheet are lazy).
4. Request count before ready and the bytes (`bench` records neither today).

## Presets after the first picture

Measured by me on 2026-10-13 with Playwright and system Chrome against two production builds served by `vite preview` (127.0.0.1, then stopped): the build of HEAD in a `git worktree` with its own `bun install` ("before") and the working tree ("after"). Cache disabled, all non-localhost requests blocked (a `context.route`), 1600x1000, local mock API, `?scene=small#map=18/...` and `?scene=dense#map=17/...`, 20 loads each (10 with 4x CPU throttling), alternating. The machine was shared with a running benchmark for part of the time; load average 4 to 8. Only the paired difference means anything. The timings are taken inside the page: `window.__bench` assigned (setter on `window`), `await __bench.ready()` returned, the first `render` of the map after `queryRenderedFeatures()` found a feature (first data frame), `await __bench.settled()` returned.

One trap that cost me an hour: **the worktree has no `packages/shell/public/sprites` and no `frame-sync.js`** (git-ignored, copied by `refs-setup`). Without the sprites the "before" build never made a single pin or vertex icon, its picture differed from the "after" picture (md5 of the screenshot), and its `settled` was 150 to 250 ms shorter because no icon image had to be made. After copying the two paths in, both builds draw the same picture (identical screenshot hash, 4 of 4) and the numbers below are the ones to read.

### What the presets are used for (classification)

Every use of `editor.presets` / `Presets.match` and friends, by the moment it needs them:

| class | what | where | count |
| --- | --- | --- | --- |
| (a) needed for the first picture to be right | nothing. The geometry class of a way (area or line) comes from `isArea` of `@osm-editor-kit/maid-style` (iD's area keys as generated data), not from the presets; the source a feature goes to, its filter state and its lens style do not read them. | `build.ts`, `engine.ts` | 0 |
| (b) decorates the picture | the icon of a pin (`buildPoint`: `match(..., 'point')`, else `'vertex'`) and of a tagged vertex (`refreshVertex`, `buildVertex`, `build`) | `packages/renderer/src/build.ts` | 4 call sites |
| (c) only on interaction | `engine.entity()` (type, icon, name for the inspector, 3 sites), the inspector and its fields, the type picker, favourites (`packages/shell/src/favourites.ts`, 9 sites), multi-select (`MultiInspector`, `MultiType`), the restore list (icons), `FavouriteHint`, the operation `pointToArea` (`canBeArea`), `PresetSchema` for the model (`matchTags` when a way is deleted, `areaKeys` for `OsmWay.isArea()` in split, merge, disconnect, move, extract), validation (no preset use), the save flow and the journal (`discardedTags` only, not the presets) | engine, shell, ui, core | about 25 |

Class (a) is empty, so no tile ever has to wait for presets to be *correct*. The model's `OsmWay.geometry()` caches per entity and uses `areaKeys` of the schema; it is only called by edits, operations and validation (never by the renderer or at load), and the schema is installed on the editor's context before any of them can run (the inspector waits for the presets, `settled()` waits for them), so no cached answer is made without the keys.

### The design as built

- **`lazyPresets(make)`** (`packages/core/src/lazy-presets.ts`): a `PresetsSource` with `load()` (memoised) and `current`. An app config gives `presets: lazyPresets(() => import('./presets').then((m) => m.makePresets()))`; `apps/*/src/presets.ts` holds `createPresets`, the schema data and the module changes (`withChanges` chains of street imagery, surface, traffic signs, parking and its German labels). Parking makes the source inside `editorConfig`, so the language of the visit is read when it is made, as before. `EditorConfig.presets` takes `Presets | PresetsSource`; presets given directly work as before.
- **`editor.presets`** is a getter, undefined until they are made; `editor.presetsPending`, `editor.loadPresets()` (starts once, resolves with them) and `editor.onPresets(listener)` (called with the presets, or with undefined when making them failed, which is reported to `onError`). The model's `PresetSchema` is installed when they arrive.
- **When:** `MapView.handleLoad` calls `loadPresetsAfterReady`: when the journal check that `ready()` waits for is over, one `setTimeout(0)`, then `editor.loadPresets()`. Not an idle callback: the map draws and parses tiles from then on, and the main thread is never idle for long. `engine.settled()` starts them too if nobody did, and an engine that holds features starts them 100 ms after the first hold (the net for use without the shell).
- **Entry graph:** `maid-presets` no longer reaches the entry. The shell read `discardedTags` through `@osm-editor-kit/maid-presets/default`, which pulled in all of the data; it now comes from `discarded.ts` (3 kB) through the package index, and the apps' vite configs mark `packages/presets/src` as free of import-time effects (as for `packages/ui/src`), so the matching code and `country-coder` leave the entry.
- **Fetch:** `apps/vite-presets-preload.ts` adds `<link rel="prefetch" as="script">` for the chunk to `index.html`. See "Prefetch, not modulepreload" below.
- **Engine, tiles that arrive before the presets** (`engine.ts`): `holdForPresets` takes the points and the tagged vertices out of a merged batch and holds them, at most 300 ms (`PRESETS_HOLD_MS`); lines, areas and untagged vertices go to the map at once. When the presets arrive (`fillInPresets`) the held features are built again, with their icon, and sent: **drawn once, never bare.** When 300 ms pass first, they are sent bare, and when the presets come, `fillInPresets` goes through the points and vertices that are on the map (ids from `featureSource`), builds those with tags again in slices of at most 8 ms with a pause between, and sends only those that now have an icon, as updates by id (`updateData` replaces by id; no line or area is touched; edited features go to the live tier, the others to the big sources). `settled()` counts the held features, the fill-in slices and the pending presets (`pushing()`, `presetsPending`), and `debugState().parts` shows `held`, `fillingIn`, `presetsPending`. `ready()` and `settled()` are not redefined; `bench.ts` is not touched.
- **React:** `usePresets()` and `usePresetsPending()` (`shell-context.ts`, `useSyncExternalStore` on `editor.onPresets`) for the components that read `editor.presets` in a render (restore list, favourite hint). `InspectorSlot` shows the same empty sidebar frame as while its chunk loads until the presets are there. Everything else of class (c) is behind the inspector or a click.

What a person sees when the tiles win the race: the lines and areas, then, up to 300 ms later at most, the pins and vertex icons together (never a bare pin that later gets its icon). If the presets take longer than 300 ms (a slow network for the 400 kB chunk), the pins appear bare and fill in. The inspector for a feature selected before the presets are there shows its frame, then the content. I tested both paths in the production build by delaying the chunk by 2.5 s (small) and 3 s (dense) with a route: the icons after the fill-in are the same set as without delay (dense: 7709 of 8476 points and 2743 of 25814 vertices with an icon, as without delay), the fill-in costs 4 ms (small) and 20 ms (dense) of engine time in 8 ms slices, no console error.

### Prefetch, not modulepreload

The brief said modulepreload. Measured on the small scene, ready (median, ms, no route, cache on): no link 254, `prefetch` 263, `modulepreload` 283. A `modulepreload` downloads **and parses** the module, and Chrome parses a module on the main thread: 1.4 MB is about 20 ms before `ready`, which is the number this work is meant to lower. `prefetch` only downloads it, at low priority, into the HTTP cache. **Not verified here:** `vite preview` answers `Cache-Control: no-cache`, and with that the later `import()` sent a second request (200, not from the cache); on a host that serves the hashed files with `immutable`, as a CDN does, the cache is used. `settled` was the same for all three variants (578 to 591 ms). `presetsPreload({ rel: 'modulepreload' })` switches back.

### Chunks

| | before (HEAD) | after |
| --- | --- | --- |
| entry `index-*.js`, raw / gzip, Maid | 3,483 kB / 992 kB | 1,852 kB / 545 kB |
| static graph before the first paint (entry and the chunks it preloads), raw / gzip, Maid | 4,030 kB (7 files) / 1,159 kB | 2,618 kB (15 files) / 763 kB |
| same, Maid Bicycle / Maid Parking | not measured | 2,621 kB / 764 kB, 2,731 kB / 800 kB |
| presets chunk (schema data, country data, `createPresets`, the app's changes), raw / gzip | in the entry | 1,418 kB / 399 kB (bicycle 1,418 kB, parking 1,423 kB) |

The entry lost 1.63 MB raw (447 kB gzip); the static graph 1.41 MB raw (396 kB gzip). More files in the graph because the split now also keeps some shared pieces apart; the bytes are what counts.

### Measurements (paired, medians [p25 to p75], ms, 20 loads, 10 at 4x)

| | before | after | change |
| --- | --- | --- | --- |
| small: `__bench` exists | 299 [298-301] | 239 [235-244] | -60 |
| small: ready | 314 [311-319] | 256 [251-263] | **-58** |
| small: first frame with data | 470 [463-478] | 378 [371-382] | -92 |
| small: settled | 829 [648-871] | 791 [590-822] | -38 (before is bimodal, 650 or 870) |
| dense: `__bench` exists | 303 [300-312] | 246 [237-248] | -57 |
| dense: ready | 315 [312-325] | 258 [251-262] | **-57** |
| dense: first frame with data | 756 [735-769] | 686 [664-702] | -70 |
| dense: settled | 1142 [1019-1242] | 1083 [1042-1122] | -59 |
| small 4x: `__bench` / ready | 790 [788-795] / 829 [825-836] | 634 [627-644] / 673 [669-691] | -156 / **-156** |
| small 4x: first frame / settled | 1388 [1378-1395] / 1721 [1715-1818] | 1152 [1145-1157] / 1792 [1681-1806] | -236 / +71 (inside the spread) |
| dense 4x: `__bench` / ready | 794 [789-795] / 835 [825-842] | 635 [631-636] / 671 [665-685] | -159 / **-164** |
| dense 4x: first frame / settled | 2138 [2037-2205] / 3064 [3031-3099] | 1898 [1885-1906] / 2977 [2933-2981] | -240 / -87 |

Two earlier variants of the same work, for the record: loading the presets in an idle callback left them to arrive after the first tiles and gave a second pass; `settled` rose 100 to 200 ms in the small scene. And the first fill-in-only design (no hold) drew the pins twice. The hold made both go away. A trigger of `loadPresets()` inside the first tile's merge ran the 25 ms chunk evaluation in the task of the first tile, before `ready()` could resolve (ready minus `__bench` was 38 ms instead of 13): it is 100 ms later now.

### Other things looked at for the start path

Profile of the "after" load up to `ready` (self time, ms, one load, 0.5 ms sampling): the entry 142 to 173 (almost all MapLibre and WebGL: `_containerDimensions`, shader link, painter setup, style clone), idle 100 to 150 (waiting for the entry), `schemas` (zod) 11 to 12, `floating-ui` 5 to 6, the presets chunk 23 to 25 (now after `ready`).

- **Moved:** the presets chunk and, with it, `country-coder`, `location-conflation`, `createPresets` and the schema data (this section).
- **Not moved, with the number:** zod (319 kB chunk, 11 to 12 ms): `settings.ts`, the stores of the lenses, imagery, notes, data-layers and street-imagery modules build their schemas at import to parse what the browser stored, synchronously. Moving it means making each store lazy or asynchronous: eight packages, not a safe change for 12 ms (about 45 ms at 4x); it is the next candidate. `floating-ui` (217 kB, 5 to 6 ms): `Tooltip` and `Flyout` render in the top bar at the first paint; lazy tooltips would be a change of the components. Dexie (132 kB): the journal check is part of what `ready()` waits for. Paraglide and the stores that rehydrate from `localStorage`: tiny (below the sampling resolution).

### Risks

- The 300 ms hold and the 8 ms slices are numbers from a localhost run. On a slow network the chunk (400 kB gzip) may take longer than the hold: pins appear bare, then fill in (tested with a 2.5 s delay).
- `prefetch` needs cacheable responses (see above); where they are `no-cache` the 400 kB are fetched twice, the second time after `ready`.
- `packages/presets/src` is marked free of import-time effects in the apps' vite configs (build only), like `packages/ui/src`. A module there that gets an effect that only its import provides would be dropped silently; `bun run check-config` and the builds do not catch that.
- The inspector shows its empty frame until the presets are there (about 100 ms after `ready` on a quiet machine). A check that selects a feature and reads the inspector right after `ready()` without `settled()` waits for its elements as before.
- A check or a script that reads `editor.presets` right after `ready()` without `settled()` gets undefined for about 100 ms. Anything in `tools/` that does this is a candidate to fail; the browser checks I ran do not.
- `check-all` for the app `maid` could not be run: port 5173 is held by another project's dev server (TILDA), and the checks fix the port. `bicycle` (the same config plus traffic signs) and `parking` pass.

### What the quiet three-editor benchmark must confirm

1. Maid's `load.readyMs` below iD's: small 319, medium 302, dense 285 (iD) against Maid's 378 / 352 / 305 from the earlier quiet run. My paired difference on the same machine is -58 ms at 1x in this harness (about 18 percent of ready); the bench's definition of ready differs (it includes the time to `page.goto`), so I do not claim a win: the dense scene (305 minus 57 is about 250) and medium (352 minus 57 is about 295) would be below iD's 285 and 302 only narrowly or by a few ms; small (378 minus 57 is about 320) would be level with iD's 319.
2. `load.drawnMs` / `settledMs` not higher than the baseline by more than the noise (20 ms): they include the presets and the hold.
3. The same picture as before (`check-render`).
4. Whether `prefetch` is served from the cache on the real host.

## What the load numbers mean

The benchmark records two load times per editor, and the phases after the load use one of them. They differ only for Maid, because only Maid loads something after its first picture.

- **Loaded: map drawn** (`load.drawnMs`, the headline row). The map shows the complete data for the view. Maid: its engine's own wait (`__bench.drawn()`, which is `engine.settled()`): no tile under way, every MapLibre source and tile loaded, nothing moving, a frame drawn after the last data change. iD: its `settled()`, which waits for the redraw queue, the OSM tile requests and one frame. Rapid: its `settled()`, which waits for the draw, the tile requests and two quiet frames.
- **Loaded: everything fetched** (`load.settledMs`). Everything the editor loads by itself after start has arrived. Maid: the drawn wait, then its lazy chunks (the inspector and the panels, fetched in idle time). iD and Rapid have no such work in their adapters, so both rows are the same for them. Rapid's `settled({ idle: true })` would also wait for its idle queue, but that holds validation and pane re-renders, which fetch nothing; it is not used.
- The pan, zoom and drag phases settle with the drawn wait, not with the lazy chunks. The setup calls between phases still use `settled()`, so that the inspector is there before a selection is timed.
- **Until correct afterwards** is each editor's own definition of a final picture, so the numbers do not measure one thing. Maid waits for MapLibre's `idle`, which fires only when nothing is dirty, so it includes the label and symbol fade-in that MapLibre runs after a change (`fadeDuration`, 300 ms by default). iD waits for its redraw queue and tiles, then one frame and one message task, with no fade. Rapid waits for its draw and tile queues and two quiet frames. A common definition would be "the time until the last frame that changed pixels in the map area", measured from outside with screencast frames or a pixel hash of the map element. It is not built: it needs a readback of the map on every frame, and its cost on a loaded map is not measured yet. For that reason the budget does not compare the settle rows with the other editors (`compare: false` in `tools/bench/metrics.ts`); they only warn against Maid's own baseline.
- **Tag edit** is measured from the call to the first draw after it. iD's draw runs synchronously inside the call (its `drawn` event fires before `setTag` returns), so its time is the draw itself. Maid's engine hands the change to MapLibre, which draws on its next animation frame, so its time includes that wait, up to 16.7 ms at 60 Hz. Both are the next picture. Maid is not changed for this.
- **Select by a click** uses the longest roads of the scene whose midpoint lies inside the editor's own map element (`__bench.mapRect()`), inset from its edges and with no control or panel on top (`pageVisibleRoads` in `tools/bench/run.ts`). Maid's map element starts right of its sidebar, so a road under the sidebar is not picked there. A click that does not show the road selected with its inspector within 2 s is a miss, and the report names the road and what the page held: the selection, the inspector, and the element under the pointer.
