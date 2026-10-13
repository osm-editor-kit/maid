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

### Still unexplained or not done

- The cause of the one stall is not found. The next occurrence should show which phase and the page state; if the state shows a stopped renderer rather than the editor's counters, the cause is outside the image path.
- `probe-page.ts` `hoverLatency` and `applyHighlight`'s `once('render')` (engine.ts, outside the allowed edits) are still unbounded in principle. The phase limit covers `hover`; the `select` bound covers the selection wait.
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
