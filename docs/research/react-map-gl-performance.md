# react-map-gl performance for Maid, 2026-10-14

An audit of `react-map-gl/maplibre` against plain MapLibre, for the things Maid does with a map. Audit and measurement only: no change to Maid's code and none to the library. Nothing here was sent anywhere.

Every claim carries one of three marks:

- **measured**: a number from `bun run bench-rmgl` (see "Method"). Medians unless said otherwise.
- **read**: read in the installed library code. Places are `file:line` in the `dist/` folder of `@vis.gl/react-maplibre` 8.1.3 (`node_modules/.bun/@vis.gl+react-maplibre@8.1.3+*/node_modules/@vis.gl/react-maplibre/dist/`).
- **inferred**: follows from what was read or measured, not checked on its own.

**The numbers come from a busy machine.** Another agent was editing and testing in this repository during the runs. Three full runs of 5 repetitions were made. The numbers below are from the second run. The first run's value follows in brackets where it differs. `reports/rmgl-bench.json` holds the third run. A partial run had overwritten the second run's file, so partial runs now write a file of their own. The third run's medians fall inside the spread of the first two. Some values are worth naming: one image per frame adds 0.6 ms of script (6.87 against 6.27), a burst of 30 adds 0.36 ms; a style swap takes 858 ms with the prop, 849 ms with re-add, and 67 ms with `transformStyle`; `updateData` takes 7.4 ms to idle; mounting Maid's layers with data takes 892 ms with react against 809 ms raw, the opposite order of run 2. Between the runs Maid's `buildLayers` gained 8 layers (the viewfield cones, commit 0c3e09c), so run 1 drew 113 layers and run 2 drew 121. Repeat `bun run bench-rmgl` on a quiet machine before anyone relies on a number.

Older notes about MapLibre itself are not repeated: [maplibre.md](maplibre.md), [performance-2026-10-13.md](performance-2026-10-13.md) (section "Layers that take part in a zoom frame", which also covers where a late `<Layer>` lands without `beforeId`) and [../upstream/maplibre-updatedata-inconsistent-tiles.md](../upstream/maplibre-updatedata-inconsistent-tiles.md).

## Summary

react-map-gl costs Maid very little today. Maid keeps every hot path out of the library. The engine pushes data with `updateData`, picks features itself, the camera is uncontrolled and the style never changes. The library's own overhead is small wherever it was measured. It costs real time in places Maid does not use: a controlled camera, `interactiveLayerIds`, style swaps, large `data` props. One path Maid does use is costly. Every `<Layer>` and `<Source>` renders again on each `styledata` event, and Maid causes those events with every marker image it adds.

| # | Finding | Maid | Typical app | Mark |
| --- | --- | --- | --- | --- |
| 1 | Every `styledata` event renders every `<Layer>` and `<Source>` again: 242 `<Layer>` renders per added image with Maid's 121 layers, 0.35 to 1.1 ms main thread per event | low to medium | low | measured |
| 2 | A `data` prop with new feature objects is compared deeply before `setData`: 7.4 ms (9.8) for 10,457 lines | low | medium | measured |
| 3 | There is no declarative path to `updateData`: a moved feature costs a full `setData` (217 ms to idle) instead of 5 ms | none (Maid is imperative) | high | measured |
| 4 | A style swap removes and re-adds every source and layer: 932 ms against 83 ms with `transformStyle` | none | high | measured |
| 5 | A controlled camera draws one frame behind on 99 percent of camera moves | none | medium | measured |
| 6 | `interactiveLayerIds` queries rendered features on every mousemove; the query itself is the cost, the library adds nothing measurable | none | medium | measured |
| 7 | A changed option of a GeoJSON `<Source>` (for example `maxzoom`) calls `setData(props.data)`: for Maid's engine-fed sources that would wipe the data | latent bug | low | read |
| 8 | Parent re-renders, mount time, camera frames, `setProps`: no difference from raw MapLibre that rises above the noise | low | low | measured |

## Method

`bun run bench-rmgl` (files in `tools/bench/rmgl/`):

