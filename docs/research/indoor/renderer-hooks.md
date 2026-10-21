# Renderer hooks for a level mode and 3D

Date: 2026-10-21. Read-only survey by one agent (Haiku 5.5). No file was edited except this report, no install, no check, no browser. Paths are repo-relative. Line numbers are from `grep -n` and `sed -n` on the working tree at that date.

Marks: **[M]** measured (grep, a node count over the committed fixture `fixtures/indoor.json.gz`, or a read of the code), **[I]** inferred from code, not run. Nothing here was timed at runtime.

## Summary

- **Features carry the tags as short properties, built once per entity.** A `level` property (or a `lv` string) can be added in the five feature constructors in `packages/renderer/src/build.ts` (lines 206, 256, 294, 584, 627). A level switch then needs no rebuild; only a tag edit of that entity rebuilds it, as it does today.
- **Recommended dimming: a paint expression on the data layers that reads a MapLibre global state** (`setGlobalStateProperty`, maplibre-gl 6.12.0). One call per level change, no source reload, the 43 base data layers in `packages/renderer/src/layers.ts` change, and buildLayers' `--edit` and `--select` twins follow. Global state must stay out of filters and layouts, which reload the source. Needs a spike before it is trusted. Fallback: `feature-state`, the same path as `related` and `focus`, with about 1,000 to 3,000 calls per change.
- **Picking has one choke point for the rule.** `packages/renderer/src/pick.ts` (`pickFeature` line 33, `pickAllFeatures` line 59) returns what `MaidEngine.pick` and `pickAll` return (engine.ts 1751, 1767), and draw snapping uses the same `pick` (draw.ts:335). Editing guards are `isReadOnly` (engine.ts 819) and `isDraggable` (drag.ts:52-61). A "not on the chosen level" test belongs next to these.
- **The display modes are a clean model for a `level=` URL value.** Engine state (engine.ts 188-194, 611-620), a URL parameter (shell/src/url/params.ts 95, url/state.ts 47), one writer hook (url/display.ts), keys in shell/src/useShortcuts.ts 174-178, and a choice panel (ui/src/MapDisplayChoice.tsx). The lens module (`packages/module-lenses/src/sync.ts`) shows the same state as a module.
- **Extension points cover a fill-extrusion layer without core changes**, through `map.layer` (ModuleLayers.tsx 19-30) or a `map.content` component with its own `<Source>`/`<Layer>` (RectangleOnMap.tsx 99-101 as the example). Two blockers for 3D sit in the shell: the map has `maxPitch={0}` and `pitchWithRotate={false}` (shell/src/components/MapView.tsx 727-728).

## 1. How features are built for MapLibre

### Feature types and properties

- `LineProps` build.ts 36-65: `id`, `b` (stacking band -1/0/1), `z` (sort key), `sc`, `sw`, `swl`, `sd`, `cc`, `cw`, `cwl`, `cd`, `hw`, `hwl`, `name`, `oneway`, `ac`, `side`, `ed`. Short names keep the worker payload small (comment at build.ts 35).
- `AreaProps` build.ts 67-88: `id`, `sc`, `sw`, `sd`, `fc`, `fo`, `fw`, `side`, `r`, `hw`, `name`, `ed`.
- `PointProps` build.ts 90-96: `id`, `icon`, `name`, `addr`, `ed`, plus `ConeProps` (viewfield.ts).
- `VertexProps` build.ts 97-104: `id`, `t` (tagged 0/1), `s` (shared 0/1), `icon`, `ed`, plus `ConeProps`. Vertices carry no tags.
- `hw` and `hwl` are shadow widths for the hover and selection halo. `ed` is what an edit changed (edits.ts), set by `markEdit` (build.ts 432-439) at the call sites 566, 576, 595, 637, 782.

### Where tags become properties

