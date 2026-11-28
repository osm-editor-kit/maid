# Why a feature that `updateData` removed stayed in a tile

2026-11-27, maplibre-gl 6.16.0 (with Maid's patch, `patches/maplibre-gl@6.16.0.patch`), `@maplibre/geojson-vt` 6.3.0. Line numbers point into `src/` of the installed package; the patch does not touch these lines.

## The symptom

The street drawing (`IncrementalSource`, module-lanes) sends its changes with `GeoJSONSource.updateData`. Now and then a feature it had removed stayed on the map: `getData()` no longer had it, `querySourceFeatures` still did. `bun run check-lanes --app lanes` failed on it about one run in three ("the street drawing has the lanes of the selected road, as its bands" with a removed `both_ways` lane left over). Maid worked around it with a whole `setData` 800 ms after the updates stopped (the reconcile in `packages/renderer/src/incremental.ts`).

## Two causes

Debugging showed two separate causes with the same symptom. Only the first is in MapLibre; the second is Maid's (with react-map-gl). The reconcile hid both.

### 1. MapLibre reads the data object again, later (MapLibre)

MapLibre keeps a **reference** to the object given to `addSource` or `setData` and copies it only later, when the result of the first `updateData` after it comes back. Maid changed that object in between.

1. `geojson_source.ts:217` (constructor) and `:300` (`setData`): `this._data = {geojson: data}`, the caller's object itself.
2. `updateData` sends the diff to the worker. The worker applies it to its geojson-vt index; that part is right.
3. When the worker answers, `_onWorkerUpdateResult` (`:543`) calls `_applyDiffToSource`. The first time after an `addSource` or `setData`, that converts the stored object into MapLibre's own map of features: `toUpdateable(this._data.geojson, promoteId)` at `:594`, reading `data.features` **now**, not when `setData` was called.
4. `applySourceDiff` (`geojson_source_diff.ts:129-130`) collects the geometry of each removed feature from that map, to know which tiles to rebuild: `const existing = updateable.get(id); if (!existing) continue;`.
5. `_getShouldReloadTileOptions` (`:546`) turns the geometries into bounds, and the tile manager reloads only the tiles whose bounds meet them (`tile_manager.ts:279`, `shouldReloadTile` at `geojson_source.ts:645`).

`Holder` in `incremental.ts` kept one collection object for react-map-gl (so that react-map-gl never calls `setData`) and set `collection.features = next` on every change, **before** sending the diff. So at step 3 MapLibre read a list that already lacked the removed feature, step 4 found no geometry for it, and its tile was not rebuilt. The worker no longer had the feature, but the tile on the main thread still drew it. A changed feature (removed and added with the same id) is hit the same way: only the new geometry's tiles were rebuilt.

Only the first `updateData` after each `addSource` or `setData` is exposed; after that MapLibre has its own map. The reconcile made it worse in a way it then hid: each reconcile was a `setData` with the same object, so the first update of the next burst was exposed again, and the next reconcile repaired it.

Reproduction: `tools/maplibre-repro/updatedata-mutated.html`, two lines in different tiles; the page sets `collection.features = [b]` and calls `updateData({remove: [a.id]})`. `?copy=1` hands MapLibre a copy instead.

```bash
bun tools/maplibre-repro/run.ts 3 "mutated,mutated&copy=1"
```

Measured 2026-11-27 (headless Chrome, macOS, 6.16.0 with Maid's patch): without the copy 3 of 3 runs keep line A in the tiles and under the mouse (`tiles: [1, 2]`, `renderedAtA: [1]`, `getData: [2]`); with the copy 3 of 3 are clean. Deterministic. Upstream draft: [docs/upstream/maplibre-updatedata-mutated-data.md](../upstream/maplibre-updatedata-mutated-data.md).

### 2. A source with someone else's data (Maid and react-map-gl)

With cause 1 fixed, check-lanes still failed 2 of 10 runs. A debug dump in the failing state showed:

- MapLibre's own copy (`getData()`, already converted to its map) held the removed lanes, ids 187 to 191, next to the new ones.
- The `Holder` alive at that moment did **not** hold them, and its log of everything it sent had **no removal** of them: its first update (the check's setup edit) removed ids from 1344 up, which it had started with.

So the source held a collection that this `Holder` never had. Measured, in passing runs: exactly one `Holder` per street source, created once. Not measured: the failing runs with that log, since logging in the `Holder` constructor made the failure go away (22 passes in a row, against 4 failures in the 18 runs just before), which points to a race at mount. **Inferred**, not proven: react-map-gl's `<Source>` calls `map.addSource` during render (`createSource` in `@vis.gl/react-maplibre` `source.ts`). When React throws a render away (a concurrent render interrupted while data arrives), the `Holder` and street collector of that render are gone but the source stays in MapLibre. The next render makes a new `Holder` (and a new full drawing with new ids), its `<Source>` finds the source already there and keeps it, and every later difference is computed against data the source never had. Features of the lost drawing stay for good. MapLibre is not at fault here.

What else was ruled out on the way: geojson-vt's `updateData` and `invalidateTiles` handle removals correctly, `GeoJSONWorkerSource.loadData` clears its loaded tiles (`geojson_worker_source.ts:195`), the overlapping tile loads of [the earlier write-up](../upstream/maplibre-updatedata-inconsistent-tiles.md) are fixed by Maid's patch, and Maid's main map never changes its style (`mapStyle` is a constant). The OSM data sender (`sender.ts`) is not affected: its sources start from the constant `EMPTY` and are never given a changing object, and the engine adds them before any data.

## The workaround (in `incremental.ts`)

- **Never change an object once MapLibre has it.** `Holder.collection`, which react-map-gl passes to `addSource`, holds the first features and is frozen. The latest features live in a private field; each change makes a new array. `latest()` returns a new collection object for every `setData`.
- **Check the source before the first difference.** On its first contact with a source the updater compares `source.serialize().data` with its own `collection` (MapLibre returns the very object it was given until the first update). If it is another object, the source gets the whole latest collection with `setData` once, then differences. The first `apply` (on mount) does this even when nothing changed, and `styledata` triggers it when the source appears later.
- **A source made again** (another `GeoJSONSource` object under the same id, as after a change of the style) also gets the whole latest collection once.
- The reconcile is gone.

## Measurements

check-lanes, `--app lanes`, small scene, this worktree's dev server, mock API, one run after another:

| Code | Runs | Failed | Failure |
| --- | ---: | ---: | --- |
| Reconcile off, nothing else changed | 8 | 5 | the removed `both_ways` lane still in `maid-street-areas` |
| Reconcile off, cause 1 fixed | 10 | 2 | the same |
| Reconcile off, both fixed (the committed code) | 20 | 0 | every run 32 `ok`, exit 0 |

The check has 32 `ok` lines now (31 when the task was written). The second cause failed about one run in five, so 20 clean runs leave about a 1 % chance that it is still there and was lucky (0.8^20).

Open: the thrown-away render behind cause 2 is inferred, not caught in the act; the check before the first difference covers it whatever made the source. The other `<Source>` users that keep one `data` object (`OsmLayers.tsx`, `EMPTY`) never change it and are not affected.
