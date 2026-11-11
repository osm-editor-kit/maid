# `@osm-editor-kit/osm-lane-diagram`

**Status:** in Maid since 2026-11-10 for the Maid Lanes app; not on npm yet.

## What it does

Pure TypeScript layout engine: OSM way tags → extended LTR slot stack → JSON scene → SVG string. Conceptual overview: [docs/lanes-road-space-approach.md](../../docs/lanes-road-space-approach.md).

## Usage

```text
tags (+ oriented neighbours)
  → buildRoadSpaceSegment()   // parseWayLanes + cycle/sidepath expansion
  → RoadSpaceChain            // prev / current / next
  → layoutRoadSpace()         // metric offsets, tapers, forks
  → RoadSpaceScene            // JSON-serializable rects + polylines
  → sceneToSvg()              // deterministic SVG string
```

```ts
import {
  buildRoadSpaceSegment,
  layoutRoadSpace,
  sceneToSvg,
} from '@osm-editor-kit/osm-lane-diagram'

const segment = buildRoadSpaceSegment(/* way tags, neighbours */)
const scene = layoutRoadSpace({ segments: [chain] })
const svg = sceneToSvg(scene)
```

Fixtures: `import { laneDiagramFixtures } from '@osm-editor-kit/osm-lane-diagram/fixtures'`.

Slot ids are stable across re-layout — carriageway lanes (`way/<id>/lane/…`) and edge/sidepath features (`way/<id>/cycleway|sidewalk/<left|right>`).

No React/JSX and no I/O (no OSM fetch, stores, or app imports). Layout uses clear slot widths only; separator strokes are cosmetic.

## Where it comes from

Copied on 2026-11-10 from the street space editor (<https://github.com/osmberlin/street-space-editor>, `packages/osm-lane-diagram` at commit `2a0f6f7`), MIT licence in [LICENSE](LICENSE). The package keeps its name, so Maid can switch to the npm release with one line once it is published. Changes here go back to the street space editor too, as long as both copies live.

One change against the original: `src/sidepaths.ts` replaces `@osm-editor-kit/osm-sidepath-tags` (not on npm), which uses `@tilda-geo/bicycle-infrastructure`, AGPL until 0.1.2 and ISC since 0.2.0. The 54 snapshot tests of the original pass unchanged with it.
