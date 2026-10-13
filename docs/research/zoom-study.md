# Zoom study (2026-10-13)

Read-only research. No repo file was edited. Probe scripts: `scratchpad/zoomprobe/probe.mjs`, `probe2.mjs` (headless Chrome against the running Maid dev server on 127.0.0.1:5173; all other hosts blocked).

Marks: **[read]** = read in code, with file and line. **[measured]** = seen in the running Maid app. **[inferred]** = follows from the code read, not run.

Not run: iD and Rapid (no reference servers were started, per the brief). Their behaviour below comes from code only.

## Answers in short

1. **Zoom numbers.** iD and Rapid count zoom with 256 px tiles (OSM zoom). MapLibre counts with 512 px tiles, so for the same view `MapLibre zoom = OSM zoom - 1`. Measured: `#map=17` gives `map.getZoom() === 16`. Maid converts correctly almost everywhere. Two places are off by one, both in the imagery module (list below).
2. **Large features.** iD: below zoom 16 it draws only the selection ("wide selection"), loads nothing, and blocks editing. Rapid: no editing gate at all; it loads from OSM 15, draws from OSM 12, and hides everything below 12. Both refuse an operation when less than 80% of the feature is in view (`too_large`). Maid has no `too_large` check, and it keeps drawing and editing all loaded data at any zoom (measured at OSM 11).
3. **Decisions needed:** see section 6.

---

## A. Zoom numbering

### A.1 Conventions

| Editor | Tile size behind the zoom number | Evidence |
| --- | --- | --- |
| iD | 256 px, `TILESIZE = 256`; scale `k = 256·2^z / TAU` | [read] `.reference/id/modules/renderer/map.js:22-26`; `modules/geo/geo.ts:58-70` (`geoScaleToZoom` / `geoZoomToScale`, default tileSize 256) |
| Rapid | 256 px. Its world is `256 × 2^WORLD_ZOOM`, with `WORLD_ZOOM = 16` | [read] `.reference/rapid/node_modules/@rapid-sdk/math/src/geo.ts:133-150` (LEGACY functions, default 256); `constants.ts:16`; `src/Viewport.ts:26` |
| MapLibre (6.12.0 in `node_modules`) | 512 px. Raster source with `tileSize 256` requests tile `floor(zoom + log2(512/256))` = `zoom + 1` | [read] `node_modules/maplibre-gl/dist/maplibre-gl-dev.mjs:6136-6139` (`coveringZoomLevel`); vector sources must be 512 (line 2991) |
| Maid URL `map=`, camera, engine | OSM (256) | [read] `apps/maid/src/url/params.ts:17-33`; `MapView.tsx:149-151` (`zoom + 1`), `:404-406` (`initial zoom - 1`); `engine.ts:281-283` (`osmZoom = getZoom() + 1`) |

Measured in the app (probe 1):

| URL `map=` | MapLibre `getZoom()` | `engine.osmZoom()` | `/api/0.6/map.json` requests | bbox lon span |
| --- | --- | --- | --- | --- |
| 17 | 16 | 17 | 8 (first 3 checked) | 0.005493 = 360/2^16, a z16 tile |
| 16 | 15 | 16 | 24 | 0.005493 |
| 15 | 14 | 15 | 0 | none. Notice "Zoom in to load data" shown |
| 12 | 11 | 12 | 0 | none. Notice shown |
| 2 | 1 | 2 | 0 | none. Notice shown |

MapLibre `getMinZoom()` = -2 and `getMaxZoom()` = 23 [measured]. OSM equivalents: -1 and 24.

### A.2 Every zoom number in Maid, and what iD and Rapid use

Column "Conv." is the convention the number is written in. Verdict compares with iD or Rapid for the same thing.

