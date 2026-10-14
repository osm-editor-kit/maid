# react-map-gl: every `<Layer>` and `<Source>` renders again on each `styledata`

Status: **local draft for a pull request to visgl/react-map-gl. Not sent.** Tobias decides whether and when to open it. Nothing in this repo posts anything.

Measurements and the code audit behind it: [docs/research/react-map-gl-performance.md](../research/react-map-gl-performance.md) (finding 1 and "Patch tried in Maid"). The patch Maid uses: `patches/@vis.gl%2Freact-maplibre@8.1.3.patch`.

## Draft

**Title:** Layer and Source: re-render on `styledata` only when the layer or source is missing

**Body:**

`<Layer>` and `<Source>` subscribe to `styledata` and force a render on every event (`modules/react-maplibre/src/components/layer.ts` and `source.ts`, same in `react-mapbox`). MapLibre fires `styledata` for every style change: an `addImage`, a `setPaintProperty`, a layer added by another component. So each such change renders every `<Layer>` of the map, and each `<Source>` schedules a timer and a render. The render then finds the layer in the style and calls `updateLayer` with the same props, which does nothing.

The render only does new work when the layer or source is missing from a loaded style, for example after a style swap. This change keeps that case and skips the rest:

```ts
// layer.ts
const onStyleData = () => {
  // @ts-ignore
  if (!(map.style && map.style._loaded && map.style.getLayer(id))) forceUpdate();
};
map.on('styledata', onStyleData);
forceUpdate();
return () => {
  map.off('styledata', onStyleData);
  // ...
};
```

`source.ts` does the same with `map.style.getSource(id)` and keeps its `setTimeout`.

Measured with 121 layers and about 10,000 GeoJSON features (a benchmark page that drives the same map once through react-maplibre and once through MapLibre directly; Chrome, medians of 5):

| | Before | After |
| --- | --- | --- |
| `<Layer>` renders per `addImage` | 242 (two `styledata` per image) | 0 |
| `<Layer>` renders per burst of 30 `addImage` | 242 | 0 |
| Main-thread script per image, one per frame, React against raw MapLibre in the same run | +49 % | +7 % |
| Style swap with the `mapStyle` prop | layers re-added | layers re-added, same time as before relative to raw |

In an editor that adds marker images on demand, the load fired 51 `styledata` events and 3,525 `<Layer>` renders; with the change its main-thread CPU at load is 4 to 9 % lower.

Unchanged behaviour:

- A layer whose source or `beforeId` is not there yet is still missing, so it renders again on the next `styledata` and is added then.
- After a style swap the layers are missing and are added again.
- While the style is not loaded, every event still renders, as before.

## Before sending

- Port the change to the TypeScript sources of both `react-maplibre` and `react-mapbox` (the patch is on the built `dist/` of 8.1.3).
- Run the library's own tests; add one that counts renders of a `<Layer>` across `map.addImage` calls.
- Check for an existing issue or pull request on the same topic.
