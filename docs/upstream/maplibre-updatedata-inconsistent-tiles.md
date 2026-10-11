# MapLibre GL JS: overlapping loads of one GeoJSON tile

Status: **write-up and local fix. Not reported upstream; sending it is postponed** (Tobias, 2026-10-11). Nothing in this repo posts anything.

This file is written so that it can be referenced, or copied, when the report is sent. Everything it mentions is in this repository:

| What | Where |
| --- | --- |
| The fix, as a patch to maplibre-gl 6.12.0 | [`patches/maplibre-gl@6.12.0.patch`](https://github.com/osm-editor-kit/maid/blob/main/patches/maplibre-gl%406.12.0.patch). Search for `_maidLoadSeq` and `_maidRawData`; the readable hunks are the ones for `maplibre-gl-dev.mjs` and `maplibre-gl-worker-dev.mjs`. The same file also holds an unrelated change (a wheel-zoom delay, [ADR 0006](../adr/0006-wheel-zoom-finish-delay.md)) |
| The test case | [`tools/maplibre-repro/updatedata-overlap.html`](https://github.com/osm-editor-kit/maid/blob/main/tools/maplibre-repro/updatedata-overlap.html): one page, no dependencies besides MapLibre |
| The runner | [`tools/maplibre-repro/run.ts`](https://github.com/osm-editor-kit/maid/blob/main/tools/maplibre-repro/run.ts): opens the page N times in Chrome and prints one JSON line per run |

The repository is private at the time of writing. The links work for people with access; for a public report the page and the two readable patch hunks should be pasted or put in a gist.

## Run the test case

Needs Bun and Chrome. From the repository root:

```bash
bun install
```

Against the MapLibre this repository uses, which has the fix:

```bash
bun tools/maplibre-repro/run.ts 30 "gap=5&restyle=1"
```

Against an untouched maplibre-gl 6.12.0. `MAPLIBRE_DIR` is any folder that contains the package's `dist/`. Bun's cache usually has one after `bun install`; if that path does not exist on your machine, unpack the package anywhere (`npm pack maplibre-gl@6.12.0`, then extract the archive) and point to its `package` folder:

```bash
MAPLIBRE_DIR=~/.bun/install/cache/maplibre-gl@6.12.0@@@1 bun tools/maplibre-repro/run.ts 30 "gap=5&restyle=1"
```

Each line of output is one run:

- `ok`: `false` means the bug showed.
- `inTiles_querySourceFeatures`: features the tiles hold. It should equal `expected` (4800).
- `queryRenderedFeatures`: a number, or the error text when the query threw.
- `overlapping`: how many requests were sent for a tile while an older one for the same tile was open.
- `outOfOrder`: how many answers came back while an older request for the same tile was still open.

Parameters of the page: `gap` (milliseconds between `updateData` calls), `restyle=1` (change a data-driven paint property after each batch; needed to trigger the bug), `serial=1` (wait for `isSourceLoaded` between updates; the workaround), `batches`, `perBatch`, `sort=1`.

To open the page by hand in a browser, serve the repository's `tools/maplibre-repro` folder together with a `maplibre-gl` folder next to it, or replace the two local MapLibre URLs at the top of the page with a CDN build, as the comment there says. The result is printed in the top-left corner.

A second page, `updatedata-order.html`, tries to force the bad order deterministically. It does **not** reproduce the bug and is kept only as a record of that attempt.

## Already reported upstream?

Searched on 2026-10-11 in `maplibre/maplibre-gl-js` (issues, pull requests, changelog, source on `main`), read-only. In short: **the symptom has been reported twice and both reports are closed as fixed in the version we use. The cause described here, the missing order check on the main thread, was not found in any issue or pull request.**

The same symptom, closed:

| | Title | State | Relation to this write-up |
| --- | --- | --- | --- |
| [#7752](https://github.com/maplibre/maplibre-gl-js/issues/7752) | `map.queryRenderedFeatures` causes "Out of bounds" error | Closed 2026-06-10 by [#7765](https://github.com/maplibre/maplibre-gl-js/pull/7765) ("only remove parse state once parsing is done") | Same error, from conflicting reloads of a tile. The fix is in the worker |
| [#8064](https://github.com/maplibre/maplibre-gl-js/issues/8064) | `map.queryRenderedFeatures` causes "Out of bounds" error again | Closed 2026-08-07 by [#8107](https://github.com/maplibre/maplibre-gl-js/pull/8107) ("Fix worker sources discarding raw tile data after aborted parse") | Same error. The worker answered without raw tile data after an aborted parse. Different trigger (a missing image and a symbol query) |

Both fixes are part of 6.12.0, and our test case still fails on an untouched 6.12.0 in 8 of 30 runs. So they did not close the path described here. A report should be written as a follow-up to those two and link them.

Related, different mechanism, both in 6.12.0:

- [#8585](https://github.com/maplibre/maplibre-gl-js/pull/8585): worker data updates of a GeoJSON source are sent one at a time. That orders the data updates, not the tile loads that follow them.
- [#8613](https://github.com/maplibre/maplibre-gl-js/pull/8613): more tests for `GeoJSONSource`, and fixes for stale data after `setData` and stale clusters.

Later versions: the changelog of 6.13.0 (2026-10-06) and of `main` has no entry about GeoJSON tile reloads, `updateData` ordering or the feature index, and `GeoJSONSource.loadTile` is reported as unchanged there. A new request replaces `tile.abortController` without aborting the open one, and an answer is applied whenever the tile is not aborted.

How sure this is:

- Checked by us: numbers, titles, states and merge dates of the six items above, and the `loadTile` code in 6.12.0.
- From the search agent, not checked by us: the statements about 6.13.0 and `main`, and what the two fixes change in detail.
- Not done: running the test case on 6.13.0 or `main`. **Do that before sending a report**; if it no longer fails there, the report is not needed.
- The search used keywords through the GitHub API. Discussions were not searched, and a report under an unusual title can have been missed.

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

`tools/maplibre-repro/updatedata-overlap.html`: one source, three line layers, 12 batches of 400 lines added with `updateData` 5 ms apart, and a `setPaintProperty('line-dasharray', ['match', ...])` on each layer after every batch. The page also counts, per tile, how often an answer comes back while an older request for the same tile is still open.

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
