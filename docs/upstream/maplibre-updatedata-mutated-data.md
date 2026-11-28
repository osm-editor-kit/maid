# MapLibre GL JS: `updateData` misses tiles when the object given to `setData` changed

Status: **draft, not posted.** Nothing in this repo posts anything; a person decides whether and when to send it. Findings and Maid's workaround: [docs/research/maplibre-updatedata-stale-tiles.md](../research/maplibre-updatedata-stale-tiles.md).

Before sending:

- Run `tools/maplibre-repro/updatedata-mutated.html` against an untouched maplibre-gl of the newest release (`MAPLIBRE_DIR=… bun tools/maplibre-repro/run.ts 3 "mutated,mutated&copy=1"`, see the older write-up [maplibre-updatedata-inconsistent-tiles.md](maplibre-updatedata-inconsistent-tiles.md) for how to point it at an unpacked package). Measured so far only on 6.16.0 with Maid's patch, which does not touch the lines below.
- Searched on 2026-11-27 (`gh search issues`, keywords "updateData mutated", "updateData removed feature stays", "toUpdateable"): no matching issue. The only hit, [#7257](https://github.com/maplibre/maplibre-gl-js/issues/7257), was a geojson-vt buffer bug, closed by [#7274](https://github.com/maplibre/maplibre-gl-js/pull/7274). Discussions were not searched.
- It can be argued that this is the caller's fault. The report therefore asks for either a copy or a sentence in the docs, and leaves the choice to the maintainers.

---

> Written by Claude Opus 5.5 (effort: medium) on behalf of @tordans.

## Title

GeoJSONSource: the first `updateData` after `setData` takes the tiles to reload from the data object as it is when the update comes back, so a removed feature can stay in its tile

## Version

maplibre-gl 6.16.0, Chrome, macOS. The code below is the same on `main` as far as we read it (not run there).

## What happens

1. `map.addSource('s', {type: 'geojson', data: collection})` (or `source.setData(collection)`).
2. The application changes `collection`, e.g. `collection.features = withoutA`, as a wrapper does that keeps one `data` object to avoid calling `setData` again.
3. `source.updateData({remove: [a.id]})`.

After the map is idle, `getData()` no longer has A, but `querySourceFeatures` and `queryRenderedFeatures` still return it, and it is still drawn. It stays until A's tile is rebuilt for another reason.

## Expected

A is gone from the map, or the documentation says that the object passed to `setData` / `addSource` must not be changed afterwards.

## Reproduction

One page, two short lines in different tiles; it prints a JSON result. `?copy=1` passes `structuredClone(collection)` instead, which makes it pass. Deterministic: 3 of 3 runs fail without the copy, 3 of 3 pass with it.

```js
const collection = {type: 'FeatureCollection', features: [a, b]} // a, b: LineStrings with ids 1 and 2, far apart
map.addSource('s', {type: 'geojson', data: collection})
map.addLayer({id: 'l', type: 'line', source: 's'})
await idle()
collection.features = [b]
await map.getSource('s').updateData({remove: [a.id]})
await idle()
map.querySourceFeatures('s').map(f => f.id) // [1, 2], expected [2]
```

(Full page: [paste `tools/maplibre-repro/updatedata-mutated.html` or a gist here.])

## Cause

- `GeoJSONSource` stores the caller's object: `this._data = {geojson: data}` (`src/source/geojson_source.ts`, constructor and `setData`).
- The main thread converts it to its own map of features lazily, in `_applyDiffToSource`, when the **result** of the first `updateData` arrives: `toUpdateable(this._data.geojson, promoteId)`.
- `applySourceDiff` (`src/source/geojson_source_diff.ts`) takes the geometry of each removed id from that map to compute `affectedBounds`; an id it cannot find is skipped.
- `TileManager.reload` rebuilds only the tiles `shouldReloadTile` accepts for those bounds.

If the object changed between `setData` and that moment, the removed feature is no longer in it, contributes no bounds, and its tile keeps the feature. The worker's index is correct. A replaced feature (removed and added with the same id) behaves the same way: only the tiles of its new geometry are rebuilt.

## Possible fixes

1. Copy the feature list when the data is given: in the constructor and `setData`, keep `{...data, features: data.features.slice()}` for a FeatureCollection (cheap: an array of references), or build the updateable map there.
2. Or document in `setData` and `updateData` that MapLibre keeps the object and that it must not be changed afterwards.

1 does not protect against changing a feature object in place; 2 covers that too.
