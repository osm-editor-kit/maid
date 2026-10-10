# osm-editor-kit

Our npm organisation: https://www.npmjs.com/org/osm-editor-kit, GitHub: https://github.com/osm-editor-kit. Maid should use these packages where they fit and improve them upstream instead of copying code. New reusable parts of Maid are published here.

## Packages (registry, 2026-10-10)

| Package | Version | Purpose | Use in Maid |
| --- | --- | --- | --- |
| `osm-data` | 0.1.0-alpha.0 | Download, parse and merge OSM API and Overpass responses into an indexed in-memory store | Candidate for the data store in iteration 1 |
| `osm-maplibre` | 0.1.0-alpha.0 | MapLibre helpers: OpenFreeMap style, overlay anchors, metre-based paint | Candidate, especially metre-based widths |
| `osm-coverage` | 0.1.0-alpha.0 | Incremental fetching per viewport with TanStack Query | Later, for live loading |
| `osm-map-url` | 0.1.0-alpha.0 | Map and feature URL parameters for TanStack Router | Candidate for `?map=` |
| `react-map-gl-draw` | 0.2.1 | Controlled component to draw and edit points, lines and polygons | Later, for editing |
| `maplibre-editor-layer-index` | 0.1.14 | Editor Layer Index as background layers with viewport filtering | Later, for imagery. Not in benchmarks (no background) |
| `live-touched` | 0.1.0 | See which objects others are editing nearby | Later |
| `osm-way-chain` | 0.1.0-alpha.0 | Traverse and orient connected highway ways | Later |
| `osm-route-snapper` | 0.1.0-alpha.0 | Route snapper graph (WASM) | Later |
| `street-imagery`, `street-imagery-react` | 0.1.0-alpha.0 | Mapillary and Panoramax layers and viewers | Later |
| `surface-smoothness-data`, `surface-smoothness-id-field` | 0.0.0 | Surface and smoothness catalogue and iD field | Later |
| `key-value-db-client` | 0.1.0 | Client for the key-value store behind `live-touched` | Later |

The alpha packages (`osm-data`, `osm-maplibre`, `osm-coverage`, `osm-way-chain`, `osm-route-snapper`, `osm-map-url`) are published from https://github.com/osmberlin/street-space-editor (verified for `osm-data`; local checkout `../parking-lanes`). They were built for that app's needs. Unverified: how well they perform or generalise.

## Repos and conventions

`react-map-gl-draw`, `maplibre-editor-layer-index` and `osm-live-touched` are Bun workspace monorepos with the same layout: `packages/<name>` plus `apps/preview`, with oxlint, oxfmt, TypeScript and changesets. Maid follows the same layout so packages can move between repos without rework.

## Questions for iteration 1

- Does `osm-data` hold the entities and indexes Maid needs (nodes, ways, relations, way-to-node and node-to-way lookups, a spatial index), and how fast is it with 100k+ nodes? Milestone 2 answers this. If it falls short we improve it there, or record why not.
- `osm-data` depends on axios and can call the OSM API and Overpass. In Maid it must only ever talk to the configured API host (the local mock in automation). Check that it has no hard-coded hosts.
- Where do Maid's new packages live: in this repo and published under `@osm-editor-kit`, or in the org's repos? Default: developed here in `packages/`, published under the scope once they are stable.