| Place (file:line) | Number | Conv. | iD / Rapid for the same thing | Verdict |
| --- | --- | --- | --- | --- |
| `packages/renderer/src/engine.ts:107` `TILE_ZOOM` | 16 | OSM tile | iD `services/osm.js:45` `_tileZoom = 16`; Rapid `OsmService.ts:283` 16 | Same. Measured: requests are z16 |
| `packages/renderer/src/engine.ts:287-290` load gate, `params.ts:63` `minDataZoom` | 16 | OSM | iD `context.ts:390` `minEditableZoom = 16` (data loads only there) | Same |
| `engine.ts:1416-1441` `fitTo`: `POINT_ZOOM`, `FIT_MAX_ZOOM` | 17, 18 | MapLibre (= OSM 18, 19) | iD `renderer/map.js:957` zoomToEase clamps to 20; Rapid `MapSystem.ts` fitEntities clamps to 20 | Deliberate per the comment at `engine.ts:108-111`. One level below iD and Rapid's max. Convention not written in the code |
| `layers.ts:55-61` `lowZoomThreshold` | 18.5 - … - 1 | MapLibre (comment says so) | iD `renderer/map.js:661-669` `[-60,0,60] → [17,18.5,17]` in OSM | Same. Checked: lat 0 gives ML 17.5 = OSM 18.5; |lat| ≥ 60 gives ML 16 = OSM 17 |
| `layers.ts:65` `PIN_ZOOM` | 17.5 | MapLibre (= OSM 18.5) | iD has no pin threshold; direction markers start at 18 (`svg/points.js:97`, `svg/vertices.js:172`) | Maid's own value, "chosen on the dense scene". Not a port |
| `layers.ts:263,272,282,392` `minzoom` on oneway, sided, highlight-direction | 15 | MapLibre (= OSM 16) | iD draws OSM data only at zoom ≥ 16 (`renderer/map.js:678`) | Same. `highlight-direction` is Maid-only |
| `layers.ts:336` vertex-icon `minzoom` | 16 | MapLibre (= OSM 17) | iD `svg/vertices.js:150` `zoom >= 17` | Same |
| `layers.ts:290-300` `vertexRadius` step | 16 | MapLibre (= OSM 17) | iD `svg/vertices.js:47` `zoom < 17` | Same |
| `layers.ts:550-565` `point-dot` maxzoom, `point-pin` minzoom | PIN_ZOOM | MapLibre | none | Maid's own |
| `OsmLayers.tsx:14` source `maxzoom: 17` and `params.ts:65` `sourceMaxZoom` | 17 | MapLibre (= OSM 18) | none. Cut level of the GeoJSON tiles | Documented in `OsmLayers.tsx:11` as MapLibre zoom. OK |
| `MapView.tsx:409` `maxZoom={23}` | 23 | MapLibre (= OSM 24) | iD `renderer/map.js:22` maxZoom 24; Rapid `MapSystem.ts:18` MAX_Z 24 | Same |
| `MapView.tsx` (no `minZoom`) | -2 default | MapLibre (= OSM -1) | iD `map.js:19` minZoom 2; Rapid `MapSystem.ts:17` MIN_Z 2 | **Different**: camera goes three levels further out than iD and Rapid. Measured |
| `url/params.ts:17-33` `map=` | OSM | OSM | iD `behavior/hash.js` same order and meaning | Same |
| `MapView.tsx:42` `FALLBACK_CAMERA.zoom` | 17 | OSM | n/a | OK |
| `MapNotices.tsx:10-11` `camera.zoom < minDataZoom` | OSM | OSM | iD notice `ui/notice.js:33` (`zoom >= minEditableZoom`) | Same. Measured |
| `BottomDock.tsx:24` display | OSM | OSM | n/a | OK |
| `ZoomControls.tsx` and `useShortcuts.ts` (± one step) | step size not read | MapLibre | iD `+`/`-` step 1 | Not checked |
| `module-notes/src/notes.tsx:63-64`, `store.ts:73-74,129` | `getZoom() + 1` and FOCUS_ZOOM 17 (OSM), focus uses `max(getZoom(), 16)` | OSM and correct | iD `svg/notes.js:233` | Correct |
| `module-notes/src/notes.tsx:37-41` `minZoom` default | 12 | OSM | iD `svg/notes.js:20` 12; Rapid `PixiLayerOsmNotes.ts:8` 12 | Default same. But `apps/maid/src/maid.config.ts:79` passes `minZoom: config.minDataZoom` (16). Notes start at 16 in Maid |
| `module-street-imagery/src/map.tsx:27` `MIN_ZOOM` | 13 | **MapLibre** (`setZoom(map.getZoom())`, line 38) = OSM 14 | The package README `…street-imagery-react/README.md:34` says `zoom={map.zoom}` (MapLibre). iD Mapillary `services/mapillary.js:23` minZoom 14 (OSM) | Same as iD's Mapillary in OSM terms. The number is not labelled, and every other module uses OSM |
| `module-imagery/src/ImageryLayers.tsx:33` `setView({zoom: map.getZoom()})` | MapLibre | **MapLibre** | ELI `minzoom` is in the tile (OSM) convention: iD uses it as `zoomExtent` (`renderer/background_source.js:45`, `util/tiler.js:37`) | **OFF BY ONE** (see A.3) |
| `module-imagery/src/helpers.ts:87-89` `visibleAtZoom` | compares MapLibre zoom with ELI minzoom | mixed | as above | **OFF BY ONE**, same cause |
| `module-imagery/src/eli.ts:59` `layer:` from `getRasterLayerSpec` | ELI minzoom copied into the MapLibre style layer | mixed | as above | **OFF BY ONE** (see A.3) |
| `module-imagery/src/eli.ts:49-50` source `minzoom`/`maxzoom` | tile zoom (256) | tile | iD `tiler` | **Correct** (see A.3) |

