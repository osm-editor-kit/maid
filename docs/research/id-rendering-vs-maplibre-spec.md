# iD's rendering against the MapLibre style spec

Date: 2026-10-14. Research only. Nothing in Maid, MapLibre or another repository was changed. No benchmark was run for this note.

The question: which rendering features of iD does the MapLibre style spec lack, what does each gap cost in looks and in frames, and is a MapLibre patch worth it? The Straßenraumkarte project already carries MapLibre patches. Do they help here?

Short answer: iD's map uses a small, plain subset of SVG. It has no blend modes, no drop shadows and no filters on the map data. MapLibre 6.12 covers almost all of it, and it now has two features older notes list as missing (group opacity, tintable fill patterns). The real gaps are structural (clipping a stroke to its own area, interleaving per `layer`), and none of the Straßenraumkarte feature patches closes them. No rendering patch is recommended now. One small optimisation from that project is worth a measurement.

## 1. Versions and method

| Thing | Version | Where read |
| --- | --- | --- |
| iD | pinned commit `0194f3926` | `.reference/id/css/`, `.reference/id/modules/svg/`, `modules/renderer/background.js`, `modules/behavior/breathe.js` |
| MapLibre GL JS | 6.12.0 | `node_modules/.bun/maplibre-gl@6.12.0/.../src` (TypeScript and GLSL ship in the package) |
| Style spec | 26.4.4 | `dist/latest.json` of `@maplibre/maplibre-gl-style-spec` |
| Maid | working tree of 2026-10-14 | `packages/renderer/src/layers.ts`, `build.ts`, `direction-images.ts`, `packages/shell/src/images.ts`, `patches/maplibre-gl@6.12.0.patch` |
| The Straßenraumkarte project | patches against MapLibre 6.0.0 and style spec 26.2.1 | its `vector/patches/`, `docs/maplibre-patches.md`, `docs/maplibre-style-gaps.md` |

Method:

- iD: grep of every map stylesheet for the property names (`mix-blend-mode`, `filter`, `clip-path`, `mask`, `paint-order`, `vector-effect`, `shape-rendering`, `animation`, `@keyframes`, `transition`, `opacity`, `stroke-linecap`, `stroke-linejoin`, `stroke-dasharray`, `marker-*`, `pattern`), then the same in `modules/svg` and `modules/renderer`.
- MapLibre: the property list per layer type from `latest.json`, and the draw functions in `src/webgl/draw/` and the shaders in `src/shaders/glsl/`.
- Marks in the tables: **[C]** read in the code or the spec, **[M]** measured (always in another note, which is named), **[I]** inferred. Nothing was measured in this run.

What the grep found in iD's map CSS (`20_map.css` to `75_categories.css`) **[C]**:

| Property | Hits on the map | Note |
| --- | --- | --- |
| `mix-blend-mode`, `isolation` | 0 | One use in JavaScript, on the imagery only (unsharp mask, see row 21) |
| `filter` | 0 on data | Imagery only: brightness, contrast, saturation, blur. `60_photos.css` has one `invert(1)` on a loader image |
| `clip-path`, `mask` | 0 in CSS | Set in JavaScript: one `clipPath` per area (`svg/areas.js`) |
| `paint-order`, `vector-effect`, `shape-rendering` | 0 | |
| `animation`, `@keyframes` | 0 | The selection pulse is JavaScript (`behavior/breathe.js`) |
| `transition` | 1 | Labels fade in 100 ms |
| `stroke-dasharray` | 84 | |
| `stroke-linecap` | 39 | |
| `stroke-linejoin`, `stroke-miterlimit` | 3 and 3 | |
| `opacity` (all kinds) | about 50 | Mostly `stroke-opacity` and `fill-opacity` on single elements |

So there is no drop shadow, no glow filter and no blend mode in iD's data layers. What iD calls "shadow" is a wide, translucent stroke under a feature (`path.shadow`), which MapLibre draws with a plain line layer.

