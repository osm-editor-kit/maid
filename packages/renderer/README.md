# Renderer (`@osm-editor-kit/maid-renderer`)

Draws the OSM data in iD's look on MapLibre and runs the map's editing: the engine loads the tiles of the view, turns the data into features, keeps MapLibre's sources up to date, and takes the pointer for drawing, dragging, selecting and the module modes. Headless parts are plain TypeScript. The React parts are the layers that declare sources and layers for MapLibre (react-map-gl).

Used by the apps (their `maid.config.ts` through the shell) and by the modules that draw or edit on the map.

## Architecture

- **`MaidEngine`** (`engine.ts`) is the one place that calls MapLibre imperatively, as the docs say (ADR 0002). It owns the OSM data (`OsmData`), the tile loader and the sender, and it creates the other topics as readonly parts: `Sender`, `TileLoader`, `Camera`, `DragTool`, `TagEdits`, `Clipboard` and more (ADR 0010 has the table). Modules and the shell use its public methods, not its parts.
- **Data path.** Tiles from the OSM API go to `OsmData.merge`. `FeatureBuilder` (`build.ts`) turns each entity into a GeoJSON feature with its iD style resolved into plain properties, so the style expressions stay simple (`['get', 'sc']`). `layers.ts` holds the layer data (pure, no map calls).
- **Sources.** Four GeoJSON sources, areas, lines, points and vertices, with `promoteId: 'id'` (ADR 0002). `sender.ts` and `channels.ts` send them: one update in flight per source, and features from tiles within 150 ms go as one update (ADR 0007).
- **Live tier and edit tier.** Data that arrives after the first view, and features that change, go to small twin sources, and their originals are hidden by feature state. The live tier is merged back in the background (ADR 0003, ADR 0008).
- **Points** are dots, with pins where they fit (ADR 0004). Below OSM zoom 18 the map shows only the lines and areas, and small hint dots (ADR 0014). Presets that arrive late are waited for, and icons are filled in afterwards (`presets-hold.ts`).
- **Pointer.** `pick.ts` picks by iD's layer priority. Drawing and dragging snap to what is under the pointer (`snap.ts`, `snap-aim.ts`), with the constraints of `constraint.ts`.
- **React.** `OsmLayers.tsx` and `ModuleLayers.tsx` render the layers. A module's own source is named by its id.

## Extension points it owns

Declared in `extension-points.ts` and merged into maid-core's `ExtensionPoints`:

| Point | Item | What it adds |
| --- | --- | --- |
| `map.layer` | `MapLayerItem` | A GeoJSON source and its layers over the OSM data. `beforeId: BELOW_OSM_LAYER` draws under it |
| `map.content` | `MapContentItem` | A React component on the map (react-map-gl) |
| `edit.operation` | `Operation` (via `operations(list)`) | An entry in the edit menu, run with its key |
| `draw.tool` | `DrawToolItem` (via `drawTools(list)`) | A tool in the Area button's dropdown (ADR 0011) |
| `draw.constraint` | `ConstraintItem` | Where a drawn or dragged node goes on open ground (ADR 0011) |
| `imagery.used` | `ImageryUsedItem` | The imagery visible on the map now |

Also: `engine.enterModuleMode(mode)` and `exitModuleMode(id)` (`module-mode.ts`). While a mode is on, the pointer goes to the module, not to the selection or the drawing. Modules use it for the reroute's two points and for drawing tools that snap.

## Parts

| Files | What they do |
| --- | --- |
| `engine.ts` | `MaidEngine`: the facade, the viewport, the loading, the edit methods, undo and redo |
| `build.ts`, `layers.ts`, `label.ts`, `direction.ts`, `direction-images.ts`, `viewfield.ts` | Features and their style, layer data, labels, direction arrows, viewfield cones |
| `data.ts`, `redraw.ts`, `edits.ts` | The OSM data, the rebuild of changed entities, what an edit changed |
| `sender.ts`, `channels.ts`, `tile-loader.ts`, `tile-loading.ts` | The updates to MapLibre and the tile requests |
| `presets-hold.ts`, `drawn-counts.ts`, `icon-requests.ts` | Late presets, counts of what is drawn, icon images |
| `pick.ts`, `pick-order.ts`, `snap.ts`, `snap-aim.ts`, `constraint.ts`, `selection-shape.ts`, `midpoints.ts`, `midpoint-handles.ts` | Picking, snapping, selection shapes, the midpoint handles |
| `draw.ts`, `drag.ts`, `transform.ts`, `turn.ts`, `camera.ts`, `modifiers.ts`, `module-mode.ts` | Drawing, dragging, move and rotate, turning the map, modifier keys, module modes |
| `measure.ts`, `measure-session.ts`, `nearby.ts`, `related.ts`, `parent-relations.ts`, `entity-info.ts` | Measuring, nearby features, relations on the map, what the inspector reads |
| `field-overlay.ts`, `operation-preview.ts`, `operation-context.ts`, `tag-edits.ts`, `set-tags-each.ts` | Field lines on the map, operation previews, tag writes |
| `extension-points.ts`, `index.ts` | The extension points and the package's exports |
| `id-*.test.ts` | Tests adapted from iD's specs (ISC, commit noted in each file) |

## Tests

`bun test packages/renderer`: the builder, layers, direction, labels, drag, drawing, snapping, tile loading, the sender, the module modes, the picking order and the adapted iD specs. The benchmarks are in `packages/renderer/bench/` (`build.bench.ts`, `load.bench.ts`, `edit.bench.ts`); each file says how to run it. The visual check is `bun run check-render <name>`.

## More

- Research: [docs/research/maplibre.md](../../docs/research/maplibre.md), [id-rendering-vs-maplibre-spec.md](../../docs/research/id-rendering-vs-maplibre-spec.md), [fetching-audit.md](../../docs/research/fetching-audit.md), [react-map-gl-performance.md](../../docs/research/react-map-gl-performance.md), [drawing-tools/](../../docs/research/drawing-tools/README.md).
- Decisions: [ADR 0002](../../docs/adr/0002-geojson-sources-with-serial-diff-updates.md), [0003](../../docs/adr/0003-edit-source-for-changing-features.md), [0004](../../docs/adr/0004-points-as-dots-plus-pins-that-fit.md), [0007](../../docs/adr/0007-workers-and-batched-updates.md), [0008](../../docs/adr/0008-live-tier-for-new-and-changed-data.md), [0010](../../docs/adr/0010-engine-split.md), [0011](../../docs/adr/0011-drawing-tool-hooks.md), [0014](../../docs/adr/0014-quiet-map-below-zoom-18.md).
- Open: the renderer's open items in [docs/build-out/steps.md](../../docs/build-out/steps.md) (the `build.ts` width for `amenity-parking_space` in code, the focus layers for the relation column).