### A.3 The off-by-one places

1. **Imagery listing.** `ImageryLayers.tsx:33` gives `visibleAtZoom` the MapLibre zoom. `helpers.ts:87-89` compares it with ELI's minzoom, which is in the OSM convention. A background with ELI minzoom 14 is listed from MapLibre 14 (OSM 15), one level late. [read]
2. **Imagery layer.** `eli.ts:59` builds the layer with `getRasterLayerSpec`. That function copies `layer.minzoom` into the style layer unchanged (`node_modules/.bun/@osm-editor-kit+maplibre-editor-layer-index@0.1.14+…/dist/chunk-6LZBRQ54.js:54-63`). MapLibre hides a style layer when `zoom < minzoom` with `zoom` = map zoom (`maplibre-gl-shared-dev.mjs:13937-13940`; `maplibre-gl-dev.mjs:24639`). So the layer appears one OSM level after ELI's minzoom. The source's own `minzoom` (line 49) is compared with tile zoom and is correct. [read] + [inferred from MapLibre code; not measured, since ELI is not reachable offline]

Count: two places in one module, both on the same cause. Nothing else in Maid is off by one. Every other number is either OSM with OSM use, or MapLibre with a comment or a `+1`/`-1` that is right.

---

## B. Minimum zoom for editing

| | iD | Rapid | Maid |
| --- | --- | --- | --- |
| Number | `minEditableZoom = 16` (OSM) [read: `core/context.ts:390`] | No editing zoom. `context.editable()` is true in every mode except save [read: `Context.ts:311-315`, `UiDrawModesTool.ts:205-207`] | None [read: no zoom check in `engine.ts` edit paths; `grep` finds zoom only in the load gate and `fitTo`] |
| Data loading | Only at ≥ 16 (`context.ts:303-306` returns unless `editableDataEnabled()`); tiles at z16 (`osm.js:45`) | Only at ≥ 15 (`Context.ts:23` `MINZOOM = 15`, `:478-482`); tiles at z16 (`OsmService.ts:283`) | Only at ≥ 16 (`engine.ts:287-290`); tiles at z16 (`engine.ts:107`). Measured: none at OSM 15 or lower |
| Drawing of loaded OSM data | Browse: nothing drawn below 16 (`renderer/map.js:404-423` `editOff`). Select: only the selection and its members (`map.js:334-349` "wide selection") | Drawn from ≥ 12 (`pixi/PixiLayerOsm.ts:20,205`). Below 12, features are made invisible by `PixiScene.ts:173-180` + `AbstractPixiLayer.ts:171-177` (`cull`) [inferred from code] | Everything loaded is drawn at all zooms; no visibility gate. Measured: rendered features 29,124 at OSM 17 and 47,063 at OSM 11 (larger view; not a cost figure). Layers with `minzoom` 15, 16 and 17.5 are the only exceptions |
| Editing | Draw/move/drag/rotate buttons disabled below 16 (`ui/tools/modes.js:56-57` `context.editable()`). Keys and menus: `behavior/operation.js:10`, `behavior/paste.js:14`, `modes/select.js:335,354,428`, `svg/midpoints.ts:63`, `svg/vertices.js:438` | Allowed at any zoom, subject to the 80% rule (section C) | Allowed at any zoom (no gate found) [inferred from code] |
| Map zoom while editing | `behavior/edit.ts:5` sets `map.minzoom(16)` during move/drag/rotate/draw; `renderer/map.js:579-583` snaps back to 16 | No such floor | No such floor |
| Message | Notice bar "Zoom in to edit" with a button that zooms to 16 (`ui/notice.js:18`; `data/core.yaml:583`) | None | "Zoom in to load data" (`MapNotices.tsx:10-19`). Measured at OSM 15, 12, 2. No editing message |
| Camera can go | `map.js:19` minZoom 2, so OSM 2 | `MapSystem.ts:17` MIN_Z 2, so OSM 2 | MapLibre -2, so OSM -1 [measured] |
| Max | 24 (`map.js:22`) | 24 (`MapSystem.ts:18`) | 23 MapLibre = 24 OSM (`MapView.tsx:409`) |

