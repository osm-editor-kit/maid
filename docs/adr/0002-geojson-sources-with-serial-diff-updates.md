# 0002: GeoJSON sources, filled with diff updates, one at a time

Date: 2026-10-10

## Decision

OSM data reaches MapLibre through four GeoJSON sources (areas, lines, points, vertices) with `promoteId: 'id'` and `tolerance: 0`. New data from a tile is added with `GeoJSONSource.updateData({ add })`. Per source only one update is in flight: features that arrive meanwhile are queued and go out together when MapLibre has rebuilt the visible tiles of the previous update.

The React components declare sources and layers. The engine (`packages/renderer/src/engine.ts`) is the one place that calls MapLibre imperatively.

## Why

Measured on the dense scene (120k nodes in the fixture, about 51k loaded for the viewport), one run each:

| | `updateData` (diff) | `setData` (everything again) |
| --- | ---: | ---: |
| Pan into new data: until the picture is correct | 526 ms | 1697 ms |
| Pan into new data: worst frame | 50 ms | 83 ms |
| Moving one node: change on screen (median) | 166 ms | 599 ms |

`setData` re-sends and re-indexes the whole source for every tile that arrives.

## A MapLibre problem we work around

With MapLibre 6.12, overlapping `updateData` calls on one source left tiles in an inconsistent state: `queryRenderedFeatures` threw `feature index out of bounds` and `querySourceFeatures` returned a different number of features from run to run (708, 976, 1274 or 1640 for the same view). Waiting for the promise of `updateData` was not enough, because it resolves before the visible tiles are rebuilt. Waiting for `isSourceLoaded` before the next update fixed it in six of six runs. This needs a minimal reproduction and an upstream report.

## Settings and their trade-offs

- `tolerance: 0`: vertices must sit exactly on their lines. The default (0.375) simplifies lines and moves them away from their vertices.
- `maxzoom: 17`: tiles are cut up to MapLibre zoom 17 (OSM zoom 18) and overzoomed above. Not yet examined: precision at OSM zoom 22 and beyond.
- Three stacking bands for lines (below ground, ground, above). iD has one per `layer` value.