Existing MapLibre write-ups in this repo, not repeated here: [docs/upstream/maplibre-updatedata-inconsistent-tiles.md](../upstream/maplibre-updatedata-inconsistent-tiles.md), [ADR 0006 wheel zoom](../adr/0006-wheel-zoom-finish-delay.md), [maplibre.md](maplibre.md) (the first look at the spec, written before 6.x), [performance-2026-10-13.md](performance-2026-10-13.md) (what costs frames: 114 layers, symbol placement, marker images).

Two corrections to older notes and to the brief of this task, both **[C]**:

- **Group opacity exists.** `line-layer-opacity` and `fill-layer-opacity` are in the spec since GL JS 6.0.0. `draw_layer_opacity.ts` renders the layer into a scratch framebuffer and composites it once. Maid already uses it for the partial fill (`layers.ts`, `area-fill-partial`). There is none for symbol and circle layers.
- **SDF patterns for fills exist.** `fill_pattern.fragment.glsl` has `u_sdf_pattern`: an image added with `sdf: true` is tinted by `fill-color`. `line_pattern.fragment.glsl` has no such branch, so line patterns cannot be tinted.

## 2. iD's rendering features, one by one

Columns: what iD does, what the spec has, what Maid does, how much the gap shows, what it costs.

| # | iD feature | iD source | In MapLibre's spec? | Maid today | Aesthetic weight | Performance: workaround today, and a native feature |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Casing under stroke | `svg/lines.js`: groups `line-shadow`, `line-casing`, `line-stroke` | Partly. Two line layers. `line-gap-width` draws a casing but not a different dash. No "casing" property (the Straßenraumkarte gap list names an open upstream issue) [C] | Layers `line-casing-*` and `line-stroke-*` [C] | None, looks the same [I] | Two layers per band, so every line is tessellated and drawn twice. A native casing would halve line buckets and draw calls [I] |
| 2 | Order by OSM `layer`: shadow, casing, stroke are interleaved per layer value | `svg/lines.js` `layergroup layer<N>` | Partly. Order is by layer, then `line-sort-key` inside one layer. Two layers cannot interleave per feature [C] | Three bands (below, ground, above), each casing then stroke, with a sort key `z` inside [C] | Low: wrong only where two bridges of different `layer` cross; then the upper casing is under the lower stroke [I] | 3 bands x 4 layers = 12 line layers, each with an edit and a selection twin. Exact interleaving within the spec needs one band per `layer` value in view (4 layers and 8 twins each). Every layer costs a recalculation per frame ([performance note](performance-2026-10-13.md), section "Layers that take part in a zoom frame") [C]. Native: a per-feature "casing then stroke" draw inside one layer; a large renderer change [I] |
| 3 | Dash patterns by tag, in pixels | 84 rules, for example `30_highways.css` | Yes. `line-dasharray` is data-driven since 5.8. Units are line widths, not pixels. Zoom changes apply at integer zooms only. An array cannot come from a feature property, only from `literal` [C] | `dashKey` in `build.ts` divides by the width; `dashMatch` lists every pattern seen in a `match`; the layers are rebuilt when a new pattern appears [C] | Low [I] | Dashed and solid lines are separate layers (8 of the 16 way layers). See idea A in section 3. Native "array from a property" would remove the rebuild [I] |
| 4 | Caps and joins: round by default, `butt` on dashes, `round` joins | `20_map.css` `path.line`, 39 `stroke-linecap` rules | Yes. `line-cap` and `line-join` are data-driven in this version (`latest.json`, evaluated per feature in `line_bucket.ts`) [C] | Constant per layer: round for solid, butt for dashed [C] | None [I] | None today. Being data-driven is what makes idea A possible [I] |
| 5 | Low-zoom widths (`.low-zoom` class up to about OSM 17) | 168 `low-zoom` rules | Yes: zoom `step` expressions [C] | `byZoom(widthLow, width)` [C] | None [I] | None |
| 6 | Hover and selection "shadow": a 16 px stroke at 0.4 or 0.7 under the feature | `20_map.css` `path.shadow` | Yes: a line layer with `line-opacity` from feature state [C] | `highlight-halo`, `highlight-halo-areas` [C] | Low. iD's shadow is one group per layer value, Maid's is one layer under all lines [I] | Two layers that draw every feature at opacity 0. A fragment with opacity 0 is still rasterised [I]. A filter on a small source would be cheaper to draw but needs data updates |
| 7 | Selection pulse ("breathe"): opacity and width of the shadow step between two values, 800 ms, 4 steps | `behavior/breathe.js` | No keyframes. Paint transitions exist for one change, not for a loop [C] | Missing, not noticed (no `breathe` in the renderer) [C] | Low to medium: it is how iD says "this is selected" [I] | Within the spec: change the paint value from a timer. Each step repaints the whole map, about 5 frames per second for ever while something is selected. Native keyframes would cost the same repaints [I] |
| 8 | Area stroke | `25_areas.css` `path.area.stroke` | Yes: a line layer on the polygon source [C] | `area-stroke`, `area-stroke-dashed` [C] | None | One more tessellation of every ring |
| 9 | Full fill, `fill-rule: evenodd` | `25_areas.css`, `70_fills.css` | Yes: `fill-color`; holes come from the rings [C] | `area-fill` when the fill setting is `full` [C] | None | None. An opaque fill is drawn in MapLibre's opaque pass; a translucent one is not [C] |
| 10 | **Partial fill** (the default): the fill path gets a 60 px stroke (40 px for building parts), `fill-opacity: 0`, clipped to the area's own shape | `70_fills.css` `.fill-partial path.area.fill`, `svg/areas.js` (`clipPath` per area) | No. There is no clip or mask per feature. A stroke can be offset to one side (`line-offset`), not clipped [C] | `area-fill-partial`: a mitred line, offset inward by half its width, width capped by the area's size, drawn opaque and composited with `line-layer-opacity: 0.3` [C] | Medium. Wrong at concave corners and in narrow or irregular shapes (the band can leave the area or miss a corner); see [the iteration 1 report](../iteration-1/report.md). Also: where the bands of two areas overlap, iD mixes both colours, Maid shows only the upper one, because the whole layer is flattened before the 0.3 is applied [I] | One extra tessellation of every ring, plus one full-screen offscreen pass per frame for the layer opacity (clear, draw, composite) [C]. The edit and selection twins carry the same paint, so they may add passes, see section 5 [I]. A native clip per feature does not fit a batched renderer; see section 3 |
| 11 | Area patterns: a 32 px PNG over the area colour, also used as the stroke of the partial band | `svg/defs.ts` (patterns), `svg/tag_pattern.ts`, `25_areas.css` `.pattern-color-*`; 28 PNGs | Partly. `fill-pattern` is data-driven and, with an SDF image, takes `fill-color`. But a fill pattern is sized by the tile zoom: it grows up to 2x between integer zooms and cross-fades, while iD's stays 32 px [C for the spec, I for the size]. A line pattern runs along the line, it is not anchored to the screen [C] | Missing, visible difference: forest, cemetery, wetland and the others are plain colour ([ADR 0001](../adr/0001-style-from-id-css.md)) [C] | Medium in `full` fill. In `partial` fill only the 60 px band carries the pattern in iD, so the loss is smaller [I] | Within the spec: one fill layer with `fill-pattern` for `full`, 28 images in the atlas, one more draw per tile. No clean way for the band [I] |
| 12 | Areas stacked by size, smaller above larger | `svg/areas.js` `areaSort`, `sortedByArea` | Yes: `fill-sort-key`, `line-sort-key` [C] | Missing ([missing-features.md](missing-features.md), F-svg-1) [C] | Low in partial fill, medium in full fill [I] | A sort key costs a sort in the worker per tile [I]. No frame cost |
| 13 | Oneway arrows: an SVG marker every 36 px, three colours | `svg/defs.ts` `addOnewayMarker`, `svg/lines.js` `addMarkers` | Partly. `symbol-placement: line` (collides, drops symbols) or `line-pattern` (never drops). Line patterns cannot be tinted [C] | `line-oneway`: a `line-pattern` whose image is as wide as the spacing, one image per shape and colour (`direction-images.ts`) [C] | None seen [I] | One layer over all oneway lines. Images are made per colour. A tintable line pattern would cut the images to three shapes [I] |
| 14 | Sided markers (cliff, coastline, barrier, embankment, cutting, guard rail), offset to one side | `svg/defs.ts` `addSidedMarker`, `addBothSidedMarker` | Same as 13 [C] | `line-sided`, `area-sided` [C] | None seen. Not compared marker by marker [I] | As 13 |
| 15 | Vertices: shadow, stroke and fill circles; radius by zoom; grey when shared | `svg/vertices.js`, `20_map.css` `g.vertex` | Yes: circle layers with stroke, feature state [C] | `vertex`, `vertex-tagged`, `vertex-icon`, `highlight-halo-vertex` [C] | None [I] | Four layers on the vertex source [C] |
| 16 | Viewfield wedge on a vertex with a direction (camera, sign, traffic signals) | `svg/vertices.js` (`viewfieldgroup`, marker `ideditor-viewfield-marker`) | Yes: a symbol with `icon-rotate` from a property, or a small polygon [C] | Not found in the renderer by grep. Missing, not noticed [C for the grep, I that nothing else draws it] | Low to medium for people who map cameras and signs [I] | One symbol layer and one image [I] |
| 17 | Points: a pin path with white fill and grey stroke, the preset icon on it, a 16 px ring on hover | `svg/points.js`, `20_map.css` `g.point` | Yes, as an image. No vector path, no stroke on an icon. `icon-halo-*` works on SDF icons only [C] | `point-pin` (pin and icon in one runtime image), `highlight-halo-pin` (a blurred circle behind the pin's head), `point-dot` below zoom 18 [C] | Low: the hover ring is a round glow, not the pin's outline [I] | Marker images are the largest load cost outside the engine ([performance note](performance-2026-10-13.md), finding A) [M there]. A pin drawn as an SDF icon with a halo, and the preset icon as a second symbol, would give iD's outline ring and fewer images, at the cost of one more symbol layer [I] |
| 18 | Midpoints: a small triangle, turned along the way, at 0.7 opacity | `svg/midpoints.ts` | Yes: a symbol with `icon-rotate` [C] | `highlight-midpoint`: a circle, not a triangle [C] | Low [I] | None |
| 19 | Labels: text with a white halo (a second text with a 5 px stroke at 0.7), on a path for lines, 100 ms fade | `svg/labels.js`, `20_map.css` `.labels-group.halo` | Yes: `text-halo-color`, `text-halo-width`, `text-halo-blur`, `symbol-placement: line`, fade built in [C] | `label-line`, `label-area`, `label-point` with a 2.5 px halo at 0.7 [C] | Low. Collision results differ from iD by design [I] | Symbol placement is a known cost [M in the performance note]. Nothing to gain from a patch |
| 20 | Wireframe mode | `70_fills.css` `.fill-wireframe` | Yes: other paint values [C] | A fill option of `buildLayers` [C] | Not checked against iD | None |
| 21 | Imagery filters: brightness, contrast, saturation, sharpness. Sharpness below 1 is a blur. Above 1 it is an unsharp mask: a second, blurred, inverted copy with `mix-blend-mode: overlay` | `renderer/background.js` | Partly. `raster-brightness-min/max`, `raster-contrast`, `raster-saturation`, `raster-hue-rotate` are uniforms of the raster shader. No blur, no sharpen, no blend mode [C] | Brightness only (`raster-brightness-max` in `ImageryLayers.tsx`, `MeasureLoupe.tsx`) [C] | Low. Contrast and saturation are easy to add. Sharpness is rarely used [I] | Contrast and saturation are free: same shader, two more uniforms [C]. Sharpness would need an offscreen blur of the imagery (two full-screen passes) [I] |
| 22 | Blend modes on data | none in iD | No. Every layer type uses one blend function (`ColorMode.alphaBlended`). Heatmap and layer opacity use a scratch framebuffer internally, with the same function [C] | Not needed for iD's look | None | See section 4 for what a patch costs |
| 23 | Group opacity | iD has `opacity` on a few groups only (`g.midpoint .fill`, label halos, QA markers). A stroked SVG path never darkens where it crosses itself, which is the same thing per feature | Yes for line and fill (`*-layer-opacity`), no for symbol and circle [C] | Used once, for the partial fill [C] | None | One full-screen pass per layer that uses it [C] |
| 24 | Drop shadows, glows, blur on data | none in iD | No filter. Soft edges can be imitated: `line-blur`, `circle-blur`, `text-halo-blur`, `icon-halo-blur` (SDF icons), a wider translucent line below, `fill-translate` for an offset copy [C] | `line-blur` on the operation preview, `circle-blur` on the pin glow [C] | None against iD | The imitations are free (same shaders). A real blur is two full-screen passes per layer (section 4) |
| 25 | `pointer-events`, touch targets, cursors | `55_cursors.css`, `svg/touch.ts` | Not a style matter: `queryRenderedFeatures` [C] | Picking in `pick.ts` | None | Outside this note |

Not checked in this run: turn restriction arrows (`svg/turns.ts`, they belong to the restriction editor's own small map), area icons (`areaicon`), the photo layers' viewfields (`60_photos.css`, drawn by the street imagery module), notes and QA markers, the data layer (`65_data.css`).

## 3. What Maid is missing most

Aesthetics: 1 (nobody sees it) to 5 (the map looks wrong). Performance effect of adding it: -2 (costs frames) to +2 (saves frames). All performance scores are inferred. None was measured.

| Rank | Gap | Aesthetics | Performance | Within the spec? | Custom layer? | Patch? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Partial fill clipped to its own area (row 10) | 3 | -1: any exact way adds work | Today's offset line is the practical limit. Exact alternative: build the inward band as a polygon in the feature builder. That is CPU per area and per edit, and the band width is in pixels, so it would need rebuilding per zoom. Not attractive | Possible: draw each area's band with a stencil test against its own fill. That means own shaders and buffers, one stencil write and one draw per area, and no feature state, no picking, no edit twin. It breaks batching, which is where Maid's speed comes from | A partial help only: write all fills of the layer into the stencil, then draw the band with a stencil test (`draw_line.ts`, `draw_fill.ts`, `frame_render_context.ts`, one new property in the spec reference). Medium size. It stops the band from leaving areas altogether. It does not stop it from entering a neighbour, and the width cap already limits both. No upstream proposal known in the repos read |
| 2 | Area patterns (row 11) | 3 | 0 to -1: one fill layer more in `full` mode | Yes for `full` fill: `fill-pattern` with images made from iD's PNG over the class colour (no tinting needed, the colour is fixed per pattern). The size steps with the zoom. For the partial band: no | Not worth it | Screen-anchored, zoom-independent pattern size: a small to medium patch in `fill_pattern.vertex.glsl` and the pattern uniforms. Only pays if rank 1 is solved too |
| 3 | Areas stacked by size (row 12) | 2 (3 in `full` fill) | 0 | Yes: a sort key from the area's size, which the builder already knows (`r`) | No | No |
| 4 | Viewfield on vertices with a direction (row 16) | 2 | 0 | Yes: a symbol with `icon-rotate`, or a wedge polygon on the highlight source | No | No |
| 5 | Exact interleaving per `layer` value (row 2) | 2 | -1: more layers | Yes, with more bands. Each band is 4 layers and 8 twins. Bands only for the values in view would keep the count down but needs layer rebuilds | No | Large patch (a draw order that alternates programs inside one layer). Not recommended |
| 6 | Selection pulse (row 7) | 2 | -2 while something is selected: the map repaints about 5 times a second | Yes, from a timer on the two halo layers' paint, or on a small selection-only layer | No | No. Keyframes in the spec would not remove the repaints |
| 7 | Imagery contrast and saturation (row 21) | 2 | 0 | Yes: two paint properties | No | No. Sharpness would need a patch (offscreen blur). Not recommended |
| 8 | Pin outline ring on hover, fewer pin images (row 17) | 1 | +1 at load, if the pin becomes one SDF image and the icon a second symbol | Yes | No | No |
| 9 | Tintable line patterns (rows 13, 14) | 1 | +0: fewer images, same draws | Not needed | No | Small patch (`line_pattern.fragment.glsl`, as fills have it). Not worth carrying |

Two ideas that are about frames, not looks. Both stay within the spec:

- **A. One layer for dashed and solid lines.** `line-cap` and `line-dasharray` are both data-driven in 6.12. The pairs `line-casing-N` / `line-casing-dashed-N` and `line-stroke-N` / `line-stroke-dashed-N` could become one layer each, with a `[1, 0]` dash for solid lines. That would remove 8 of the way layers and their 16 twins, about a fifth of the 114 layers. The price: every solid line then goes through the dash shader (`lineSDF`), which samples the dash atlas per fragment. Whether fewer layers beat a dearer shader is not known. Inferred, to be measured.
- **B. The twins of the partial fill.** See section 5.

On custom layers in general (`CustomLayerInterface`): they get the GL context and the matrix, and nothing else. No buckets, no tiling, no feature state, no `queryRenderedFeatures`, no edit or selection twin. Everything Maid's engine relies on would have to be rebuilt for that layer. They suit one special overlay, not a core feature class.

## 4. The Straßenraumkarte patches

That project ports a QGIS street map to MapLibre. Its look needs soft shadows, multiply blending and ground-sized textures. It patches the installed package with `bun patch`, edits only the readable dev bundle, and redirects the package's `exports` to that bundle. The production build therefore ships the larger dev bundle. Its notes say: "`*-layer-*` properties cost a full-screen pass per layer."

Lines changed are the added lines of the patch file per commit (renderer patch + spec patch). They are close to, but not the same as, lines changed in MapLibre. The whole patch is 637 lines against `maplibre-gl@6.0.0` and 449 lines against the style spec 26.2.1.

| Patch | What it does | Where in MapLibre | Lines (renderer + spec) | Invasive? | Upstream, as that project's notes say | Verdict for Maid |
| --- | --- | --- | --- | --- | --- | --- |
| `fill-layer-blend`, `line-layer-blend` (`multiply`, `screen`, `plus`) | Composites the layer's scratch framebuffer with another GL blend function | `color_mode.ts`, `draw_layer_opacity.ts`, `draw_line.ts`, `draw_fill.ts`, paint properties, spec reference | 189 + 136 | Medium. Reuses the layer opacity path | Proposal style-spec#1661, draft gl-js PR #8073, same property names | **Not relevant.** iD uses no blend mode on data. Could matter later for a lens that tints imagery, but a translucent fill does that today |
| `fill-layer-blur`, `line-layer-blur` | Gaussian blur of a whole layer: second framebuffer, two passes of 33 taps | new `layerBlur` program and framebuffer in the painter, both draw functions | 156 + 66 | Medium to large: new shader, new framebuffer | None for 2D layers | **Not relevant.** iD has no shadows. Two more full-screen passes per layer |
| `*-layer-blur-mode` (`inner-edge`, `inner-core`) | Combines the blurred alpha with the sharp layer: an inner shadow or an edge fade, clipped to the shape | the `layerBlur` shader | 73 + 64 | Small on top of the blur patch | None | **Helps later, perhaps.** `inner-edge` is the only patch that makes a band on the inside of a polygon that is right at concave corners. But the edge is soft, not a hard 60 px band, the layer is flattened first so two buildings that share a wall get no band along it, and a 60 px radius is far more than 33 taps sample well. It would look different from iD in a new way, and cost two passes |
| `symbol-layer-opacity` | Group opacity for a symbol layer | `draw_symbol.ts`, symbol paint properties | 79 + 62 | Small | None named | **Not relevant.** Maid's symbols are opaque |
| Skip the offscreen pass when no visible tile has features for the layer | Two lines at the top of the layer opacity branch | `draw_line.ts`, `draw_fill.ts` | 11 + 0 | Tiny. A pure optimisation, no style property | Not proposed | **Helps now, if the measurement in section 5 confirms it.** 6.12.0 still has no such check [C] |
| Sub-pixel line ink | Rescales the alpha of lines thinner than one pixel, in all five line fragment shaders. Global, no switch | `line*.fragment.glsl` | 27 + 0 | Small, but it changes every thin line | None | **Not relevant.** iD's thinnest lines are 1 px. It would change the render references for no gain |
| `fill-shadow-*` | A fill layer casts its own blurred, offset shadow | `layerBlur` shader mode 3, `draw_fill.ts` | 116 + 114 | Medium, needs the blur patch | None | **Not relevant** |
| `fill-pattern-reference-zoom`, `fill-pattern-rotate` | Patterns keep their ground size and can be turned per feature | `fill_pattern.vertex.glsl`, pattern uniforms, one data-driven property | 112 + 64 | Medium | None found | **Not relevant as it is.** iD's patterns keep their screen size, the opposite. The patch shows where the pattern size is computed, which is the place a "screen size" mode would go (rank 2) |

What carrying any of them to Maid would take:

- **Re-anchor against 6.12.** The patches and their `apply-*.py` scripts match text in the 6.0.0 dev bundle. In 6.12 the draw functions take a `FrameRenderContext` and call `painter.frameRenderContext.useProgram(...)`, so the anchors and the inserted code change. The spec patch must move from 26.2.1 to 26.4.4, in both `index.mjs` and `index.cjs`.
- **Bundles.** Maid's own patch (`patches/maplibre-gl@6.12.0.patch`, 106 lines: the GeoJSON tile fix and the wheel zoom delay) edits the dev bundles and the minified ones by hand. That works for a few lines of JavaScript. It does not work for new shaders and programs. A rendering patch means either shipping the dev bundle, as the other project does, or building MapLibre from a fork. Both are a standing cost at every MapLibre update.
- **Types.** New paint properties need the `.d.ts` edits too, or `layers.ts` does not type-check.

## 5. Recommendation

**Do not carry a rendering feature patch into Maid now.** iD's look needs no blend mode, no blur and no shadow, and those are what the Straßenraumkarte patches add. Each of them costs at least one full-screen pass per layer and per frame, plus the work of keeping a shader patch alive across MapLibre versions. Maid's rule is that it must stay faster than iD and Rapid; a patch that only adds decoration fails that test before it is measured.

**Do first, within the spec** (each is about one build-out step):

1. Areas stacked by size with a sort key (rank 3).
2. Area patterns in `full` fill (rank 2), accepted difference in `partial`.
3. Viewfields on vertices with a direction (rank 4).
4. Imagery contrast and saturation (rank 7).

**Measure, then decide: the offscreen passes of the partial fill.** This is the one place where Maid already pays for a `*-layer-*` property.

- What the code says [C]: `area-fill-partial` has `line-layer-opacity: 0.3`. `buildLayers` gives it an `--edit` twin and a `--select` twin with the same paint. `drawLine` in 6.12 takes the offscreen path whenever the layer opacity is below 1 and the layer has tile coordinates. It does not look whether any tile has a bucket for the layer.
- What follows [I]: when the edit source has tiles in view but no areas in them, which is the normal state, the `--edit` twin still clears a full-screen framebuffer and composites it. The `--select` twin is cut off by its `maxzoom` above the floor zoom and hidden when nothing is selected, so it should cost nothing at editing zooms. So the frame may hold two offscreen passes where one is needed.
- Not determined: whether an empty GeoJSON source hands tile coordinates to the painter at all. If it does not, there is nothing to gain. This is the first thing to look at.

Step 0, no patch, no measurement run needed: in the browser, `window.__maid.map.style.tileManagers['osm-areas-edit'].getVisibleCoordinates()` (or the equivalent in 6.12) with nothing being edited. An empty list ends the matter.

If the list is not empty, there are two ways to remove the pass, in order of preference:

- **Without a patch:** hide `area-fill-partial--edit` (`visibility: none`) while the edit source holds no area, the same way `selectTwins` hides the selection twins.
- **With the patch:** the two-line check from the Straßenraumkarte project, added to `drawLine` and `drawFill` in both bundles of Maid's existing patch. It is small enough for the minified bundle. It is a candidate for an upstream draft, prepared here and handed to a person.

Measurement plan, before and after, on a quiet machine:

1. `bun run check-render-save before-offscreen` on the unchanged tree.
2. `bun run bench --editor maid --scene small,medium,dense --repeat 5 --label offscreen-before`
3. A second baseline that shows what one offscreen pass costs at all: `bun run bench --editor maid --scene small,medium,dense --repeat 5 --label offscreen-fill-full --maid-query "fill=full" --variant fill-full`. In `full` fill there is no `*-layer-opacity` layer, so the difference between 2 and 3 is an upper bound for the gain (it also contains the difference between a fill and a band).
4. Make the change. `bun run check-render before-offscreen` must report no difference in any scene: this is an optimisation, the picture must be identical.
5. `bun run bench --editor maid --scene small,medium,dense --repeat 5 --label offscreen-after`
6. `bun run bench-report <run-before> <run-fill-full> <run-after>` and `bun run bench-budget <run-after>`.
7. `bun run check-all` once, because the edit twin is what a drag draws.

Numbers that decide, per scene, medians over the 5 runs: `pan-warm-cpu`, `pan-warm-p95`, `zoom-in-p95`, `zoom-in-settle`, `hover-sweep-cpu`, and the drag numbers of the edit phase. Keep the change if a CPU number falls by more than the budget's tolerance (15 %) on at least one scene and nothing rises. If step 3 shows that `full` fill is not measurably cheaper than `partial`, stop: the pass is too cheap to matter on this machine.

A caveat about the instrument: the benchmark's frame numbers sit at the display's 16.7 ms in every scene (`tools/bench/budget.json`), so a GPU saving does not show in p95 as long as no frame is dropped. It shows, if at all, in the CPU numbers and on weaker hardware. The run cannot prove a GPU gain on a fast machine. See the open questions.

**What should not be patched, and why:**

- **Blend modes, layer blur, fill shadows, symbol layer opacity.** No use in iD's look. One to three full-screen passes per layer and frame. Shader patches cannot live in the minified bundle.
- **Sub-pixel line ink.** Global, no switch, changes every reference picture, and iD has no line under 1 px.
- **Per-feature clip for the partial fill.** It breaks batching. The offset line is close enough, and its cost is known.
- **Interleaving per `layer` value inside one layer.** A large change to MapLibre's draw order for a difference that shows only where bridges of different levels cross.
- **Ground-sized, rotated patterns.** The opposite of what iD draws.

## 6. Open questions for Tobias

1. **Partial fill:** is today's offset band good enough as the final answer, with its known faults at concave corners and narrow shapes? If not, the only exact route is a band polygon from the feature builder, which costs CPU on every edit and every zoom step.
2. **Patterns:** do you want iD's area patterns at all? They are easy in `full` fill and not possible in the default `partial` fill without a patch. A map with patterns in one mode only may be worse than none.
3. **Selection pulse:** iD's selected feature pulses. In Maid that means the map never rests while something is selected. Leave it out for good?
4. **Shadows and blend modes as Maid's own design, beyond iD:** this note finds no need. Is there a concrete place you had in mind (pins, the inspector's map sketch, a lens)? One example would let the cost be measured against a real use.
5. **Dev bundle or fork:** if a shader patch is ever wanted, is shipping MapLibre's dev bundle acceptable for Maid, as the Straßenraumkarte project does, or must it be a fork build?
6. **A GPU-sensitive benchmark:** the frame numbers are capped by the display. Should the benchmark get a mode that makes fill cost visible (a larger viewport, device pixel ratio 2, or CPU and GPU throttling)? Without it no patch that saves or costs GPU time can be judged here.
7. **Idea A (dashed and solid lines in one layer):** worth a measured experiment? It removes about a fifth of the layers and makes the line shader dearer.