Note on the owner's wording: iD has no maximum zoom for editing. Its only editing gate is the minimum (16), plus the overall maximum of 24.

---

## C. Large features

### C.1 iD

- **Zoomed out below 16, no feature selected (browse):** OSM data is removed from the map (`renderer/map.js:404-423` `editOff`). `editOff` also moves a draw, move or drag mode back to browse (same lines).
- **Zoomed out below 16, with a feature selected (select-osm):** "wide selection" (`renderer/map.js:334-349`, `isInWideSelection()` at `map.js:1051-1052`). Only the selected entities and their deep members are drawn (`utilEntityAndDeepMemberIDs`). Other data is not drawn. Loading stops (`context.ts:303`). Select-note, select-data and select-error modes keep their own layers (`map.js:409-415`).
- **Operations:** disabled while the zoom is below 16 (see B). Above 16 they are disabled with reason `too_large` when less than 80% of the feature is in the view: `operations/move.js:24-27`, `copy.js:99`, `delete.js:73`, `extract.ts:64`, `disconnect.js:164` and others; scale in `modes/select.js:371-372` (`extent.percentContainedIn(map.extent()) < 0.8`). Definition: `geo/extent.ts:141`.
- **Zoom to this:** `Z` key (`data/core.yaml:706-707`), `modes/select.js:170-171` → `map.zoomToEase(entities)`. `renderer/map.js:945-968` clamps to 0..20. It can zoom out below 16 (no floor for browse/select).
- **Show only the selection and hide the rest:** no separate command. The closest thing is wide selection below 16. Selected entities can be forced visible past the feature filters (`features.forceVisible`, `renderer/features.js:56`, used by rotate and osmose).

### C.2 Rapid

- **Editing:** no zoom gate (section B).
- **Operations:** the same `too_large` rule as iD (`MoveOperation.ts:72-73, 85-88`, and the same in Rotate, Orthogonalize, Reflect, Copy, Disconnect, Circularize, Straighten, Delete). A power-user setting `poweruser.allowLargeEdits` turns it off (`SettingsSystem.ts:162`, `UiRapidPowerUserFeatures.ts:37`; default off).
- **Zoomed out:** draws OSM from 12; below 12 nothing from OSM is visible (culled). Data loads from 15 (section B). Notes from 12 (`PixiLayerOsmNotes.ts:8`).
- **Zoom to this:** `UiZoomToControl.ts:123-140`. A toggle: zooms to the selection's extent with `map.extentZoom`, and a second press returns to the previous transform. Shortcut key from `shortcuts.command.zoom_to.key`. No floor.
- **Show only the selection:** no equivalent found. `FilterSystem.ts:71,172,488` has `forceVisible` for selected or related entities, used by Osmose and KeepRight details.

### C.3 Maid

