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

## The whole street: `@osm-editor-kit/osm-lane-diagram/street`

`streetGeometry({ ways, loc, origin? })` draws every road of an area with its lanes at their widths, joined at junctions,
in [lon, lat]: lane polygons, junction surfaces with kerb curves, lane lines and kerbs, turn arrow points. The input is
each way's cross-section (its lanes as offsets from the way's line); how a cross-section is read from the tags is the
caller's (Maid: `sceneBands` in module-lanes, from this package's scene). Pure, no caches.

The approach is Lane Studio's road geometry (<https://github.com/MarcelMarzec/LaneStudio>,
`modules/lanes/geometry/road_geometry.ts` and `frame.ts`, ISC licence), cut down to its core:

- each way end at a node is an arm; two arms are partners, cut on the bisector of their bend, so their lanes meet;
- where two roads that run on have different lanes, the road with fewer lanes runs on out of the other's over 25 m,
  and a lane it lacks narrows to nothing on it (a taper); a carriageway without lanes widens to the other's kerbs;
- at three or more arms the main road (straightest pair by way, ref, name, class) runs through; the other arms stop
  where their kerbs meet their neighbours' (at most 30 m; round a roundabout where they are clear of the ring), and
  the junction's surface joins all ends with kerb curves; a road splitting into two one-way roads has no main road;
- each way is cut at its junction nodes, each piece offset per lane with mitre joins.

Left out so far (Lane Studio has them): junctions of several nodes close together as one, slip roads and forks lined
up with the lanes they carry on from, guide lines through junctions, connectivity relations, carriageway areas,
painted islands, turning heads, left-hand traffic. Tests: `src/street/street.test.ts` (made-up roads after Lane
Studio's test cases). On the dense fixture about 4 % of the junction outlines cross themselves (collinear points at
mouths, very short pieces at sharp angles).

## Where it comes from

Copied on 2026-11-10 from the street space editor (<https://github.com/osmberlin/street-space-editor>, `packages/osm-lane-diagram` at commit `2a0f6f7`), MIT licence in [LICENSE](LICENSE). The package keeps its name, so Maid can switch to the npm release with one line once it is published. Changes here go back to the street space editor too, as long as both copies live.

One change against the original: `src/sidepaths.ts` replaces `@osm-editor-kit/osm-sidepath-tags` (not on npm), which uses `@tilda-geo/bicycle-infrastructure`, AGPL until 0.1.2 and ISC since 0.2.0. The 54 snapshot tests of the original pass unchanged with it.
