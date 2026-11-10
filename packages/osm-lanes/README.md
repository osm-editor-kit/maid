# `@osm-editor-kit/osm-lanes`

**Status:** in Maid since 2026-11-10 for the Maid Lanes app; not on npm yet.

## What it does

Parse OSM way lane tags into a typed `WayLaneModel` with per-lane `LaneSlot` records (forward, backward, both_ways), then serialize back to OSM tags while preserving unrelated keys. Handles pipe-delimited `*:lanes` tags, lane counts, reverse-oneway remirror, driving-side inference, validation warnings, and width reconciliation helpers.

## Usage

```ts
import { parseWayLanes, serializeWayLanes } from '@osm-editor-kit/osm-lanes'

const tags = {
  highway: 'primary',
  oneway: 'yes',
  lanes: '2',
  'turn:lanes': 'left|through',
}

const model = parseWayLanes(tags)
// model.slots → [{ index: 0, direction: 'forward', turn: 'left', ... }, ...]

const out = serializeWayLanes(model, tags)
// out['turn:lanes'] === 'left|through', out.highway unchanged
```

Tag parsing and serialization only — not a lane editor UI or diagram renderer.

## Where it comes from

Copied on 2026-11-10 from the street space editor (<https://github.com/osmberlin/street-space-editor>, `packages/osm-lanes` at commit `2a0f6f7`), MIT licence in [LICENSE](LICENSE). The package keeps its name, so Maid can switch to the npm release with one line once it is published. Changes here go back to the street space editor too, as long as both copies live.