- **Editing zoomed out:** allowed at any zoom (no gate) [inferred].
- **`too_large`:** built in 5251d50 (2026-10-13). `packages/operations/src/extent.ts` gives the share of a feature in view; straighten, square, make round, disconnect, extract, flip and delete refuse a feature that is less than 80 % in view, with iD's wording. There is no power-user switch and no exemption for unsaved features, as in iD. Point-to-area has no rule. The rule uses the view box, so with a turned map it is not yet exact (see [rotate-and-tilt.md](rotate-and-tilt.md)). Before 5251d50 this line read: not implemented. [read]
- **Loaded data below the load zoom:** still drawn and hit-testable [measured: rendered features at OSM 11; inferred for hit-testing]. The tile set only grows: `engine.ts` removes a tile from `this.tiles` only when its request fails. Data is never unloaded.
- **Zoom to this:** `engine.fitTo` (`engine.ts:1416-1441`), `POINT_ZOOM` 17 and `FIT_MAX_ZOOM` 18 in MapLibre (= OSM 18 and 19). Not clamped to iD's 20.
- **Show only the selection:** not implemented. Filters (`packages/filters`) hide by category and cannot isolate a selection.

---

## D. Background imagery zoom limits

| | iD | Rapid | Maid |
| --- | --- | --- | --- |
| Source of min/max | `zoomExtent` from the imagery index (OSM tile zoom) [read: `renderer/background_source.js:45`] | `zoomExtent` in `ImagerySource.ts`; `zoomRange` default 5 (`ImagerySource.ts:148`) | ELI `minzoom`/`maxzoom` (`eli.ts:32`, `chunk-6LZBRQ54.js:36-50`) |
| Below min | Nothing. `validZoom(z, underzoom)` false, `underzoom` default 0 (`renderer/background_source.js:230-233`; `tile_layer.js:18,105`) | `isValidZoom` false, so no tiles (`ImagerySource.ts:278-282`). The loop falls back to coarser tiles down to `zoom - zoomRange` (`PixiLayerBackgroundTiles.ts:218-232`) | MapLibre source `minzoom` in tile zoom: no tiles below it [read: `maplibre-gl-dev.mjs:6272,6718`]. Correct in tile terms. The layer `minzoom` is one level late (A.3) |
| Above max | Overzoom by default (`background_source.js:46` `overzoom !== false`). Tiles from `zoomExtent[1]` are stretched (`util/tiler.js:37-38` clamps z0) | Overzoom: the max-zoom tiles are scaled up (`PixiLayerBackgroundTiles.ts:222-229`) | Overzoom: MapLibre stretches the last tiles (no `maxzoom` on the layer; `eli.ts` comment) |
| Message | None | None | The panel says "No background covers this view at this zoom" (`ImageryPanel.tsx:123`) |

---

## Measurements (headless Chrome, Maid dev server, scene `medium`)

- Probe 1 (`probe.mjs`): the table in A.1. No requests to any host except localhost (`blockedHosts` empty).
- Probe 2 (`probe2.mjs`): loaded at `#map=17`, then `jumpTo({zoom: 10})` (OSM 11). `renderedTotal` 29,124 at OSM 17, 47,063 at OSM 11 (the view is larger at OSM 11). Loaded data stays drawn. Tile requests were counted in probe 1 only.

Not measured: editing below 16 in Maid (no gate was found, so it was not run); the imagery layer (ELI is not reachable offline); iD and Rapid behaviour (not started).

---

## 6. What to decide

**D1. Editing below zoom 16.** Options:
- (a) iD: no editing below 16. Simple, but a forest bigger than the screen at z11 cannot be edited at all.
- (b) Rapid: editing allowed at any zoom, but refused when less than 80% of the feature is in view. Fits the owner's use case: zoom out to see the forest, edit it, and it still works because the 80% check is about the view.
- (c) Maid today: allowed at any zoom with no check. Risky for huge features.

Recommendation: (b). It is what Rapid does and it matches the workflow. Add the `too_large` rule first, with the power-user escape as in Rapid.

**D2. Data loading floor.** Keep 16 (iD) or 15 (Rapid). Recommendation: keep 16. Loading a half-country at z15 is the problem the owner names. Rapid's 15 is an OSM number that loads more than iD's.

**D3. What to draw below the load zoom.** Options:
- (a) iD: only the selection (wide selection), everything else removed from the map. Matches "keep only it visible and hide the rest".
- (b) Rapid: everything loaded, down to OSM 12; hidden below 12.
- (c) Maid today: everything loaded, at every zoom (measured: still drawn at OSM 11).

Recommendation: (a) for the selection, plus (b)'s floor of 12 for the rest. Hide the rest below 12 or 16.

