# Draft bug report for MapLibre GL JS

Status: **draft, not sent.** Tobias decides if and where to post it. Nothing in this repo posts anything.

Before sending: replace the two local MapLibre URLs in the reproduction page with a CDN build (noted in the file), and re-run it against the then-current MapLibre release.

---

## Title

GeoJSON source: `updateData` while tiles are reloading can leave tiles with stale data and make `queryRenderedFeatures` throw "feature index out of bounds"

## Version

maplibre-gl 6.12.0, Chrome 154, macOS (Apple M4). Not tested on other versions or browsers.

## What happens

A GeoJSON source with `promoteId` receives several `updateData({ add })` calls in quick succession. Between the calls a data-driven paint property of a layer on that source changes (`setPaintProperty` with a new `match` expression), which makes MapLibre reload the source's tiles.

Sometimes, after the map has gone idle:

- `source.getData()` returns all features (the worker has the full data),
- `map.querySourceFeatures(sourceId)` returns fewer features (the tiles do not have all of them: 2800 or 3200 of 4800 in the reproduction),
- `map.queryRenderedFeatures({ layers })` throws `Error: feature index out of bounds`.

The state does not repair itself. It stays wrong until the source is updated again.

## Expected

Once the map is idle, the tiles contain what the last `updateData` produced, and feature queries do not throw.

## Reproduction

`tools/maplibre-repro/updatedata-overlap.html` in this repo. One source, three line layers, 12 batches of 400 lines added with `updateData`, a `setPaintProperty('line-dasharray', ['match', ...])` on each layer after every batch.

Run it 12 times per mode with `bun tools/maplibre-repro/run.ts 12`. Results on 2026-10-10:

| Mode (`?` parameters) | Runs | Failed |
| --- | ---: | ---: |
| `gap=30` (updates 30 ms apart, no style change) | 4 | 0 |
| `gap=30&restyle=1` | 4 | 0 |
| `gap=5&restyle=1` | 12 | 1 |
| `gap=30&restyle=1&sort=1` | 16 | 1 |
| `gap=5&restyle=1&sort=1` | 12 | 0 |
| `serial=1&restyle=1&sort=1` (wait for `isSourceLoaded` before the next update) | 16 | 0 |

So the standalone page fails in roughly one of 15 to 20 runs when style changes are mixed in, and never without them or when updates are serialised. That is a small sample; the rate is an indication only.

In our application the same symptom appeared far more often (three of five runs) before we serialised updates. There, four sources are updated at the same time, about 27 layers read from them, and new dash patterns arrive with the data, so layers are re-specified while updates are in flight.

## What we do about it

We send one `updateData` per source at a time and wait until `map.isSourceLoaded(sourceId)` is true again before sending the next. Waiting for the promise that `updateData` returns was not enough: it resolves when the worker has the data, before the visible tiles are rebuilt. With that in place the problem did not occur again (6 of 6 application runs, 16 of 16 in the reproduction).

## Guess at the cause (not verified in MapLibre's code)

A tile reload that was started by the style change and one started by the data update overlap. The tile ends up with the feature index of one load and the raw tile data of the other, so indexes point past the end of the layer.
