# Data layers module (`@osm-editor-kit/maid-module-data-layers`)

Other data drawn under the OSM data: GeoJSON, GPX, PMTiles and vector tiles. A "Data layers" flyout in the top bar lists the layers, switches them on and off, and adds new ones. The editor's config can bring layers of its own.

`dataLayers(options?)` is the module. `options.layers` takes layers the config brings (`DataLayerConfig[]`). They are shown first, cannot be removed, and can be hidden. A broken one stops the start with every problem named.

## What a person sees / can do

- "Data layers" in the top bar. Each layer has a switch (shown or hidden) and a row with its kind, its colour and a remove button.
- "Add a layer": a name, a kind (GeoJSON, GPX, PMTiles or vector tiles), an address (`https://`, or a path on the same server) or a GeoJSON or GPX file from the computer, a colour from five swatches or any hex colour, and for vector tiles and PMTiles the source layer names.
- A file is read in the browser and is not kept after a reload. An address is kept in the browser until it is removed.
- KML is refused with a sentence that says to use GPX or GeoJSON.
- A layer is drawn under the OSM data. A hidden layer makes no request.
- URL parameter `data`: `?data=<address>` shows one remote GeoJSON, GPX or PMTiles file while the URL names it. Removing the layer clears the parameter. A link alone writes nothing to storage. Its iD name is `gpx`, so iD's GPX links work here.

## Using it in an editor's config

```ts
import { dataLayers } from '@osm-editor-kit/maid-module-data-layers'

// in the modules list, in every app:
dataLayers(),
// or with layers of the config:
dataLayers({ layers: [{ id: 'bikeways', name: 'Bikeways', kind: 'geojson', url: '/data/bikeways.geojson' }] }),
```

All five apps (`maid`, `maid-bicycle`, `maid-parking`, `maid-indoor`, `maid-lanes`) call `dataLayers()` without layers. Tailwind needs `@source '../../module-data-layers/src';` in `packages/shell/src/styles.css` (listed there).

## Parts

| File | What it does |
| --- | --- |
| `src/module.tsx` | `dataLayers()`: the URL parameter, the map content and the flyout, registered on `map.content` and `topbar.panel` |
| `src/config.ts` | The kinds, the one schema every layer is checked with (`dataLayerSchema`, `checkDataLayerConfig`, `checkConfigLayers`), the palette. Pure |
| `src/layers.ts` | The map layers of a layer, as plain objects. Pure. The automated-run rule is applied here |
| `src/MapLayers.tsx` | Draws the visible layers (`<Source>` and `<Layer>`), under `belowOsm` |
| `src/data-layers-store.ts` | The added layers and the hidden ones, stored under `maid:data-layers` (version 1). Files are session state |
| `src/add.ts`, `src/geojson.ts`, `src/gpx.ts` | Checking the form and reading the text of a file or an address. GPX is converted with `@tmcw/togeojson` |
| `src/pmtiles.ts` | PMTiles: the layer names of an archive, and the `pmtiles://` protocol |
| `src/link.ts`, `src/url.ts` | The `data` parameter: loading a linked layer as a query |
| `src/Panel.tsx`, `src/ColorSwatches.tsx`, `src/swatch.ts` | The flyout, the form, the colour swatches (arrow keys choose) |

## Tests

`bun test packages/module-data-layers`: the config schema and its messages, the layer draw, the store and its stored version, GeoJSON, GPX (with `src/test-dom.ts` as a stand-in for `DOMParser`), PMTiles headers, the `data` parameter and the swatches.

## More

- [URL state audit](../../docs/research/url-state-audit.md): the `data` parameter and the stored layers (S19 to S21, Q8).
- [Fetching audit](../../docs/research/fetching-audit.md): section 4h, data layers and imagery.
- [Step D3 in the build-out steps](../../docs/build-out/steps.md): what was built and the test for Tobias.

## Open

- A click on a data-layer feature, and a tag filter for data layers (step D3).
- Texts are English only (the module has no messages yet; `docs/build-out/steps.md`, "Texts not through Paraglide").