**D4. Camera minimum zoom.** iD and Rapid stop at OSM 2. Maid can go to OSM -1 (MapLibre -2). Recommendation: set `minZoom` to 1 in MapLibre (= OSM 2) to match. Small, but it is a visible behaviour change.

**D5. Notes start zoom.** iD and Rapid show notes from OSM 12. Maid passes `minDataZoom` (16) into the notes module (`maid.config.ts:79`), so notes start at 16. Recommendation: 12, as iD, or keep 16 and say so in a comment. This is probably an unintended coupling.

**D6. Zoom to a single point.** Maid fits to OSM 18 (point) and OSM 19 (max). iD and Rapid go to 20. The code comment says the lower value is intended. Recommendation: keep unless a person asks for iD's behaviour.

---

## 7. Fix without a decision (plain off-by-one)

| File | Line | Change |
| --- | --- | --- |
| `packages/module-imagery/src/ImageryLayers.tsx` | 33 | `zoom: map.getZoom() + 1` with a comment "OSM zoom (256px tiles), as ELI's minzoom". This fixes the listing in `helpers.ts:87-89` and `ImageryPanel.tsx:90` |
| `packages/module-imagery/src/eli.ts` | 59 | After `getRasterLayerSpec`, set the layer's `minzoom` to `Math.max(0, minzoom - 1)` when it is defined. The source keeps ELI's value at line 49 of the library's `getRasterSourceSpec`, which is right |
| `packages/module-street-imagery/src/map.tsx` | 27 | Comment only: say "MapLibre zoom (13 = OSM 14, as the package README uses `map.zoom`)". The number stays |
| `packages/renderer/src/engine.ts` | 107-119, 1416-1441 | Comment only: say which convention each number uses. `POINT_ZOOM` and `FIT_MAX_ZOOM` are MapLibre |

After the imagery fix, run `bun run check`. The change in `eli.ts` should be checked with a real ELI layer that has a non-zero minzoom, since it cannot be checked offline here.

---

## Files read (repo, not edited)

- `.reference/id/modules/`: `geo/geo.ts`, `renderer/map.js`, `renderer/background_source.js`, `renderer/tile_layer.js`, `util/tiler.js`, `core/context.ts`, `services/osm.js`, `services/mapillary.js`, `svg/notes.js`, `svg/vertices.js`, `svg/points.js`, `modes/select.js`, `modes/rotate.js`, `behavior/edit.ts`, `behavior/operation.js`, `ui/notice.js`, `ui/tools/modes.js`, `ui/tools/undo_redo.js`, `ui/zoom_to_selection.js`, `ui/init.js`, `operations/*.js`, `geo/extent.ts`, `data/core.yaml`
- `.reference/rapid/modules/`: `Context.ts`, `core/MapSystem.ts`, `core/FilterSystem.ts`, `services/OsmService.ts`, `pixi/PixiLayerOsm.ts`, `pixi/PixiLayerBackgroundTiles.ts`, `pixi/PixiScene.ts`, `pixi/AbstractPixiLayer.ts`, `lib/ImagerySource.ts`, `ui/controls/UiZoomToControl.ts`, `ui/tools/UiDrawModesTool.ts`, `operations/MoveOperation.ts` and siblings, `core/SettingsSystem.ts`, `ui/UiRapidPowerUserFeatures.ts`; `node_modules/@rapid-sdk/math/src/geo.ts`, `constants.ts`, `Viewport.ts`
- Maid: `apps/maid/src/url/params.ts`, `components/MapView.tsx`, `components/MapNotices.tsx`, `components/BottomDock.tsx`, `components/ZoomControls.tsx`, `maid.config.ts`, `bench.ts`; `packages/renderer/src/engine.ts`, `layers.ts`, `OsmLayers.tsx`; `packages/module-imagery/src/ImageryLayers.tsx`, `ImageryPanel.tsx`, `helpers.ts`, `eli.ts`; `packages/module-street-imagery/src/map.tsx`; `packages/module-notes/src/notes.tsx`, `store.ts`; `packages/operations/src/operations.ts`
- MapLibre: `node_modules/maplibre-gl/dist/maplibre-gl-dev.mjs` (lines 2991, 6136-6139, 6272, 6718, 24639), `maplibre-gl-shared-dev.mjs` (13937-13940); ELI `chunk-6LZBRQ54.js` (36-63); street-imagery README line 34
