# MapLibre for editable data

## Versions (npm, verified 2026-10-10)

| Package | Version |
| --- | --- |
| `maplibre-gl` | 6.13.0 |
| `react-map-gl` | 8.1.3 (peer: `react >=16.3`, `maplibre-gl >=1.13`) |
| `@deck.gl/mapbox` | 9.4.0 |
| `@playwright/test` | 1.64.0 |

MapLibre 6 (unverified, from the v6.0.0 release notes): WebGL2 is required, the package is ESM only, `setData` lost its second parameter, and missing style images are resolved with `setMissingStyleImageResolver` instead of the `styleimagemissing` event. The `react-map-gl` skill's notes on missing images predate this and need a check in milestone 2. Also check that `react-map-gl` 8.1 works with MapLibre 6 before building on it.

## How data gets on the map

Each option below is a candidate for the renderer. Milestone 5 measures them against each other.

1. **GeoJSON source with `setData`.** Simple. The whole dataset is re-tiled in a worker (geojson-vt) on every change. Fine for loading; the open question is the cost of an edit when 100k features are loaded.
2. **GeoJSON source with `updateData(diff)`.** Sends only added, changed and removed features. Every feature needs a stable id (`promoteId` or `feature.id`). MapLibre saw a series of performance fixes for this in late 2025 (PRs #6562, #6668, #6738, #6772, #6800) and one regression report (#7257). Unverified: real timings at our scale. No published benchmark was found.
3. **Several sources**, for example one per OSM tile or one for "being edited" and one for "at rest". Keeps each update small and lets the edited features skip re-tiling of everything else.
4. **deck.gl overlay** (`MapboxOverlay` in interleaved mode, shares MapLibre's WebGL context). Draws straight from arrays without tiling. Costs a second rendering model and a second styling system.
5. **Custom layer** (`CustomLayerInterface`). Full control, and we write the renderer ourselves. Only if 1 to 4 fail.

Source options that matter: `tolerance` (default 0.375, simplification), `buffer` (default 128), `maxzoom` (default 18; an editor zooms to 22 and beyond, so overzoom precision needs a check), `promoteId`, `generateId`.

Hover and selection: `setFeatureState` changes paint without re-tiling, as long as features have ids. Changing a layer `filter` is the alternative for small sets. (General knowledge; the exact limits are unverified.)

## Can MapLibre express iD's look?

From the style spec:

| iD feature | MapLibre | Risk |
| --- | --- | --- |
| Road casing and stroke | Two line layers, or `line-gap-width` | Low |
| `layer=*` ordering, bridges over roads | `line-sort-key` within a layer; casing and stroke in separate layers cannot interleave per feature | Medium: iD interleaves casing and stroke per `layer` value. Needs layer groups per `layer` value or an accepted difference |
| Dashed lines by tag | `line-dasharray`, data-driven since GL JS 5.8 | Low |
| Zoom-dependent widths | Zoom expressions | Low |
| Area stroke | Line layer on the polygon | Low |
| Full fill | `fill-color`, `fill-opacity` | Low |
| Partial fill (band along the inside edge) | No direct equivalent | **High**: candidates are a wide, offset line (`line-offset`), which overlaps itself in narrow shapes, or an inward buffer computed in JS |
| Fill patterns (forest, cemetery) | `fill-pattern`, data-driven | Low to medium: disables outline colour, needs sprites |
| Oneway arrows | Symbol layer with `symbol-placement: line` | Low |
| Point pin with preset icon | Symbol layer, sprite or runtime images | Medium: iD has several hundred preset icons from Maki, Temaki, Röntgen and Font Awesome; needs a sprite build step |
| Vertices | Circle layers | Low |
| Labels with priority and collision | Symbol layers, `symbol-sort-key` | Medium: collision results will differ from iD |
| Hover and selection halo | Extra wide line layer driven by feature state | Low |
| Hit testing with tolerance | `queryRenderedFeatures` with a box around the pointer | Medium: iD has generous invisible targets; picking priority (vertex over line over area) must be rebuilt |

Other constraints: `line-pattern` disables `line-color` and `line-dasharray`; zoom expressions for dashes only change at integer zooms.

## Prior art

- **Rapid** moved from SVG to PixiJS/WebGL in v2 and reported 5 to 10 times the frame rate (self-reported, https://github.com/facebook/Rapid/discussions/738; FOSS4G 2022 talk https://talks.osgeo.org/foss4g-2022/talk/VSEAKD/).
- **Rapid 3** uses MapLibre for its 3D inset map, fed by GeoJSON sources. See [rapid.md](rapid.md).
- **iD**: no issue or discussion about moving to WebGL or MapLibre was found. Unverified: the search was shallow.
- **openstreetmap-website** is moving its maps to MapLibre and hit jitter and redraw bugs when mixing it with Leaflet.
- Drawing libraries on MapLibre: Terra Draw, and our own `react-map-gl-draw`.

Nobody seems to have published a MapLibre-based editor for raw OSM data at iD's scale. The question this iteration asks is open.

## Measuring

### Metrics

- **Frame times** from a `requestAnimationFrame` loop in the page: median, p95, p99, share of frames over 16.7 ms and over 50 ms.
- **Long tasks** from `PerformanceObserver('longtask')`.
- **Settle time**: from the end of a camera move until the editor reports a finished, correct draw. For MapLibre the `idle` event, for iD `drawn {full: true}`, for Rapid `draw` plus an empty scheduler queue.
- **Load time**: from the data request to the first complete draw, split into fetch and parse, build, and draw where the editor allows.
- **Interaction latency**: from pointer move to the highlight being painted.
- **Memory**: JS heap through the Chrome DevTools Protocol (`Performance.getMetrics`). GPU memory is not visible this way.
- CDP tracing for a deep look at single scenarios.

### Pitfalls

- Headless Chrome renders with SwiftShader on the CPU unless told otherwise. Numbers from SwiftShader do not describe a real GPU. Run the real benchmark with GPU acceleration on a named machine and record `chrome://gpu` output with the results. Use SwiftShader in CI only to see whether things still run.
- Frames are capped at the display refresh rate. Frame time cannot show headroom below 16.7 ms. Flags to uncap (`--disable-gpu-vsync`, `--disable-frame-rate-limit`) are unverified on current Chromium; test by comparing frame intervals with and without them. Independent of that, measure work per frame (script and render duration), not only the interval.
- Pin the Chromium version, the viewport and the device pixel ratio. Repeat each scenario and report the median and spread.
- All three editors hide stale pictures behind CSS transforms or tile fades. Always pair frame times with settle time and a screenshot at the end.

### Comparing pictures

`pixelmatch` (8.0.0) or `odiff` (4.5.0) for pixel differences, SSIM for a similarity score. The three renderers will never match pixel for pixel: anti-aliasing, label placement and fonts differ. Pixel diffs are useful for regression within one editor. Between editors the useful outputs are a contact sheet for people and a checklist per style feature.