- Lines: `lineFeature` build.ts 206-249. Style from `resolveWayStyle(classes, 'line')`, the layer band from `wayLayer(tags)` (build.ts 213, defined at `packages/style/src/classes.ts` 193-203, reads `layer`, `covered`, `location`, `power`, `bridge`), label from `mapLabelOf`, oneway from `onewayOf`, side from `sidedOf`.
- Multipolygon outlines: `partialFeature` build.ts 256-285 (members of an incomplete relation), `areaFeature` build.ts 294-348 (`fc`/`fo` from the fill, `r` from area and perimeter, geometry 343-345). Relation tags reach the area through `outlineTags` (build.ts 413).
- Points: `buildPoint` build.ts 584-610. The icon from presets (`this.presets?.match`, 602-604), label, address plaque (`addr`, 598).
- Vertices: `buildVertex` build.ts 627-650. Props come from the state string `t`/`s` (state set in `buildVertex`'s caller, 611-625), `ed` at 637, icon at 641.
- Edit state read in `editOf` build.ts 479-481, from `editKindOf` (edits.ts).

### Where a new property goes

Add a field to the four `*Props` types (build.ts 36-104) and set it in the five constructors, through a helper like `markEdit`:

- `lineFeature` (206), `partialFeature` (256), `areaFeature` (294), `buildPoint` (584), `buildVertex` (627).
- A level read: `tags.level` (OSM tag, decimal and list values exist, see 3 below). Store the raw string `lv`, or a parsed form.
- Vertices have no tags. A vertex's level comes from its ways, as `isVertexFiltered` already does (build.ts 529-541, via `data.nodeWays`). Vertices are the hard case.

### Cost on a redraw [I]

- Full build: one extra tag read and one string per built feature. Measured: 1,354 of 5,118 tagged elements in the indoor fixture carry `level` (959 ways, 379 nodes, 16 relations) [M]. Rough payload: about 14 bytes each, so about 19 KB raw on top of the GeoJSON of about 5k features [I].
- Edit of one entity: `redrawEntities` (`packages/renderer/src/redraw.ts` 42-...) rebuilds only the changed entities. A level tag edit is a normal redraw of that entity; no new path.
- Level switch: nothing is rebuilt if the dimming uses a layer expression (section 2). Only `rebuildAll` (engine.ts 829-861), used by `setFilters` (787), `setLens` (809) and `reloadAfterUpload`, rebuilds everything. Do not reach for those for a level switch.

## 2. How dimming could work

### What exists

- Feature state in layers: `editing` (layers.ts 169, used at 181-184 to hide the original of an edited feature), `focus` (388-395), `selected`/`hover`/`related` (428-439 `opacity` and `haloColour`). Set from engine: `syncFeatureState` engine.ts 1475-1505, `paintState` 1497-1502 (sets both the big and the `--edit` source, not `SELECT`), `setRelated` 1444, `setFocus` 1460, `applyHighlight` 1566-1583 (also `SELECT`). A feature not yet loaded is skipped (`!this.featureSource.has(id)`, engine.ts 1485).
- Build-time dimming via the lens: `packages/style/src/lens.ts` `lensStyle` 80-96 (rules match tags only, `matchesTags` 60; `rest: 'dim'` gives `DIM_OPACITY` 0.25 at line 55). `packages/renderer/src/build.ts` `restyleLine` 159-183 and `restyleArea` 185-204 write the alpha into `sc`, `cc`, `fc`, `fo`, `ac`. A lens rule cannot match a level range, so this is not a fit (except as a one-off mode, which needs `rebuildAll`).
- Build-time read-only state: `FeatureBuilder.states` `readonly` (build.ts 503-508, `isFiltered` 512-527). Set by the filter set, so it is a rebuild for each change.

### Option (a): feature-state on every off-level feature

- Set `levelOff` (or similar) with `map.setFeatureState` per feature, on `SOURCES`, `EDIT_SOURCES` and `SELECT_SOURCES`, as `paintState` does for two sources [M for the pattern, engine.ts 1497-1502].
- Layers that change: the same 43 base data layers as (b) need a paint expression on opacity, e.g. `['case', ['boolean', ['feature-state', 'levelOff'], false], 0.25, 1]`.
- Count of calls [M from the fixture]: for level 0, 1,030 of the 1,354 levelled elements are off-level; for level -1, 860; for level 1, 1,176 [M, node count over `fixtures/indoor.json.gz`]. Two or three `setFeatureState` calls each, so roughly 1,700 to 3,500 calls per level change [I].
- Gaps [I]: features that load later must get the state (the `featureSource.has` check at engine.ts 1485 only sets known ones), and vertices need a way-derived state. Feature state is per tile source id, so every new batch needs a pass.
- Works on MapLibre 6.12.0 for sure: the same mechanism is in use for `related`, `focus` and `hover`.

### Option (b): a paint expression over a global state (recommended, needs a spike)

- Set one global state, e.g. `level`, with `map.setGlobalStateProperty('level', n)` (maplibre-gl). Each data layer's opacity reads a feature property (`lv` or `lo`/`hi`) and compares it with `['global-state', 'level']`.
- Support in maplibre-gl 6.12.0 [M, read in `node_modules/maplibre-gl/dist/maplibre-gl-dev.mjs`]:
  - `setGlobalStateProperty` at line 14589; `_setGlobalStateValues` 14603-14612; `_applyGlobalStateChanges` 14619-14645.
  - For each layer: paint refs go to `_updatePaintProperty` (14631), layout or filter refs reload the layer's source (14630: `sourceIdsToReload.add(layer.source)`), visibility refs recalc the layer (14632-14634).
  - `getLayoutAffectingGlobalStateRefs` collects the refs of visibility, layout and filter (in `node_modules/maplibre-gl/dist/maplibre-gl-shared-dev.mjs`, the method of the style layer class, found by name).
  - Repo: `package.json` line 88 patches maplibre-gl@6.12.0; `packages/renderer/package.json` line 23 `^6.12.0`. No `global-state` or `setGlobalStateProperty` use exists in `packages/` or `apps/` yet [M, grep].
- Layers that change: the 43 base data layers (list in section 5 and the table below). buildLayers (layers.ts 162-203) copies each into `--edit` (175-190) and `--select` (`selectionTwin`, 261-289) twins, so the expression follows to 129 instances [I].
- Rules: never put `global-state` in a `filter` or in a layout property (source reload) [M, 14630]. Use it in paint opacity only. The symbol layers need `text-opacity` and `icon-opacity` (buildLayers `OPACITY` map, layers.ts 170-175).
- Cost on a level change [I]: one `setGlobalStateProperty`, a loop over every layer (about 200 with the highlight and tool layers, buildLayers), a `setPaintProperty` on the layers that read it, a repaint, and one message to the workers ("UGS" broadcast, 14644). No feature rebuilt, no source reloaded.
- Open risk [I, not traced to the end]: data-driven paint values that read a global state need their per-feature buffers refreshed on loaded tiles. `_updatePaintProperty` sets `_updatedPaintProps` (15319) and `updatePaintBuffers` exists (shared-dev, 16107), but the path from the paint change to the tile buffers was not followed. Test with a spike: a level change with 1,000 features, check that the picture changes without a reload. If it does not, fall back to (a).

### Option (c): filter

- A `filter` with `global-state` reloads the source (layout-affecting refs, 14630). A filter without it needs `setFilter` on each layer and is not better than (b). Reject for level switching. Filters also hide, and the mode dims.

### Option (d): lens rules by level (build-time)

- Works with the existing lens path (section 1). Needs a numeric or list match in `matchesTags`, and a `rebuildAll` (`setLens`, engine.ts 809-816) for every change. Reject for level switching.

### Layers to change for (a) or (b)

Data layers in `packages/renderer/src/layers.ts` that draw OSM features (source `SOURCES.areas|lines|points|vertices`): 33 literal lines [M, grep `source: SOURCES.(areas|lines|points|vertices)`], 43 layers at run time after the 3-band loop [M by count: lines 497 and 514 each make 12]:

- Areas: `area-fill-partial` 339, `area-stroke` 357, `area-stroke-dashed` 369, `focus-halo-areas` 399 (not dimmed, it is a halo), `highlight-halo-areas` 444, `edit-halo-areas` 466, `area-sided` 568.
- Lines: `focus-halo` 411, `highlight-halo` 451, `edit-halo` 474, the 12 `line-casing-b`, `line-casing-dashed-b`, `line-stroke-b`, `line-stroke-dashed-b` (loop 484-523), `line-oneway` 549, `line-sided` 558.
- Vertices: `highlight-halo-vertex` 595, `focus-halo-vertex` 606, `edit-halo-vertex` 617, `vertex` 629, `vertex-tagged` 640, `vertex-icon` 649, `vertex-tagged-icon-dot` 664.
- Points: `highlight-halo-points` 825, `focus-halo-points` 831, `edit-halo-points` 842, `point-address-dot` 857, `point-address` 869, `point-dot` 902, `point-pin` 919, `highlight-halo-pin` 943, `focus-halo-pin` 957.
- Labels: `label-line` 1000, `label-area` 1013, `label-point` 1021.

Not dimmed: the highlight layers (`highlight-midpoint` 674, `highlight-vertex` 691, `highlight-direction` 707, previews, field overlay, measure, `active-point-pin` 970 on the active source, guides 1042-1050), the cones (`coneLayers` 220).

Counting: a dimmed layer needs its opacity property present. Some layers have none (e.g. `area-sided`, `vertex`, `point-dot` set `circle-opacity`; check each in the change).

### Redraw cost of the expression itself [I]

- Each data-driven expression is evaluated per feature in the paint step. Opacity is one multiply, cheap next to the layers' existing `step`/`interpolate` widths (layers.ts 293-296 `byZoom`).

## 3. Picking and selection

- The engine picks through `map.queryRenderedFeatures`, never through `interactiveLayerIds` on the Map (pick.ts 1-4 comment).
- `pickFeature` pick.ts 33-57: query over a tolerance box with `layers: layerIds`, then `skip` filter (line 46-50), then `pickBest` (priority by source, 25-31).
- `pickAllFeatures` pick.ts 59-82: query, candidates by id, `orderPicks` (pick-order.ts). No `skip` here.
- `MaidEngine.pick` engine.ts 1751-1758 (with `skip`), `pickAll` 1767-1769. `handleAt` 1033-1043 (handles only).
- Callers: `shell/src/components/MapView.tsx` 285 (`pick`), 303 (`pick` || `midpointAt`), 409 (`pick`), 422 and 676 (`pickAll`). `packages/renderer/src/draw.ts` 335 (snap, with `skip`), `engine.ts` 1145-1146 (reroute, checks `isReadOnly`).
- `interactiveLayerIds` layers.ts 1068-1071 (regex over layer ids, `--edit` twins included). `MapView.tsx` 193 uses `buildLayers` for it on every render.
- Editing guards: `isReadOnly` engine.ts 819-821 (reads `builder.isReadOnly`, a build-time state), `isDraggable` drag.ts 52-61, `changeTags` guard engine.ts 770, move and rotate guard engine.ts 877, reroute 1146.

Where the rule goes [I]:

1. A predicate `levelOff(id)` in the engine (reads `data.way(id)` or `data.node(id)` tags, for a vertex its ways via `data.nodeWays`). Applied in `pickFeature` and `pickAllFeatures` after `queryRenderedFeatures` (pick.ts 46 and 67-72). `queryRenderedFeatures` returns features whatever their paint opacity [I, MapLibre behaviour, not checked in code]. So a layer expression alone does not stop a pick.
2. Include `levelOff` in `isReadOnly` (or a separate `isLocked` used by the guards above), so a dimmed feature cannot be dragged, changed or moved.
3. Snapping (draw.ts 335) gets the rule for free through `engine.pick`.
4. Selection from the URL (`id=`) or a relation member on another level is still allowed; decide in the open questions.

## 4. How the `display` modes are wired (model for `level=`)

Engine state:
- `displayShown` engine.ts 187-188, set from `options.display` at 194 (`EngineOptions.display` 112-113).
- Getter `get display()` 611-613; `setDisplay` 616-621 sets the field and calls `this.changed()` (subscribers re-render).
- Layer types: `DISPLAYS`, `MapDisplay`, `displayOf` in `packages/renderer/src/layers.ts` 92-104; `buildLayers` reads `options.display` at 322-323 (`wire`, `edits`) and sets paint and visibility of the layers, no layers added or removed (comment 319-321).

Shell:
- URL schema: `packages/shell/src/url/params.ts` 91-95 (`display: parseAsStringLiteral(['wireframe', 'edits'])`, no key for the normal look).
- Hook: `packages/shell/src/url/state.ts` 46-48 (`useDisplayParam`, `history: 'replace'`).
- Writer: `packages/shell/src/url/display.ts` 15-25 (`useDisplayUrl`, reads `engine.display` with `useSyncExternalStore`, writes the URL). Mounted once in `packages/shell/src/App.tsx` 24 and 31.
- Start value: `packages/shell/src/config.ts` 105-108 (`readDisplay`: link, then stored choice, then normal), used at 145; passed to the engine at `packages/shell/src/shell.ts` 122.
- Map reads it: `packages/shell/src/components/MapView.tsx` 181-190 (`options`, `display: useEngine((e) => e.display)`), 193 (`interactive`), then `OsmLayers` 754-755.
- Keys: `packages/shell/src/useShortcuts.ts` 174 (W), 178 (G), both through `chooseDisplay`.
- Choice: `packages/ui/src/display.ts` 10-13 (`chooseDisplay`: `engine.setDisplay` and the settings `shown.display`). Panel: `packages/ui/src/MapDisplayChoice.tsx` 12-37.

Model for a `level=` value [I]:
- Engine: a `level` state with `setLevel` (like `setDisplay`), `changed()` on change. Engine options take the start value like `display` (194).
- URL: `level` in `params.ts` (a number or a string, to allow `-1.7`), a `useLevelParam` in `state.ts`, a writer like `useDisplayUrl`, a start value in `config.ts` (like `readDisplay`).
- Keys and panel: as for W and G.
- Layers: `buildLayers` gets the level in `LayerOptions` (layers.ts 107-127) and writes the global state or the feature-state from there, so the layers stay pure data. Note that `LayerOptions` is rebuilt on every MapView render (`MapView.tsx` 181-196).
- Lens-as-module model: `packages/module-lenses/src/sync.ts` (`useUrlSetting`, the `lens` URL keeps the live value), `packages/module-lenses/src/module.tsx` 33-37 (`LensUrlSync` registered as `map.content`). A `level` module would follow it and keep the core unchanged.

## 5. Map content modules and layers (model for fill-extrusion)

Core layers:
- `packages/renderer/src/OsmLayers.tsx` 17-61: sources (`SOURCES`, `EDIT_SOURCES`, `SELECT_SOURCES`, `ACTIVE_SOURCE`), the background `BELOW_OSM_LAYER` (56), then `layers.map(... <Layer/>)` (58-60) from `buildLayers(options)` (35). `data` stays `EMPTY` (the engine pushes features).

Extension points, `packages/renderer/src/extension-points.ts`:
- `MapLayerProps` 19 (layer props without `source`), `MapLayerItem` 22-31 (`id`, `source: {id, data}`, `layers`).
- `BELOW_OSM_LAYER` 33 (draw under the OSM data with `beforeId`).
- `MapContentProps` 35-43 (`editor`, `belowOsm`, `engine`), `MapContentItem` 51 (`id`, `component`).
- Registered as `'map.layer'` and `'map.content'` 141-142.
- `packages/renderer/src/ModuleLayers.tsx` 19-42: `map.layer` items become `<Source>` and flat `<Layer>` (30-36), `map.content` components render inside the map (39-42).

Examples:
- `packages/shell/src/modules/scene-bounds.ts` 23-52: a `map.layer` with a source and a line layer (`scene-bounds-outline`).
- `packages/module-shapes/src/rectangle/RectangleOnMap.tsx` 99-101: `<Source>` and `<Layer>` inside a `map.content` component.
- `packages/module-parking/src/lens/side-features.tsx` 83-85: same pattern.
- `packages/module-street-imagery/src/index.ts` 124 registers a list of layers on `map.content`.

For fill-extrusion [I]:
- A `map.layer` item with one GeoJSON source of rooms (`indoor=room|area|corridor`, `level`, `height`, `min_height`), and a `fill-extrusion` layer with `fill-extrusion-height` and `fill-extrusion-base` by level (a level in metres, say 3 m, from `level` and a default) and an opacity or filter by the chosen level. Features come from the engine's `data` in a `map.content` component, or a second engine source. A `map.layer` item draws on top of the OSM layers (no `beforeId`), so 3D rooms would cover the OSM data; use `beforeId` if they must sit under the labels.
- The map must allow pitch: `shell/src/components/MapView.tsx` 727 `maxPitch={0}` and 728 `pitchWithRotate={false}`. `docs/research/rotate-and-tilt.md` says tilt is not built and is off (line 13).
- Editing under pitch is in the tilt research file (pick and move were tested at 45 degrees, the rotate tool was not right).

## Recommendation

Dimming: **option (b), a global-state paint expression on the 43 base data layers**, with the picking rule in `pick.ts` and `isReadOnly`. Reasons:
- One call per level change, no feature rebuilt, no source reloaded: a level change is a paint change (sections 1 and 2).
- Features that load later are right without bookkeeping: they carry their own level in the property.
- The feature-state alternative (a) works today, but needs about 1,700 to 3,500 calls per change and a re-apply on each new batch, and it does nothing for vertices without extra code.
- The one risk is that data-driven paint on loaded tiles refreshes under a global-state change. Settle it with a short spike on the `indoor` scene before the step is committed. If it fails, switch to (a) and keep the layer list and the picking rule the same.
- Do not use filters or layouts with the level, and do not use a build-time lens or `rebuildAll` for switching.

Level data: store the raw `level` string and parse it in the expression, not `min`/`max`, because lists have gaps (`0;2`) and decimals (`-1.7`) occur [M: 327 multi-value elements and the decimal values in the fixture]. Use a string with separators, e.g. `;-1;0;1;` with `index-of` in the expression [I].

## Measured numbers (fixture `fixtures/indoor.json.gz`, read by `node` count, not by the app) [M]

- Elements 15,747; tagged 5,118; with `level` 1,354 (ways 959, nodes 379, relations 16).
- Multi-valued `level` (`;`): 327. Unparsable by a number split: 6 (the mistyped `0,5`).
- Off-level counts (levelled features not on level L): L=0: 1,030; L=1: 1,176; L=2: 1,217; L=-1: 860; L=-2: 905.
- Level values by count (top): `0` 232, `-1` 256, `-2` 244, `1` 133, `2` 109, `-2;-1` 116, `-1.7` 18, `-1.3` 18.
- Code sizes: `layers.ts` 1,072 lines; `build.ts` 851; `engine.ts` 1,781; `pick.ts` 99; `redraw.ts` 131.
- Data-source layers at run time: 43 base (section 2), about 129 with the `--edit` and `--select` twins [I, by buildLayers].

Not measured: any timing (draw, pick, level switch, memory). Those need a spike in the browser, with a person or the bench (`bun run bench-model`, `bun run bench-validation` exist for model and validation timings).

## Open questions

1. Does a data-driven paint with `global-state` refresh the buffers of loaded tiles without a reload? (Spike, section 2.)
2. Vertices: a vertex shared by a level-0 corridor and a level-1 stair, is it on level 0 (visible) or 1? Rule: visible if any way is on the level (the `isVertexFiltered` rule). Needs a decision and a per-vertex property or a way lookup at pick time.
3. Selection by URL (`id=`), relation members and the relation column for a feature on another level: allowed, or dimmed and not selected? Decide before the pick rule.
4. Level of a multipolygon area: the relation's `level` or its members' (`outlineTags`, build.ts 413)? The current code uses the relation's tags for the outline.
5. Parsing: decimals (`-1.7`), the mistyped `0,5` (6 elements), and ranges `-2-32` (none in the fixture, documented on the wiki in `docs/research/indoor/tagging-model.md`). A feature with an unparsable level: dimmed, normal, or flagged?
6. `repeat_on` (doors, lifts repeated on other floors): a feature with `repeat_on` but no `level` is "no level" and stays normal on every level. Fixture: 1,885 elements have an `indoor`, `highway`, `building`, `amenity` or `area` tag and no `level` [M, node count]; their `repeat_on` use was not counted.
7. 3D: a second source built from the same data, or the same `lv` read in `fill-extrusion`? Tilt is off (`MapView.tsx` 727-728) and the tilt research has open items.
8. Does `queryRenderedFeatures` return features whose paint opacity is 0? Assumed yes [I]; check in a spike, since it decides whether the JS predicate is needed for every pick or only for edits.
9. Layer count at runtime: the 129 figure assumes buildLayers' twins are created for every data layer; confirm with the layer list of a running map before a budget is set.
