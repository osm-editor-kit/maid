# Draft bug report for MapLibre GL JS

Status: **draft, not sent.** Tobias decides if and where to post it. Nothing in this repo posts anything.

A fix runs locally as part of `patches/maplibre-gl@6.12.0.patch`. It is described under "Cause" and "Fix" below and was confirmed with the reproduction: 8 of 30 runs fail on unpatched 6.12.0, 0 of 30 with the patch.

Before sending: replace the two local MapLibre URLs in the reproduction page with a CDN build (noted in the file), and re-run it against the then-current MapLibre release.

---

## Title

GeoJSON source: answers for overlapping loads of the same tile are applied in arrival order, so an older one can overwrite a newer one (stale tiles, `queryRenderedFeatures` throws "feature index out of bounds")

## Version

maplibre-gl 6.12.0, Chrome 154, macOS (Apple M4). Not tested on other versions or browsers.

## What happens

A GeoJSON source with `promoteId` receives several `updateData({ add })` calls in quick succession. Between the calls a data-driven paint property of a layer on that source changes (`setPaintProperty` with a new `match` expression), which makes MapLibre re-parse the source's tiles.

Sometimes, after the map has gone idle:

- `source.getData()` returns all features (the worker has the full data),
- `map.querySourceFeatures(sourceId)` returns fewer features (the tiles show an older state),
- `map.queryRenderedFeatures({ layers })` throws `Error: feature index out of bounds`.

The state does not repair itself. It stays wrong until the source is updated again.

## Expected

Once the map is idle, the tiles contain what the last `updateData` produced, and feature queries do not throw.

## Reproduction

`tools/maplibre-repro/updatedata-overlap.html` in this repo: one source, three line layers, 12 batches of 400 lines added with `updateData` 5 ms apart, and a `setPaintProperty('line-dasharray', ['match', ...])` on each layer after every batch. The page also counts, per tile, how often an answer comes back while an older request for the same tile is still open.

```bash
bun tools/maplibre-repro/run.ts 30 "gap=5&restyle=1"                                  # the MapLibre this repo uses (patched)
MAPLIBRE_DIR=~/.bun/install/cache/maplibre-gl@6.12.0@@@1 bun tools/maplibre-repro/run.ts 30 "gap=5&restyle=1"   # unpatched
```

Results on 2026-10-11, 30 runs each:

| | Failed runs | Runs in which an answer overtook an older request |
| --- | ---: | ---: |
| maplibre-gl 6.12.0 | 8 | 22 |
| with the fix below | 0 | 21 |

So answers arrive out of order in about two of three runs either way; without the fix about a third of those end in a broken tile.

Earlier, smaller samples: no failure in 16 runs when the page waits for `isSourceLoaded` before the next update, and none without style changes.

## Cause

`GeoJSONSource.loadTile` on the main thread sends a request to the worker and applies the answer when it arrives. Nothing stops a second request for the same tile from going out while the first is open: a data update and a style change both trigger one. (`VectorTileSource.loadTile` has a guard for this: it parks a reload while the tile is `loading`. `GeoJSONSource` has none.)

The answers do not always come back in the order the requests went out, because parsing a tile is asynchronous in the worker: it waits for glyphs, images and dash patterns from the main thread. When an older answer arrives last, `Tile.loadVectorData` installs its buckets and its feature index over the newer ones.

The exception comes from a second detail. The worker only attaches the raw tile data to the first parse of a tile (`_parseWorkerTile` attaches it while a `parsing` entry exists and then removes the entry). A re-parse answers without it, and the main thread pairs that answer's feature index with `tile.latestRawTileData`, whatever was received last. If that raw data belongs to a different generation of the tile, the indexes in the feature index point past the end of its layers.

## Fix

Two small changes, both in the GeoJSON path only:

1. **Main thread, `GeoJSONSource.loadTile`:** number the requests per tile and ignore an answer (or an error) if a newer request for that tile has gone out since. The worker handles requests in order, so the newest request always sees the newest data.
2. **Worker, `GeoJSONWorkerSource`:** keep the raw tile data with the worker tile it was made from, and attach it to every parse result, not only the first. Each answer is then consistent in itself.

The first change alone could drop the only answer that carries raw data; the second alone would still let an older answer win. Cost of the second: the worker keeps one copy of the raw data per loaded tile, and re-parses send it again.

The exact edits are in `patches/maplibre-gl@6.12.0.patch` (search for `_maidLoadSeq` and `_maidRawData`; the readable version is in the `-dev.mjs` hunks).

Not examined: whether `VectorTileSource` can show the same raw-data mismatch through its own reload path.

## What we did before the fix

We sent one `updateData` per source at a time and waited until `map.isSourceLoaded(sourceId)` was true again before sending the next. Waiting for the promise that `updateData` returns was not enough: it resolves when the worker has the data, before the visible tiles are rebuilt. Maid still does this; with the patch it is no longer needed for correctness. With the workaround switched off (`?serial=0&coalesce=0`), the application configuration that used to fail in three of five runs gave the same, correct result in six of six.