- `prepare.ts` runs Maid's own feature builder over the dense fixture (Neukölln: 10,345 areas, 10,457 lines, 20,264 points, 59,291 vertices) and Maid's own `buildLayers`. So both sides draw Maid's real 14 sources and 113 (run 1) or 121 (run 2) layers, with the same source options (`promoteId`, `tolerance: 0`, `maxzoom: 17`, `buffer: 64`). Icon images are taken out of the layouts, because Maid makes them at run time; text labels stay and use the shell's local fonts. The sets with 20, 100 and 200 layers are copies of Maid's 33 visible data layers on the four data sources.
- `build.ts` builds one page with Vite in production mode with the React Compiler (`react({ compiler: true })`, as `apps/maid`). React, react-map-gl, MapLibre and Vite are taken from where `apps/maid` resolves them, so the versions are the ones Maid ships, MapLibre with Maid's patch. No install was needed.
- The page has two modes. `?mode=react` builds the map as the react-map-gl skill prescribes: `MapProvider`, `<Map>` with event props and `initialViewState`, flat `<Source>` and `<Layer>` siblings in JSX. `?mode=raw` builds the same map with `new Map()`, `addSource` and `addLayer` on `load`. Both use the same style (empty, a background layer, no paint transitions), the same zoom (MapLibre 16, OSM 17, Maid's opening zoom), `fadeDuration: 0`, a 1280 x 800 viewport.
- `run.ts` serves the built files itself on port 5186 (`PORTS.rmglBench`), drives one tab per mode with system Chrome (headless), blocks every request that is not for 127.0.0.1 (none was made), and reads main-thread time from the Chrome DevTools Protocol (`Performance.getMetrics`: `ScriptDuration`, `TaskDuration`) around each step. Worker time (tiling, parsing) is not in the main-thread numbers, but it is in the "to idle" times.
- Each step records: how long the call blocks, the time to the next drawn frame (plus one task, so timers and React renders it caused have run), and the time until the map is idle again. A first map per tab is mounted and removed before measuring.
- 5 repetitions per scenario. The results are in `reports/rmgl-bench.json` (medians, p95, min, max and all samples).

What it cannot see: the GPU, input latency as a person feels it, and Maid's own engine. It measures the library against MapLibre, not Maid.

## Code audit

### `<Map>` (components/map.js, maplibre/maplibre.js)

- **Mount** (read). `map.js:14-68`: one `useEffect` with no dependencies loads `mapLib` (a promise even when it is passed in), makes `new Maplibre(...)` and sets it as state, which renders the children. `maplibre.js:201-271`: the constructor builds the options, creates the map, and installs a camera hook (`setTransformCameraUpdate`, `maplibre.js:238-245`) **always**, also for an uncontrolled map. It subscribes to `style.load`, `sourcedata` and **every** event it knows: 14 pointer, 15 camera and 13 other events (`maplibre.js:257-269`), whether a prop handles them or not. `create-ref.js:24-39` binds every public method of the map once (a few hundred `bind` calls, once per mount).
- **Every render of `<Map>`** (read). `map.js:69-73`: a layout effect without dependencies calls `setProps(props)`. `maplibre.js:134-149` then runs `_updateSettings` (3 `deepEqual` and the zoom and pitch limits), `_updateSize` (only with the `viewState` prop), `_updateViewState` (`getTransformLike` allocates a `LngLat` and a padding copy and calls six getters), `_updateStyle` (identity of `cursor` and `mapStyle`), `_updateStyleComponents` and `_updateHandlers` (8 `deepEqual` on booleans). A few microseconds (inferred); it only matters if `<Map>` renders very often.
- **Camera events** (read). `maplibre.js:95-105`: `_onCameraEvent` computes `e.viewState` (`transformToViewState(getTransformLike(map))`, two objects and a `LngLat`) **before** it looks for a handler. During a zoom frame MapLibre fires `move` and `zoom`, so this runs twice per frame even if the app has no `onZoom`.
- **The camera hook** (read). `maplibre.js:106-112`, MapLibre `applyUpdatedTransform` (`maplibre-gl-dev.mjs:23397-23455`): with the hook set, MapLibre keeps a copy of the transform for the requested camera and clones it once more per update. For an uncontrolled map `applyViewStateToTransform` finds no `longitude` in the props and returns no changes, so the hook costs those clones and nothing else (inferred: small, not separable in the camera scenario).
- **Controlled camera** (read, measured). With `longitude`, `latitude` and `zoom` as props, `_onCameraUpdate` returns the camera of the current props, so MapLibre draws the camera React last saw. `onMove` gets the proposed camera in `e.viewState`; the app sets state; `setProps` runs, but `_updateViewState` skips the map while `isMoving()` (`maplibre.js:327-339`). The new camera is applied at the next camera update. **The map is one frame behind on 99 percent of `move` events** (measured, scenario 6). Frame times stay at 16.7 ms: it is latency, not jank.
- **The `viewState` prop** (read, observed). `_updateSize` (`maplibre.js:305-317`) calls `map.resize()` on every `setProps` when `viewState.width` and `height` do not match the canvas. The type requires them; without them (a cast or plain JavaScript) `resize()` fires `move`, `onMove` sets state, and React stops with error 185 (maximum update depth). Seen in a first version of the benchmark; that variant was removed.
- **Pointer events and hover** (read). `maplibre.js:113-126`: every `mousemove` and `mouseout` runs `_updateHover`. With `interactiveLayerIds` and a mouse handler it calls `_queryRenderedFeatures` (`maplibre.js:449-461`), which allocates `interactiveLayerIds.filter(map.getLayer.bind(map))` and queries. The result is kept in `_hoveredFeatures` and reused as `e.features` for the handler, so it is one query per event, not two. Without `interactiveLayerIds` the path is a few property reads.
- **`cursor`** (read). `maplibre.js:385-387`: a style write on the canvas when the prop changes. Cheap.
- **`mapStyle`** (read). `maplibre.js:388-398`: `setStyle(normalizeStyle(mapStyle), { diff: styleDiffing })` when the prop's identity changes. `normalizeStyle` copies the layer list. With the diff, every source and layer that `<Source>` and `<Layer>` added is not in the new style, so the diff removes them, and they come back through `styledata` (below).
- **`sourcedata`** (read). `maplibre.js:257-260`: every `sourcedata` event (each tile load) runs `_updateStyleComponents`, which returns after four falsy checks when no light, sky, terrain or projection prop is set. Cheap.
- **`reuseMaps`** (read). `maplibre.js:150-199`: keeps the map and moves its DOM to the new container. Maid does not use it.

### `<Source>` (components/source.js)

- **Every render** (read). `source.js:99-106`: `map.getSource(id)`, then `updateSource`, which runs `deepEqual(prevProps[key], props[key])` **for every prop** except `id` and `children` (`source.js:25-30`). For `data` that is a deep walk of the GeoJSON whenever the identity changed. `deepEqual` (`utils/deep-equal.js:21-59`) returns early on identical references, so an immutable update (new array, the other feature objects kept) is a cheap walk over references; a collection whose feature objects are all new is compared value by value up to the first difference.
- **What a change does** (read). `source.js:35-37`: for a GeoJSON source **any** changed prop calls `source.setData(props.data)`: the whole collection, never `updateData`. A changed option (`maxzoom`, `tolerance`, `cluster`) is not applied. The data is sent again instead.
- **`styledata`** (read). `source.js:70-97`: each `<Source>` subscribes to `styledata` and on every event schedules `setTimeout(() => setState(v + 1), 0)`: one timer and one React render per source per event.
- **Creation and re-adding** (read). `createSource` (`source.js:7-18`) only works once `map.style._loaded`; before that the first render does nothing and the timer render adds the source. After a style swap the same path adds it again with `props.data`.
- **Removal** (read). `source.js:76-93`: the cleanup calls `map.getStyle()` (a serialisation of all layers and sources) once per `<Source>` to find its layers.

### `<Layer>` (components/layer.js)

- **Every render** (read). `layer.js:83-96`: `map.getLayer(id)`, then `updateLayer` (`layer.js:6-50`). It compares `layout` and `paint` by identity first and only walks their keys with `deepEqual` when the object is new; `filter` is always passed to `deepEqual` (cheap when identical); zoom range and `beforeId` by identity. Only changed keys reach `setLayoutProperty`, `setPaintProperty`, `setFilter`, `setLayerZoomRange`, `moveLayer`. With identical objects one render is a `getLayer` and a few comparisons (measured below: about 1 microsecond per layer).
- **`styledata`** (read, measured). `layer.js:67-81`: each `<Layer>` subscribes to `styledata` and calls `setState(v + 1)` on every event, without a timer. MapLibre fires `styledata` once per frame in which the style changed (`Style.update`, `maplibre-gl-dev.mjs:14854`) and at once for each `addImage`, `removeImage` and sprite change (`maplibre-gl-dev.mjs:15051-15056`, `15768`). So a `setPaintProperty`, `setFilter`, `setLayoutProperty`, `addLayer` or `addImage` anywhere renders **every** `<Layer>` of the map again. `setFeatureState` does not (read: `Style.setFeatureState`, `maplibre-gl-dev.mjs:15326-15358`, sets no `_changed`); `setData` and `updateData` fire `sourcedata`, not `styledata` (inferred from `maplibre-gl-dev.mjs:25071-25074`, where the event's `dataType` decides).
- **Creation order** (read). A `<Layer>` whose source is not there yet does nothing (`layer.js:51-59`). It is added on a later `styledata`. On mount this is the normal case: the layers render on the first `styledata` before the sources' timers have run, and are added one frame later.

### `useMap`, `MapProvider`, `useControl`

- `use-map.js:28-32` (read): `MapProvider` passes a new context object on each of its renders, so every `useMap()` caller renders again when `MapProvider` renders. `useMap` itself memoises on `maps` and the current map. The cost is small. Maid's `MapProvider` sits in `App` (`packages/shell/src/App.tsx:98`).
- `use-control.js` (read): adds the control in an effect once. Maid uses it once (`packages/module-data-layers/src/MapLayers.tsx:70`). The cost is negligible.
- Maid uses no `<Marker>` or `<Popup>`.

## Measurements and findings

### 1. `styledata` renders every `<Layer>` and `<Source>` again

- **What**: each style change (paint, filter, layout, layer added, image added) renders all `<Layer>` components once more, and schedules one timer and render per `<Source>`.
- **How much** (measured, scenarios 9 and 3): **242 `<Layer>` renders per added image** with Maid's 121 layers (226 with 113 in run 1): two `styledata` per image, one at once and one in the next frame. The same count per paint prop change. The renders are cheap one by one: one image per frame costs 6.71 ms main-thread script per step with react-map-gl against 5.81 ms raw, +0.9 ms (6.89 against 6.53, +0.36); 30 images added in one task cost 5.9 against 5.55 ms, +0.35 ms (6.4 against 5.3, +1.1), and the 30 `addImage` calls block 0.8 ms against 0.1 ms. A burst gives the same 242 renders as one image, because React batches them. So the extra is 0.35 to 1.1 ms per `styledata` storm, and the two runs do not agree closer than that.
- **Why**: `layer.js:67-73` and `source.js:70-75` subscribe to `styledata` and force a render on every event, also when nothing about the layer changed. The render then finds nothing to do.
- **Maid**: exposed. Maid adds marker images on demand, one `addImage` per image after an async decode (`packages/shell/src/images.ts:242-256`, `292-307`): 46 at the dense opening view, and up to 218 pins more once the map is zoomed in to the pin layer ([performance-2026-10-13.md](performance-2026-10-13.md), "Pins only where drawn"). Each image comes in its own task, so each can cause a render of all of Maid's `<Layer>` and `<Source>` components, the module layers included. Upper bound (inferred): 46 x 1.1 ms, about 50 ms of main thread at load, and up to about 240 ms spread over the frames of a zoom-in that brings all pins; less where images land in the same frame. Not measured in Maid.
- **Rating**: Maid low to medium (on the load and zoom paths, small per event, not yet measured in Maid); typical app low (few layers, few style changes).
- **Maid could**: count `styledata` events and React commits during `bun run bench` load, to replace the upper bound with a number. Adding the images in batches per frame (collect, then add in one `requestAnimationFrame`) would also cut the per-image `styledata` storms (inferred).
- **Local patch** (`bun patch @vis.gl/react-maplibre`, `dist/components/layer.js` and `source.js`): render again only when the layer or source is missing from the style, which is the only case where the render does something new:

  ```js
  // layer.js, in the effect
  const forceUpdate = () => {
    if (!map.style?._loaded || !map.getLayer(id)) setStyleLoaded((version) => version + 1)
  }
  // source.js, the same with map.getSource(id), keeping the setTimeout
  ```

  Risk: low. When the layer exists, today's render runs `updateLayer` with the same props and does nothing. A style swap removes the layers. They are then missing, so the render still re-adds them. Edge: while the style is not loaded yet (`_loaded` false), today's behaviour stays. Confirm with `bun run bench-rmgl --only images,props,style` (expect `Layer renders per image` near 0 and the same `to ready` for the style swap) and with `bun run check-all`.

### 2. A `data` prop is compared deeply

- **How much** (measured, scenario 4): replacing the lines collection (10,457 features, 3.7 MB) blocks **7.4 ms** (p95 10.9; run 1 9.8) in the render when all feature objects are new, **0.3 ms** (0.4) when only the moved feature is new, and 0.0 ms for raw `setData`. Time to idle is the same on all three sides (202 to 217 ms; 261 to 283), because MapLibre's worker re-tiles the whole source either way.
- **Why**: `source.js:25-30`, `deepEqual` over `data`.
- **Maid**: not exposed on the hot path. The engine-fed sources pass a constant `EMPTY` (`packages/renderer/src/OsmLayers.tsx:14`, `38-57`), so the comparison is one identity check. Module sources pass memoised collections: notes (`packages/module-notes/src/notes.tsx:158`), parking sides (`packages/module-parking/src/lens/side-features.tsx:80`, `useMemo` on the history snapshot), and module layers (`packages/renderer/src/ModuleLayers.tsx:17`). Each edit that changes the parking data costs one deep comparison up to the first different feature, then a full `setData` (inferred).
- **Rating**: Maid low; typical app medium (apps that build GeoJSON in render with a selector or `map()` pay both the deep compare and a full `setData`).
- **Local patch**: in `updateSource`, compare `data` by identity: `const changed = key === 'data' ? prevProps.data !== props.data : !deepEqual(prevProps[key], props[key])`. Risk: an app that makes an equal collection on every render would now call `setData` on every render, which is far worse than the compare. Maid would gain little. **Not worth patching for Maid.**

### 3. No declarative `updateData`

- **How much** (measured, scenario 4): one moved line of 10,457, at 10 Hz. `setData` (React prop or raw) takes **202 to 217 ms to idle** (261 to 283) and about 17 ms main-thread script per step (22 to 26); raw `updateData` with a diff of one feature takes **5.0 ms to idle** (5.2) and 3.1 ms script. About forty times faster to idle.
- **Why**: `source.js:35-37` only knows `setData`. This is the API, not a slow path in the library.
- **Maid**: not exposed. The engine calls `updateData` itself (`packages/renderer/src/engine.ts:809`) on sources whose `data` prop never changes. The parking lens and notes use `setData` through props (above); they are small.
- **Rating**: Maid none; typical app high, for anything that edits or animates GeoJSON.
- **Maid could**: if the parking lens or another module draws many features that change often, give it an engine-style source (constant `data` prop, imperative `updateData`) instead of a `data` prop.
- **Local patch**: not as a patch; it needs an API (a `diff` prop, or a ref to the source). Out of scope.

### 4. A style swap re-adds everything

- **How much** (measured, scenario 8, Maid's layers with the dense data): `mapStyle` prop swap **932 ms** (900) to ready; raw `setStyle` with `diff: false` and adding everything again 1018 ms (1058); raw `setStyle` with `transformStyle` that carries the sources and layers into the next style **83 ms** (85). The React side is as slow as re-adding by hand, and ten times slower than keeping the layers.
- **Why**: `maplibre.js:388-398` diffs the new style against the old one; the sources and layers that `<Source>` and `<Layer>` added are not in the new style, so MapLibre removes them, and the `styledata` path adds them again with their full data, which the worker tiles again.
- **Maid**: not exposed. `mapStyle` is the module constant `EMPTY_STYLE` (`packages/shell/src/components/MapView.tsx:45-50`); backgrounds are sources and layers of modules, not styles.
- **Rating**: Maid none; typical app high (base map switchers).
- **Local patch**: in `_updateStyle`, pass `transformStyle: (previous, next) => ({ ...next, sources: { ...previous.sources, ...next.sources }, layers: [...next.layers, ...previous.layers.filter(managed)] })`, where `managed` knows the ids that `<Source>` and `<Layer>` own (needs a small registry on the `Maplibre` instance). Risk: medium (layer order, ids that both styles have). Not worth it for Maid.

### 5. A controlled camera is one frame behind

- **How much** (measured, scenario 6, a 2 s pan and a 2 s zoom with `easeTo`): with `longitude`, `latitude`, `zoom` as props and `onMove` setting them, the map's camera differs from the proposed one on **99 percent of `move` events**; uncontrolled and raw: 0 percent. Frame times are 16.7 ms everywhere (p95 16.8); main-thread script per frame is 2.6 to 2.9 ms on all sides, within the noise, also when every `<Layer>` renders on every frame (2.71 ms against 2.84 raw; run 1 3.07 against 2.77).
- **Why**: `maplibre.js:106-112` with `maplibre.js:327-339`, described above.
- **Maid**: not exposed. `initialViewState` (`MapView.tsx:543`), the camera goes to the URL on `onMoveEnd`.
- **Rating**: Maid none; typical app medium (one frame of extra latency on every drag and animation).
- **Local patch**: in `_onCameraUpdate`, accept the proposed camera when the props are the ones the last `onMove` was given. Risk: high (the whole point of controlled mode is that the app can refuse a camera). Not worth it; use the uncontrolled camera, as the skill says.

### 6. `interactiveLayerIds` on every mousemove

- **How much** (measured, scenario 5, about 105 to 110 synthetic mousemoves per second dispatched in the page, 67 interactive layers): **0.56 ms** main-thread script per event with `interactiveLayerIds` (both runs), 0.66 ms (0.56) for a raw listener that queries on every event, 0.43 ms (0.34) for a raw query once per frame, 0.08 ms for a listener without a query on both sides. A first try with Playwright's mouse reached only 30 events a second, because each move is a round trip. A short run at that rate gave 4 to 5 ms per query on a busier moment, so the per-query cost moves with the load of the machine.
- **Why**: `maplibre.js:462-484` queries on every move. The library adds nothing measurable around the query.
- **Maid**: not exposed. Maid does not set `interactiveLayerIds` and picks in its engine (`packages/renderer/src/pick.ts:1-4`, `MapView.tsx:175-177`), also on every mousemove (`MapView.tsx:334-349`). Real mouse input in Chrome comes at most once per frame, so throttling Maid's own pick would gain little (inferred); the synthetic events here come faster than that.
- **Rating**: Maid none; typical app medium (with many layers the query is the cost of a hover).
- **Local patch**: throttle `_updateHover` to one query per animation frame, and keep an immediate query for `click`, `mousedown` and `mouseup` so their `e.features` stay exact. Risk: medium (`onMouseEnter` and `onMouseLeave` move by up to one frame). Not for Maid.

### 7. A changed `<Source>` option sends the data again

- **What** (read): `source.js:35-37` calls `setData(props.data)` for any changed prop of a GeoJSON source. The option itself is not applied.
- **Maid**: latent. Maid's engine-fed sources have `data={EMPTY}` and the engine fills them. If `tolerance`, `maxzoom` or `buffer` of `OsmLayers` ever changed at run time (`MapView.tsx` passes `config.tolerance` and `config.sourceMaxZoom`), react-map-gl would call `setData(EMPTY)` and **wipe the engine's features** until the next push. Today these come from the app config and do not change while the map lives (read).
- **Rating**: Maid medium as a correctness trap, low for performance; typical app low.
- **Maid**: already keeps the options constant for the life of the map (`OsmLayers.tsx:36-40` reads them once), and the comment there names this trap. Keying the sources on their options is ruled out in that comment: MapLibre refuses to remove a source that a layer uses, and the engine cannot refill a new one. A changed option needs a new map.

### 8. What showed no difference

All measured, medians of 5 repetitions, Maid's 121 layers (113 in run 1) unless named:

- **Mount to ready** (scenario 1): Maid's layers without data 52 ms react against 55 ms raw (45 against 50); with the dense data 995 against 1033 ms (981 against 1105), main-thread script 93 against 102 ms (105 against 130); 200 layers with data 1595 against 1517 ms (1543 against 1825). Which side is faster changes between runs, and the p95 spread (up to 2.4 s) is larger than any difference. The extra frames the React side needs to add layers after their sources (read, above) do not show.
- **A parent render that changes nothing** (scenario 2, timed in batches of 20 renders because the browser clock steps by 0.1 ms): with the React Compiler no `<Layer>` renders and the render costs 0.01 ms. Without memoisation every `<Layer>` renders: 0.09 ms for Maid's 121 layers and 0.12 ms for 200 layers with the same objects; with new paint, layout and filter objects of the same content (what `buildLayers` returns when one of its options changes) 0.13 ms for 121 and 0.21 ms for 200. So a `<Layer>` render costs about 1 microsecond, and the deep comparison of Maid's whole layer list well under a millisecond.
- **One layer's paint, filter or visibility** (scenario 3): the call blocks 0.2 to 0.3 ms (prop) against 0.0 to 0.15 ms (`setPaintProperty`, `setFilter`, `setLayoutProperty`); filter and visibility take 84 to 100 ms to idle on both sides (MapLibre lays out the tiles of that source again). Main-thread script per paint step 6.27 against 5.39 ms (6.58 against 6.13), filter and visibility within the noise. Part of the paint difference is finding 1: the change renders every `<Layer>` twice, once for the prop and once for `styledata`. With Maid's 121 layers that is 242 renders.
- **Hover highlight** (scenario 7): `setFeatureState` 3.07 against 3.19 ms script per step, a `filter` prop 18.5 against `setFilter` 19.8 ms, a small `data` source 2.66 against 2.73 ms. Time to idle: feature state 16.7 ms, small source 16.7 ms, filter **100 ms** on both sides (a filter on a layer of the big lines source lays out its tiles again). The route the react-map-gl skill prescribes (feature state) is the cheap one, and react-map-gl adds nothing to it.

## For Maid

Maid already avoids the costly paths, each in a named place: `updateData` in the engine (`engine.ts:809`), constant `data={EMPTY}` (`OsmLayers.tsx`), its own picking instead of `interactiveLayerIds` (`pick.ts`), `initialViewState` (`MapView.tsx:543`), a constant `mapStyle` (`MapView.tsx:45`), and layer props memoised by the React Compiler. What is left is finding 1 (renders on `styledata`) and the trap of finding 7.

### Worth patching first

1. **Finding 1, `styledata` renders** (`layer.js:67-73`, `source.js:70-75`): render only when the layer or source is missing. A two-line change per file, low risk, removes 242 `<Layer>` renders per style change. Measure it in Maid's load (`bun run bench`) as well as with `bun run bench-rmgl --only images`, because the benchmark here shows only 0.35 to 1.1 ms per event.
2. **Camera event allocation** (`maplibre.js:95-105`): look up the handler first and compute `e.viewState` only when there is one. One line, no risk, but no measurable gain here (scenario 6). Do it only together with 1.

### Not worth it

- Identity instead of `deepEqual` for `data` (finding 2): makes careless apps worse, Maid gains nothing.
- Installing the camera hook only for a controlled map (`maplibre.js:238-245`): saves a transform clone per frame, not measurable.
- Throttled hover queries (finding 6), a `transformStyle` for style swaps (finding 4), a faster controlled camera (finding 5): Maid does not use these paths.
- Replacing `<Source>` and `<Layer>` with imperative calls in Maid: the measured overhead is below a millisecond per event outside finding 1, and the declarative layers are easier to keep right.

## Open questions

- How many `styledata` events and React commits does Maid's load cause on the dense scene, and what does the patch of finding 1 save there? Needs one `bun run bench` with a counter on `window.__maid.map` (`map.on('styledata', ...)`), before and after the patch.
- Do the module layers (`map.content`, `map.layer`) change their `<Source>` options at run time anywhere (finding 7)? Read: not in the modules checked, but not proven for every module.
- A run on a quiet machine is still to do. The numbers come from a busy one.

## Rerun

```bash
bun run bench-rmgl                      # all scenarios, 5 repetitions, about 10 to 17 minutes
bun run bench-rmgl --only images,props  # some scenarios
bun run bench-rmgl --quick              # one short repetition: a check that it runs
```

A full run writes `reports/rmgl-bench.json`; a run with `--only` or `--quick` writes `reports/rmgl-bench-partial.json` and leaves the full report alone.

Scenario names: `mount`, `rerender`, `props`, `data`, `pointer`, `camera`, `hover`, `style`, `images`. The page is in `tools/bench/rmgl/app/` (`react-driver.jsx`, `raw-driver.js`, `shared.js`, `main.jsx`). To test a patch: `bun patch @vis.gl/react-maplibre`, edit the files in `dist/` named above, `bun patch --commit`, then rerun the scenarios the finding names and compare `reports/rmgl-bench.json` with a copy from before.
