# Projections and coordinates: does MapLibre's custom CRS help Maid?

Tobias, 2026-11-11: MapLibre can now use any projection. Does that open anything for Maid in accuracy (for example mapping in the Arctic: too few decimal places?) or in speed and memory (Rapid's other coordinate system, which we decided against)? URLs keep the usual `map=zoom/lat/lon`; a change would be internal only. Switch only on clear advantages; otherwise this is research.

**Answer: no switch.** Neither question is helped by another projection or by Rapid's world coordinates. Lon/lat in the model stays (decided 2026-10-11, [data store](../architecture/05-data-store.md) "Decided"). One side finding about drawing precision at the highest zooms is real but small, and has its own fix that is not a projection (section 4).

## 1. What MapLibre added

MapLibre GL JS 6.15.0 (2026-10-18; Maid is on 6.16.0, latest is 6.17.0) added, marked experimental ([CHANGELOG](https://github.com/maplibre/maplibre-gl-js/blob/main/CHANGELOG.md)):

- `addProjection(crs)`, `removeProjection`, a built-in `identity` projection and a `{bbox}` token in tile URLs, "for maps in a custom planar CRS with its own quad tile grid".
- GeoJSON sources in such a CRS, projected in the workers from a `definition` string (WKT or PROJ) and a projection handler.

What it is, read in `src/geo/projection/crs.ts` of 6.17.0: a CRS is `forward`/`inverse` between lon/lat and plane coordinates plus a tile matrix set. **"Every tile source of the map is taken to be cut in `tileMatrixSet`, and the tiles are used as they are, without reprojecting their content."** No world copies, no wrapping.

So it is for maps whose tiles were made in that CRS (a national grid such as EPSG:2193, a floor plan). It does not reproject raster tiles. Every background Maid offers (ELI, Bing, Esri, OpenAerialMap, custom TMS) is cut in Web Mercator, so under a custom CRS the map would have no imagery, apart from a WMS that serves that CRS through `{bbox}`. For an editor that alone rules it out as the normal view.

## 2. Accuracy: are coordinates less precise near the poles?

No. Three layers, each checked:

| Layer | Precision | Near the poles |
| --- | --- | --- |
| OSM itself | Lon/lat as integers of 1e-7° (API and database). 1e-7° of latitude is 1.1 cm; of longitude 1.1 cm × cos(lat) | Longitude steps get *finer* in metres: 0.4 cm at 70°, 0.2 cm at 80°. Nothing is lost |
| Maid's model | JavaScript numbers (float64), lon/lat as the API gives them | A float64 near 180 resolves about 3e-14°, millions of times finer than OSM's step. Lon/lat → Mercator → lon/lat comes back within 6e-14° (measured, 1 million random points); it never changes a 7th decimal |
| Geometry actions | Squaring, circularising, rotating project lon/lat to Mercator world coordinates for the length of the calculation (Rapid's code, `packages/model/src/actions/orthogonalize.ts:88-113`) | Mercator is conformal: a right angle on the map is a right angle on the ground at any latitude. Within one view (about 1 km) the scale changes by `tan(lat)/R`, at 80° under 0.1 % per km |

Where Mercator really stops is at 85.0511° north and south (`MAX_VALID_LATITUDE` in MapLibre). MapLibre's GeoJSON tiler clamps anything beyond to the edge of the world square (`projectY` in `@maplibre/geojson-vt`). North of 85° there is no land. South of 85°S there is OSM data on the Antarctic plateau (the South Pole station and the traverse road to it, from memory, not checked, since automation sends no requests to OSM). iD and Rapid cannot edit there either. A polar view (EPSG:3031 with `addProjection`) could show it, but without imagery and with an experimental API. Not worth building for a few hundred features nobody edits with Maid; noted under "Not planned yet" in [steps.md](../build-out/steps.md).

## 3. Memory and speed: Rapid's world coordinates

What Rapid does ([rapid.md](rapid.md) "Rendering"): every feature is stored in world coordinates at zoom 16 *in addition to* lon/lat, so PixiJS can draw it with one transform; a pan only moves the origin. Maid took Rapid's model but computes that geometry lazily, on first access (decided 2026-10-11, [data store](../architecture/05-data-store.md); about 135 ms of 204 ms "create entities" saved).

Why switching would not store less:

- **Rapid keeps both, not one instead of the other.** OSM gives and takes lon/lat (API, uploads, osmChange, URLs, Nominatim, validation distances), so lon/lat cannot go. World coordinates only add. Measured in V8 (`node --expose-gc`, 119,678 nodes as in the `dense` scene): a `[lon, lat]` array costs 75.6 bytes per node, a second `[x, y]` array another 75.5 bytes, about 9 MB more on `dense`.
- **MapLibre wants lon/lat.** A GeoJSON source projects lon/lat to Mercator in its worker (`@maplibre/geojson-vt` `convert`); handing it pre-projected coordinates is not possible for the Mercator map, and under a custom CRS the worker projects again from the `definition`. Maid's engine sends lon/lat straight through, nothing is converted on the way. Rapid needs world coordinates because Pixi draws in screen space; MapLibre does that projection itself on the GPU, per tile.
- **Smaller numbers would cost precision.** Float32 world coordinates at zoom 16 (0 to 16.7 million pixels) have a step of 1 pixel = 2.4 m × cos(lat). Rapid uses float64 for this reason.

If memory per node ever matters, the lever is not the projection but the layout: lon/lat as integers of 1e-7° in one `Int32Array` (8 bytes per node, like OSM's own database) instead of an array object per node (76 bytes). On `dense` that is about 8 MB. It would touch every entity, the graph's copy-on-write and all ported Rapid actions, and no measurement so far has found memory per node to be a problem (none has looked at it: [performance-2026-10-13.md](performance-2026-10-13.md) is about time). Not proposed.

## 4. Side finding: where precision is lost today

Measured with `bun tools/bench/precision-probe.ts small` (new, needs `bun run dev-maid` and `bun run dev-api`; writes `reports/precision-probe.json`). It compares each node's `loc` in the graph with the position MapLibre keeps for it in its tiles (`querySourceFeatures`), scene `small`, Lichtenrade, 52.39°N:

| MapLibre zoom (OSM zoom) | Tiles cut at | Max offset | Max offset on screen |
| --- | --- | --- | --- |
| 17 (18) | 17 | 1.6 cm | 0.04 px |
| 20 (21) | 17 | 1.6 cm | 0.34 px |
| 21 (22) | 17 | 1.6 cm | 0.68 px |
| 22 (23) | 17 | 1.6 cm | 1.36 px |
| 23 (24, Maid's maximum) | 17 | 1.6 cm | 2.71 px |

Why: the editable sources are cut into tiles up to MapLibre zoom 17 (`SOURCE_OPTIONS.maxzoom` in `packages/renderer/src/OsmLayers.tsx`, [ADR 0002](../adr/0002-geojson-sources-with-serial-diff-updates.md), which left "precision at OSM zoom 22 and beyond" open) and overzoomed above. A tile has 8192 units per side (`EXTENT` in MapLibre), so a point snaps to a grid of 305.7 m / 8192 = 3.7 cm × cos(lat). The data is not changed; only the drawing is rounded.

- In pixels this is the same at every latitude: at the poles the grid is finer in metres, and so are the pixels. Formula: max ≈ 0.044 × 2^(zoom − 17) px. A projection cannot change it.
- Vertices and lines are rounded the same way, so they stay on each other. What can be off is the drawing against the pointer and the imagery: up to 1.4 px at OSM 23 and 2.7 px at OSM 24. At OSM 22 and below it stays under one pixel.
- The fix, if it is ever visible: raise the source `maxzoom` to 18 or 19 (halves or quarters the offset) at the cost of more tiles per update. Measure with `bun run bench` and `bench-edit` first. Not done here; offered as a follow-up.

## 5. What custom projections could do for Maid later

- **Indoor plans in a local metric system** (`identity` projection): the indoor fixture is OSM data in lon/lat on imagery, so no.
- **A polar view for Antarctica**: see section 2. Only with a background in EPSG:3031 and when MapLibre drops "experimental".
- **The globe** (since MapLibre 5) is a separate, built-in projection and keeps Web Mercator tiles. Useful for an overview, not for editing.

## Sources

- MapLibre GL JS 6.17.0 package (`npm pack`), `src/geo/projection/crs.ts`, `src/data/extent.ts`, `src/util/util.ts`, `CHANGELOG.md` 6.15.0.
- `@maplibre/geojson-vt` 6.1.2 `dist/geojson-vt.mjs` (`projectY`).
- Measurements: `tools/bench/precision-probe.ts` (run 2026-11-11 against the dev server, headless Chrome, no request outside localhost) and a V8 heap measurement of 119,678 coordinate pairs (script not kept: one array per node, `process.memoryUsage().heapUsed` after `gc()`).
- Earlier decision: [05-data-store.md](../architecture/05-data-store.md) "Decided" (2026-10-11), [03-packages.md](../architecture/03-packages.md) on `@rapid-sdk/math`, [rapid.md](rapid.md).
