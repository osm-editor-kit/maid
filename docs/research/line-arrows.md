# Arrows on lines: drawing direction and oneway

Design proposal, 2026-11-26, for Tobias to decide on. No code has changed. Sketches of every case in every state, on
map and imagery: **https://claude.ai/artifact/RKGn9wBkgduyGvmVaGswJV** (private until shared).

Asked for by Tobias: users find the hook for `oneway=-1` (ADR 0015) unnatural. The drawing-direction arrow should come
closer to iD but be easier to see; oneways keep their own glyph; both should show together.

## What exists

- iD (`.reference/id` at `0194f3926`): one marker, `svg/defs.ts` `ideditor-oneway-marker-*`, path
  `M 6,3 L 0,3 L 0,2 L 6,2 L 5,0 L 10,2.5 L 5,5 z`, 12 x 6 px, `#333` (white, `#eee` on dark and rail lines,
  `svg/lines.js` `onewayArrowColour`), every 36 px from zoom 16 (`svgMarkerSegments`), mirrored for
  `isOneWayBackwards`, doubled for `isBiDirectional`. `oneway=no` cancels every implied oneway (`osm/way.ts`
  `isOneWay`). Oneway paths also get a dash pattern `6 6 6 18`. iD never shows the drawing direction.
- Maid: `renderer/src/direction.ts` and `direction-images.ts` draw iD's arrow, the hook (`reversed`) for `-1`, and a
  white outlined copy of iD's arrow on a selected highway without oneway (`selection-shape.ts`,
  `highlight-direction`). The bicycle lens draws white arrows and hooks as line patterns (`maid-line-arrow-*`).

## Proposal

- **Two glyphs, two meanings.** Drawing direction: iD's arrow, bolder (2.6 px shaft, 16 x 8.4 px), white with a dark
  outline, on hover and selection only. Oneway: a double chevron, dark with a white halo, from OSM 16 every 36 px.
- **Normal state shows traffic only.** `oneway=-1` is the same chevron turned 180° (`icon-rotate`). No hook.
- **Hover and selected alternate both**: arrow, chevrons, arrow, chevrons, one pair image every 72 px. For `-1` they
  point at each other.
- Reversible and alternating: back-to-back chevrons with a bar. Bicycles exempt (`oneway:bicycle=no`,
  `cycleway=opposite*`): chevrons plus a small blue counter-chevron. TILDA lines: single white chevrons in the line
  pattern, mirrored for "against", an outward pair for two-way.
- Readable on imagery through the two-tone glyphs; single-colour glyphs as SDF images (`icon-color`,
  `icon-halo-*`, `icon-opacity` for the lens dimming instead of one image per colour).

Code to change (details on the page): `direction.ts`, `direction-images.ts`, `layers.ts`, `build.ts` (`cf`
property), `selection-shape.ts` and `engine.ts` (hover feature, every open line), the bicycle lens `layers.ts`,
`direction-svg.ts` and `assets/direction/*.svg`, their tests and `check-bike-style`, and a new ADR that supersedes the
hook part of ADR 0015.

## Open questions for Tobias

1. `oneway=-1` in the normal state: traffic direction only, or a small "drawn against" cue?
2. Drawing direction on hover too, or on selection only?
3. Drawing direction for every selected open line (waterways, sided lines), not only highways?
4. `oneway=no` on a roundabout or motorway: nothing (iD) or a two-way hint?
5. The blue contraflow counter-chevron in every app, or in Maid Bicycle only?
6. `oneway:bus`, `oneway:psv`, `oneway:foot`: out of scope?
7. The oneway glyph deviates from iD in every app: fine?
